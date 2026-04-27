export type { CardSpatialPose, CardMotionFlip } from "./cardMotionTypes";
export { easeInOutCubic, easeOutQuad } from "./easing";
export {
  interpolateCardPose,
} from "./interpolateCardPose";
export { resolveFaceUpAtProgress } from "./resolveFaceUp";
export {
  useCardMotion,
  type UseCardMotionOptions,
  type UseCardMotionResult,
} from "./useCardMotion";
export {
  CARD_MOTION_PRESETS,
  flipDeal,
  flipDealRevealFirst,
  flipToDiscard,
} from "./presets";
