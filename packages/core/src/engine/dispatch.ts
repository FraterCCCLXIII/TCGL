import type { GameAction } from "../types/actions";
import { SCHEMA_VERSION } from "../types/schema";
import type { EngineResult } from "../types/result";
import { err, ok } from "../types/result";
import type { GameState } from "../types/state";
import { cloneState, getZone } from "./cloneState";
import { applyAdvanceStep, applyEndTurn } from "./turn";

export function dispatch(state: GameState, action: GameAction): EngineResult {
  if (action.schemaVersion !== SCHEMA_VERSION) {
    return err(state, {
      code: "SCHEMA",
      message: `Unsupported action schema ${String(action.schemaVersion)}`,
    });
  }
  switch (action.type) {
    case "MOVE_CARD":
      return moveCard(state, action);
    case "REORDER_ZONE_CARDS":
      return reorderZoneCards(state, action);
    case "END_TURN":
      return endTurn(state, action);
    case "ADVANCE_STEP":
      return advanceStep(state, action);
    case "PASS_PRIORITY":
      return passPriority(state, action);
    case "CAST_TO_STACK":
      return castToStack(state, action);
    case "TOGGLE_CARD_TAPPED":
      return toggleCardTapped(state, action);
  }
  return err(state, {
    code: "ILLEGAL",
    message: "Unhandled action",
  });
}

function reorderZoneCards(
  state: GameState,
  a: Extract<GameAction, { type: "REORDER_ZONE_CARDS" }>
): EngineResult {
  const s = cloneState(state);
  const list = getZone(s, a.zoneId, true);
  const n = list.length;
  if (n <= 1) {
    return err(state, { code: "ILLEGAL", message: "Nothing to reorder" });
  }
  if (a.fromIndex < 0 || a.fromIndex >= n || a.toIndex < 0 || a.toIndex >= n) {
    return err(state, { code: "ILLEGAL", message: "Invalid reorder index" });
  }
  if (a.fromIndex === a.toIndex) {
    return ok(s, []);
  }
  const id = list[a.fromIndex]!;
  const c = s.cards[id];
  if (!c) {
    return err(state, { code: "ILLEGAL", message: "Unknown card" });
  }
  if (c.controllerId !== a.playerId) {
    return err(state, { code: "ILLEGAL", message: "You do not control this card" });
  }
  list.splice(a.fromIndex, 1);
  list.splice(a.toIndex, 0, id);
  s.priorityPassCount = 0;
  return ok(s, [
    {
      type: "ZONE_REORDERED",
      zoneId: a.zoneId,
      cardId: id,
      fromIndex: a.fromIndex,
      toIndex: a.toIndex,
    },
  ]);
}

function toggleCardTapped(
  state: GameState,
  a: Extract<GameAction, { type: "TOGGLE_CARD_TAPPED" }>
): EngineResult {
  const s = cloneState(state);
  const card = s.cards[a.cardId];
  if (!card) {
    return err(state, { code: "ILLEGAL", message: "Unknown card" });
  }
  if (card.controllerId !== a.playerId) {
    return err(state, {
      code: "ILLEGAL",
      message: "Player does not control this card",
    });
  }
  card.tapped = !card.tapped;
  s.priorityPassCount = 0;
  return ok(s, [
    { type: "CARD_TAP_TOGGLED", cardId: a.cardId, tapped: card.tapped },
  ]);
}

function moveCard(
  state: GameState,
  a: Extract<GameAction, { type: "MOVE_CARD" }>
): EngineResult {
  const s = cloneState(state);
  const list = getZone(s, a.fromZone, true);
  const to = getZone(s, a.toZone, true);
  const idx = list.indexOf(a.cardId);
  if (idx < 0) {
    return err(state, {
      code: "ILLEGAL",
      message: "Card is not in fromZone",
      details: { cardId: a.cardId, fromZone: a.fromZone },
    });
  }
  const card = s.cards[a.cardId];
  if (!card) {
    return err(state, { code: "ILLEGAL", message: "Unknown card" });
  }
  if (card.controllerId !== a.playerId) {
    return err(state, {
      code: "ILLEGAL",
      message: "Player does not control this card",
    });
  }
  list.splice(idx, 1);
  const toIndex =
    a.toIndex === undefined
      ? to.length
      : Math.max(0, Math.min(a.toIndex, to.length));
  to.splice(toIndex, 0, a.cardId);
  s.priorityPassCount = 0;
  return ok(s, [
    {
      type: "CARD_MOVED",
      cardId: a.cardId,
      fromZone: a.fromZone,
      toZone: a.toZone,
      toIndex,
    },
  ]);
}

function endTurn(
  state: GameState,
  a: Extract<GameAction, { type: "END_TURN" }>
): EngineResult {
  const r = applyEndTurn(state, a.playerId);
  if (r === "not_active") {
    return err(state, { code: "OUT_OF_TURN", message: "Not your turn" });
  }
  return ok(r.state, r.events);
}

function advanceStep(
  state: GameState,
  a: Extract<GameAction, { type: "ADVANCE_STEP" }>
): EngineResult {
  if (a.playerId !== state.activePlayer) {
    return err(state, { code: "OUT_OF_TURN", message: "Only active player can advance" });
  }
  if (state.stack.length > 0) {
    return err(state, {
      code: "ILLEGAL",
      message: "Clear the stack (priority / resolve) before advancing the step",
    });
  }
  const r = applyAdvanceStep(state);
  return ok(r.state, r.events);
}

function passPriority(
  state: GameState,
  a: Extract<GameAction, { type: "PASS_PRIORITY" }>
): EngineResult {
  if (state.priorityPlayer == null) {
    return err(state, { code: "ILLEGAL", message: "No open priority window" });
  }
  if (a.playerId !== state.priorityPlayer) {
    return err(state, { code: "NOT_YOUR_PRIORITY", message: "Not your priority" });
  }
  const s = cloneState(state);
  s.priorityPassCount += 1;
  const n = s.players.length;
  if (s.priorityPassCount < n) {
    const idx = s.players.indexOf(a.playerId);
    s.priorityPlayer = s.players[(idx + 1) % n] ?? null;
    return ok(s, [
      { type: "PRIORITY_GIVEN", player: s.priorityPlayer! },
    ]);
  }
  s.priorityPassCount = 0;
  if (s.stack.length > 0) {
    const top = s.stack.pop()!;
    s.priorityPlayer = s.activePlayer;
    return ok(s, [
      { type: "STACK_OBJECT_RESOLVED", id: top.id },
      { type: "PRIORITY_GIVEN", player: s.activePlayer },
    ]);
  }
  const adv = applyAdvanceStep(s);
  return ok(adv.state, adv.events);
}

function castToStack(
  state: GameState,
  a: Extract<GameAction, { type: "CAST_TO_STACK" }>
): EngineResult {
  if (a.playerId !== state.activePlayer) {
    return err(state, { code: "ILLEGAL", message: "Only active player can cast" });
  }
  const s = cloneState(state);
  const from = getZone(s, a.fromZone, true);
  const ix = from.indexOf(a.cardId);
  if (ix < 0) {
    return err(state, { code: "ILLEGAL", message: "Card not in zone" });
  }
  const card = s.cards[a.cardId];
  if (!card || card.controllerId !== a.playerId) {
    return err(state, { code: "ILLEGAL", message: "Invalid card" });
  }
  from.splice(ix, 1);
  const id = `stack_${s.gameId}:${s.nextStackSeq}`;
  s.nextStackSeq += 1;
  s.stack.push({
    id,
    sourceCardId: a.cardId,
    controllerId: a.playerId,
    type: "SPELL",
  });
  s.priorityPlayer = a.playerId;
  s.priorityPassCount = 0;
  return ok(s, [
    {
      type: "STACK_OBJECT_PUSHED",
      id,
      controllerId: a.playerId,
      sourceCardId: a.cardId,
      kind: "SPELL",
    },
    { type: "PRIORITY_GIVEN", player: a.playerId },
  ]);
}
