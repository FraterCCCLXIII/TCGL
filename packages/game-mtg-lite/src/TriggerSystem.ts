import type { GameState } from "@tcgl/core";
import type { GameEvent } from "@tcgl/core";

/**
 * Listens to `GameEvent` streams; may enqueue stack objects (to be wired in `@tcgl/core` later).
 * Stub: implement when moving beyond the toy engine.
 */
export class TriggerSystem {
  check(_state: GameState, _event: GameEvent): void {
    void _state;
    void _event;
  }
}
