// AI features — thin client for the local /api/ai endpoint (serve.ts → GLM).
// Every call is best-effort: on ANY failure (offline, timeout, bad shape) we
// return null and the caller falls back to canned content. Calls never block
// the UI longer than `timeoutMs` (AbortController).
import { standings, type MatchState } from "./engine.ts";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export async function aiChat(
  messages: AiMessage[],
  system?: string,
  timeoutMs = 3000
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, ...(system ? { system } : {}) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: unknown };
    return typeof data.text === "string" && data.text.trim() ? data.text.trim() : null;
  } catch {
    return null; // aborted (timeout) or network error — caller falls back
  } finally {
    clearTimeout(timer);
  }
}

// ── match narrator ───────────────────────────────────────────────────────────

const NARRATOR_SYSTEM =
  "You are the live match commentator for Reps With Friends, a fitness app where " +
  "friends compete in handicap rep matches (push-ups, squats, burpees…). Lower " +
  "fitness tiers earn a higher score per rep, so effort competes, not raw fitness. " +
  "Style: dramatic sports-commentator energy, witty, punchy. ALWAYS exactly 2-3 " +
  "short sentences. No emoji, no markdown, no preamble — just the commentary.";

/** Compact text summary of current standings — the narrator's fact sheet. */
export function standingsSummary(match: MatchState): string {
  const rows = standings(match);
  return rows
    .map(
      (r, i) =>
        `${i + 1}. ${r.player.name} (${r.player.tier} tier): ${r.rawReps} raw reps of ` +
        `${match.config.targetReps}, ${r.adjustedScore} adjusted points, ${r.verifiedPct}% verified`
    )
    .join("\n");
}

/** 2-3 sentences of dramatic commentary on the current state of the match. */
export async function narrateMatch(match: MatchState): Promise<string | null> {
  return aiChat(
    [
      {
        role: "user",
        content:
          `Current standings in a ${match.config.targetReps}-rep match ` +
          `(${match.config.exercises.map((e) => e.name).join(", ")}):\n` +
          `${standingsSummary(match)}\n\n` +
          "Give 2-3 sentences of dramatic commentary on the state of the match.",
      },
    ],
    NARRATOR_SYSTEM,
    7000
  );
}

// ── taunt composer ───────────────────────────────────────────────────────────

const TAUNT_SYSTEM =
  "You write ONE trash-talk taunt for Reps With Friends, a fitness rep-competition " +
  "between close friends. Rules: max 25 words, funny and biting but friendly (mates " +
  "ribbing mates), reference their stats when given, no slurs, no emoji, no quote " +
  "marks, no preamble — just the line itself.";

export interface TauntTarget {
  name: string;
  tier: string;
  rank: number;
  rawReps: number;
  adjustedScore: number;
}

/** A fresh AI taunt aimed at a specific crewmate's stats, or null on failure. */
export async function composeTaunt(
  meName: string,
  target: TauntTarget,
  targetReps: number
): Promise<string | null> {
  return aiChat(
    [
      {
        role: "user",
        content:
          `I'm ${meName}. Taunt my crewmate ${target.name} for me. ${target.name} is ` +
          `currently rank ${target.rank} in the match: ${target.rawReps} raw reps of the ` +
          `${targetReps} target, ${target.adjustedScore} adjusted points, ${target.tier} tier.`,
      },
    ],
    TAUNT_SYSTEM,
    3000
  );
}
