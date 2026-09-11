// RWF WIKI — the feedback layer (founder's crew notes; wiring in docs/22 §11).
//   • every wiki page gets a comment box + this page's notes at the bottom
//   • /wiki/feedback (feedback.html) is the admin stream, filterable by page
//   • the wiki index shows the all-time note count via [data-fb-total]
// Endpoint: same-origin /feedback — serve.ts proxies to apps/api (:4174) and
// falls back to the same store locally, so `bun serve.ts` alone is enough.
// ZERO auth by design → hostile-input safe: EVERY user string is rendered
// with textContent/createElement, never innerHTML. Caps mirror the API
// (name ≤40, text ≤1000).
(() => {
  const NAME_MAX = 40;
  const TEXT_MAX = 1000;

  // "game.html" → "game" · "/wiki/" → "index" · "/wiki/feedback" → "feedback"
  const PAGE_ID = (() => {
    const seg = decodeURIComponent(location.pathname.split("/").pop() || "").replace(/\.html?$/, "");
    return seg === "" || seg === "wiki" ? "index" : seg;
  })();

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const when = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  const jget = async (url) => {
    const r = await fetch(url);
    return { r, b: await r.json().catch(() => ({})) };
  };

  function commentCard(c) {
    const card = el("div", "fbx__comment");
    const head = el("div", "fbx__chead");
    head.append(el("b", "fbx__cname", c.name || "anon"), el("span", "fbx__cwhen", when(c.at)));
    card.append(head, el("p", "fbx__ctext", c.text));
    return card;
  }

  // ── the per-page comment widget ────────────────────────────────────────
  function mountWidget() {
    const host = el("section", "fbx");
    host.id = "feedback";

    const head = el("div", "fbx__head");
    head.append(el("h2", "fbx__title", "📝 Notes on this page"));
    const sub = el("p", "fbx__sub", "Founder-and-crew feedback — goes straight into the notes stream (");
    const a = el("a", null, "see it all");
    a.href = "feedback.html";
    sub.append(a, el("span", null, ")."));
    head.append(sub);

    const form = el("form", "fbx__form");
    const name = document.createElement("input");
    name.className = "fbx__input fbx__name";
    name.type = "text";
    name.maxLength = NAME_MAX;
    name.placeholder = "name (optional — anon)";
    name.autocomplete = "off";

    const ta = document.createElement("textarea");
    ta.className = "fbx__input";
    ta.maxLength = TEXT_MAX;
    ta.rows = 3;
    ta.placeholder = "what works, what's confusing, what's missing…";
    ta.required = true;

    const row = el("div", "fbx__row");
    const btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "fbx__btn";
    btn.textContent = "Leave a note";
    const counter = el("span", "fbx__count", `0 / ${TEXT_MAX}`);
    ta.addEventListener("input", () => { counter.textContent = `${ta.value.length} / ${TEXT_MAX}`; });
    row.append(btn, counter);

    const status = el("p", "fbx__status", "");
    status.setAttribute("aria-live", "polite");

    form.append(name, ta, row, status);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text || btn.disabled) return;
      btn.disabled = true;
      status.className = "fbx__status";
      status.textContent = "posting…";
      try {
        const r = await fetch("/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ page: PAGE_ID, name: name.value.trim(), text }),
        });
        const b = await r.json().catch(() => ({}));
        if (r.status === 201) {
          status.textContent = b.deduped ? "already noted ✓ (that one's in the stream)" : "noted ✓ — thanks!";
          status.classList.add("fbx__status--ok");
          ta.value = "";
          counter.textContent = `0 / ${TEXT_MAX}`;
          loadList();
        } else {
          status.textContent = b.error || `couldn't post (${r.status})`;
          status.classList.add("fbx__status--err");
        }
      } catch {
        status.textContent = "feedback box unreachable from this host";
        status.classList.add("fbx__status--err");
      }
      btn.disabled = false;
    });

    const list = el("div", "fbx__list");

    async function loadList() {
      try {
        const { r, b } = await jget(`/feedback?page=${encodeURIComponent(PAGE_ID)}`);
        if (!r.ok) throw new Error(String(r.status));
        list.replaceChildren(
          el("p", "fbx__listlabel",
            b.count > 0
              ? `${b.count} note${b.count === 1 ? "" : "s"} on this page`
              : "no notes yet — be the first")
        );
        for (const c of b.comments ?? []) list.append(commentCard(c));
      } catch {
        list.replaceChildren(
          el("p", "fbx__listlabel fbx__status--err",
            "notes unavailable here — this host doesn't serve /feedback (the API isn't running)")
        );
      }
    }

    host.append(head, form, list);
    const footer = document.querySelector("footer.wfoot");
    if (footer && footer.parentNode) footer.parentNode.insertBefore(host, footer);
    else document.body.append(host);
    loadList();
  }

  // ── the /wiki/feedback admin stream ────────────────────────────────────
  async function mountAdmin() {
    const root = document.getElementById("fbAdmin");
    if (!root) return;

    const bar = el("div", "fbx__bar");
    const filter = document.createElement("select");
    filter.className = "fbx__input fbx__filter";
    filter.setAttribute("aria-label", "filter notes by page");
    const limitSel = document.createElement("select");
    limitSel.className = "fbx__input fbx__filter";
    limitSel.setAttribute("aria-label", "how many notes to show");
    for (const n of [50, 100, 200]) {
      const o = document.createElement("option");
      o.value = String(n); o.textContent = `last ${n}`;
      limitSel.append(o);
    }
    limitSel.value = "50";
    const count = el("span", "fbx__streamcount", "loading…");
    bar.append(filter, limitSel, count);
    const stream = el("div", "fbx__stream");
    root.append(bar, stream);

    // "all pages" → /feedback/recent (newest, capped) · a picked page →
    // /feedback?page= (that page's complete history). Both read paths.
    async function render() {
      stream.replaceChildren(el("p", "fbx__listlabel", "loading…"));
      const pick = filter.value;
      try {
        const url = pick === "all"
          ? `/feedback/recent?limit=${limitSel.value}`
          : `/feedback?page=${encodeURIComponent(pick)}`;
        const { r, b } = await jget(url);
        if (!r.ok) throw new Error(String(r.status));
        const comments = b.comments ?? [];
        stream.replaceChildren();
        if (comments.length === 0) {
          stream.append(el("p", "fbx__listlabel", pick === "all" ? "no notes yet — the crew hasn't started" : "no notes on that page yet"));
        }
        for (const c of comments) {
          const card = commentCard(c);
          const pg = el("a", "fbx__cpage", `#${c.page}`);
          pg.href = `${c.page === "index" ? "index.html" : c.page + ".html"}`;
          card.querySelector(".fbx__chead").append(pg);
          stream.append(card);
        }
        count.textContent = pick === "all"
          ? `${b.count} shown · ${b.total} total`
          : `${b.count} on #${pick} · ${b.total} total`;
      } catch {
        stream.replaceChildren(el("p", "fbx__listlabel fbx__status--err",
          "couldn't reach /feedback — this host doesn't serve it (the API isn't running)"));
        count.textContent = "";
      }
    }

    async function fillFilter() {
      try {
        const { r, b } = await jget("/feedback/recent?limit=200");
        const counts = new Map();
        for (const c of b.comments ?? []) counts.set(c.page, (counts.get(c.page) ?? 0) + 1);
        filter.replaceChildren();
        const all = document.createElement("option");
        all.value = "all";
        all.textContent = `all pages (${b.total ?? 0} total)`;
        filter.append(all);
        for (const [pg, n] of [...counts.entries()].sort()) {
          const o = document.createElement("option");
          o.value = pg;
          o.textContent = `#${pg} (${n}${b.total > 200 ? "+" : ""})`;
          filter.append(o);
        }
      } catch { /* render() shows the error state */ }
      filter.value = "all";
    }

    filter.addEventListener("change", render);
    limitSel.addEventListener("change", render);
    await fillFilter();
    await render();
  }

  // ── all-time count (wiki index stat) ───────────────────────────────────
  async function fillTotals() {
    for (const n of document.querySelectorAll("[data-fb-total]")) {
      n.textContent = "…";
      try {
        const { r, b } = await jget("/feedback/recent?limit=1");
        n.textContent = r.ok ? String(b.total ?? 0) : "—";
      } catch {
        n.textContent = "—";
      }
    }
  }

  mountWidget();
  mountAdmin();
  fillTotals();
})();
