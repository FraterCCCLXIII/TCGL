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

/** Wrapper scales for CardMotion while child Card keeps constant `innerUniform`. */
export function motionWrapperScaledPair(
  fromSampled: CardSpatialPose,
  toPose: CardSpatialPose,
  innerUniform: number
): { from: CardSpatialPose; to: CardSpatialPose } {
  const sf = fromSampled.scale ?? 1;
  const destUniform = toPose.scale ?? innerUniform;
  return {
    from: {
      ...fromSampled,
      scale: sf / innerUniform,
    },
    to: {
      ...toPose,
      scale: destUniform / innerUniform,
    },
  };
}
