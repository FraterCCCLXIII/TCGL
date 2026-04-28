import type { SchemaVersion } from "./schema";
import { SCHEMA_VERSION } from "./schema";

/**
 * Intents a player (or the UI on their behalf) sends into the **authoritative** reducer.
 * Serializable; safe to log and send over the wire.
 */
export type GameAction =
  | MoveCardAction
  | ReorderZoneCardsAction
  | EndTurnAction
  | AdvanceStepAction
  | PassPriorityAction
  | CastToStackAction
  | ToggleCardTappedAction;

export type MoveCardAction = {
  type: "MOVE_CARD";
  schemaVersion: SchemaVersion;
  playerId: string;
  cardId: string;
  fromZone: string;
  toZone: string;
  /** Insert index in destination zone, or end if omitted. */
  toIndex?: number;
};

/**
 * Reorder **within a single zone** (e.g. hand) by moving a card from one index to another.
 * Does not change `cards` or zones — only the order of ids in `zoneContents[zoneId]`.
 */
export type ReorderZoneCardsAction = {
  type: "REORDER_ZONE_CARDS";
  schemaVersion: SchemaVersion;
  playerId: string;
  zoneId: string;
  fromIndex: number;
  toIndex: number;
};

export type EndTurnAction = {
  type: "END_TURN";
  schemaVersion: SchemaVersion;
  playerId: string;
};

export type AdvanceStepAction = {
  type: "ADVANCE_STEP";
  schemaVersion: SchemaVersion;
  playerId: string;
};

export type PassPriorityAction = {
  type: "PASS_PRIORITY";
  schemaVersion: SchemaVersion;
  playerId: string;
};

export type CastToStackAction = {
  type: "CAST_TO_STACK";
  schemaVersion: SchemaVersion;
  playerId: string;
  cardId: string;
  fromZone: string;
};

/** Flip {@link CardInstance.tapped} (e.g. MTG-style 90° tap / exhausted). */
export type ToggleCardTappedAction = {
  type: "TOGGLE_CARD_TAPPED";
  schemaVersion: SchemaVersion;
  playerId: string;
  cardId: string;
};

export function actionSchemaVersion(
  a: GameAction
): SchemaVersion {
  return a.schemaVersion;
}

export function isSupportedAction(
  a: GameAction
): a is GameAction {
  return a.schemaVersion === SCHEMA_VERSION;
}
