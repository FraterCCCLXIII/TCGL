import { dispatch } from "./engine/dispatch";
import type { GameAction } from "./types/actions";
import type { EngineResult } from "./types/result";
import type { GameState } from "./types/state";
import { createEmptyEventLog, appendToLog, type EventLog } from "./log/eventLog";

/**
 * In-memory, single-player view of the rules engine. For multiplayer, only the **server** should
 * own this; clients send actions and receive new state (or diffs) over the wire.
 */
export function createSession(initial: GameState) {
  let state = initial;
  let log: EventLog = createEmptyEventLog();
  return {
    getState: (): GameState => state,
    getLog: (): EventLog => log,
    reset(next: GameState) {
      state = next;
      log = createEmptyEventLog();
    },
    /**
     * Apply an action. On success, `state` and the append-only `log` are updated.
     */
    dispatch(a: GameAction): EngineResult {
      const r = dispatch(state, a);
      if (r.error) {
        return r;
      }
      state = r.state;
      log = appendToLog(log, r.events);
      return r;
    },
  };
}

export type TcglSession = ReturnType<typeof createSession>;
