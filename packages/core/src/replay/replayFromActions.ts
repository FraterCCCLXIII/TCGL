import type { GameAction } from "../types/actions";
import { dispatch } from "../engine/dispatch";
import type { GameState } from "../types/state";
import { createEmptyEventLog, appendToLog, type EventLog } from "../log/eventLog";

/**
 * Deterministic fold. Failed actions are **skipped**; see `errors` for indices.
 */
export function replayFromActions(
  initial: GameState,
  actions: readonly GameAction[]
): { state: GameState; log: EventLog; errors: { index: number; message: string }[] } {
  let state = initial;
  let log = createEmptyEventLog();
  const errors: { index: number; message: string }[] = [];
  for (let i = 0; i < actions.length; i++) {
    const r = dispatch(state, actions[i]!);
    if (r.error) {
      errors.push({ index: i, message: r.error.message });
      continue;
    }
    state = r.state;
    log = appendToLog(log, r.events);
  }
  return { state, log, errors };
}

/**
 * Aborts the first time an action is illegal. Use in tests and strict replays.
 */
export function assertReplayFromActions(
  initial: GameState,
  actions: readonly GameAction[]
): { state: GameState; log: EventLog } {
  let state = initial;
  let log = createEmptyEventLog();
  for (let i = 0; i < actions.length; i++) {
    const r = dispatch(state, actions[i]!);
    if (r.error) {
      throw new Error(`Replay failed at [${i}]: ${r.error.message}`);
    }
    state = r.state;
    log = appendToLog(log, r.events);
  }
  return { state, log };
}
