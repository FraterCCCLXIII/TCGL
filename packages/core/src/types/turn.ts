/**
 * Simplified turn structure: not a full MTG turn tree, but enough for a real step/progress event log.
 */
export type GamePhase =
  | "beginning"
  | "main1"
  | "combat"
  | "main2"
  | "ending";

export type TurnStep =
  | "pre"
  | "main"
  | "end";

/** Ordered (player turn) sub-phases. `advanceStep` moves along this list; `end` wraps to next player. */
export const TURN_PHASE_ORDER: GamePhase[] = [
  "beginning",
  "main1",
  "combat",
  "main2",
  "ending",
];
