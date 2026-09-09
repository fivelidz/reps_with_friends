/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 — CLOUD SYNC CLIENT (M1 pilot — apps/api is the game-state truth)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The answer to "why do the bots have to run on my system?": they don't.
   apps/api holds the SOT group (same engine, same rules); the app is a
   client. This module is the app-side of that:

     · OPTIMISTIC LOG: local log lands instantly (offline stays first-class),
       then POSTs to /sot/groups/:code/log — server truth is merged on reply.
       Conflict = server wins, with a toast (the honest pilot rule).
     · LIVE POLL: while the app is visible, poll state?since=seq every 5s and
       merge — other phones' logs appear on the board without you doing
       anything. Also on visibilitychange (phone-glide).
     · JOIN BY CODE: a code that isn't on-device is looked up on the API —
       join and a local mirror group is built from server truth.
     · BOTS: they talk to the SAME API (chat commands run through
       SotCommandBus server-side) — the app poll sees bot logs like anyone.

   LOCAL MODE IS UNCHANGED: with sync off, nothing here runs. The demo
   seeder stays local-only. Simulated-offline (the Conn shim) queues sets
   exactly as before; replay pushes them to the API too (replayQueuedLogs).

   Storage: localStorage rwf.cloud.v1 — {mode, apiBase, groups: {code}}.
   Auth-lite: a random playerToken per player, kept server-side; this file
   keeps its own copy so it can act for you (no accounts yet — honest).
   ═══════════════════════════════════════════════════════════════════════ */

(() => {
  const CFG_KEY = "rwf.cloud.v1";
  const POLL_MS = 5000;
  const FAIL_COOLDOWN_MS = 8000;

  /* ── config ─────────────────────────────────────────────────────────── */
  let cfg = null;
  function load() {
    try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); } catch (e) { cfg = null; }
    if (!cfg || typeof cfg !== "object") cfg = {};
    if (!cfg.groups || typeof cfg.groups !== "object") cfg.groups = {};
    if (cfg.mode !== "cloud") cfg.mode = "local";
    if (typeof cfg.apiBase !== "string") cfg.apiBase = defaultBase();
  }
  function save() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* private mode */ }
  }
  function defaultBase() {
    // dev serve.ts (4173) → the API on 4174; deployed, the app points at the
    // same origin (the reverse proxy mounts apps/api at /sot — docs/22 §M1)
    if (location.port === "4173" || location.port === "4194") return "http://localhost:4174";
    return "";
  }

  /* ── tiny fetch layer (never throws) ────────────────────────────────── */
  let lastFailAt = 0;
  async function api(method, path, body) {
    const base = (cfg.apiBase || "").replace(/\/+$/, "");
    const url = base + path;
    try {
      const r = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { error: (data && data.error) || `HTTP ${r.status}` };
      return data;
    } catch (e) {
      lastFailAt = Date.now();
      return { error: `offline — ${e instanceof Error ? e.message : e}` };
    }
  }

  const S = () => window.RWFSoT;
  const state = () => (S() ? S().state : null);

  function bindingFor(groupId) {
    const st = state();
    const g = st && st.groups[groupId || st.activeGroupId];
    if (!g || !g.cloud || !g.cloud.code) return null;
    return { g, b: cfg.groups[g.cloud.code] || null };
  }
  function activeBinding() {
    const st = state();
    if (!st || !st.activeGroupId) return null;
    return bindingFor(st.activeGroupId);
  }

  /* ── conversion: physical reps → engine reps (mirrors engine.js logReps) */
  function toEngineReps(exerciseId, physical) {
    const ex = S().exerciseById(exerciseId);
    if (!ex) return Math.max(1, Math.round(physical));
    return ex.secsPerRep ? Math.round((physical / ex.secsPerRep) * ex.value) : Math.round(physical * ex.value);
  }

  /* ══ PUBLIC SURFACE (window.RWFCloud) ═════════════════════════════════ */

  const Cloud = {
    mode: () => cfg.mode,
    setMode(m) {
      cfg.mode = m === "cloud" ? "cloud" : "local";
      save();
    },
    apiBase: () => cfg.apiBase,
    setApiBase(u) { cfg.apiBase = String(u || "").trim(); save(); },
    enabled: () => cfg.mode === "cloud",
    groupCode: (groupId) => { const x = bindingFor(groupId); return x ? x.g.cloud.code : null; },
    isCloudGroup: (groupId) => !!bindingFor(groupId),
    lastSyncAt: () => cfg.lastSyncAt || 0,
    lastError: () => cfg.lastError || null,

    /* ── preview a code (join flow) ──────────────────────────────────── */
    async lookup(code) {
      const c = String(code || "").trim().toUpperCase();
      if (!/^[A-Z2-9]{5,32}$/.test(c)) return { error: "that code doesn't look right" };
      const r = await api("GET", `/sot/groups/${c}`);
      if (r.error) return r;
      return {
        ok: true, code: c, name: r.name, players: r.players,
        config: r.config, hasLiveDay: r.hasLiveDay, seq: r.seq,
      };
    },

    /* ── creator: bind a freshly-created local group to a new API group ── */
    async createForLocalGroup(g) {
      if (!cfg.groups) cfg.groups = {};
      const me = state().me;
      const exIds = (g.exerciseIds || []).map((id) => { const e = S().exerciseById(id); return e ? { id: e.id, name: e.name } : null; }).filter(Boolean);
      // duration groups run the SAME window server-side; window groups run to
      // windowEnd today. Play days: every day server-side (the local calendar
      // stays the wizard's — the pilot's server day is always openable).
      let windowMs = 21 * 3600_000;
      if (g.clockMode === "duration") windowMs = Math.max(60_000, g.durationMin * 60_000);
      else {
        const d = new Date(); d.setHours(g.windowEnd || 22, 0, 0, 0);
        windowMs = Math.max(60_000, d.getTime() - Date.now());
      }
      const bots = (g.members || [])
        .filter((m) => m.id !== me.id && m.isHouse)
        .map((m) => ({ name: m.name, tier: m.tier, id: m.id }));
      const r = await api("POST", "/sot/groups", {
        name: g.name,
        config: { targetReps: g.target, playDays: [0, 1, 2, 3, 4, 5, 6], exercises: exIds, dayWindowMs: windowMs },
        bots,
      });
      if (r.error) return r;
      // claim my seat (the creator is the first human player) — propose my
      // local member id so the engine day uses the SAME ids on both sides
      const join = await api("POST", `/sot/groups/${r.code}/players`, { name: me.name || "Me", tier: me.tier, id: me.id });
      if (join.error) return join;
      g.cloud = { code: r.code, pid: join.playerId, creator: true, map: {} };
      g.cloud.map[join.playerId] = me.id;
      const botTokens = {};
      (r.botTokens || []).forEach((bt) => {
        const m = (g.members || []).find((mm) => mm.name === bt.name);
        if (m) botTokens[m.id] = bt.playerToken;
      });
      if (Object.keys(botTokens).length) g.cloud.botTokens = botTokens;
      cfg.groups[r.code] = { pid: join.playerId, token: join.playerToken, since: (join.state && join.state.seq) || 0 };
      g.code = r.code; // the invite code IS the server code now
      save();
      S().save();
      await this.syncNow(g.id);
      return { ok: true, code: r.code };
    },

    /* ── joiner: build a local mirror of the server group ─────────────── */
    async confirmJoin(code) {
      const me = state().me;
      const prev = await this.lookup(code);
      if (prev.error) return prev;
      const join = await api("POST", `/sot/groups/${prev.code}/players`, { name: me.name || "Me", tier: me.tier, id: me.id });
      if (join.error) return join;
      const st = join.state;
      // local twin with the SAME rules; one live battle (duration = time left)
      const dl = (st.day && st.day.config && st.day.config.deadlineAt) || Date.now() + 3600_000;
      const g = S().createGroup({
        mode: "individual", name: st.group.name, icon: "⚡", color: "#4fd1c5",
        activeDays: st.group.config.playDays.slice(), target: st.group.config.targetReps,
        clockMode: "duration", durationMin: Math.max(1, Math.ceil((dl - Date.now()) / 60000)),
        exerciseIds: st.group.config.exercises.map((e) => e.id),
        stake: { type: "none" },
      });
      S().startSeason(g.id); // local container — the merge overwrites it with server truth
      g.cloud = { code: prev.code, pid: join.playerId, creator: false, map: {} };
      g.cloud.map[join.playerId] = me.id;
      g.code = prev.code;
      cfg.groups[prev.code] = { pid: join.playerId, token: join.playerToken, since: 0 };
      save();
      S().save();
      await this.syncNow(g.id);
      return { ok: true, groupId: g.id, code: prev.code };
    },

    /* ── the optimistic-log follow-up (called after a local log lands) ── */
    async afterLocalLog(groupId, exerciseId, physical, verified, clientLogId) {
      const bind = bindingFor(groupId);
      if (!bind || !this.enabled()) return { skipped: true };
      const { g, b } = bind;
      const reps = toEngineReps(exerciseId, physical);
      const r = await api("POST", `/sot/groups/${g.cloud.code}/log`, {
        playerToken: b.token, exercise: exerciseId, reps, ...(verified ? { verified: true } : {}), ...(clientLogId ? { clientLogId } : {}),
      });
      if (r.error) { noteFail(r.error); return r; }
      mergeState(g, r.state);
      return r;
    },

    /* ── any chat command, from the app (same brain the bots use) ─────── */
    async cmd(groupId, text) {
      const bind = bindingFor(groupId);
      if (!bind) return { error: "not a cloud group" };
      const { g, b } = bind;
      const r = await api("POST", `/sot/groups/${g.cloud.code}/cmd`, { playerToken: b.token, text, clientCmdId: "cmd_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8) });
      if (r.error) { noteFail(r.error); return r; }
      mergeState(g, r.state);
      return r;
    },
    async closeDay(groupId) { return this.cmd(groupId, "day close force"); },

    /* ── poll (interval + visibilitychange) ───────────────────────────── */
    async pollActive() {
      if (!this.enabled()) return { skipped: true };
      const bind = activeBinding();
      if (!bind) return { skipped: true };
      return this.syncNow(bind.g.id);
    },
    async syncNow(groupId) {
      const bind = bindingFor(groupId);
      if (!bind) return { skipped: true };
      if (Date.now() - lastFailAt < FAIL_COOLDOWN_MS) return { skipped: true, cooling: true };
      const { g, b } = bind;
      const since = (cfg.groups[g.cloud.code] || {}).since || 0;
      const r = await api("GET", `/sot/groups/${g.cloud.code}/state?since=${since}&playerToken=${encodeURIComponent(b.token)}`);
      if (r.error) { noteFail(r.error); return r; }
      if (r.unchanged) return { ok: true, unchanged: true, seq: r.seq };
      cfg.groups[g.cloud.code].since = r.seq;
      cfg.lastSyncAt = Date.now();
      cfg.lastError = null;
      save();
      mergeState(g, r);
      return { ok: true, seq: r.seq };
    },
  };

  function noteFail(err) {
    cfg.lastError = String(err);
    save();
  }

  /* ══ THE MERGE — server truth → the local mirror group ════════════════ */

  function memberForPid(g, pid, players) {
    const map = g.cloud.map || (g.cloud.map = {});
    if (map[pid]) {
      const m = g.members.find((x) => x.id === map[pid]);
      if (m) return m;
    }
    const sp = (players || []).find((p) => p.id === pid);
    if (sp) {
      let m = g.members.find((x) => (x.name || "").toLowerCase() === (sp.name || "").toLowerCase());
      if (!m) {
        m = {
          id: pid, name: sp.name, initials: (sp.name || "?").slice(0, 2).toUpperCase(),
          color: (S().COLORS || ["#4fd1c5"])[Math.floor(Math.random() * 6)],
          tier: sp.tier || "casual", isHouse: false, joinedAt: Date.now(),
          teamId: null, streak: 0, bestStreak: 0, lifetimeReps: 0, dailyWins: 0,
          completions: 0, failedDays: 0, stakeAgreed: true,
        };
        g.members.push(m);
      }
      map[pid] = m.id;
      return m;
    }
    return null;
  }

  /** Rebuild the UI-side battle mirrors from the engine day (bombs, wins). */
  function syncBattleMirrors(g, b, day) {
    b.winnerId = day.winnerId || null;
    if (day.winnerId) b.winnerAtMs = b.winnerAtMs || Date.now();
    b.completions = {};
    for (const [pid, prog] of Object.entries(day.progress || {})) {
      if (prog.completedAt != null) {
        const m = memberForPid(g, pid, day.players);
        if (m) b.completions[m.id] = { atMs: prog.completedAt, order: Object.keys(b.completions).length + 1 };
      }
    }
    b.bombs = (day.bombs || []).map((cb) => ({
      id: "b_" + cb.targetId + "_" + cb.issuedAt, fromId: (memberForPid(g, cb.fromId, day.players) || {}).id,
      targetId: (memberForPid(g, cb.targetId, day.players) || {}).id, reps: cb.reps,
      atMs: cb.issuedAt, fuseEndMs: cb.deadline,
      status: cb.resolved ? (cb.resolved.hit ? "defused" : "fizzled") : "live",
      logged: cb.resolved ? cb.resolved.bankedRuf : 0,
    })).filter((x) => x.targetId);
    b.steals = (day.powerLog || []).filter((pl) => pl.kind === "steal").map((pl) => ({
      id: "st_" + pl.at, fromId: (memberForPid(g, pl.playerId, day.players) || {}).id,
      targetId: (memberForPid(g, pl.detail && pl.detail.targetId, day.players) || {}).id,
      gained: pl.detail && pl.detail.gain, atMs: pl.at, targetKept: 0,
    })).filter((x) => x.fromId);
    // streak mirror from the season record
    const st = curSeason(g);
    if (st && st.core && st.core.streaks) {
      for (const [pid, sk] of Object.entries(st.core.streaks)) {
        const m = memberForPid(g, pid, day.players);
        if (m) { m.streak = sk.length || 0; m.bestStreak = Math.max(m.bestStreak || 0, sk.best || 0); }
      }
    }
  }

  function curSeason(g) { return g.seasons.find((s) => s.status === "active") || g.seasons[g.seasons.length - 1] || null; }

  function mergeEvents(g, st) {
    const have = new Set(g.events.map((e) => e.id));
    for (const se of st.events || []) {
      if (have.has(se.id)) continue;
      const m = se.playerId ? memberForPid(g, se.playerId, st.players) : null;
      // a server win event maps to the app's "win" feed type so the
      // beaten-to-the-punch moment fires on the other phones
      let kind = se.kind === "log" ? "log" : se.kind === "join" ? "join" : se.kind === "battle_start" ? "battle_start" : se.kind === "day_close" ? "recap" : "card";
      if (se.kind === "log" && /^🏆/.test(se.text || "")) kind = "win";
      if (se.kind === "log" && /^🏦/.test(se.text || "")) kind = "bank";
      g.events.push({ id: se.id, atMs: se.at, type: kind, memberId: m ? m.id : undefined, text: se.text, reactions: {}, cloud: true });
    }
    if (g.events.length > 240) g.events.splice(0, g.events.length - 240);
  }

  function mergeState(g, st) {
    try {
      const me = state().me;
      if (!g.cloud) return;
      // roster: make sure every server player has a local member
      for (const sp of st.players || []) memberForPid(g, sp.id, st.players);

      const s = curSeason(g);
      if (s && st.season) s.core = st.season; // points/records are server truth

      // server day → local battle mirror
      if (st.day) {
        const b = s ? (s.battles.find((x) => x.status === "live") || s.battles.find((x) => x.status === "scheduled") || s.battles[s.battles.length - 1]) : null;
        if (b) {
          const dropped = b.core && b.core.entries && st.day.entries &&
            b.core.entries.filter((e) => !e.powerUps).length - st.day.entries.length;
          if (st.day.status === "live" && b.status !== "live") {
            // the server opened a day (e.g. a bot ran `start`) → open locally
            b.status = "live"; b.startedAtMs = Date.now();
            b.startMs = b.idx === 1 ? Date.now() : Date.now();
            b.deadlineMs = st.day.config.deadlineAt;
          }
          if (b.status === "live" || st.day.status === "closed") {
            b.core = st.day;
            b.deadlineMs = st.day.config.deadlineAt;
            if (b.status === "live" && st.day.status === "closed") {
              b.status = "ended";
              const w = st.day.winnerId ? (g.cloud.map || {})[st.day.winnerId] : null;
              pushRecap(g, b, st, w);
            }
            syncBattleMirrors(g, b, st.day);
            if (dropped > 0 && st.day.entries.some((e) => e.playerId === g.cloud.pid)) {
              // conflict = server wins; tell the pilot honestly
              toastOnce("☁️ Synced with the crew server — the server copy of your log stands");
            }
          }
        }
      }
      if (st.season && st.season.endedAt != null && s && s.status === "active") {
        s.status = "ended"; s.endedAt = st.season.endedAt;
        s.winnerId = (g.cloud.map || {})[st.season.champion] || st.season.champion;
        s.core = st.season;
      }
      mergeEvents(g, st);
      S().save();
      try { window.dispatchEvent(new CustomEvent("rwf-cloud-sync", { detail: { code: g.cloud.code } })); } catch (e) { /* non-fatal */ }
    } catch (e) {
      console.warn("cloud merge", e);
    }
  }

  function pushRecap(g, b, st, winnerMemberId) {
    const winner = winnerMemberId ? g.members.find((m) => m.id === winnerMemberId) : null;
    const banked = (st.board || []).filter((r) => r.completed).length;
    g.events.push({
      id: "recap_" + b.idx + "_" + st.seq, atMs: Date.now(), type: "recap", battle: b.idx, reactions: {},
      text: winner
        ? `Battle ${b.idx} done — ${winner.name.split(" ")[0]} took the Daily Win · ${banked} banked (cloud-synced)`
        : `Battle ${b.idx} done — nobody reached target (cloud-synced)`,
    });
  }

  let toastT = null;
  function toastOnce(msg) {
    try {
      const t = document.getElementById("toast");
      if (!t) return;
      t.textContent = msg; t.classList.add("on");
      clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600);
    } catch (e) { /* headless */ }
  }

  /* ── the loop ───────────────────────────────────────────────────────── */
  load();
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    Cloud.pollActive().catch(() => {});
  }, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") Cloud.pollActive().catch(() => {});
  });

  window.RWFCloud = Cloud;
})();
