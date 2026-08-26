// Static app content: exercise catalog, charities, demo crew, canned taunts.
import type { Charity, Exercise, FitnessTier, Player } from "./engine.ts";
import { TIER_MULTIPLIERS } from "./engine.ts";

export const EXERCISES: Exercise[] = [
  { id: "pushup", name: "Push-ups" },
  { id: "squat", name: "Squats" },
  { id: "situp", name: "Sit-ups" },
  { id: "burpee", name: "Burpees" },
  { id: "lunge", name: "Lunges" },
];

export const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export const CHARITIES: Charity[] = [
  { id: "beyondblue", name: "Beyond Blue" },
  { id: "movember", name: "Movember" },
  { id: "wwf", name: "WWF Australia" },
  { id: "foodbank", name: "Foodbank" },
];

/** Demo crewmates (simulated locally — real crew arrive via the chat bots). */
export const DEMO_CREW: Player[] = [
  { id: "sim_sam", name: "Sam", tier: "fit" },
  { id: "sim_priya", name: "Priya", tier: "casual" },
  { id: "sim_dex", name: "Dex", tier: "couch" },
];

export const TAUNTS: string[] = [
  "You call those reps? My nan does more getting off the couch.",
  "I've seen warm-ups warmer than your whole match.",
  "Keep going — second place needs the company.",
  "I'm not even sweaty. You good?",
  "Every rep you skip makes me stronger.",
  "See you at the finish line. Actually — you won't.",
  "The pot's already mine. Pick a charity you like.",
  "That grinding sound is your excuses, not your joints.",
  "Couch tier and still beating you. Awkward.",
  "Logging reps isn't doing reps. Oh wait — that's you.",
];

export interface TierInfo {
  label: string;
  blurb: string;
  mult: number;
}

export const TIER_INFO: Record<FitnessTier, TierInfo> = {
  couch: { label: "Couch", blurb: "Getting up IS the workout", mult: TIER_MULTIPLIERS.couch },
  casual: { label: "Casual", blurb: "1–2 sessions a week", mult: TIER_MULTIPLIERS.casual },
  fit: { label: "Fit", blurb: "3–4 sessions a week", mult: TIER_MULTIPLIERS.fit },
  athlete: { label: "Athlete", blurb: "Daily. Unhinged.", mult: TIER_MULTIPLIERS.athlete },
};

export const TIER_CLASS: Record<FitnessTier, string> = {
  couch: "tier-couch",
  casual: "tier-casual",
  fit: "tier-fit",
  athlete: "tier-athlete",
};

/** Everyone stakes this (cents) at match start → winner directs it to charity. */
export const STAKE_CENTS = 500;
