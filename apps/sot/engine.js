/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 — SoT ENGINE BRIDGE (state store + shared-engine rules)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The RULES live in apps/sot-engine.js (the shared daily-battle engine,
   itself a port of packages/game-core ENGINE V4). This module is the app's
   state store + orchestration layer: persistence (rwf.sot.v1), members,
   feed events, screens-facing snapshots — and every rule decision is
   delegated to the shared engine through its documented API:

     Core.createDay / logSet / closeDay / activatePowerUp / grantPowerUp /
     resolveExpiredBombs            — one engine `day` object per battle
     Core.createBattleSeason / recordBattleDay / dayRecordFrom /
     battleStandings / endBattleSeason — one engine `season` per season
     Core.proposeStake / agreeToStake / contributeToCharityStake /
     resolveSeasonStake / designateCharity / processCharityDonation /
     markStakeFulfilled — stake lifecycle (points = trial currency; the UI
     displays 1 point as $1 for the charity demo)

   Semantics this bridge adopts from the shared engine (supersede the
   earlier local model — see the handover):
   · Rep Steal is PURE GAIN in bonusRuf; it counts toward the target only
     under the day flag stealCanTriggerWin (SOT Q237) — this demo sets it.
   · Surprise Bomb: +20 RUF in 10 minutes — a HIT banks a +20 defusal
     bonus for the victim; a MISS fizzles (no target growth).
   · Lightning: once per day, ×3 for 10 minutes. Freeze: group-wide +30 min
     deadline extension (stack limit 1). Rescue Rope: 50 credit, inactive
     mates only. Group Shield: streak protection consumed at the close it
     saves. Double Down: 2× target personal quest (reward-side).
   · First ELIGIBLE player to the base target earns the Daily Win; later
     finishers still bank the day. 1 Daily Win = 1 season point.
   · Exercise values (push-up 1.0, burpee 2.0 …) are applied BEFORE the
     engine call (reps are RUF-equivalent); the SOT conversion table is an
     open gap and stays in the app layer. RUF is internal — the UI says
     "reps" (Q216 ruling).

    FACADE (unchanged surface for app.js + e2e):
    SoT.load/save/setMe/subscribe · createGroup/startSeason/startNextSeason/
    joinByCode/agreeStake · snapshot · logReps/undoLast/activateCard/tick ·
    pickDraft/rerollDeal/voteProof/debugGrant (the v4.1 card stack) ·
    resolveCharity/markObligationFulfilled/react · resetProfile/resetAll ·
    EXERCISES/CARDS/CHARITIES/TIERS… (see the bottom export).
   ═══════════════════════════════════════════════════════════════════════ */

let Core = null;
try {
  Core = await import("./sot-engine.js");
  if (!Core || typeof Core.createDay !== "function") Core = null;
} catch (e) {
  Core = null;
}
if (!Core) {
  throw new Error("RWF v4 needs apps/sot-engine.js (the shared daily-battle engine)");
}

const STORE_KEY = "rwf.sot.v1";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ── handicap tiers (multiplier changes what a rep is WORTH) ───────── */
const TIERS = [
  { id: "couch", label: "Couch", mult: Core.TIER_MULTIPLIERS.couch, blurb: "Just getting moving — every rep counts extra." },
  { id: "casual", label: "Casual", mult: Core.TIER_MULTIPLIERS.casual, blurb: "Train now and then." },
  { id: "fit", label: "Fit", mult: Core.TIER_MULTIPLIERS.fit, blurb: "Regular training." },
  { id: "athlete", label: "Athlete", mult: Core.TIER_MULTIPLIERS.athlete, blurb: "Serious engine — reps count for less." },
];

/* ── stock exercise library (SOT §3.3: 12 core + variants) ───────────
     value = conversion proposal (official table is an open SOT gap);
     applied BEFORE the engine call, so reps handed to the engine are
     RUF-equivalent physical reps. */
const EXERCISES = [
  { id: "pushups", name: "Push-ups", cat: "Upper", value: 1.0, unit: "reps", icon: "🙌", variants: "Wide · Diamond · Incline · Decline", cues: "Body straight, chest to floor, full lockout." },
  { id: "squats", name: "Squats", cat: "Legs", value: 1.0, unit: "reps", icon: "🦵", variants: "Jump · Pistol · Bulgarian split", cues: "Hips below knee, drive through heels." },
  { id: "burpees", name: "Burpees", cat: "Full body", value: 2.0, unit: "reps", icon: "💥", variants: "Half · Box-jump finish", cues: "Chest to floor, explode up." },
  { id: "lunges", name: "Lunges", cat: "Legs", value: 1.0, unit: "reps", icon: "🚶", variants: "Reverse · Jumping · Walking", cues: "Back knee to floor, tall torso." },
  { id: "mtnclimbers", name: "Mountain Climbers", cat: "Core", value: 0.5, unit: "reps", icon: "⛰️", variants: "Cross-body · Slow tempo", cues: "Hips low, quick knee drives." },
  { id: "plankjacks", name: "Plank Jacks", cat: "Core", value: 0.5, unit: "reps", icon: "🧗", variants: "Up-downs · Plank to down-dog", cues: "Strong plank, feet wide and back." },
  { id: "jumprope", name: "Jump Rope", cat: "Cardio", value: 0.5, unit: "jumps", icon: "🪢", variants: "Double unders · Single-leg", cues: "Light bounces, wrists do the work." },
  { id: "dips", name: "Dips", cat: "Upper", value: 1.0, unit: "reps", icon: "🪑", variants: "Straight-leg · Bent-knee", cues: "Elbows back, shoulders down." },
  { id: "highknees", name: "High Knees", cat: "Cardio", value: 0.5, unit: "reps", icon: "🏃", variants: "Quick feet · Butt kickers", cues: "Knees to hip height, stay tall." },
  { id: "bicycle", name: "Bicycle Crunches", cat: "Core", value: 0.5, unit: "reps", icon: "🚲", variants: "Reverse crunches · Leg raises", cues: "Slow and controlled, elbow to knee." },
  { id: "jumpingjacks", name: "Jumping Jacks", cat: "Cardio", value: 0.5, unit: "reps", icon: "⭐", variants: "Star jumps · Seal jacks", cues: "Full arm extension, soft knees." },
  { id: "wallsit", name: "Wall Sit", cat: "Legs", value: 1.0, unit: "secs", icon: "🧱", secsPerRep: 10, variants: "Single-leg · Calf-raise finish", cues: "Thighs parallel to floor, hold." },
  { id: "plank", name: "Plank Hold", cat: "Core", value: 1.0, unit: "secs", icon: "➖", secsPerRep: 10, variants: "Side plank · Shoulder taps", cues: "Rigid line, squeeze glutes." },
];

/* ── power-up cards — ids are the shared engine kinds ────────────────
      The full CARD STACK (engine CARD_CATALOG) + app-side copy: the
      detail line, the glyph, and the target-picker hints the UI needs.
      canon: true marks the SOT §3.6 launch four. */
const CARD_ICONS = {
  lightning: "⚡", steal: "🥷", shield: "🛡️", freeze: "❄️",
  combo_boost: "🔥", double_down: "🎲", assist_boost: "🤝",
  surprise_bomb: "💣", rescue_rope: "🪢", shield_bash: "🔨",
  double_exercise: "🏋️", specialist: "🎯", wildcard_workout: "🃏",
  rivalry: "⚔️", training_partners: "🤜", pack_bond: "🐺",
  prove_it: "📋", spot_check: "🔍",
  second_wind: "💨", mulligan: "🔄", underdog: "🐕",
};
const CARD_DETAIL = {
  lightning: "Activate, then log — every rep inside the window scores ×3. Once per day; the group sees the storm.",
  steal: "You gain 10% of their completed score — and they keep every rep. Pure gain, no mercy. Once per day.",
  shield: "If someone fails the day while the shield is armed, their streak survives. Consumed at the close it saves.",
  freeze: "The deadline extends half an hour for the WHOLE group. One freeze per day.",
  surprise_bomb: "Drop +20 reps on a rival. Deliver inside 10 minutes and the bomb pays THEM a +20 defusal bonus; let it fizzle and nothing sticks.",
  rescue_rope: "A mate with zero reps today? The rope hands them an instant 50-rep credit toward target. Once per day.",
  combo_boost: "Arm the group's prescribed exercise sequence and land it in order for the rep bonus.",
  double_down: "A personal quest: clear double your target today. Season-point doubling only under competitive flags.",
  assist_boost: "Arm it on a teammate: when THEY finish inside the window, you both pocket +25 bonus reps.",
  shield_bash: "Competitive mode: smash the crew's armed shield and its protection ends.",
  double_exercise: "Name ONE exercise from today's library — every set of it you log counts double for the rest of the day.",
  specialist: "Your three most-logged exercises are locked in at play time — new sets of those count ×1.5 today.",
  wildcard_workout: "Today, any movement counts as any other: mix it up, log it under whatever fits, the crew sees the wild log.",
  rivalry: "Pick a rival. Whoever has banked more reps when the day closes takes +30 bonus reps. Tie pays nobody.",
  training_partners: "Pick a partner. If you BOTH bank the day, you both pocket +25 bonus reps and the partner stat. One partner per day.",
  pack_bond: "Team card: bond the pack — every member who logs 20+ reps today banks +10% on top of their work.",
  prove_it: "Target a rival's NEXT set: they mark it verified (camera or timer) and THEY bank +15 reps for the honesty. Skip it and the crew accepts or contests the set.",
  spot_check: "A proof check lands on the current leader's biggest set — verified sets are immune, everything else goes to the crew.",
  second_wind: "Way behind? Your reps count ×1.5 for 15 minutes. Only fires when you're 40%+ off the lead.",
  mulligan: "Scrap the hand you're holding — three fresh cards hit the table. The discarded cards are gone for good.",
  underdog: "Last place when you play it? Every rep you log today counts ×1.25. Front-runners can't ride it.",
};
const CARDS = Object.fromEntries(
  Object.entries(Core.CARD_CATALOG).map(([id, c]) => [
    id,
    { id, name: c.name, rarity: c.rarity, family: c.family, canon: c.family === "canon",
      target: c.target, expiry: c.expiry, blurb: c.blurb,
      detail: CARD_DETAIL[id] || c.blurb, icon: CARD_ICONS[id] || "🃏" },
  ])
);

const CHARITIES = [
  { id: "heart", name: "Heart Foundation", icon: "❤️", note: "Heart health research & prevention" },
  { id: "beyondblue", name: "Beyond Blue", icon: "💙", note: "Mental health support" },
  { id: "pcyc", name: "PCYC", icon: "🟦", note: "Youth community programs" },
];

const COLORS = ["#f5c445", "#a06bff", "#4fd1c5", "#ff7a90", "#7cc4ff", "#ffd166"];

/* ── state ─────────────────────────────────────────────────────────── */
let state = null;
const listeners = new Set();
function emit() { for (const fn of listeners) { try { fn(state); } catch (e) { console.warn("SoT listener", e); } } }

function blankState() { return { v: 1, onboarded: false, me: null, groups: {}, activeGroupId: null }; }
function load() {
  try { state = JSON.parse(localStorage.getItem(storeKey) || "null"); } catch { state = null; }
  if (!state || state.v !== 1) state = blankState();
  return state;
}
function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) { console.warn("SoT save failed", e); }
  emit();
}

/* ── shadow state (the guided demo's safety net, v1 demo-driver pattern) ──
   useKey(DEMO_KEY) swaps persistence to a throwaway key so the demo can
   seed a full live battle WITHOUT touching the real save; useKey(null)
   returns to the real key (exitDemo restores the snapshot itself). */
let storeKey = STORE_KEY;
function useKey(key) {
  const next = key || STORE_KEY;
  if (next === storeKey) { emit(); return state; }
  try { if (state) localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) { /* best-effort */ }
  storeKey = next;
  try { state = JSON.parse(localStorage.getItem(storeKey) || "null"); } catch { state = null; }
  if (!state || state.v !== 1) state = blankState();
  emit();
  return state;
}

const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
const rnd = (n) => Math.floor(Math.random() * n);

/* ── profile ───────────────────────────────────────────────────────── */
function setMe(patch) {
  if (!state.me) {
    state.me = { id: uid("p"), name: "", initials: "", color: COLORS[rnd(COLORS.length)],
      tone: "cheeky", tier: "fit", sfxMuted: false, quietFrom: "21:00", quietTo: "07:00" };
  }
  Object.assign(state.me, patch);
  save();
  return state.me;
}

/* ── group creation (wizard cfg) ───────────────────────────────────── */
function makeCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += A[rnd(A.length)];
  return c;
}
function tierOf(id) { return TIERS.find((t) => t.id === id) || TIERS[2]; }

function createGroup(cfg) {
  const g = {
    id: uid("g"), code: makeCode(), name: cfg.name, icon: cfg.icon || "⚡", color: cfg.color || "#f5c445",
    mode: cfg.mode || "individual",
    teams: cfg.teams || [],
    activeDays: cfg.activeDays && cfg.activeDays.length ? cfg.activeDays.slice() : [1, 2, 3, 4, 5],
    seasonLength: cfg.seasonLength || "weekly",
    target: cfg.target || Core.DEFAULT_DAILY_TARGET_RUF,
    clockMode: cfg.clockMode || "window", windowStart: 6, windowEnd: 22,
    durationMin: Math.max(1, cfg.durationMin || 1),
    exerciseIds: cfg.exerciseIds && cfg.exerciseIds.length ? cfg.exerciseIds.slice() : EXERCISES.map((e) => e.id),
    stake: normalizeStake(cfg.stake || { type: "none" }),
    // the card stack: every dealable kind is on by default (the founder's
    // card system IS the product); shield_bash stays opt-in (competitive)
    powerUps: Object.assign(
      Object.fromEntries(Object.keys(CARDS).map((k) => [k, k !== "shield_bash"])),
      mapLegacyPowerUps(cfg.powerUps || {})),
    members: [], seasons: [], currentSeasonId: null,
    events: [], createdAt: Date.now(),
  };
  addMemberTo(g, { id: state.me.id, name: state.me.name, initials: state.me.initials, color: state.me.color, tier: state.me.tier, isHouse: false, joinedAt: Date.now() });
  for (const h of cfg.housePlayers || []) {
    addMemberTo(g, { id: uid("m"), name: h.name, initials: h.name.slice(0, 2).toUpperCase(), color: COLORS[rnd(COLORS.length)], tier: h.tier, isHouse: true, joinedAt: Date.now() });
  }
  if (cfg.teams && cfg.mode === "team") g.teams = cfg.teams;
  // the stake was agreed at creation — the initial roster counts as in
  // (joiners agree explicitly through the join flow; SOT §4.2 acceptance)
  if (g.stake.type !== "none") for (const m of g.members) m.stakeAgreed = true;
  state.groups[g.id] = g;
  state.activeGroupId = g.id;
  pushEvent(g, { type: "group_created", memberId: state.me.id, text: `${g.name} is up — invite code ${g.code}` });
  save();
  return g;
}
/* wizard cfg may still carry pre-integration ids — normalise once */
function mapLegacyPowerUps(p) {
  const alias = { bomb: "surprise_bomb", rescue: "rescue_rope", combo: "combo_boost", doubleDown: "double_down", assist: "assist_boost", shieldBash: "shield_bash" };
  const out = {};
  for (const [k, v] of Object.entries(p)) out[alias[k] || k] = v;
  return out;
}

function normalizeStake(s) {
  const base = { type: s.type || "none" };
  if (s.type === "dinner") { base.description = s.description || "Loser shouts the post-season dinner"; base.capCents = s.capCents ?? 8000; }
  if (s.type === "dare") { base.dareText = s.dareText || "Wear the silliest costume to next week's session"; }
  if (s.type === "deliverable") { base.description = s.description || "Loser owes the crew a practical favour (car wash, coffee run…)"; }
  if (s.type === "charity") { base.perPersonCents = s.perPersonCents ?? 1000; base.feePct = s.feePct ?? 5; }
  return base;
}

function addMemberTo(g, m) {
  g.members.push(Object.assign({ teamId: null, streak: 0, bestStreak: 0, lifetimeReps: 0, dailyWins: 0, completions: 0, failedDays: 0, stakeAgreed: false }, m));
}

/* ── engine-player view of a member ────────────────────────────────── */
const enginePlayer = (m) => ({ id: m.id, name: m.name, tier: m.tier });

/* ── seasons & battles (engine day objects live inside) ────────────── */
function seasonBattleDays(g) {
  // weekly = one pass of the active days; monthly = four passes
  const days = g.activeDays.slice().sort((a, b) => a - b);
  const passes = g.seasonLength === "monthly" ? 4 : 1;
  const out = [];
  for (let p = 0; p < passes; p++) out.push(...days);
  return out;
}

function startSeason(gRaw) {
  const g = asGroup(gRaw);
  if (!g) return null;
  const idx = g.seasons.length + 1;
  const roster = g.members.map(enginePlayer);
  const core = Core.createBattleSeason({ id: uid("s"), name: `Season ${idx}`, length: g.seasonLength === "monthly" ? "monthly" : "weekly", playDays: g.activeDays, targetReps: g.target }, roster);
  const s = {
    id: core.config.id, idx, label: `Season ${idx}`, length: g.seasonLength,
    status: "active", startedAt: Date.now(), endedAt: null,
    battles: [], core,
    winnerId: null, loserIds: [],
    stake: JSON.parse(JSON.stringify(g.stake)),
    stakeResolution: { status: g.stake.type === "none" ? "none" : "pending" },
  };
  // stake lifecycle on the engine object (points = trial currency; the
  // charity demo displays 1 point as $1)
  if (g.stake.type !== "none") {
    let decl = stakeDeclaration(g);
    let coreStake = Core.proposeStake(core, {
      type: g.stake.type, declaration: decl,
      ...(g.stake.type === "charity" ? { charity: { perPlayerPoints: g.stake.perPersonCents / 100, platformFeeRate: g.stake.feePct / 100 } } : {}),
    }, roster.map((p) => p.id));
    for (const m of g.members) if (m.stakeAgreed) coreStake = Core.agreeToStake(coreStake, m.id);
    if (g.stake.type === "charity" && coreStake.stake.status === "active") {
      for (const m of g.members) if (m.stakeAgreed) coreStake = Core.contributeToCharityStake(coreStake, m.id, g.stake.perPersonCents / 100);
    }
    s.core = coreStake;
  }
  g.seasons.push(s);
  g.currentSeasonId = s.id;

  const days = seasonBattleDays(g);
  for (let i = 0; i < days.length; i++) {
    s.battles.push({ idx: i + 1, dayIdx: days[i], dayName: DAY_NAMES[days[i]],
      startMs: null, deadlineMs: null, frozenUntilMs: null,
      status: i === 0 ? "live" : "scheduled", core: null,
      winnerId: null, winnerAtMs: null, completions: {}, failures: [], steals: [], bombs: [] });
  }
  // the card system (v4.1): no more founder pack / random drop — every
  // battle day OPENS with a deal of three, pick one (the founder's
  // directive). beginBattle → createEngineDay → dealDay deals the cards.
  beginBattle(g, s, s.battles[0]);
  pushEvent(g, { type: "season_start", memberId: g.members[0].id, text: `${s.label} is LIVE — ${s.battles.length} battle days, first to ${g.target} takes the Daily Win`, season: s.id });
  save();
  return s;
}

function stakeDeclaration(g) {
  const s = g.stake;
  if (s.type === "dinner") return `Loser shouts the meal — ${s.description || "agreed dinner"} (cap $${((s.capCents || 0) / 100).toFixed(0)})`;
  if (s.type === "dare") return `The dare, locked before the season: ${s.dareText}`;
  if (s.type === "deliverable") return `Loser owes the favour: ${s.description}`;
  if (s.type === "charity") return `Charity pot — everyone contributes, the winner directs the donation (${s.feePct}% disclosed platform fee)`;
  return "Pride only";
}

function beginBattle(g, s, b) {
  b.status = "live";
  b.startedAtMs = Date.now();
  if (g.clockMode === "duration") {
    b.startMs = b.idx === 1 ? Date.now() : s.battles[b.idx - 2].deadlineMs; // rolling sprint
    b.deadlineMs = b.startMs + g.durationMin * 60_000;
  } else {
    // window clock: this battle plays on the next occurrence of its weekday
    const base = new Date(s.startedAt);
    const offset = (b.dayIdx - base.getDay() + 7) % 7;
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    b.startMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), g.windowStart, 0, 0).getTime();
    let dl = new Date(d.getFullYear(), d.getMonth(), d.getDate(), g.windowEnd, 0, 0).getTime();
    if (dl <= b.startMs) dl += 24 * 3600_000;
    b.deadlineMs = dl;
    if (b.startMs > Date.now()) b.status = "scheduled";
  }
  if (b.status === "live") createEngineDay(g, s, b);
}

function createEngineDay(g, s, b) {
  const roster = g.members.filter((m) => m.joinedAt <= Date.now() + 1000).map(enginePlayer);
  b.core = Core.createDay({
    id: `${s.id}-d${b.idx}`,
    playDays: g.activeDays,
    deadlineAt: b.deadlineMs,               // engine adds freeze extensions on top
    targetReps: g.target,
    exercises: g.exerciseIds.map((id) => ({ id })),
    flags: { stealCanTriggerWin: true },     // our answer to SOT Q237 for this demo
  }, roster);
  // cards are day-scoped now: drafted cards expire when the battle closes
  // (the expiry sweep) — nothing carries across battles. Day open = deal.
  dealDay(g, s, b, "open");
  pushEvent(g, { type: "battle_start", memberId: g.members[0].id, battle: b.idx, text: `Battle day ${b.idx} is LIVE — first to ${g.target} takes the Daily Win` });
}

/* ── the deal (v4.1): three dealt, pick one — the founder's directive ──
      Every battle day opens with a deal for each player; crossing 50% of
      target EARNS a bonus deal (once per day). House players auto-pick
      (they have no screen); the human's deal waits on the day until they
      pick, reroll, or the deadline sweeps it. */
function stackPool(g) {
  return Object.keys(CARDS).filter((k) => g.powerUps[k]);
}

function dealDay(g, s, b, reason, onlyId = null) {
  if (!b.core || b.core.status !== "live") return false;
  const pool = stackPool(g);
  if (!pool.length) return false;
  let dealt = false;
  for (const m of g.members) {
    if (onlyId && m.id !== onlyId) continue;                  // halfway deals THE player who crossed
    if (!eligible(g, b, m)) continue;
    if (Core.inventoryOf(b.core, m.id).length >= Core.HAND_CAP) continue;
    if (b.core.drafts && b.core.drafts[m.id]) continue;
    const ret = Core.draftOptions(b.core, m.id, { at: Date.now(), reason, pool });
    if (!ret.result.ok) continue;
    b.core = ret.state;
    dealt = true;
    if (m.isHouse) {
      // the house crew picks immediately (they don't have a screen)
      const pick = ret.options[rnd(ret.options.length)];
      const done = Core.draftPick(b.core, m.id, pick);
      if (done.result.ok) b.core = done.state;
      pushEvent(g, { type: "deal", memberId: m.id, battle: b.idx, quiet: true, text: `🃏 ${firstName(g, m)} took a card from the deal — ${CARDS[pick].name}` });
    } else {
      pushEvent(g, { type: "deal", memberId: m.id, battle: b.idx, text: `🃏 three cards on the table for ${firstName(g, m)} — pick one` });
    }
  }
  return dealt;
}

/* ── battle math (reads through the engine day) ────────────────────── */
function memberById(g, id) { return g.members.find((m) => m.id === id); }
function firstName(g, m) { return m.name.split(" ")[0]; }
function exerciseById(id) { return EXERCISES.find((e) => e.id === id); }
function eligible(g, b, m) { return !!b.core && b.core.players.some((p) => p.id === m.id); }

function progOf(b, id) { return (b.core && b.core.progress[id]) || { ruf: 0, creditRuf: 0, bonusRuf: 0, completedAt: null }; }
function displayTotal(b, id) { const p = progOf(b, id); return Math.round(p.ruf + p.creditRuf + p.bonusRuf); }
function targetProgress(b, id) { return b.core ? Math.round(Core.targetProgressOf(b.core, id)) : 0; }
function dayTargetFor(g, b, m) { return b.core ? Core.effectiveTargetOf(b.core, m.id) : g.target; }
function effDeadline(b) { return b.core ? Core.effectiveDeadline(b.core) : (b.deadlineMs || 0); }

function totalsFor(b, id) { const p = progOf(b, id); return { physical: 0, adjusted: Math.round(p.ruf + p.creditRuf + p.bonusRuf) }; }

function snapshotBoard(g, b) {
  const rows = [];
  for (const m of g.members) {
    if (!eligible(g, b, m)) continue;
    const target = dayTargetFor(g, b, m);
    const prog = targetProgress(b, m.id);
    const done = progOf(b, m.id).completedAt != null;
    rows.push({ member: m, physical: 0, adjusted: displayTotal(b, m.id), dayTarget: target,
      pct: Math.min(1, target ? prog / target : 0), remaining: Math.max(0, target - prog),
      completed: done, completedAt: done ? progOf(b, m.id).completedAt : null,
      isWinner: !!(b.core && b.core.winnerId === m.id), eligible: true,
      hand: (b.core && Core.inventoryOf(b.core, m.id)) || [] });
  }
  rows.sort((a, b2) => {
    if (a.completed && b2.completed) return a.completedAt - b2.completedAt;
    if (a.completed !== b2.completed) return a.completed ? -1 : 1;
    return b2.adjusted - a.adjusted;
  });
  return rows;
}

function teamTotals(g, b) {
  return (g.teams || []).map((t) => {
    const members = g.members.filter((m) => m.teamId === t.id);
    const adj = members.reduce((s2, m) => s2 + displayTotal(b, m.id), 0);
    const tgt = members.reduce((s2, m) => s2 + dayTargetFor(g, b, m.id), 0);
    const done = members.every((m) => progOf(b, m.id).completedAt != null);
    return { team: t, adjusted: adj, target: tgt, pct: Math.min(1, tgt ? adj / tgt : 0), complete: done, members };
  });
}

/* ── logging (delegated: Core.logSet) ──────────────────────────────── */
function logReps(gRaw, memberId, exerciseId, physical, opts = {}) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = curSeason(g); if (!s) return { error: "no active season" };
  const b = curBattle(s); if (!b || b.status !== "live" || !b.core) return { error: "battle not live" };
  const m = memberById(g, memberId); if (!m) return { error: "unknown member" };
  const ex = exerciseById(exerciseId); if (!ex) return { error: "unknown exercise" };
  if (!g.exerciseIds.includes(exerciseId)) {
    // Wildcard Workout lifts the allowlist in the engine — the app converts
    // the physical reps at the group's BEST exercise value for the holder
    const wild = !!(b.core.modifiers && b.core.modifiers[memberId] && b.core.modifiers[memberId].wildcard);
    if (!wild) return { error: "exercise not allowed in this group" };
  }
  physical = Math.max(1, Math.round(physical));
  const wildOn = !!(b.core.modifiers && b.core.modifiers[memberId] && b.core.modifiers[memberId].wildcard);
  const convertEx = wildOn ? bestValueExercise(g) : ex;
  const rufReps = convertEx.secsPerRep ? Math.round((physical / convertEx.secsPerRep) * convertEx.value) : Math.round(physical * convertEx.value);

  const beforeProg = targetProgress(b, m.id);
  const beforeDone = progOf(b, m.id).completedAt != null;
  const bolt = Core.lightningActive(b.core, m.id, Date.now());

  let ret;
  try {
    ret = Core.logSet(b.core, { playerId: m.id, exerciseId, reps: rufReps, at: Date.now(), ...(opts.verified ? { verified: true } : {}) });
  } catch (e) {
    return { error: String(e.message || e) };
  }
  b.core = ret.state;
  m.lifetimeReps += ret.ruf + (ret.bonusRuf || 0);

  const afterProg = targetProgress(b, m.id);
  const target = dayTargetFor(g, b, m);
  let lastEntry = null;
  for (let i = b.core.entries.length - 1; i >= 0; i--) {
    const e = b.core.entries[i];
    if (e.playerId === m.id && !e.powerUps) { lastEntry = e; break; }
  }
  const stackFx = (lastEntry && lastEntry.stack) || [];

  // feed events
  const fxNote = stackFx.length
    ? " (" + stackFx.map(fxTag).join(" · ") + ")"
    : "";
  if (bolt) {
    pushEvent(g, { type: "log", memberId: m.id, battle: b.idx, text: `${firstName(g, m)} logged ${physical} ${ex.unit === "secs" ? "sec " : ""}${ex.name.toLowerCase()} — +${ret.ruf} reps (⚡ ×3)${fxNote}`, exercise: ex.id });
  } else if (!m.isHouse || ret.ruf >= 50) {
    pushEvent(g, { type: "log", memberId: m.id, battle: b.idx, text: `${firstName(g, m)} logged ${physical} ${ex.unit === "secs" ? "sec " : ""}${ex.name.toLowerCase()} — +${ret.ruf} reps${fxNote}`, quiet: m.isHouse, exercise: ex.id });
  }
  // proof outcomes on this log (Prove It / Spot Check). A verified proof
  // lands an extra +15 pseudo-entry AFTER the log — walk back past it.
  let proofInfo = null;
  const entries = b.core.entries;
  const pseudo = entries.length && entries[entries.length - 1].powerUps && entries[entries.length - 1].powerUps.includes("prove_it");
  const entryIdx = entries.length - 1 - (pseudo ? 1 : 0);
  const boundProof = Core.proofsOf(b.core).find((p) => p.entryIndex === entryIdx);
  if (boundProof && boundProof.status === "verified") {
    proofInfo = { status: "verified", bonusRuf: Core.PROVE_IT_BONUS_RUF };
    pushEvent(g, { type: "proof_verified", memberId: m.id, battle: b.idx, text: `📋 ${firstName(g, m)} verified the set — honest effort pays THEM +${Core.PROVE_IT_BONUS_RUF} reps` });
  } else if (boundProof && boundProof.status === "review") {
    proofInfo = { status: "review" };
    pushEvent(g, { type: "proof_review", memberId: m.id, battle: b.idx, text: `📋 ${firstName(g, m)}'s set is under group review — the crew accepts or contests` });
  }
  // bomb defusal bonus shows as an extra moment
  if ((ret.bonusRuf || 0) > 0) {
    pushEvent(g, { type: "card", memberId: m.id, battle: b.idx, text: `💣 ${firstName(g, m)} banked +${ret.bonusRuf} bonus reps (bomb/combo payoff)` });
  }
  syncBombMirror(g, b);

  // milestone at 50% — and the EARNED bonus deal (v4.1): crossing halfway
  // deals a second 3-card choice (once per day, hand permitting) — for the
  // player who crossed, not the whole crew
  if (beforeProg / target < 0.5 && afterProg / target >= 0.5) {
    if (!m.isHouse) pushEvent(g, { type: "milestone", memberId: m.id, battle: b.idx, text: `${firstName(g, m)} is halfway — ${Math.round((afterProg / target) * 100)}% of target` });
    const dealt = dealDay(g, s, b, "halfway", m.id);
    if (dealt && !m.isHouse) pushEvent(g, { type: "deal", memberId: m.id, battle: b.idx, text: `🃏 halfway bonus deal earned — three more cards for ${firstName(g, m)}, pick one` });
  }

  // completion / Daily Win bookkeeping (engine already decided)
  let completion = null;
  if (ret.completed && !beforeDone) {
    completion = recordCompletion(g, s, b, m, afterProg, target, ret.wonDay);
  }

  save();
  return { ok: true, gained: ret.ruf + (ret.bonusRuf || 0), adjustedTotal: displayTotal(b, m.id),
    dayTarget: target, remaining: Math.max(0, target - afterProg), completion, lightning: bolt,
    stack: stackFx, proof: proofInfo };
}

function fxTag(tag) {
  const names = { double_exercise: "×2 double", specialist: "×1.5 specialist", underdog: "×1.25 underdog", second_wind: "×1.5 second wind", wildcard_workout: "wildcard" };
  return names[tag] || tag;
}

/** The group's best-value exercise (Wildcard Workout conversion basis). */
function bestValueExercise(g) {
  const list = g.exerciseIds.map(exerciseById).filter(Boolean);
  if (!list.length) return EXERCISES[0];
  return list.reduce((best, e) => (e.value / (e.secsPerRep || 1)) > (best.value / (best.secsPerRep || 1)) ? e : best, list[0]);
}

function recordCompletion(g, s, b, m, prog, target, wonDay) {
  const order = Object.keys(b.completions).length + 1;
  b.completions[m.id] = { atMs: Date.now(), order };
  m.completions += 1;
  m.streak += 1; // optimistic live streak; engine season streaks reconcile at close
  m.bestStreak = Math.max(m.bestStreak, m.streak);
  if (wonDay) {
    b.winnerId = m.id; b.winnerAtMs = Date.now();
    m.dailyWins += 1;
    pushEvent(g, { type: "win", memberId: m.id, battle: b.idx, text: `🏆 ${firstName(g, m)} reached ${target} reps FIRST — Daily Win banked! The battle continues…` });
    return { kind: "win", order };
  }
  pushEvent(g, { type: "bank", memberId: m.id, battle: b.idx, text: `${firstName(g, m)} completed ${target} reps — day BANKED (streak ${m.streak})` });
  return { kind: "bank", order };
}

function undoLast(gRaw, memberId) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = curSeason(g); if (!s) return { error: "no season" };
  const b = curBattle(s); if (!b || !b.core) return { error: "no battle" };
  if (b.core.status !== "live") return { error: "battle closed" };
  const mine = b.core.entries.filter((e) => e.playerId === memberId && !e.powerUps);
  const last = mine[mine.length - 1];
  if (!last) return { error: "nothing to undo" };
  if (Date.now() - last.at > 5 * 60_000) return { error: "undo window passed" };
  if (b.core.progress[memberId].completedAt != null) return { error: "day already completed — can't undo across target" };
  b.core = { ...b.core, entries: b.core.entries.filter((e) => e !== last) };
  const ruf = b.core.entries.filter((e) => e.playerId === memberId).reduce((sum, e) => sum + e.ruf, 0);
  b.core = { ...b.core, progress: { ...b.core.progress, [memberId]: { ...b.core.progress[memberId], ruf: Math.round(ruf * 100) / 100 } } };
  const m = memberById(g, memberId);
  m.lifetimeReps = Math.max(0, m.lifetimeReps - last.ruf);
  pushEvent(g, { type: "undo", memberId, battle: b.idx, text: `${firstName(g, m)} undid a set (−${last.ruf} reps)` });
  save();
  return { ok: true };
}

/* ── power-ups (delegated: Core.activatePowerUp) ───────────────────── */
function activateCard(gRaw, memberId, cardId, targetId, opts = {}) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = curSeason(g); if (!s) return { error: "no active season" };
  const b = curBattle(s); if (!b || b.status !== "live" || !b.core) return { error: "battle not live" };
  const m = memberById(g, memberId); if (!m) return { error: "unknown member" };
  if (!g.powerUps[cardId]) return { error: "card disabled for this group" };
  if (Core.inventoryOf(b.core, m.id).indexOf(cardId) < 0) return { error: "card not in inventory" };

  let ret;
  try {
    ret = Core.activatePowerUp(b.core, m.id, cardId, { at: Date.now(), targetId: targetId || undefined, ...opts });
  } catch (e) {
    return { error: String(e.message || e) };
  }
  if (!ret.result.ok) return { error: ret.result.reason };
  b.core = ret.state;
  const r = ret.result;
  let result = { ok: true, card: cardId };

  if (cardId === "lightning") {
    result.untilMs = r.until;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `⚡ ${firstName(g, m)} called a LIGHTNING ROUND — their reps count ×3` });
  } else if (cardId === "steal") {
    const tgt = memberById(g, r.targetId);
    // pure gain lands in bonusRuf; stealCanTriggerWin lets it count toward target
    b.steals.push({ id: uid("st"), fromId: memberId, targetId: r.targetId, gained: r.gain, atMs: Date.now(), targetKept: targetProgress(b, r.targetId) });
    m.lifetimeReps += r.gain;
    result.gain = r.gain; result.targetKept = b.steals[b.steals.length - 1].targetKept; result.targetName = tgt ? firstName(g, tgt) : "?";
    pushEvent(g, { type: "steal", memberId, battle: b.idx, text: `🥷 ${firstName(g, m)} skimmed ${r.gain} reps off ${tgt ? firstName(g, tgt) : "?"}'s completed score — they keep every rep` });
    const prog = targetProgress(b, m.id);
    const target = dayTargetFor(g, b, m);
    if (prog >= target && progOf(b, m.id).completedAt == null) result.completion = recordCompletion(g, s, b, m, prog, target, !b.core.winnerId);
  } else if (cardId === "shield") {
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🛡️ ${firstName(g, m)} raised the GROUP SHIELD — streaks are safe today` });
  } else if (cardId === "freeze") {
    b.frozenUntilMs = Date.now() + Core.FREEZE_MS;
    result.frozenUntilMs = b.frozenUntilMs; result.newDeadlineMs = r.newDeadline;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `❄️ ${firstName(g, m)} FROZE the battle clock — 30 minutes added` });
  } else if (cardId === "surprise_bomb") {
    const tgt = memberById(g, r.targetId);
    // atMs is derived from the core deadline (at + SURPRISE_BOMB_WINDOW_MS)
    // so syncBombMirror's issuedAt === atMs match is EXACT, never a 1ms race.
    b.bombs.push({ id: uid("b"), fromId: memberId, targetId: r.targetId, reps: r.reps, atMs: r.deadline - Core.SURPRISE_BOMB_WINDOW_MS, fuseEndMs: r.deadline, status: "live", logged: 0 });
    result.bomb = b.bombs[b.bombs.length - 1];
    pushEvent(g, { type: "bomb", memberId, battle: b.idx, text: `💣 ${firstName(g, m)} dropped a SURPRISE BOMB on ${tgt ? firstName(g, tgt) : "?"} — +${r.reps} reps in the next 10 minutes or it fizzles` });
  } else if (cardId === "rescue_rope") {
    const tgt = memberById(g, r.toId);
    const before = targetProgress(b, r.toId);
    const target = dayTargetFor(g, b, tgt);
    const after = before + r.creditRuf;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🪢 ${firstName(g, m)} threw ${tgt ? firstName(g, tgt) : "?"} a RESCUE ROPE — 50-rep credit` });
    if (after >= target && before < target && progOf(b, r.toId).completedAt == null) result.completion = recordCompletion(g, s, b, tgt, after, target, !b.core.winnerId);
  } else if (cardId === "combo_boost") {
    result.untilMs = Date.now() + Core.ASSIST_WINDOW_MS;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🔥 ${firstName(g, m)} armed a COMBO — land the prescribed sequence for the bonus` });
  } else if (cardId === "double_down") {
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🎲 ${firstName(g, m)} DOUBLED DOWN — 2× target quest today` });
  } else if (cardId === "assist_boost") {
    const tgt = memberById(g, r.toId);
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🤝 ${firstName(g, m)} ASSISTED ${tgt ? firstName(g, tgt) : "?"} — finish in window and you both score` });
  } else if (cardId === "shield_bash") {
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🔨 ${firstName(g, m)} BASHED the Group Shield — protection shattered` });
  } else if (cardId === "double_exercise") {
    const ex = exerciseById(r.exerciseId);
    result.exerciseId = r.exerciseId; result.exerciseName = ex ? ex.name : r.exerciseId; result.multiplier = r.multiplier;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🏋️ ${firstName(g, m)} DOUBLED ${ex ? ex.name.toLowerCase() : "an exercise"} — their reps of it count ×2 today` });
  } else if (cardId === "specialist") {
    const names = (r.exercises || []).map((id) => { const e = exerciseById(id); return e ? e.name.toLowerCase() : id; });
    result.exercises = r.exercises; result.exerciseNames = names; result.multiplier = r.multiplier;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🎯 ${firstName(g, m)} is now a SPECIALIST — ${names.join(", ")} count ×1.5 today` });
  } else if (cardId === "wildcard_workout") {
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🃏 ${firstName(g, m)} went WILDCARD — any exercise counts as any other for them today` });
  } else if (cardId === "rivalry") {
    const tgt = memberById(g, r.rivalId);
    result.rivalName = tgt ? firstName(g, tgt) : "?"; result.bonusRuf = r.bonusRuf;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `⚔️ ${firstName(g, m)} called a RIVALRY on ${tgt ? firstName(g, tgt) : "?"} — more reps today takes +${r.bonusRuf}` });
  } else if (cardId === "training_partners") {
    const tgt = memberById(g, r.partnerId);
    result.partnerName = tgt ? firstName(g, tgt) : "?"; result.bonusRufEach = r.bonusRufEach;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🤜🤛 ${firstName(g, m)} and ${tgt ? firstName(g, tgt) : "?"} are TRAINING PARTNERS — both bank today and both pocket +${r.bonusRufEach}` });
  } else if (cardId === "pack_bond") {
    const names = (r.members || []).map((id) => { const mm = memberById(g, id); return mm ? firstName(g, mm) : id; });
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🐺 ${firstName(g, m)} bonded the pack — ${names.join(", ")}: log ${r.thresholdRuf}+ and bank +10%` });
  } else if (cardId === "prove_it") {
    const tgt = memberById(g, r.targetId);
    result.targetName = tgt ? firstName(g, tgt) : "?"; result.proofId = r.proofId;
    pushEvent(g, { type: "proof_request", memberId, battle: b.idx, proofId: r.proofId, text: `📋 ${firstName(g, m)} played PROVE IT on ${tgt ? firstName(g, tgt) : "?"} — their next set gets verified, honest effort pays THEM +${r.bonusRuf}` });
  } else if (cardId === "spot_check") {
    const tgt = memberById(g, r.targetId);
    result.targetName = tgt ? firstName(g, tgt) : "?"; result.proofId = r.proofId; result.entryRuf = r.entryRuf;
    pushEvent(g, { type: "proof_request", memberId, battle: b.idx, proofId: r.proofId, text: `🔍 SPOT CHECK on ${tgt ? firstName(g, tgt) : "?"}'s biggest set (${r.entryRuf} reps) — the crew accepts or contests` });
  } else if (cardId === "second_wind") {
    result.untilMs = r.until; result.multiplier = r.multiplier;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `💨 ${firstName(g, m)} caught a SECOND WIND — their reps count ×1.5 for 15 minutes` });
  } else if (cardId === "mulligan") {
    result.options = r.options; result.discarded = r.discarded;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🔄 ${firstName(g, m)} took the MULLIGAN — hand scrapped, three fresh cards on the table` });
  } else if (cardId === "underdog") {
    result.multiplier = r.multiplier;
    pushEvent(g, { type: "card", memberId, battle: b.idx, text: `🐕 ${firstName(g, m)} is the UNDERDOG — their reps count ×1.25 today. Comeback lane open.` });
  }
  syncBombMirror(g, b);
  save();
  return result;
}

/* ── the deal: pick / reroll (delegated: Core.draftPick / rerollDraft) ── */
function pickDraft(gRaw, memberId, kind) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = curSeason(g); if (!s) return { error: "no active season" };
  const b = curBattle(s); if (!b || !b.core) return { error: "no battle" };
  const m = memberById(g, memberId); if (!m) return { error: "unknown member" };
  const ret = Core.draftPick(b.core, m.id, kind);
  if (!ret.result.ok) return { error: ret.result.reason };
  b.core = ret.state;
  const card = CARDS[kind] || { name: kind };
  pushEvent(g, { type: "deal_pick", memberId, battle: b.idx, text: `🃏 ${firstName(g, m)} took ${card.name.toUpperCase()} (${ret.result.rarity}) from the deal` });
  save();
  return { ok: true, kind, name: card.name, rarity: ret.result.rarity, family: ret.result.family };
}

function rerollDeal(gRaw, memberId) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = curSeason(g); if (!s) return { error: "no active season" };
  const b = curBattle(s); if (!b || !b.core) return { error: "no battle" };
  const m = memberById(g, memberId); if (!m) return { error: "unknown member" };
  const ret = Core.rerollDraft(b.core, m.id, { pool: stackPool(g) });
  if (!ret.result.ok) return { error: ret.result.reason };
  b.core = ret.state;
  pushEvent(g, { type: "deal_reroll", memberId, battle: b.idx, text: `🔄 ${firstName(g, m)} rerolled the deal — ${ret.result.cost} points to the pot (pot: ${ret.result.pot})` });
  save();
  return { ok: true, cost: ret.result.cost, options: ret.result.options, balance: ret.result.balance, pot: ret.result.pot };
}

/* ── group review votes (Prove It / Spot Check) ────────────────────── */
function voteProof(gRaw, proofId, voterId, vote) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = curSeason(g); if (!s) return { error: "no active season" };
  const b = curBattle(s); if (!b || !b.core) return { error: "no battle" };
  const ret = Core.voteProof(b.core, proofId, voterId, vote);
  if (!ret.result.ok) return { error: ret.result.reason };
  b.core = ret.state;
  const voter = memberById(g, voterId);
  if (ret.result.settled) {
    const proof = Core.proofsOf(b.core).find((p) => p.id === proofId);
    const tgt = proof ? memberById(g, proof.targetId) : null;
    if (ret.result.outcome === "contested") {
      pushEvent(g, { type: "proof_contested", battle: b.idx, text: `📋 the crew CONTESTED ${tgt ? firstName(g, tgt) : "the set"} — it scores 0, but the day still banks. Onward.` });
    } else {
      pushEvent(g, { type: "proof_accepted", battle: b.idx, text: `📋 the crew ACCEPTED ${tgt ? firstName(g, tgt) : "the set"} — reps stand. Trust is the game.` });
    }
  } else {
    pushEvent(g, { type: "proof_vote", memberId: voterId, battle: b.idx, quiet: true, text: `📋 ${voter ? firstName(g, voter) : "?"} voted to ${vote} the set under review` });
  }
  save();
  return { ok: true, ...ret.result };
}

/* ── e2e / driver affordances (same engine APIs the UI drives) ─────── */
function debugGrant(gRaw, memberId, kind) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = curSeason(g); if (!s) return { error: "no active season" };
  const b = curBattle(s); if (!b || !b.core) return { error: "no battle" };
  try { b.core = Core.grantPowerUp(b.core, memberId, kind); } catch (e) { return { error: String(e.message || e) }; }
  save();
  return { ok: true };
}

/* mirror engine bomb states onto the UI/e2e-friendly shape */
function syncBombMirror(g, b) {
  if (!b.core) return;
  for (const bomb of b.bombs) {
    const core = b.core.bombs.find((c) => c.targetId === bomb.targetId && c.issuedAt === bomb.atMs);
    if (!core) continue;
    if (core.resolved) {
      if (core.resolved.hit && bomb.status === "live") {
        bomb.status = "defused";
        const victim = memberById(g, core.targetId);
        pushEvent(g, { type: "bomb_defused", memberId: core.targetId, battle: b.idx, text: `💣 DEFUSED by ${victim ? firstName(g, victim) : "?"} — +${Core.SURPRISE_BOMB_BONUS_RUF} bonus reps banked inside the fuse` });
      } else if (!core.resolved.hit && bomb.status === "live") {
        bomb.status = "fizzled";
        const victim = memberById(g, core.targetId);
        pushEvent(g, { type: "bomb_fizzled", memberId: core.targetId, battle: b.idx, text: `💣 the Surprise Bomb on ${victim ? firstName(g, victim) : "?"} FIZZLED — 10 minutes up, nothing stuck` });
      }
      bomb.logged = core.resolved.bankedRuf;
    }
  }
}

/* ── day / season resolution (delegated: closeDay → recordBattleDay) ─ */
function tick(gRaw) {
  const g = asGroup(gRaw);
  if (!g) return null;
  const s = curSeason(g);
  if (!s) return null;
  let changed = false;
  const now = Date.now();
  for (const b of s.battles) {
    if (b.status !== "live" || !b.core) continue;
    if (b.frozenUntilMs && now < b.frozenUntilMs) continue; // frozen visual clock
    // lazily resolve expired bombs so the UI reflects fizzles/hits, and
    // sweep expired card-stack state (past-deadline deals vanish)
    try {
      const nextCore = Core.resolveExpiredBombs(b.core, now);
      const swept = Core.sweepExpiredCards(nextCore, now);
      if (swept !== b.core) {
        b.core = swept;
        syncBombMirror(g, b);
        changed = true;
      }
    } catch (e) { /* day closed — handled below */ }
    if (now >= effDeadline(b)) {
      resolveBattle(g, s, b);
      changed = true;
    }
  }
  // cloud-bound groups (apps/sot/cloud.js): the SERVER opens days — the local
  // mirror never auto-opens a scheduled battle (the poll merge does it when
  // the server day exists). The live battle's clock/bombs still tick above.
  if (!g.cloud) for (const b of s.battles) {
    if (b.status === "scheduled" && b.startMs && Date.now() >= b.startMs) {
      b.status = "live";
      createEngineDay(g, s, b);
      changed = true;
    } else if (b.status === "scheduled" && !b.startMs && s.battles[b.idx - 2] && s.battles[b.idx - 2].status === "ended") {
      beginBattle(g, s, b);
      changed = true;
    }
  }
  if (changed) save();
  return changed;
}

function resolveBattle(g, s, b) {
  let ret;
  try {
    ret = Core.closeDay(b.core, effDeadline(b));
  } catch (e) {
    // safety: mark ended even if the engine refuses (shouldn't happen)
    b.status = "ended";
    return;
  }
  b.core = ret.state;
  b.status = "ended";
  syncBombMirror(g, b);
  b.failures = [];
  let shieldSaved = false;
  for (const [id, o] of Object.entries(ret.outcomes)) {
    const m = memberById(g, id);
    if (o.outcome === "failed") {
      b.failures.push(id);
      if (m) { m.failedDays += 1; m.streak = 0; }
    } else if (o.outcome === "shielded") {
      shieldSaved = true;
      if (m) m.streak = Math.max(0, m.streak); // streak survives (engine preserves)
      pushEvent(g, { type: "shield_used", memberId: id, battle: b.idx, text: `🛡️ the Group Shield held — ${m ? firstName(g, m) : "?"}'s streak survives the failed day` });
    }
    // card-stack stat folds (recorded bonuses — deliberately NOT season
    // points: those stay 1:1 with Daily Wins per the SOT; open question
    // logged in the handover)
    if (m && o.partnershipBonus) m.partnerBonuses = (m.partnerBonuses || 0) + 1;
    if (m && o.rivalryWon) m.rivalryWins = (m.rivalryWins || 0) + 1;
  }
  // settled proofs read back for the recap
  const proofEvents = Core.proofsOf(b.core).filter((p) => p.status === "contested");
  for (const p of proofEvents) {
    const tgt = memberById(g, p.targetId);
    pushEvent(g, { type: "proof_contested", battle: b.idx, text: `📋 the crew CONTESTED ${tgt ? firstName(g, tgt) : "the set"} at the close — it scores 0, but the day still banks. Onward.` });
  }
  // fold the day into the engine season record (points + engine streaks)
  try {
    const dateStr = dateLabel(b, s);
    s.core = Core.recordBattleDay(s.core, Core.dayRecordFrom(b.core, dateStr));
    const standings = Core.battleStandings(s.core);
    for (const row of standings) {
      const m = memberById(g, row.playerId);
      if (m) { m.streak = row.streak; m.bestStreak = Math.max(m.bestStreak, row.bestStreak); }
    }
  } catch (e) { console.warn("recordBattleDay", e); }

  const winner = b.winnerId ? memberById(g, b.winnerId) : null;
  pushEvent(g, { type: "recap", battle: b.idx, text: winner
    ? `Battle ${b.idx} (${b.dayName}) done — ${firstName(g, winner)} took the Daily Win · ${Object.keys(b.completions).length} banked · ${b.failures.length} failed`
    : `Battle ${b.idx} (${b.dayName}) done — NOBODY reached target. No Daily Win awarded.` });

  const next = s.battles.find((x) => x.status === "scheduled");
  if (next && !g.cloud) {
    beginBattle(g, s, next);
  } else if (!next) {
    endSeason(g, s);
  }
  // cloud groups: the next battle stays scheduled here — the server opens it
  // (bot `start` / next play day) and the poll merge flips the local mirror.
}

function dateLabel(b, s) {
  const d = new Date(b.startMs || b.startedAtMs || Date.now());
  let label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // Demo/sprint groups compress a whole season into minutes — two battles can
  // land on ONE calendar date, and recordBattleDay keys strictly by date (a
  // duplicate throws). Later same-day battles get a #idx suffix; the season
  // calendar renders battle rows (dayName), never this internal key.
  if (s && s.core && Array.isArray(s.core.days) && s.core.days.some((x) => x.date === label || String(x.date).startsWith(label + "#"))) {
    label += "#" + (b.idx || 2);
  }
  return label;
}

function endSeason(g, s) {
  s.status = "ended";
  s.endedAt = Date.now();
  try {
    s.core = Core.endBattleSeason(s.core);
    s.winnerId = s.core.champion ?? null;
    s.tie = !!s.core.tie;
  } catch (e) { console.warn("endBattleSeason", e); }
  const stake = s.stake;
  if (stake.type !== "none" && s.core.stake) {
    try {
      s.core = Core.resolveSeasonStake(s.core);
      const res = s.core.stake.resolution;
      s.loserIds = res.loserIds;
      if (stake.type === "charity") {
        const potPts = Core.charityPotTotal(s.core.stake);
        const feePts = Math.floor(potPts * (stake.feePct / 100));
        s.stakeResolution = { status: "awaiting_choice", potCents: potPts * 100, feeCents: feePts * 100, donateCents: (potPts - feePts) * 100, contributors: Object.keys(s.core.stake.charity.contributions).length };
      } else {
        s.stakeResolution = { status: "obligation", loserId: res.loserIds[0], loserIds: res.loserIds };
      }
    } catch (e) { console.warn("resolveSeasonStake", e); s.stakeResolution = { status: "pending" }; }
  } else {
    s.stakeResolution = { status: "none" };
  }
  const w = s.winnerId ? memberById(g, s.winnerId) : null;
  pushEvent(g, { type: "season_end", text: w
    ? `🏁 ${s.label} over — ${firstName(g, w)} takes the season with ${s.core.points[s.winnerId] || 0} Daily Win${(s.core.points[s.winnerId] || 0) === 1 ? "" : "s"}`
    : `${s.label} over` });
  if (stake.type !== "none") {
    pushEvent(g, { type: "stake_due", text: stake.type === "charity" ? `Charity pot stands at $${((s.stakeResolution.potCents || 0) / 100).toFixed(2)} — the winner chooses where it goes` : `Stake is due: ${stakeLabel(stake)}` });
  }
}

function stakeLabel(stake) {
  if (stake.type === "dinner") return `Loser shouts dinner${stake.description ? " — " + stake.description : ""}`;
  if (stake.type === "dare") return `Loser owes the dare: ${stake.dareText}`;
  if (stake.type === "deliverable") return `Loser owes: ${stake.description}`;
  if (stake.type === "charity") return `Charity pot — winner directs the donation`;
  return "No stake";
}

function resolveCharity(gRaw, charityId) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = curSeason(g) || g.seasons[g.seasons.length - 1];
  if (!s || s.status !== "ended") return { error: "season not ended" };
  if (!s.stakeResolution || s.stakeResolution.status !== "awaiting_choice") return { error: "not awaiting a choice" };
  const ch = CHARITIES.find((c) => c.id === charityId);
  if (!ch) return { error: "unknown charity" };
  try {
    s.core = Core.designateCharity(s.core, ch.id, s.winnerId);
    s.core = Core.processCharityDonation(s.core);
  } catch (e) {
    return { error: String(e.message || e) };
  }
  const charity = s.core.stake.charity;
  s.stakeResolution = { status: "donated", charityId, charityName: ch.name, donatedAt: Date.now(),
    potCents: Core.charityPotTotal(s.core.stake) * 100, feeCents: charity.feePoints * 100, donateCents: charity.donationPoints * 100,
    receipt: "RWFD-" + g.code + "-" + s.idx };
  pushEvent(g, { type: "charity_donated", text: `❤️ pot of $${((s.stakeResolution.potCents) / 100).toFixed(2)} directed to ${ch.name} (after $${((s.stakeResolution.feeCents) / 100).toFixed(2)} disclosed platform fee)` });
  save();
  return { ok: true, resolution: s.stakeResolution };
}

function markObligationFulfilled(gRaw) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const s = g.seasons[g.seasons.length - 1];
  if (!s || !s.stakeResolution || s.stakeResolution.status !== "obligation") return { error: "no obligation" };
  try {
    for (const id of s.stakeResolution.loserIds || []) s.core = Core.markStakeFulfilled(s.core, id);
  } catch (e) { /* engine may not track this loser — mirror anyway */ }
  s.stakeResolution.status = "fulfilled";
  pushEvent(g, { type: "stake_fulfilled", text: `Stake settled — the debt is paid. Until next season 😈` });
  save();
  return { ok: true };
}

function startNextSeason(gRaw) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  if (curSeason(g)) return { error: "season still active" };
  const s2 = startSeason(g);
  save();
  return s2;
}

/* ── join flow (local-first: groups registry on this device) ───────── */
function joinByCode(code) {
  code = String(code || "").trim().toUpperCase();
  let g = Object.values(state.groups).find((x) => x.code === code);
  if (!g) return { error: "no group with that code on this device — ask the creator to share it again" };
  if (g.members.some((m) => m.id === state.me.id)) {
    state.activeGroupId = g.id; save();
    return { ok: true, group: g, already: true };
  }
  addMemberTo(g, { id: state.me.id, name: state.me.name, initials: state.me.initials, color: state.me.color, tier: state.me.tier, isHouse: false, joinedAt: Date.now() });
  const m = memberById(g, state.me.id);
  m.stakeAgreed = true;
  state.activeGroupId = g.id;
  const s = curSeason(g);
  if (s) {
    // late joiner: enters the engine season + stake, deals into future days
    try {
      s.core = { ...s.core, players: [...s.core.players, enginePlayer(m)], points: { ...s.core.points, [m.id]: 0 }, streaks: { ...s.core.streaks, [m.id]: { length: 0, best: 0, lastDate: null } } };
      if (s.core.stake && s.core.stake.status === "active") {
        s.core = Core.agreeToStake(s.core, m.id);
        if (s.core.stake.type === "charity") s.core = Core.contributeToCharityStake(s.core, m.id, g.stake.perPersonCents / 100);
      }
    } catch (e) { console.warn("joiner into engine season", e); }
    for (const b of s.battles) {
      if (b.status === "live" && b.core && !b.core.players.some((p) => p.id === m.id)) continue; // mid-day join: eligible next day
      if (b.status === "scheduled") { /* engine day created at begin */ }
    }
  }
  pushEvent(g, { type: "join", memberId: m.id, text: `${firstName(g, m)} joined the battle` });
  save();
  return { ok: true, group: g };
}
function agreeStake(gRaw, memberId) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const m = memberById(g, memberId);
  if (m) m.stakeAgreed = true;
  const s = curSeason(g);
  if (s && s.core && s.core.stake && m) {
    try { s.core = Core.agreeToStake(s.core, m.id); } catch (e) { /* already agreed */ }
  }
  save();
  return { ok: true };
}

/* ── events / feed ─────────────────────────────────────────────────── */
function pushEvent(g, ev) {
  g.events.push(Object.assign({ id: uid("e"), atMs: Date.now(), reactions: {} }, ev));
  if (g.events.length > 240) g.events.splice(0, g.events.length - 240);
}
function react(gRaw, eventId, emoji) {
  const g = asGroup(gRaw);
  if (!g) return { error: "no group" };
  const ev = g.events.find((e) => e.id === eventId);
  if (!ev) return { error: "event gone" };
  ev.reactions[emoji] = (ev.reactions[emoji] || 0) + 1;
  save();
  return { ok: true };
}

/* ── view-model ────────────────────────────────────────────────────── */
function asGroup(gRaw) { return (typeof gRaw === "string" ? state.groups[gRaw] : gRaw) || null; }
function curSeason(g) { return g.seasons.find((s) => s.status === "active") || null; }
function curBattle(s) { return s ? (s.battles.find((b) => b.status === "live") || s.battles.find((b) => b.status === "scheduled") || s.battles[s.battles.length - 1]) : null; }

function urgency(remainingMs) {
  if (remainingMs <= 0) return { id: "over", label: "Time's up", level: 0 };
  if (remainingMs <= 10 * 60_000) return { id: "dodie", label: "DO OR DIE", level: 4 };
  if (remainingMs <= 30 * 60_000) return { id: "m30", label: "Final 30", level: 3 };
  if (remainingMs <= 60 * 60_000) return { id: "h1", label: "Final hour", level: 2 };
  if (remainingMs <= 3 * 3600_000) return { id: "h3", label: "Final 3 hours", level: 1 };
  return { id: "ok", label: "Battle live", level: 0 };
}

function snapshot(groupId) {
  const g = state.groups[groupId || state.activeGroupId];
  if (!g) return null;
  tick(g);
  const s = curSeason(g);
  const b = s ? curBattle(s) : null;
  const meM = g.members.find((m) => m.id === (state.me ? state.me.id : ""));
  const board = b && b.core ? snapshotBoard(g, b) : [];
  const myRow = board.find((r) => r.member.id === (meM ? meM.id : "")) || null;
  let clock = null, danger = false, closeCall = false;
  if (b && b.status === "live" && b.core) {
    const remainingMs = Math.max(0, effDeadline(b) - Date.now());
    const frozen = !!(b.frozenUntilMs && Date.now() < b.frozenUntilMs);
    clock = { remainingMs, frozen, frozenRemainingMs: frozen ? Math.max(0, b.frozenUntilMs - Date.now()) : 0, urgency: frozen ? { id: "frozen", label: "Frozen", level: 0 } : urgency(remainingMs) };
    danger = !frozen && clock.urgency.level >= 3;
    const sorted = board.filter((r) => !r.completed).sort((a, b3) => b3.adjusted - a.adjusted);
    if (sorted.length >= 2 && sorted[0].adjusted >= g.target * 0.7) {
      // SOT #98 close-call: leader gap < 5% of target with the lead real
      if (sorted[0].adjusted - sorted[1].adjusted <= g.target * 0.05) closeCall = true;
    }
  }
  let streakAtRisk = false;
  if (myRow && b && b.status === "live" && meM && meM.streak > 0 && !myRow.completed) {
    streakAtRisk = clock ? (clock.urgency.level >= 2 || myRow.pct < 0.5) : false;
  }
  const teams = (g.mode === "team" && b && b.core) ? teamTotals(g, b) : null;
  const feed = g.events.slice().reverse().slice(0, 60);
  // transient: live inventory for the Power-Ups tab (engine day holds the truth)
  if (meM) meM.inventory = b && b.core ? Core.inventoryOf(b.core, meM.id) : (meM.inventory || []);
  // the card system (v4.1): pending deal, hand, points/pot, open proofs
  const myDraft = (meM && b && b.core && b.core.drafts && b.core.drafts[meM.id]) || null;
  const openProofs = (b && b.core ? Core.proofsOf(b.core) : [])
    .filter((p) => p.status === "review" || p.status === "awaiting_log")
    .map((p) => ({
      ...p,
      targetName: (memberById(g, p.targetId) || { name: "?" }).name.split(" ")[0],
      fromName: (memberById(g, p.fromId) || { name: "?" }).name.split(" ")[0],
      accepts: Object.values(p.votes || {}).filter((v) => v === "accept").length,
      contests: Object.values(p.votes || {}).filter((v) => v === "contest").length,
      myVote: meM ? ((p.votes || {})[meM.id] || null) : null,
      iAmTarget: !!(meM && p.targetId === meM.id),
    }));
  return { group: g, season: s, battle: b, me: meM, board, myRow, clock, danger, closeCall, streakAtRisk, teams, feed,
    stakeLabel: stakeLabel(g.stake), exerciseList: g.exerciseIds.map(exerciseById).filter(Boolean),
    myDraft, points: b && b.core ? Core.pointsOf(b.core, meM ? meM.id : "") : Core.STARTING_POINTS,
    pot: b && b.core ? Core.potTotal(b.core) : 0, openProofs };
}

/* ── demo seeder — a live mid-battle, instantly (v1's demo crew pattern).
      Everything is REAL engine state: createGroup → startSeason → logReps,
      plus one house-thrown Surprise Bomb so the founder lands in a live,
      slightly spicy hour. */
function seedDemo() {
  if (!state.me || !state.me.name) setMe({ name: "Alex", initials: "AL" });
  // jumping in from the welcome screen skips onboarding — mark it done or
  // render()'s onboarded guard bounces the view straight back to welcome
  state.onboarded = true;
  const existing = Object.values(state.groups).find((g) => g.isDemo);
  if (existing) {
    if (!curSeason(existing)) startNextSeason(existing.id);
    state.activeGroupId = existing.id;
    save();
    return existing;
  }
  const g = createGroup({
    mode: "individual", name: "Gold Squad", icon: "⚡", color: "#f5c445",
    activeDays: [1, 2, 3, 4, 5], target: 200,
    clockMode: "duration", durationMin: 60,   // a live hour, not a 1-minute sprint
    stake: { type: "charity", perPersonCents: 1000, feePct: 5 },
    // the full stack is on in the demo — the deal decides what you hold
    housePlayers: [
      { name: "Marco", tier: "casual" }, { name: "Priya", tier: "fit" }, { name: "Jack", tier: "couch" },
    ],
  });
  g.isDemo = true;
  startSeason(g);                                   // battle 1 live, the deal is on the table
  const byName = (n) => g.members.find((m) => m.name === n);
  logReps(g.id, byName("Marco").id, "pushups", 48); // casual ×1.25 → 60 reps
  logReps(g.id, byName("Priya").id, "burpees", 22); // fit ×1.0 → 44 reps
  logReps(g.id, byName("Jack").id, "squats", 40);   // couch ×1.5 → 60 reps
  // Marco throws his Surprise Bomb at me — 10-minute fuse, defusable
  try {
    debugGrant(g.id, byName("Marco").id, "surprise_bomb");
    activateCard(g.id, byName("Marco").id, "surprise_bomb", state.me.id);
  } catch (e) { /* demo spice, best-effort */ }
  pushEvent(g, { type: "group_created", memberId: state.me.id, text: "Demo battle seeded — the crew is already moving. Your deal is on the Cards tab." });
  save();
  return g;
}

/* ── resets ────────────────────────────────────────────────────────── */
function resetProfile() {
  for (const g of Object.values(state.groups)) {
    const m = g.members.find((x) => x.id === state.me.id);
    if (m) m.isHouse = true;
  }
  const groups = state.groups;
  state = { v: 1, onboarded: false, me: null, groups, activeGroupId: null };
  save();
  return state;
}
function resetAll() {
  state = { v: 1, onboarded: false, me: null, groups: {}, activeGroupId: null };
  save();
  return state;
}

/* ── export ────────────────────────────────────────────────────────── */
load();
const SoT = {
  TIERS, EXERCISES, CARDS, CHARITIES, DAY_NAMES, COLORS,
  REAL_KEY: STORE_KEY, DEMO_KEY: "rwf.sot.demo.v1",
  useKey, blankState,
  get state() { return state; },
  get engine() { return Core; },
  load, save, setMe, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  createGroup, startSeason, startNextSeason, joinByCode, agreeStake,
  snapshot, logReps, undoLast, activateCard, tick, seedDemo,
  pickDraft, rerollDeal, voteProof, debugGrant,
  resolveCharity, markObligationFulfilled, react,
  resetProfile, resetAll,
  curSeasonOf: curSeason, curBattleOf: curBattle,
  totalsFor, dayTargetFor, tierOf, exerciseById, stakeLabel,
  // page-driver API (the e2e + any future server drive OTHER players through this)
  logRepsAs(groupId, memberId, exerciseId, physical, verified) { return logReps(groupId, memberId, exerciseId, physical, verified ? { verified: true } : {}); },
  pickDraftAs(groupId, memberId, kind) { return pickDraft(groupId, memberId, kind); },
  voteProofAs(groupId, proofId, voterId, vote) { return voteProof(groupId, proofId, voterId, vote); },
  groupByCode(code) { return Object.values(state.groups).find((x) => x.code === String(code).trim().toUpperCase()) || null; },
};
window.RWFSoT = SoT;
