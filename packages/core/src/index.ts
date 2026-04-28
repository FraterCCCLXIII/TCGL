// --- Schema & contracts
export { SCHEMA_VERSION, type SchemaVersion } from "./types/schema";
export {
  type GameAction,
  type ReorderZoneCardsAction,
  type MoveCardAction,
  type EndTurnAction,
  type AdvanceStepAction,
  type PassPriorityAction,
  type CastToStackAction,
  type ToggleCardTappedAction,
  actionSchemaVersion,
  isSupportedAction,
} from "./types/actions";
export {
  type GameEvent,
  type CardMoved,
  type CardTapToggled,
  type ZoneReordered,
  type TurnAdvanced,
  type StepEntered,
  type TurnBegan,
  type PriorityGiven,
  type StackObjectPushed,
  type StackObjectResolved,
  type LogLine,
} from "./types/events";
export type {
  EngineResult,
  EngineError,
  EngineErrorCode,
} from "./types/result";
export { err, ok } from "./types/result";
export {
  type GameState,
  type CardId,
  type PlayerId,
  type ZoneId,
  type CardInstance,
  type StackObject,
  createEmptyState,
} from "./types/state";
export { TURN_PHASE_ORDER, type GamePhase, type TurnStep } from "./types/turn";

// --- Log & replay
export {
  type EventLog,
  createEmptyEventLog,
  appendToLog,
  projectStateFromEventLog,
} from "./log/eventLog";
export { replayFromActions, assertReplayFromActions } from "./replay/replayFromActions";

// --- Engine
export { dispatch } from "./engine/dispatch";
export { cloneState, getZone } from "./engine/cloneState";
export { applyAdvanceStep, applyEndTurn, nextPlayer, indexOfPlayer } from "./engine/turn";
export { createSession, type TcglSession } from "./session";

// --- Factories (typed actions for UI / tests)
export {
  moveCardAction,
  reorderZoneCardsAction,
  endTurnAction,
  advanceStepAction,
  passPriorityAction,
  castToStackAction,
  toggleCardTappedAction,
} from "./factories";

// --- Wire protocol (shared with server / clients)
export type {
  ClientToServer,
  ServerToClient,
} from "./net/messages";
