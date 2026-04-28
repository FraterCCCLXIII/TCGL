import { SCHEMA_VERSION } from "./types/schema";
import type { GameAction } from "./types/actions";

export function reorderZoneCardsAction(
  playerId: string,
  zoneId: string,
  fromIndex: number,
  toIndex: number
): GameAction {
  return {
    type: "REORDER_ZONE_CARDS",
    schemaVersion: SCHEMA_VERSION,
    playerId,
    zoneId,
    fromIndex,
    toIndex,
  };
}

export function moveCardAction(
  playerId: string,
  cardId: string,
  fromZone: string,
  toZone: string,
  toIndex?: number
): GameAction {
  return {
    type: "MOVE_CARD",
    schemaVersion: SCHEMA_VERSION,
    playerId,
    cardId,
    fromZone,
    toZone,
    ...(toIndex !== undefined ? { toIndex } : {}),
  };
}

export function endTurnAction(playerId: string): GameAction {
  return { type: "END_TURN", schemaVersion: SCHEMA_VERSION, playerId };
}

export function advanceStepAction(playerId: string): GameAction {
  return { type: "ADVANCE_STEP", schemaVersion: SCHEMA_VERSION, playerId };
}

export function passPriorityAction(playerId: string): GameAction {
  return { type: "PASS_PRIORITY", schemaVersion: SCHEMA_VERSION, playerId };
}

export function castToStackAction(
  playerId: string,
  cardId: string,
  fromZone: string
): GameAction {
  return {
    type: "CAST_TO_STACK",
    schemaVersion: SCHEMA_VERSION,
    playerId,
    cardId,
    fromZone,
  };
}

export function toggleCardTappedAction(
  playerId: string,
  cardId: string
): GameAction {
  return {
    type: "TOGGLE_CARD_TAPPED",
    schemaVersion: SCHEMA_VERSION,
    playerId,
    cardId,
  };
}
