import type { SchemaVersion } from "./schema";
import { SCHEMA_VERSION } from "./schema";
import type { GamePhase, TurnStep } from "./turn";

export type CardId = string;
export type PlayerId = string;
export type ZoneId = string;

export type CardInstance = {
  id: CardId;
  /** Printed card or template id; rules may branch on it later. */
  definitionId: string;
  /** Owner in game; may differ from control in future rulesets. */
  controllerId: PlayerId;
  tapped: boolean;
};

export type StackObject = {
  id: string;
  sourceCardId: string;
  controllerId: PlayerId;
  type: "SPELL" | "ABILITY" | "TRIGGER";
};

/**
 * Authoritative (server-side) game snapshot. The UI should project views from this, not own it
 * in React state.
 */
export type GameState = {
  schemaVersion: SchemaVersion;
  gameId: string;
  turnNumber: number;
  activePlayer: PlayerId;
  players: PlayerId[];
  /**
   * Zone id → ordered list of card ids. Zone ids are arbitrary strings, e.g. `p1:hand`, `shared:battlefield`.
   */
  zoneContents: Record<ZoneId, CardId[]>;
  cards: Record<CardId, CardInstance>;
  /** See `TURN_PHASE_ORDER` when using the turn + step machine. */
  turnPhase: GamePhase;
  turnStep: TurnStep;
  /**
   * Stack top is last element. Empty stack with clear priority advances the **step/phase** when
   * everyone passes; non-empty stack resolves top.
   */
  stack: StackObject[];
  /** null when no window open (e.g. between turn cleanup). */
  priorityPlayer: PlayerId | null;
  /** Consecutive priority passes; reset when a player takes a non-pass action. */
  priorityPassCount: number;
  /** Monotonic for deterministic stack object ids. */
  nextStackSeq: number;
};

export function createEmptyState(
  id: string,
  players: PlayerId[],
  active: PlayerId
): GameState {
  if (players.length < 1) {
    throw new Error("At least one player is required");
  }
  if (!players.includes(active)) {
    throw new Error("activePlayer must be in players");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    gameId: id,
    turnNumber: 1,
    activePlayer: active,
    players: [...players].sort(),
    zoneContents: {},
    cards: {},
    turnPhase: "beginning",
    turnStep: "pre",
    stack: [],
    priorityPlayer: active,
    priorityPassCount: 0,
    nextStackSeq: 0,
  };
}
