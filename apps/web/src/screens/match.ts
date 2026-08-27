// Match view — live standings, rep logging, taunts, crew feed.
// Demo crewmates (sim_*) log reps on a timer while this screen is open.
import { standings, type MatchState, type StandingRow } from "../engine.ts";
import { TAUNTS } from "../data.ts";
import { composeTaunt, narrateMatch } from "../ai.ts";
import { COMEBACK_MULTIPLIER, comebackArmed } from "../engine-extras.ts";
import { getMatch, getState, logEntry, touch } from "../state.ts";
import { avatar, el, fmtScore, icon, posMark, toast, topbar, tierBadge } from "../ui.ts";
import { openCameraVerifier } from "../verify/camera.ts";
import { openHrSheet, type HrController } from "../verify/hr.ts";

// Persist across re-renders (same match) so logging feels continuous.
const panel = { matchId: "", exerciseId: "", count: 10 };
const tauntFeed: { at: number; text: string }[] = [];
let tauntIdx = Math.floor(Math.random() * TAUNTS.length);
// Last AI narration per match — shown instantly on re-render, refreshed on click.
const narrationCache = new Map<string, string>();
let tauntInFlight = false;

// Lane 7 — live HR strap session. Module-level so it survives re-renders
// (sim crew logs re-render this screen every few seconds).
const hrSession: { ctrl: HrController | null; bpm: number; hrrPct: number; lost: boolean } = {
  ctrl: null,
  bpm: 0,
  hrrPct: 0,
  lost: false,
};

export function renderMatch(root: HTMLElement, matchId: string): () => void {
  const st = getState();
  const match = st.matches.find((m) => m.config.id === matchId);
  if (!match) {
    location.hash = "#/";
    return () => {};
  }
  if (match.status === "complete") {
    location.hash = `#/result/${matchId}`;
    return () => {};
  }
  const me = st.me!;
  if (panel.matchId !== matchId || !match.config.exercises.some((e) => e.id === panel.exerciseId)) {
    panel.matchId = matchId;
    panel.exerciseId = match.config.exercises[0].id;
    panel.count = 10;
  }

  // ── standings ──────────────────────────────────────────────────────────────
  const rows = standings(match);
  const topScore = rows[0]?.adjustedScore ?? 0;

  const standingRow = (row: StandingRow, i: number): HTMLElement =>
    el(
      "div",
      { class: `strow ${i === 0 ? "lead" : ""}` },
      el(
        "div",
        { class: "strow-r1" },
        el("span", {
          class: `rank ${i < 3 ? "rank--medal" : ""} ${i < 3 ? "top" : ""}`,
          text: posMark(i),
          "aria-label": `position ${i + 1}`,
        }),
        avatar(row.player.name, row.player.tier),
        el(
          "div",
          { class: "strow-id" },
          el("span", { class: "strow-name" }, row.player.name, tierBadge(row.player.tier)),
          el(
            "span",
            { class: "strow-meta" },
            el("span", {
              class: `vchip ${row.verifiedPct > 0 ? "vchip--ok" : ""}`,
              html: icon("check", 10) + `<span>${row.verifiedPct}%</span>`,
            }),
            comebackArmed(match, row.player.id)
              ? el("span", {
                  class: "cbk-badge",
                  text: `⚡ COMEBACK ×${COMEBACK_MULTIPLIER} ARMED`,
                })
              : null
          )
        ),
        el(
          "div",
          { class: "score" },
          el("b", { text: fmtScore(row.adjustedScore) }),
          el("span", { text: `${row.rawReps} raw` })
        )
      ),
      el("div", { class: "bar" }, el("i", { style: `width:${row.progressPct}%` })),
      i === 0 && topScore > 0 ? el("span", { class: "leadflag", text: "LEADING" }) : null
    );

  // ── log panel ──────────────────────────────────────────────────────────────
  const exChips = match.config.exercises.map((ex) =>
    el("button", {
      class: `chip chip--sm ${panel.exerciseId === ex.id ? "on" : ""}`,
      type: "button",
      text: ex.name,
      onClick: () => {
        panel.exerciseId = ex.id;
        touch();
      },
    })
  );

  const countEl = el("span", { class: "stepval", text: String(panel.count) });
  const exName = (): string =>
    match.config.exercises.find((e) => e.id === panel.exerciseId)?.name ?? "";

  const logBtn = el("button", {
    class: "rwf-btn rwf-btn--primary btn-block btn-lg",
    text: `LOG ${panel.count} ${exName().toUpperCase()}`,
    onClick: () => doLog(false),
  });

  // Floating log bar — stays pinned above the nav while the screen scrolls.
  const stickyInfo = el("span", { class: "stickylog-info" });
  const stickyBtn = el("button", {
    class: "rwf-btn rwf-btn--primary stickylog-btn",
    text: "SEND IT",
    onClick: () => doLog(false),
  });
  const stickyBar = el("div", { class: "stickylog" }, stickyInfo, stickyBtn);

  const setCount = (n: number): void => {
    panel.count = Math.max(1, Math.min(500, n));
    countEl.textContent = String(panel.count);
    logBtn.textContent = `LOG ${panel.count} ${exName().toUpperCase()}`;
    syncSticky();
  };
  const syncSticky = (): void => {
    stickyInfo.textContent = `${panel.count} × ${exName()}`;
  };
  syncSticky();

  // "One lime CTA per screen" (doc 13 §1.1). The sticky bar is a stand-in for
  // the real LOG button once that button scrolls out of view — while it IS on
  // screen, showing both puts two identical lime CTAs in front of the user.
  // So the bar hides itself whenever logBtn is actually visible.
  // Keep toasts clear of the floating bar: while the bar is up, lift the toast
  // stack by its height (+ gap) so confirmations never cover SEND IT.
  const setToastLift = (barVisible: boolean): void => {
    const h = barVisible ? Math.round(stickyBar.getBoundingClientRect().height) + 10 : 0;
    document.documentElement.style.setProperty("--toast-lift", `${h}px`);
  };

  let stickyObserver: IntersectionObserver | undefined;
  if (typeof IntersectionObserver !== "undefined") {
    stickyObserver = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e) {
          stickyBar.classList.toggle("is-hidden", e.isIntersecting);
          setToastLift(!e.isIntersecting);
        }
      },
      { root: document.getElementById("app"), threshold: 0.4 }
    );
    stickyObserver.observe(logBtn);
  }

  const doLog = (verified: boolean): void => {
    // Lane 7: while a strap is live, attach this set's average %HRR (Karvonen).
    const hr = hrSession.ctrl?.takeSetAverage() ?? null;
    const closed = logEntry(
      matchId,
      me.id,
      panel.exerciseId,
      panel.count,
      verified,
      hr != null ? { avgHrrPct: hr } : undefined
    );
    // Comeback toast: state.logEntry flags the entry when the player is armed.
    const after = getMatch(matchId);
    const last = after?.entries[after.entries.length - 1];
    const comebackApplied = !!last && last.playerId === me.id && !!(last as any).comeback;
    if (comebackApplied) toast(`⚡ COMEBACK ×${COMEBACK_MULTIPLIER} applied to that set!`, "ok");
    if (closed) {
      toast("You closed the match! 🏆", "ok");
      location.hash = `#/result/${matchId}`;
    } else {
      toast(`+${panel.count} ${exName()} logged${hr != null ? ` · ${Math.round(hr)}% HRR` : ""}`, "ok");
    }
  };

  // ── lane 7: verification (camera counting + HR strap) ─────────────────────
  const hrChipText = (): string =>
    hrSession.lost
      ? `HR LOST · ${Math.round(hrSession.ctrl?.stats().avgHrrPct ?? 0)}% AVG KEPT`
      : `HR LIVE · ${hrSession.bpm || "–"} BPM · ${Math.round(hrSession.hrrPct)}% HRR`;

  const refreshHrChip = (): void => {
    const chip = document.querySelector(".hrchip");
    if (!chip) return;
    chip.classList.toggle("hrchip--lost", hrSession.lost);
    const t = chip.querySelector(".hrchip-text");
    if (t) t.textContent = hrChipText();
  };

  const disconnectHr = (): void => {
    const stats = hrSession.ctrl?.stats();
    hrSession.ctrl?.stop();
    hrSession.ctrl = null;
    hrSession.lost = false;
    toast(
      stats && stats.avgHrrPct != null
        ? `Strap off — session avg ${Math.round(stats.avgHrrPct)}% HRR`
        : "Strap disconnected",
      "info"
    );
    touch();
  };

  const hrChip = hrSession.ctrl
    ? el("button", {
        class: `hrchip ${hrSession.lost ? "hrchip--lost" : ""}`,
        type: "button",
        title: "Tap to disconnect the strap",
        html: `<i class="hrchip-dot"></i><span class="hrchip-text">${hrChipText()}</span>`,
        onClick: () => disconnectHr(),
      })
    : null;

  const openHr = (): void => {
    if (hrSession.ctrl) {
      disconnectHr();
      return;
    }
    openHrSheet({
      onBpm: (bpm, hrrPct) => {
        hrSession.bpm = bpm;
        hrSession.hrrPct = hrrPct;
        refreshHrChip();
      },
      onStatus: (status, detail) => {
        if (status === "disconnected") {
          hrSession.lost = true;
          refreshHrChip();
          toast(detail ?? "Strap disconnected — partial average kept", "warn");
        }
      },
      onConnected: (ctrl) => {
        hrSession.ctrl = ctrl;
        hrSession.bpm = ctrl.stats().lastBpm ?? 0;
        hrSession.hrrPct = 0;
        hrSession.lost = false;
        toast(`❤ ${ctrl.deviceName ?? "Strap"} connected — effort now scores`, "ok");
        touch(); // re-render mounts the live chip
      },
    });
  };

  const openCamera = (): void => {
    openCameraVerifier({
      exerciseId: panel.exerciseId,
      allowedExercises: match.config.exercises.map((e) => e.id),
      onDone: (r) => {
        const ex = match.config.exercises.find((e) => e.id === r.exerciseId);
        if (!ex) {
          toast("That exercise isn't part of this match", "warn");
          return;
        }
        const hr = hrSession.ctrl?.takeSetAverage() ?? null;
        const closed = logEntry(
          matchId,
          me.id,
          r.exerciseId,
          r.reps,
          true,
          hr != null ? { avgHrrPct: hr } : undefined
        );
        toast(`✓ Camera verified ${r.reps} ${ex.name.toLowerCase()}`, "ok");
        if (closed) {
          toast("You closed the match! 🏆", "ok");
          location.hash = `#/result/${matchId}`;
        }
      },
    });
  };

  // ── AI narrator ───────────────────────────────────────────────────────────
  const cachedNarration = narrationCache.get(matchId);
  const narrateBtn = el("button", {
    class: "actbtn actbtn--sky",
    type: "button",
    html:
      `<span class="actbtn-ico">${icon("mic", 19)}</span>` +
      `<span class="actbtn-label">NARRATE</span>`,
    onClick: async () => {
      narrateBtn.disabled = true;
      const label = narrateBtn.querySelector(".actbtn-label");
      if (label) label.textContent = "CALLING…";
      const m = getMatch(matchId);
      const text = m ? await narrateMatch(m) : null;
      if (text) {
        narrationCache.set(matchId, text);
        touch(); // re-render shows the callout
      } else {
        narrateBtn.disabled = false;
        if (label) label.textContent = "NARRATE";
        toast("Commentator unreachable — try again", "warn");
      }
    },
  });
  const narrateCard = cachedNarration
    ? el(
        "div",
        { class: "rwf-card card-pad stack-sm narrate-card" },
        el(
          "div",
          { class: "ai-callout" },
          el("div", { class: "seclabel seclabel--lime", text: "🎙️ AI commentary" }),
          el("p", { class: "ai-callout-text", text: cachedNarration })
        )
      )
    : null;

  // ── AI taunt composer (falls back to the canned list on failure/timeout) ──
  const tauntBtn = el("button", {
    class: "actbtn actbtn--coral",
    type: "button",
    html:
      `<span class="actbtn-ico">${icon("flame", 19)}</span>` +
      `<span class="actbtn-label">TAUNT CREW</span>`,
    onClick: async () => {
      if (tauntInFlight) return;
      tauntInFlight = true;
      tauntBtn.disabled = true;
      const label = tauntBtn.querySelector(".actbtn-label");
      if (label) label.textContent = "COOKING…";
      // Fresh AI taunt aimed at a random opponent's stats; canned fallback.
      const m = getMatch(matchId);
      const rows = m ? standings(m) : [];
      const myIdx = rows.findIndex((r) => r.player.id === me.id);
      const pool = rows.filter((_, i) => i !== myIdx);
      const target = pool.length ? pool[Math.floor(Math.random() * pool.length)] : rows[0];
      let line: string | null = null;
      if (m && target) {
        line = await composeTaunt(
          me.name,
          {
            name: target.player.name,
            tier: target.player.tier,
            rank: rows.indexOf(target) + 1,
            rawReps: target.rawReps,
            adjustedScore: target.adjustedScore,
          },
          m.config.targetReps
        );
      }
      if (!line) line = TAUNTS[tauntIdx++ % TAUNTS.length]; // fallback: canned
      tauntFeed.unshift({ at: Date.now(), text: line });
      tauntFeed.length = Math.min(tauntFeed.length, 10);
      toast(`🔥 “${line}”`, "warn");
      tauntInFlight = false;
      touch();
    },
  });

  // ── feed (entries + this session's taunts) ─────────────────────────────────
  const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const nameOf = (pid: string): string => match.players.find((p) => p.id === pid)?.name ?? "?";
  const exOf = (eid: string): string => match.config.exercises.find((e) => e.id === eid)?.name.toLowerCase() ?? eid;
  const events: { at: number; html: string }[] = [
    ...match.entries.slice(-8).map((e) => ({
      at: e.at,
      html: `<b>${esc(nameOf(e.playerId))}</b> logged <b>${e.reps}</b> ${esc(exOf(e.exerciseId))}`,
    })),
    ...tauntFeed.map((t) => ({ at: t.at, html: `<b>You</b>: “${esc(t.text)}”` })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5);

  // ── assemble ───────────────────────────────────────────────────────────────
  root.append(
    el(
      "section",
      { class: "screen" },
      topbar("Match", {
        back: "#/",
        right: el(
          "span",
          { class: "topbar-meta" },
          el("span", { class: "pill pill--live", html: `<i class="pulse"></i>LIVE` }),
          el("span", { class: "muted small", text: `→ ${match.config.targetReps} reps` })
        ),
      }),

      el("div", { class: "rwf-card card-pad stack-sm" },
        el("div", { class: "seclabel", text: "Standings — adjusted score" }),
        ...rows.map(standingRow)
      ),

      el("div", { class: "actionrow" }, narrateBtn, tauntBtn),

      narrateCard,

      el(
        "div",
        { class: "rwf-card card-pad stack-sm logpanel" },
        el("div", { class: "seclabel", text: "Log a set" }),
        el("div", { class: "chiprow" }, ...exChips),
        el(
          "div",
          { class: "stepper" },
          el("button", { class: "stepbtn", type: "button", text: "−", onClick: () => setCount(panel.count - 5) }),
          countEl,
          el("button", { class: "stepbtn", type: "button", text: "+", onClick: () => setCount(panel.count + 5) })
        ),
        el("div", { class: "quickrow" },
          ...[10, 25, 50].map((n) =>
            el("button", { class: "chip chip--sm", type: "button", text: `+${n}`, onClick: () => setCount(n) })
          )
        ),
        logBtn,
        hrChip,
        el(
          "div",
          { class: "verifyrow" },
          el("button", {
            class: "rwf-btn btn-sm btn--ghost verifyrow-btn",
            type: "button",
            html: icon("camera", 15) + "<span>CAMERA VERIFY</span>",
            onClick: openCamera,
          }),
          el("button", {
            class: `rwf-btn btn-sm btn--ghost verifyrow-btn verifyrow-btn--hr ${hrSession.ctrl ? "on" : ""}`,
            type: "button",
            html: icon("heart", 15) + `<span>${hrSession.ctrl ? "HR LIVE · END" : "HR STRAP"}</span>`,
            onClick: openHr,
          })
        )
      ),

      el("div", { class: "rwf-card card-pad stack-sm feed" },
        el("div", { class: "seclabel", text: "Crew feed" }),
        events.length
          ? el("ul", { class: "feedlist" }, ...events.map((e) => el("li", { html: e.html })))
          : el("p", { class: "muted small", text: "Nothing yet. Log the first set." })
      ),

      stickyBar
    )
  );

  // ── demo-crew simulator ────────────────────────────────────────────────────
  const sims = match.players.filter((p) => p.id.startsWith("sim_"));
  let handle: number | undefined;
  if (sims.length > 0) {
    handle = window.setInterval(() => {
      const s = getState();
      const m: MatchState | undefined = s.matches.find((x) => x.config.id === matchId);
      if (!m || m.status !== "live") return;
      const p = sims[Math.floor(Math.random() * sims.length)];
      const ex = m.config.exercises[Math.floor(Math.random() * m.config.exercises.length)];
      const reps = 8 + Math.floor(Math.random() * 22);
      const closed = logEntry(matchId, p.id, ex.id, reps, false);
      if (closed) {
        toast(`${p.name} closed the match!`, "warn");
        location.hash = `#/result/${matchId}`;
      }
    }, 7000);
  }

  return () => {
    if (handle !== undefined) clearInterval(handle);
    stickyObserver?.disconnect();
    // The lift is global (set on :root) — clear it so other screens, which have
    // no floating bar, don't render their toasts hovering in mid-air.
    document.documentElement.style.removeProperty("--toast-lift");
  };
}
