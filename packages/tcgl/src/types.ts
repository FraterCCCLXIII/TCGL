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

export type CardInteractionEvents = {
  onCardHover: (cardId: string) => void;
  onCardDragStart: (cardId: string) => void;
  onCardDrag: (cardId: string, position: Vec3) => void;
  onCardDrop: (cardId: string, zoneId: string) => void;
  onCardFlip: (cardId: string) => void;
  onCardTap: (cardId: string) => void;
  onCardSelect: (cardId: string) => void;
};

export const noopCardEvents: CardInteractionEvents = {
  onCardHover: () => undefined,
  onCardDragStart: () => undefined,
  onCardDrag: () => undefined,
  onCardDrop: () => undefined,
  onCardFlip: () => undefined,
  onCardTap: () => undefined,
  onCardSelect: () => undefined,
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
