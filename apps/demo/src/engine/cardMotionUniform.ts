import type { GameState } from "@tcgl/core";
import type { CardSpatialPose } from "tcgl";
import {
  demoCardScaleById,
  VIEWPORT_HAND_SCALE_NEAR,
  VIEWPORT_HAND_SCALE_OPPONENT,
} from "../DemoCard3d";

/** Matches resting viewport HUD card uniform (`DemoCard3dTable`). */
export function viewportHandInnerUniform(
  cardId: string,
  state: GameState,
  playerId: "p1" | "p2"
): number {
  const base = demoCardScaleById(cardId, state);
  const mul =
    playerId === "p2" ? VIEWPORT_HAND_SCALE_OPPONENT : VIEWPORT_HAND_SCALE_NEAR;
  return base * mul;
}

/** Matches resting table strip / deck card uniform (no viewport multiplier). */
export function tableCardInnerUniform(cardId: string, state: GameState): number {
  return demoCardScaleById(cardId, state);
}

/**
 * Flight endpoints when the animated object is the **real card root** under an attach shell (no
 * CardMotion wrapper). Interpolate **absolute** uniform scale — crossing HUD vs table regimes cannot
 * share one “inner uniform” divisor (that split only applies to CardMotion).
 */
export function attachedFlightPoseEndpoints(
  fromSampled: CardSpatialPose,
  toPose: CardSpatialPose
): { from: CardSpatialPose; to: CardSpatialPose } {
  return {
    from: {
      ...fromSampled,
      scale: fromSampled.scale ?? 1,
    },
    to: {
      ...toPose,
      scale: toPose.scale ?? 1,
    },
  };
}
