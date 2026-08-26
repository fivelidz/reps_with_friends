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
