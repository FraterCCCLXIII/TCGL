import type { CardMotionFlip } from "./cardMotionTypes";

/** Resolve {@link Card.faceUp} from eased motion progress `u ∈ [0,1]`. */
export function resolveFaceUpAtProgress(
  flip: CardMotionFlip | undefined,
  u: number
): boolean {
  if (!flip) {
    return true;
  }
  if (flip.mode === "none") {
    return flip.faceUp;
  }
  const { faceUpStart, faceUpEnd, at } = flip;
  return u < at ? faceUpStart : faceUpEnd;
}
