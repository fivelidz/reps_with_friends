// figma/fetch.ts — the F1 extractor. READ-ONLY against the Figma API.
// Pulls EVERYTHING from Ben's file into figma/assets/ + a catalogue.
//
// Usage:  bun figma/fetch.ts
// Token:  ~/.secrets/figma.env containing FIGMA_TOKEN=... (read-only scope)
//         or FIGMA_TOKEN env var.
//
// What it downloads (never uploads/modifies — read-only endpoints only):
//   figma/assets/file.json        full document (pages, frames, vectors, text)
//   figma/assets/meta.json        file metadata + last-modified
//   figma/assets/components.json  component registry (instances, descriptions)
//   figma/assets/variables.json   design variables/tokens (colours, type, spacing)
//   figma/assets/exports/         every frame + every component as PNG @2x
//   figma/notes/catalogue.md      auto-generated catalogue of the whole file

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const FILE_KEY = "jTTqanaC6WLPBTpPlyuUYu";
const OUT = "figma/assets";
const EXPORTS = `${OUT}/exports`;

// ── token ────────────────────────────────────────────────────────────────────
let token = process.env.FIGMA_TOKEN ?? "";
if (!token) {
  for (const p of ["~/.secrets/figma.env", ".secrets/figma.env", ".env"]) {
    const f = p.replace("~", process.env.HOME ?? "");
    if (existsSync(f)) {
      const m = readFileSync(f, "utf8").match(/^FIGMA_TOKEN=(.+)$/m);
      if (m) { token = m[1].trim(); break; }
    }
  }
}
if (!token) {
  console.error(
    "No FIGMA_TOKEN. Get one (30s): figma.com → Settings → Security →\n" +
    "Personal access tokens → Generate — scope: Read only (or file_content:read).\n" +
    "Save as FIGMA_TOKEN=... in ~/.secrets/figma.env, then re-run."
  );
  process.exit(1);
}

mkdirSync(EXPORTS, { recursive: true });
mkdirSync("figma/notes", { recursive: true });

const API = "https://api.figma.com/v1";
const H = { "X-Figma-Token": token };

async function api(path: string): Promise<any> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`${API}${path}`, { headers: H });
    if (r.status === 429) { // rate limited — back off
      const wait = 2000 * attempt;
      console.log(`  rate-limited, waiting ${wait}ms…`);
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    if (!r.ok) throw new Error(`${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  throw new Error(`${path}: rate limit exhausted`);
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);

// ── 1. verify + metadata ─────────────────────────────────────────────────────
console.log("▸ token check");
const me = await api("/me");
console.log(`  token OK (${me.email ?? me.handle ?? "unknown user"})`);

console.log("▸ file metadata");
const meta = await api(`/files/${FILE_KEY}`);
writeFileSync(`${OUT}/meta.json`, JSON.stringify({
  name: meta.name, lastModified: meta.lastModified, thumbnail: meta.thumbnailUrl,
  pages: (meta.document?.children ?? []).map((p: any) => ({ id: p.id, name: p.name })),
}, null, 2));

// ── 2. full document ─────────────────────────────────────────────────────────
console.log("▸ full document JSON");
const file = await api(`/files/${FILE_KEY}`);
writeFileSync(`${OUT}/file.json`, JSON.stringify(file));

// ── 3. components registry ───────────────────────────────────────────────────
console.log("▸ component registry");
try {
  const comps = await api(`/files/${FILE_KEY}/components`);
  writeFileSync(`${OUT}/components.json`, JSON.stringify(comps, null, 2));
} catch (e: any) { console.log(`  (components endpoint: ${e.message})`); }

// ── 4. variables (design tokens) ─────────────────────────────────────────────
console.log("▸ variables / design tokens");
try {
  const vars = await api(`/files/${FILE_KEY}/variables/local`);
  writeFileSync(`${OUT}/variables.json`, JSON.stringify(vars, null, 2));
} catch (e: any) { console.log(`  (variables endpoint: ${e.message})`); }

// ── 5. walk the tree: every FRAME + COMPONENT node ───────────────────────────
interface Node { id: string; name: string; type: string; children?: Node[]; absoluteBoundingBox?: any }
const frames: Node[] = [];
const components: Node[] = [];
(function walk(n: Node) {
  if (n.type === "FRAME" || n.type === "GROUP" && n.children?.length) frames.push(n);
  if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") components.push(n);
  n.children?.forEach(walk);
})(file.document);

// top-level frames only for export (children come along in the render)
const topFrames: Node[] = [];
for (const page of file.document.children ?? []) {
  for (const child of page.children ?? []) {
    if (["FRAME", "GROUP", "COMPONENT", "COMPONENT_SET", "SECTION"].includes(child.type)) {
      topFrames.push(child);
    }
  }
}
console.log(`▸ tree: ${frames.length} frames, ${components.length} components, ${topFrames.length} top-level nodes to render`);

// ── 6. render every top-level node as PNG @2x (batched) ─────────────────────
console.log("▸ rendering exports @2x (batched 30/batch)…");
const ids = topFrames.map((f) => f.id);
const nameOf = new Map(topFrames.map((f) => [f.id, f.name]));
let done = 0;
for (let i = 0; i < ids.length; i += 30) {
  const batch = ids.slice(i, i + 30);
  const imgs = await api(`/images/${FILE_KEY}?ids=${batch.join(",")}&format=png&scale=2`);
  for (const [id, url] of Object.entries<string>(imgs.images ?? {})) {
    if (!url) continue;
    const png = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(`${EXPORTS}/${slug(nameOf.get(id) ?? id)}_${id.replace(/[^a-zA-Z0-9]/g, "-")}.png`, png);
    done++;
  }
  await new Promise((r) => setTimeout(r, 400)); // be polite
}
console.log(`  exported ${done}/${ids.length} PNGs → ${EXPORTS}/`);

// ── 7. auto-catalogue ────────────────────────────────────────────────────────
console.log("▸ writing catalogue");
const lines = [
  `# Figma catalogue — ${file.name}`,
  ``,
  `File: ${FILE_KEY} · last modified ${file.lastModified}`,
  `Auto-generated by figma/fetch.ts — regenerate any time (read-only).`,
  ``,
];
for (const page of file.document.children ?? []) {
  lines.push(`## Page: ${page.name}`, ``);
  for (const child of page.children ?? []) {
    const bb = child.absoluteBoundingBox;
    const size = bb ? ` (${Math.round(bb.width)}×${Math.round(bb.height)})` : "";
    lines.push(`- **${child.name}** \`${child.type}\`${size} — \`${child.id}\``);
    // one level of children for component-dense frames
    for (const gc of (child.children ?? []).slice(0, 40)) {
      if (["COMPONENT", "COMPONENT_SET", "FRAME"].includes(gc.type)) {
        lines.push(`  - ${gc.name} \`${gc.type}\` — \`${gc.id}\``);
      }
    }
  }
  lines.push(``);
}
writeFileSync("figma/notes/catalogue.md", lines.join("\n"));
console.log(`✓ done. catalogue: figma/notes/catalogue.md (${topFrames.length} nodes, ${components.length} components)`);
