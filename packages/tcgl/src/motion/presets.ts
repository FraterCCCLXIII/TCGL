import type { CardMotionFlip } from "./cardMotionTypes";
import { easeInOutCubic, easeOutQuad } from "./easing";

/** Tunings you can spread onto `useCardMotion` / `CardMotion` props. */
export const CARD_MOTION_PRESETS = {
  deckToHand: {
    arcLiftMax: 0.28,
    durationMs: 560,
    easing: easeInOutCubic,
  },
  /** Face-down battlefield discard toward grave pile — subtle arc, quicker settle. */
  toDiscard: {
    arcLiftMax: 0.18,
    durationMs: 420,
    easing: easeOutQuad,
  },
  /** Quick slide between table zones without much swing. */
  zoneToZone: {
    arcLiftMax: 0.08,
    durationMs: 380,
    easing: easeInOutCubic,
  },
} as const;

/** Flip crossing tuned for deals from concealed deck → reveal in hand. */
export function flipDeal(faceUpEnd: boolean): CardMotionFlip {
  return {
    mode: "threshold",
    faceUpStart: false,
    faceUpEnd,
    at: 0.58,
  };
}

/**
 * Same as {@link flipDeal} but crosses early so the face reveals near the deck before most of the
 * travel into hand (threshold is in **eased** progress `u ∈ [0,1]`).
 */
export function flipDealRevealFirst(faceUpEnd: boolean): CardMotionFlip {
  return {
    mode: "threshold",
    faceUpStart: false,
    faceUpEnd,
    at: 0.07,
  };
}

/** Flip crossing tuned for sending to discard while hiding face mid-flight (adjust `at`). */
export function flipToDiscard(faceUpEnd: boolean): CardMotionFlip {
  return {
    mode: "threshold",
    faceUpStart: true,
    faceUpEnd,
    at: 0.72,
  };
}
