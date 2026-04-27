import type { GameAction } from "../types/actions";
import type { GameState } from "../types/state";
import type { GameEvent } from "../types/events";

/**
 * Monotonic per-match sequence for ordering and idempotent replays on the client.
 */
export type Seq = number;

/**
 * All WebSocket / HTTP payloads the client may send. The server is authoritative and must
 * re-apply via `dispatch` — never apply raw `GameState` from peers.
 */
export type ClientToServer =
  | { type: "join"; roomId: string; playerId: string; token?: string }
  | { type: "dispatch"; roomId: string; seq?: Seq; action: GameAction; playerId: string }
  | { type: "ping"; t: number };

export type ServerToClient =
  | { type: "welcome"; roomId: string; playerId: string; state: GameState; seq: Seq }
  | {
      type: "patch";
      roomId: string;
      seq: Seq;
      state: GameState;
      events: GameEvent[];
      error?: { code: string; message: string };
    }
  | { type: "pong"; t: number };
