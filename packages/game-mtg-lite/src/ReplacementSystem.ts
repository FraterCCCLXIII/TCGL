import type { GameEvent } from "@tcgl/core";

/**
 * Replaces or prevents pending events before they apply. Kept outside triggers.
 */
export class ReplacementSystem {
  apply(_ev: GameEvent): GameEvent {
    return _ev;
  }
}
