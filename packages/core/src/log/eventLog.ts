import type { GameEvent } from "../types/events";
import type { GameState } from "../types/state";
import { SCHEMA_VERSION } from "../types/schema";

/**
 * Durable, append-only record of what the engine (or server) has applied. The canonical replay input
 * is the **action** list, not this log; this log is for debugging, audit, and optional Event Sourcing
 * of facts.
 */
export type EventLog = {
  schemaVersion: typeof SCHEMA_VERSION;
  entries: GameEvent[];
};

export function createEmptyEventLog(): EventLog {
  return { schemaVersion: SCHEMA_VERSION, entries: [] };
}

export function appendToLog(
  log: EventLog,
  ev: readonly GameEvent[]
): EventLog {
  return { ...log, entries: log.entries.concat(...ev) };
}

/**
 * Future: project `GameState` from a sequence of `GameEvent`s. Today the source of truth is
 * `replayFromActions` over `GameAction` — this stub remains so callers can branch later.
 */
export function projectStateFromEventLog(
  _initial: GameState,
  _log: EventLog
): GameState {
  void _initial;
  void _log;
  throw new Error(
    "projectStateFromEventLog is not implemented; use replayFromActions(actions) for determinism"
  );
}
