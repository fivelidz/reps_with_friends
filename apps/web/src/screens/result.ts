// Result — screenshot-worthy champion card, final standings, charity pot picker,
// MVP vote, and a downloadable 1200×675 result card (canvas → PNG).
import { CLOSURE_BONUS, potTotalCents, standings, winner } from "../engine.ts";
import { CHARITIES } from "../data.ts";
import { designateCharity, getState, voteMvp } from "../state.ts";
import { drawResultCard } from "../card.ts";
import { avatar, el, fmtScore, icon, money, posMark, tierBadge, toast, topbar } from "../ui.ts";

export function renderResult(root: HTMLElement, matchId: string): () => void {
  const st = getState();
  const match = st.matches.find((m) => m.config.id === matchId);
  if (!match || match.status !== "complete") {
    location.hash = "#/";
    return () => {};
  }
  const pot = st.pots[matchId];
  const win = winner(match);
  if (!win) {
    location.hash = "#/";
    return () => {};
  }
  const champ = match.players.find((p) => p.id === win.playerId)!;
  const rows = standings(match);
  const nameOf = (pid: string): string => match.players.find((p) => p.id === pid)?.name ?? "—";
  const chosen = pot?.designatedCharityId ? CHARITIES.find((c) => c.id === pot.designatedCharityId) : undefined;

  // ── champion card ──────────────────────────────────────────────────────────
  // Pure-CSS confetti burst (~20 particles). Colours from the token palette;
  // hidden entirely under prefers-reduced-motion (see styles.css).
  const CONFETTI_COLORS = ["var(--lime)", "var(--coral)", "var(--amber)", "var(--sky)", "#e8eaed"];
  const confetti = el(
    "div",
    { class: "confetti", "aria-hidden": "true" },
    ...Array.from({ length: 20 }, (_, i) => {
      const angle = (i / 20) * Math.PI * 2 + 0.4;
      const dist = 90 + ((i * 37) % 70);
      return el("i", {
        class: "confetti-p",
        style:
          `--tx:${Math.round(Math.cos(angle) * dist)}px;` +
          `--ty:${Math.round(60 + Math.sin(angle) * 60 + (i % 5) * 22)}px;` +
          `--rot:${Math.round(((i * 53) % 360) - 180)}deg;` +
          `--c:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};` +
          `--d:${(i % 7) * 90}ms;` +
          `--w:${5 + (i % 3) * 3}px;`,
      });
    })
  );

  const champCard = el(
    "div",
    { class: "rwf-card card-pad champcard" },
    confetti,
    el("div", { class: "champcrown", html: icon("crown", 34) }),
    el("div", { class: "seclabel seclabel--lime", text: "Champion" }),
    avatar(champ.name, champ.tier, 64),
    el("div", { class: "champname h-display", text: champ.name }),
    el("div", { class: "champbadges" }, tierBadge(champ.tier), win.closedMatch ? el("span", { class: "tier tier--bonus", text: `+${CLOSURE_BONUS} CLOSURE` }) : null),
    el("div", { class: "champscore", text: fmtScore(win.adjustedScore) }),
    el("div", { class: "seclabel", text: "adjusted score" }),
    el("p", { class: "muted small", text: win.closedMatch ? `${champ.name} hit ${match.config.targetReps} raw reps and closed the match.` : `Highest effort-adjusted score when ${nameOf(match.closedBy ?? "")} closed the match.` })
  );

  // ── final standings ────────────────────────────────────────────────────────
  const finalRows = rows.map((row, i) =>
    el(
      "div",
      { class: `strow ${i === 0 ? "lead" : ""}` },
      el(
        "div",
        { class: "strow-r1" },
        el("span", {
          class: `rank ${i < 3 ? "rank--medal" : ""} rank--${i + 1}`,
          text: posMark(i),
          "aria-label": `position ${i + 1}`,
        }),
        el("span", { class: "strow-name" }, row.player.name, tierBadge(row.player.tier)),
        el("div", { class: "score" }, el("b", { text: fmtScore(row.adjustedScore) }), el("span", { text: `${row.rawReps} raw` }))
      ),
      el("div", { class: "bar" }, el("i", { style: `width:${row.progressPct}%` }))
    )
  );

  // ── charity pot ────────────────────────────────────────────────────────────
  const total = pot ? potTotalCents(pot) : 0;
  const contribs = (pot?.contributions ?? []).map((c) =>
    el("div", { class: "potline" }, el("span", { text: nameOf(c.playerId) }), el("span", { text: money(c.amountCents) }))
  );

  let picked: string | null = null;
  const charityCards = CHARITIES.map((c) => {
    const isChosen = chosen?.id === c.id;
    const card = el(
      "button",
      {
        class: `charitycard ${isChosen ? "on" : ""}`,
        type: "button",
        disabled: !!chosen,
        onClick: () => {
          picked = c.id;
          charityCards.forEach((x) => x.classList.remove("sel"));
          card.classList.add("sel");
          designateBtn.disabled = false;
        },
      },
      el("span", { class: "charitycard-name", text: c.name }),
      isChosen || chosen ? el("span", { class: "charitycard-check", html: icon("check", 14) }) : null
    );
    return card;
  });

  const designateBtn = el(
    "button",
    {
      class: "rwf-btn rwf-btn--primary btn-block",
      text: "DESIGNATE POT",
      disabled: true,
      onClick: () => {
        if (!picked) return;
        designateCharity(matchId, picked);
      },
    }
  );

  const potCard = el(
    "div",
    { class: "rwf-card card-pad stack-sm potcard" },
    el("div", { class: "seclabel", text: "Charity pot" }),
    el("div", { class: "pottotal", text: money(total) }),
    el("div", { class: "potlines" }, ...contribs),
    chosen
      ? el("div", { class: "potdone", html: icon("check", 16) }, el("span", { text: `Pot → ${chosen.name}` }))
      : el(
          "div",
          { class: "stack-sm" },
          el("div", { class: "seclabel", text: `${champ.name} picks — winner directs the pot` }),
          el("div", { class: "charitygrid" }, ...charityCards),
          designateBtn
        )
  );

  // ── MVP vote (one local vote; counts to the season via recordMatch) ───────
  const myVote = st.mvp?.[matchId];
  const mvpPlayer = myVote ? match.players.find((p) => p.id === myVote) : undefined;
  const mvpCard = el(
    "div",
    { class: "rwf-card card-pad stack-sm mvpcard" },
    el("div", { class: "seclabel", text: "MVP vote — best effort, not the winner" }),
    mvpPlayer
      ? el(
          "div",
          { class: "mvp-locked" },
          avatar(mvpPlayer.name, mvpPlayer.tier, 40),
          el("div", { class: "mvp-locked-id" },
            el("span", { class: "mvp-locked-name" }, mvpPlayer.name),
            el("span", { class: "muted small", text: "Your vote is locked · +1 season point" })
          ),
          el("span", { class: "mvp-medal", text: "🏅" })
        )
      : el(
          "div",
          { class: "stack-sm" },
          el("p", { class: "hint", text: "Tap a player — one vote, locks instantly." }),
          el(
            "div",
            { class: "mvp-chips" },
            ...match.players.map((p) =>
              el(
                "button",
                {
                  class: "mvp-chip",
                  type: "button",
                  onClick: () => {
                    voteMvp(matchId, p.id);
                    toast(`MVP vote locked: ${p.name} 🏅`, "ok");
                  },
                },
                avatar(p.name, p.tier, 30),
                el("span", { class: "mvp-chip-name", text: p.name }),
                el("span", { class: "mvp-chip-vote", text: "VOTE" })
              )
            )
          )
        )
  );

  // ── shareable result card (1200×675 canvas → PNG download) ────────────────
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  canvas.className = "result-canvas";
  const cardData = {
    match,
    rows,
    winnerId: win.playerId,
    winnerScore: win.adjustedScore,
    closedMatch: win.closedMatch,
    potCents: total,
    charityName: chosen?.name,
    mvpName: mvpPlayer?.name,
    crewCode: st.crew?.code,
  };
  const draw = (): void => drawResultCard(canvas, cardData);
  draw();
  // Redraw once the display font is actually loaded (first paint may fall back).
  if (typeof document !== "undefined" && (document as any).fonts?.ready) {
    (document as any).fonts.ready.then(draw).catch(() => {});
  }
  const saveCard = (): void => {
    canvas.toBlob((blob) => {
      if (!blob) {
        toast("Couldn't render the card — try again", "warn");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rwf-${match.config.targetReps}reps-${champ.name.toLowerCase().replace(/\s+/g, "-")}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Result card saved — go rub it in 📸", "ok");
    }, "image/png");
  };
  const shareCard = el(
    "div",
    { class: "rwf-card card-pad stack-sm sharecard" },
    el("div", { class: "seclabel", text: "Share card" }),
    el(
      "div",
      { class: "photoframe" },
      canvas,
      el("div", { class: "photoframe-cap", text: "REPS WITH FRIENDS 📸" })
    ),
    el("button", {
      class: "rwf-btn rwf-btn--primary btn-block",
      html: icon("download", 16) + "<span>SAVE CARD</span>",
      onClick: saveCard,
    })
  );

  root.append(
    el(
      "section",
      { class: "screen" },
      topbar("Match complete", { back: "#/" }),
      el("div", { class: "matchdate muted small", text: new Date(match.completedAt ?? Date.now()).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) }),
      champCard,
      el("div", { class: "rwf-card card-pad stack-sm" }, el("div", { class: "seclabel", text: "Final standings" }), ...finalRows, el("p", { class: "hint", text: `Closer gets +${CLOSURE_BONUS} on top of their adjusted score.` })),
      mvpCard,
      potCard,
      shareCard,
      el("p", { class: "rubin", text: "Screenshot this. Rub it in. ♻️ Next match Sunday." }),
      el("button", { class: "rwf-btn btn-block btn-lg", text: "DONE", onClick: () => (location.hash = "#/") })
    )
  );
  return () => {};
}
