// Tiny DOM helpers — no framework, no deps.

export type Child = string | Node | null | undefined | false;

/**
 * Create an element. Attrs:
 *   class / href / type / ...  → setAttribute
 *   text    → textContent
 *   html    → innerHTML (used ONLY for our own static icon strings)
 *   value   → input.value property
 *   disabled→ property
 *   on*     → addEventListener (e.g. onClick)
 */
export function el(
  tag: string,
  attrs: Record<string, unknown> | null = null,
  ...children: Child[]
): HTMLElement {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "text") n.textContent = String(v);
      else if (k === "html") n.innerHTML = String(v);
      else if (k === "value") (n as HTMLInputElement).value = String(v);
      else if (k === "disabled") (n as HTMLButtonElement).disabled = Boolean(v);
      else if (k.startsWith("on") && typeof v === "function")
        n.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else n.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) {
      for (const inner of c as Child[]) {
        if (inner == null || inner === false) continue;
        n.append(typeof inner === "string" ? document.createTextNode(inner) : inner);
      }
    } else {
      n.append(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return n;
}

// ── Icons (inline SVG, stroke = currentColor) ────────────────────────────────

const ICONS: Record<string, string> = {
  home: '<path d="M3 11.2 12 4l9 7.2V20h-5.5v-5h-7v5H3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.7-5.4 7-5.4s6.2 1.8 7 5.4"/>',
  back: '<path d="M15 4 7 12l8 8"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
  flame: '<path d="M12 3c1 3.4 5 5.2 5 9.2a5 5 0 0 1-10 0c0-2 .9-3.6 2-4.6.2 1.5 1 2.3 2 2.5-.6-2.4-.2-5.1 1-7.1z"/>',
  trophy: '<path d="M7 4h10v4.5a5 5 0 0 1-10 0zM7 5H4v1.5a3 3 0 0 0 3 3M17 5h3v1.5a3 3 0 0 1-3 3M12 13.5V17m-4 3h8"/>',
  check: '<path d="M4 12.5 10 18 20 6"/>',
  chat: '<path d="M4 5.5h16V16H10l-5 4z"/>',
  hash: '<path d="M9 4v16M15 4v16M4.5 9h15M4.5 15h15"/>',
  crown: '<path d="M4 8l4 4 4-6.5L16 12l4-4v9.5H4z"/>',
  bolt: '<path d="M13 3 5 13.5h5L10.5 21 19 10.5h-5z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  medal: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5 7 21l5-2.5L17 21l-1.5-7.5"/>',
  download: '<path d="M12 4v11m0 0 5-5m-5 5-5-5M4 20h16"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6a5.2 5.2 0 0 1 9.3 4.4C19.5 15.4 12 20 12 20z"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
};

export function icon(name: string, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

// ── Toasts ───────────────────────────────────────────────────────────────────

export type ToastTone = "ok" | "warn" | "info";

export function toast(msg: string, tone: ToastTone = "info"): void {
  const host = document.getElementById("toasts");
  if (!host) return;
  const t = el("div", { class: `toast toast--${tone}`, text: msg });
  host.append(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 240);
  }, 2600);
}

// ── Clipboard ────────────────────────────────────────────────────────────────

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// ── Small shared fragments ───────────────────────────────────────────────────

export function tierBadge(tier: string, extra = ""): HTMLElement {
  return el("span", { class: `tier ${extra}`, text: tier });
}

export function avatar(name: string, tier: string, size = 36): HTMLElement {
  const a = el("span", { class: `avatar av-${size} av-tier-${tier}`, text: name.slice(0, 1).toUpperCase() });
  return a;
}

export function topbar(title: string, opts: { back?: string; right?: Node } = {}): HTMLElement {
  const bar = el("div", { class: "topbar" });
  if (opts.back !== undefined) {
    bar.append(
      el("button", {
        class: "iconbtn",
        html: icon("back", 20),
        "aria-label": "Back",
        onClick: () => {
          location.hash = opts.back ?? "#/";
        },
      })
    );
  }
  bar.append(el("h1", { class: "h-display", text: title }));
  if (opts.right) bar.append(opts.right);
  return bar;
}

export function sectionLabel(text: string): HTMLElement {
  return el("div", { class: "seclabel", text });
}

export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;
}

export function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Position marker: medals for the podium, plain number below. */
const MEDALS = ["🥇", "🥈", "🥉"];
export function posMark(i: number): string {
  return i < 3 ? MEDALS[i] : String(i + 1);
}

// ── Sync status bar (app header) ─────────────────────────────────────────────
// A slim strip above the scroll area: wordmark left, sync chip right. Injected
// from JS (main.ts) so index.html / styles.css stay untouched.

import type { SyncSnapshot } from "./sync.ts";

const SYNCBAR_CSS = `
#syncbar{display:flex;align-items:center;justify-content:space-between;gap:10px;
  flex:none;padding:7px 16px 6px;border-bottom:1px solid var(--line);
  font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);}
#syncbar .wordmark{font-family:var(--font-display);font-weight:700;opacity:.55;}
#syncchip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;
  border-radius:999px;border:1px solid var(--line);font-weight:600;line-height:1.4;}
#syncchip .dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none;}
.syncchip--off{color:var(--muted);opacity:.75;}
.syncchip--ready{color:var(--muted);}
.syncchip--syncing{color:var(--muted);}
.syncchip--synced{color:var(--lime);border-color:rgba(198,243,46,.35);background:var(--lime-glow);}
.syncchip--offline{color:var(--amber);border-color:rgba(255,176,32,.4);background:rgba(255,176,32,.08);}
`;

/** Create the header strip inside #frame (before #app). Returns the chip el. */
export function mountSyncBar(frame: HTMLElement): HTMLElement | null {
  if (!frame || document.getElementById("syncbar")) return document.getElementById("syncchip");
  if (!document.getElementById("syncbar-styles")) {
    document.head.append(el("style", { id: "syncbar-styles", text: SYNCBAR_CSS }));
  }
  const chip = el("span", { id: "syncchip", class: "syncchip", "aria-live": "polite" });
  const bar = el(
    "div",
    { id: "syncbar", class: "syncbar" },
    el("span", { class: "wordmark", text: "RWF" }),
    chip
  );
  frame.insertBefore(bar, frame.firstChild);
  return chip;
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** Paint the chip from a sync snapshot (see sync.ts for the states). */
export function renderSyncChip(chip: HTMLElement | null, snap: SyncSnapshot): void {
  if (!chip) return;
  let label = "LOCAL ONLY";
  let cls = "syncchip--off";
  let title = "This device keeps the scoreboard — no server involved";
  if (snap.state === "ready") {
    title = "Server sync available — tap “Sync this crew to the server” on the crew screen";
  } else if (snap.state === "syncing") {
    label = "SYNCING…";
    cls = "syncchip--syncing";
    title = "Talking to the server";
  } else if (snap.state === "synced") {
    label = `SYNCED · ${relTime(snap.lastOk ?? Date.now())}`;
    cls = "syncchip--synced";
    title = `Mirrored to the API (${snap.base}) — crew ${snap.crewCode ?? "?"}`;
  } else if (snap.state === "offline") {
    label = `OFFLINE — QUEUED ${snap.queued}`;
    cls = "syncchip--offline";
    title = "Server unreachable — actions are queued and will flush automatically";
  }
  chip.className = cls;
  chip.title = title;
  chip.innerHTML = "";
  chip.append(el("span", { class: "dot" }), document.createTextNode(label));
}
