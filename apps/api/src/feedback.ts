// @rwf/api — wiki feedback store (.data/feedback.json)
// The founder's crew leaving notes on the wiki (apps/wiki). ZERO auth by
// design — this is a notes box, not a game surface — so the whole spam story
// is: length caps, control-char stripping, a light per-IP rate limit and a
// same-text dedupe. Rendering escapes everything (apps/wiki/feedback.js uses
// textContent only), so hostile input is inert end to end.
//
// This module is dependency-free (node only) ON PURPOSE: serve.ts imports it
// as a graceful fallback when the API (:4174) isn't running, so the wiki's
// comment box works with `bun serve.ts` alone. The API route layer in
// routes.ts is the production path — see docs/22 §11 for the wiring.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

// ── Tuning (kept in sync with apps/wiki/feedback.js caps) ───────────────────

export const PAGE_MAX = 80;
export const NAME_MAX = 40;
export const TEXT_MAX = 1000;
/** Bound the file: the stream keeps the newest MAX_ENTRIES notes. */
export const MAX_ENTRIES = 2000;
/** Same page+text within the newest DEDUPE_WINDOW notes → deduped, not stored. */
export const DEDUPE_WINDOW = 200;
/** Light rate limit: POSTs per IP per window. */
export const RATE_MAX = 12;
export const RATE_WINDOW_MS = 5 * 60_000;

// ── Records & path ──────────────────────────────────────────────────────────

export interface FeedbackEntry {
  id: string;
  /** Wiki page id ("game", "app", "index", …) — the note's home page. */
  page: string;
  /** Display name, "anon" when the note-taker didn't bother. */
  name: string;
  text: string;
  at: number;
}

// Default: <repoRoot>/.data/feedback.json (repo root = three levels up from
// src/). Override with RWF_FEEDBACK_DB (tests use a temp file).
const defaultPath = resolve(
  dirname(new URL(import.meta.url).pathname),
  "../../../.data/feedback.json"
);

export function feedbackPath(): string {
  return process.env.RWF_FEEDBACK_DB || defaultPath;
}

// ── Load / save ─────────────────────────────────────────────────────────────

export function loadFeedback(): FeedbackEntry[] {
  const path = feedbackPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: any) =>
        e &&
        typeof e.id === "string" &&
        typeof e.page === "string" &&
        typeof e.text === "string"
    );
  } catch {
    // Corrupt file → start empty rather than take the notes box down.
    return [];
  }
}

/** Atomic write: serialize → write tmp → rename over the target. */
export function saveFeedback(list: FeedbackEntry[]): void {
  const path = feedbackPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(list, null, 2));
  renameSync(tmp, path);
}

// ── Input hygiene ───────────────────────────────────────────────────────────

/** Strip control chars (keep \n + \t in text; single-line fields collapse all whitespace). */
const clean = (s: string, singleLine: boolean): string => {
  let out = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
  if (singleLine) out = out.replace(/\s+/g, " ");
  return out.trim();
};

// ── Write path ──────────────────────────────────────────────────────────────

export type FeedbackResult =
  | { ok: true; entry: FeedbackEntry; deduped: boolean }
  | { ok: false; status: number; error: string };

/**
 * Validate → dedupe → persist one note. Never throws: the result carries the
 * HTTP status so both the API routes and serve.ts's fallback map it 1:1.
 */
export function addFeedback(input: {
  page?: unknown;
  name?: unknown;
  text?: unknown;
}): FeedbackResult {
  const rawText = typeof input?.text === "string" ? clean(input.text, false) : "";
  if (!rawText) return { ok: false, status: 400, error: "text is required" };
  if (rawText.length > TEXT_MAX)
    return { ok: false, status: 400, error: `text must be ≤${TEXT_MAX} chars` };

  const rawPage =
    typeof input?.page === "string" ? clean(input.page, true) : "";
  const page = (rawPage || "index").slice(0, PAGE_MAX);

  const rawName = typeof input?.name === "string" ? clean(input.name, true) : "";
  const name = (rawName || "anon").slice(0, NAME_MAX);

  const list = loadFeedback();

  // Same-text dedupe: identical page+text already in the recent window →
  // report success pointing at the existing note, store nothing.
  const dupe = list
    .slice(-DEDUPE_WINDOW)
    .reverse()
    .find((e) => e.page === page && e.text === rawText);
  if (dupe) return { ok: true, entry: dupe, deduped: true };

  const entry: FeedbackEntry = {
    id: `fb_${crypto.randomUUID().slice(0, 8)}`,
    page,
    name,
    text: rawText,
    // Strictly monotonic: two notes in the same millisecond must still
    // order by arrival (newest-first reads are the whole UX).
    at: Math.max(Date.now(), (list[list.length - 1]?.at ?? 0) + 1),
  };
  list.push(entry);
  saveFeedback(list.slice(-MAX_ENTRIES)); // keep the newest bound
  return { ok: true, entry, deduped: false };
}

// ── Read paths (newest first everywhere) ────────────────────────────────────

const newestFirst = (list: FeedbackEntry[]): FeedbackEntry[] =>
  [...list].sort((a, b) => b.at - a.at);

/** All notes for one page, newest first, plus the all-time total. */
export function listForPage(page: string): {
  comments: FeedbackEntry[];
  total: number;
} {
  const all = loadFeedback();
  return {
    comments: newestFirst(all.filter((e) => e.page === page)),
    total: all.length,
  };
}

/** The whole stream, newest first, capped; plus the all-time total. */
export function listRecent(limit: number): {
  comments: FeedbackEntry[];
  total: number;
} {
  const all = loadFeedback();
  return { comments: newestFirst(all).slice(0, limit), total: all.length };
}

/** Parse + clamp a ?limit= value (default 50, hard cap 200). */
export function parseLimit(raw: string | null): number {
  const n = Number(raw ?? "50");
  return Number.isInteger(n) && n > 0 ? Math.min(n, 200) : 50;
}

// ── Rate limit (in-memory per process — light by design) ────────────────────

const rateBuckets = new Map<string, { resetAt: number; count: number }>();

/** Extract the caller IP the same way the sot limiter does. */
export function feedbackIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "local"
  );
}

/** True when this IP has burned its RATE_MAX posts in the current window. */
export function feedbackRateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = rateBuckets.get(ip);
  const bucket = cur && cur.resetAt > now ? cur : { resetAt: now + RATE_WINDOW_MS, count: 0 };
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  return bucket.count > RATE_MAX;
}
