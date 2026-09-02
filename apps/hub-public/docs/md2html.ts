// RWF md2html — minimal GFM-subset Markdown → HTML renderer (bun-native, zero deps).
// Exists because system pandoc is broken (missing libHS* shared objects).
// Handles exactly what the repo's docs/ use: headings, paragraphs, bold/italic/
// code, links, fenced code, blockquotes, hr, ordered/unordered lists (nested),
// GFM pipe tables. Output is wrapped by docs/template.html.
//
// Usage: bun md2html.ts <src.md> <title> <out-slug>   (run from docs/ dir)

import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, dirname } from "node:path";

const [src, title, slug] = process.argv.slice(2);
if (!src || !title || !slug) {
  console.error("usage: bun md2html.ts <src.md> <title> <out-slug>");
  process.exit(1);
}
const md = readFileSync(src, "utf8");

// ── inline ────────────────────────────────────────────────────────────────
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  let out = esc(s);
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
  return out;
}

// ── blocks ────────────────────────────────────────────────────────────────
const lines = md.replace(/\r\n?/g, "\n").split("\n");
const html: string[] = [];
let i = 0;

const ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const itemOf = (l: string) => {
  const m = l.match(ITEM);
  return m ? { indent: Math.floor(m[1].replace(/\t/g, "  ").length / 2), ordered: /\d+\./.test(m[2]), text: m[3] } : null;
};
const isBlockStart = (l: string) =>
  !l.trim() || /^(#{1,6}\s|```| {0,3}>)/.test(l) || ITEM.test(l) ||
  /^ {0,3}([-*_])\s*(?:\1\s*){2,}$/.test(l);

// parse one list (items at `indent`), recursive for nested lists
function parseList(indent: number): void {
  let ordered = itemOf(lines[i])!.ordered;
  html.push(ordered ? "<ol>" : "<ul>");
  while (i < lines.length) {
    const it = itemOf(lines[i]);
    if (!it || it.indent < indent) break;
    if (it.indent > indent) { parseList(it.indent); continue; } // deeper → nested
    if (it.ordered !== ordered && it.indent === indent) {
      // marker flavour flip at same level: close & reopen the wrapper
      html.push(ordered ? "</ol>" : "</ul>");
      ordered = it.ordered;
      html.push(ordered ? "<ol>" : "<ul>");
    }
    html.push(`<li>`);
    let text = it.text;
    i++;
    // continuation lines: indented non-item text belonging to this item
    while (i < lines.length && lines[i].trim() && !itemOf(lines[i]) &&
           !/^(#{1,6}\s|```| {0,3}>)/.test(lines[i])) {
      text += `<br>${inline(lines[i].trim())}`;
      i++;
    }
    html.push(inline(text));
    // nested list or dedent handled by loop; close li before leaving item
    const nxt = i < lines.length ? itemOf(lines[i]) : null;
    if (!nxt || nxt.indent < indent) html.push(`</li>`);
    else if (nxt.indent > indent) {
      parseList(nxt.indent); // recurse; on return, this li continues/closes below
      const after = i < lines.length ? itemOf(lines[i]) : null;
      if (!after || after.indent < indent) html.push(`</li>`);
      else html.push(`</li>`); // sibling items continue at same li level
    } else html.push(`</li>`);
  }
  html.push(ordered ? "</ol>" : "</ul>");
}

while (i < lines.length) {
  const line = lines[i];

  if (/^```/.test(line)) {                                    // fenced code
    const buf: string[] = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
    i++;
    html.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
    continue;
  }
  if (!line.trim()) { i++; continue; }                        // blank

  const h = line.match(/^(#{1,6})\s+(.*)$/);                  // heading
  if (h) { html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

  if (/^ {0,3}([-*_])\s*(?:\1\s*){2,}$/.test(line)) { html.push("<hr>"); i++; continue; }

  if (/^ {0,3}>/.test(line)) {                                // blockquote
    const buf: string[] = [];
    while (i < lines.length && /^ {0,3}>/.test(lines[i]))
      buf.push(lines[i++].replace(/^ {0,3}>\s?/, ""));
    html.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
    continue;
  }

  if (line.includes("|") && i + 1 < lines.length &&           // GFM table
      /^\s*\|?[\s:|-]*-[\s:|-]*\|/.test(lines[i + 1])) {
    const cells = (r: string) =>
      r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    const head = cells(line);
    i += 2;
    const rows: string[][] = [];
    while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
    html.push(
      `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
      `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
    );
    continue;
  }

  if (itemOf(line)) { parseList(itemOf(line)!.indent); continue; }

  const buf: string[] = [line];                               // paragraph
  i++;
  while (i < lines.length && !isBlockStart(lines[i]) &&
         !(lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|/.test(lines[i + 1] ?? "")))
    buf.push(lines[i++]);
  html.push(`<p>${inline(buf.join(" "))}</p>`);
}

// ── wrap with template ────────────────────────────────────────────────────
const tpl = readFileSync(join(dirname(import.meta.path), "template.html"), "utf8");
writeFileSync(`${slug}.html`, tpl.replaceAll("$title$", title).replace("$body$", html.join("\n")));
console.log(`▸ rendered ${slug}.html (${html.length} blocks)`);
