import type { GameState } from "./state";
import type { GameEvent } from "./events";

export type EngineErrorCode =
  | "SCHEMA"
  | "ILLEGAL"
  | "OUT_OF_TURN"
  | "ILLEGAL_TARGET"
  | "NOT_YOUR_PRIORITY";

export type EngineError = {
  code: EngineErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * The UI must handle both branches: on failure, the previous `state` is still valid.
 */
export type EngineResult = {
  state: GameState;
  events: GameEvent[];
  error?: EngineError;
};

export function err(
  state: GameState,
  e: EngineError
): EngineResult {
  return { state, events: [], error: e };
}

export function ok(
  state: GameState,
  events: GameEvent[]
): EngineResult {
  return { state, events };
}
