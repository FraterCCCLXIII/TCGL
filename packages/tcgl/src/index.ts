// Mental model: Cards + zones + layouts + interactions — not game rules.
export * from "./types";
export {
  DEFAULT_CARD_H,
  DEFAULT_CARD_TABLE_CLEARANCE_Y,
  DEFAULT_CARD_W,
  SCREEN_OVERLAY_GHOST_PICK_Z_NUDGE,
} from "./constants/dimensions";
export { createRoundedCardAlphaMap } from "./utils/roundedCardAlphaMap";
export {
  applyCardLayFlatGroupHudPitch,
  applyCardLayFlatGroupTablePitch,
  convertCardFaceMaterialsHudToTable,
  convertCardFaceMaterialsTableToHud,
  resetCardPointerTiltGroup,
  resetCardTableToHudLayoutOffsets,
  setCardFaceShadowFade,
  setCardFlipRigY,
  setCardPointerTiltFromUv,
  setScreenOverlayCardLiftZ,
} from "./utils/cardPresentationBridge";
export {
  createCardFaceShadowDepthMaterial,
  TCGL_SHADOW_FADE_UNIFORM,
} from "./materials/cardFaceShadowDepthMaterial";
export { TCGLProvider, useTCGL, useTCGLEvents } from "./context/TCGLContext";
export { TCGLCanvas, type TCGLCanvasProps } from "./components/TCGLCanvas";
export { Playmat, type PlaymatGridConfig, type PlaymatProps } from "./components/Playmat";
export { Card, type CardProps } from "./components/Card";
export {
  CardVfx,
  type CardVfxProps,
  TABLE_CARD_FACE_ALIGN,
} from "./components/CardVfx";
export { CardBack, type CardBackProps } from "./components/CardBack";
export { CardFan, type CardFanProps } from "./components/CardFan";
export {
  ReorderableCardFan,
  type ReorderableCardFanProps,
  type HandReorderDetail,
  type HandDragTowardTableDetail,
} from "./components/ReorderableCardFan";
export { CardStack, type CardStackProps } from "./components/CardStack";
export { CardPile, type CardPileProps } from "./components/CardPile";
export { CardGrid, type CardGridProps } from "./components/CardGrid";
export { CameraRig, type CameraRigProps } from "./components/CameraRig";
export { LightingRig, type LightingRigProps } from "./components/LightingRig";
export { PlayerArea, type PlayerAreaProps } from "./components/PlayerArea";
export { Zone, type ZoneProps } from "./components/Zone";
export {
  BattlefieldZone,
  DeckZone,
  ExileZone,
  GraveyardZone,
  HandZone,
  SideboardZone,
  StackZone,
} from "./components/zones/presets";
export { DragLayer, type DragLayerProps } from "./components/interaction/DragLayer";
export {
  DropZoneOverlay,
  type DropZoneOverlayProps,
} from "./components/interaction/DropZoneOverlay";
export { TargetingArrow, type TargetingArrowProps } from "./components/interaction/TargetingArrow";
export {
  SelectionOutline,
  type SelectionOutlineProps,
} from "./components/interaction/SelectionOutline";
export { cardFanLayout, type FanOptions, type FanStyle } from "./layout/fanLayout";
export { cardStackIndex, cardPileIndex, cardGridIndex } from "./layout/stackLayout";
export {
  CARD_VFX_KINDS,
  cardVfxPresets,
  cardVfxLifeAlpha,
  seedCardVfxBurst,
  type CardVfxKind,
} from "./vfx/cardVfxPresets";
export * from "./motion";
export { CardMotion, type CardMotionProps } from "./components/CardMotion";
