import type { ThreeElements } from "@react-three/fiber";

/**
 * Data TCGL can render. No game rules — your engine maps state to this shape.
 * Visual fields describe *how* a card looks, not *why* it is there.
 */
export type CardView = {
  id: string;
  face: string;
  back?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  faceUp?: boolean;
  selected?: boolean;
  draggable?: boolean;
  /** MTG-style: in-plane 90°. Presentation only. */
  tapped?: boolean;
  /**
   * Muted / “ghost” opacity (~42%) while staying fully interactive (unlike {@link disabled}).
   */
  ghosted?: boolean;
  /** e.g. valid target — outline styling. */
  highlighted?: boolean;
  /** Faded, non-interactive. */
  disabled?: boolean;
  /** Ghost / overlay state while dragging (host may hide source). */
  dragging?: boolean;
  /** Hooks for future enter/exit/resolve motion. */
  animationState?: "idle" | "entering" | "exiting" | "resolving";
};

export type Vec3 = [number, number, number];

/** Native pointer / mouse flags for {@link CardInteractionEvents.onCardTap} (left button = 0). */
export type CardPointerClickDetail = {
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
};

/** Viewport coordinates for a host-rendered card context menu (right-click or Ctrl/Cmd+click). */
export type CardContextMenuPoint = {
  clientX: number;
  clientY: number;
};

export type CardInteractionEvents = {
  onCardHover: (cardId: string) => void;
  onCardDragStart: (cardId: string) => void;
  onCardDrag: (cardId: string, position: Vec3) => void;
  onCardDrop: (cardId: string, zoneId: string) => void;
  onCardFlip: (cardId: string) => void;
  /**
   * Primary action (usually left click). Host can branch on {@link CardPointerClickDetail} for
   * shift/alt/meta/ctrl shortcuts vs a plain tap.
   */
  onCardTap: (cardId: string, detail: CardPointerClickDetail) => void;
  onCardSelect: (cardId: string) => void;
  /**
   * Secondary / context open: native right-click or Ctrl/Cmd+primary on the card hitbox.
   * Host should call `preventDefault` on the triggering event when showing UI (see {@link Card}).
   */
  onCardContextMenu: (cardId: string, point: CardContextMenuPoint) => void;
};

export const noopCardEvents: CardInteractionEvents = {
  onCardHover: () => undefined,
  onCardDragStart: () => undefined,
  onCardDrag: () => undefined,
  onCardDrop: () => undefined,
  onCardFlip: () => undefined,
  onCardTap: (_cardId, _detail) => undefined,
  onCardSelect: () => undefined,
  onCardContextMenu: () => undefined,
};

/**
 * How cards are arranged in a region (layout, not rules).
 */
export type LayoutKind =
  | "free"
  | "fan"
  | "grid"
  | "stack"
  | "pile"
  | "row"
  | "lane";

/**
 * Table region *kind* for UX, debugging, and future drop affordances. TCGL does not enforce game meaning.
 */
export type ZoneKind =
  | "deck"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "exile"
  | "stack"
  | "sideboard"
  | "custom";

export type TCGLContextValue = {
  events: CardInteractionEvents;
  cardWidth?: number;
  /** WebGL shadow maps and object shadow casting/receiving (from `TCGLCanvas` / `TCGLProvider`). */
  shadows: boolean;
};

export type R3FGroupProps = ThreeElements["group"];

export type PlaymatSide = "near" | "far";
