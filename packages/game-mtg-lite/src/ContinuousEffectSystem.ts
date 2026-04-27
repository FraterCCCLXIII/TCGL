import type { GameState } from "@tcgl/core";

/**
 * Layer-ordered static/type/PT effects — simplify aggressively in your own game.
 */
export class ContinuousEffectSystem {
  recompute(_state: GameState): GameState {
    return _state;
  }
}
