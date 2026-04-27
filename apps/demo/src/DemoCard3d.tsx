import type { ThreeEvent } from "@react-three/fiber";
import { Card } from "tcgl";
import type { GameState } from "@tcgl/core";
import { demoZones } from "./engine/seedDemoGame";
import { definitionIdToFaceN, DRAG_CARD_ID } from "./engine/zoneView";

const BASE = "/cards";
const face = (n: number) => `${BASE}/face-${n}.png`;
const BACK = `${BASE}/back.png`;

/** Face-down pile — card id still listed in either deck zone (both players). */
function isCardOnDeckStack(state: GameState, id: string): boolean {
  return (
    (state.zoneContents[demoZones.deck]?.includes(id) ?? false) ||
    (state.zoneContents[demoZones.p2Deck]?.includes(id) ?? false)
  );
}

function cardScaleById(id: string, state?: GameState): number {
  if (id.startsWith("c-deck-") || id.startsWith("c-p2-deck-")) {
    if (state != null) {
      return isCardOnDeckStack(state, id) ? 1 : 1.05;
    }
    return 1;
  }
  if (id.startsWith("c-p2-hand-")) {
    return 1.05;
  }
  switch (id) {
    case "c-hand-1":
    case "c-hand-2":
    case "c-hand-3":
    case "c-hand-4":
      return 1.05;
    case "c-gy-1":
    case "c-gy-2":
    case "c-gy-3":
      return 1;
    default:
      return 1;
  }
}

export { cardScaleById as demoCardScaleById, face, BACK };

type DemoCard3dTableProps = {
  id: string;
  state: GameState;
  setCardGroupRef: (id: string) => (n: import("three").Group | null) => void;
  isFaceUp: (id: string) => boolean;
  selectedId: string | null;
  inPlay: (id: string) => boolean;
  onToggleFace: (id: string) => void;
  oneHighlight: boolean;
  oneTapped: boolean;
  /** Full local `position` on the `Card` (e.g. battlefield); hand/stack omit and stay default. */
  position?: [number, number, number];
  onDragPointer?: {
    onPointerDown: () => void;
    onPointerUp: () => void;
  };
  /** Merged with internal handlers (e.g. hand reorder). */
  onCardPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  /** When set, replaces default double-click (usually flip). */
  onCardDoubleClick?: () => void;
  /** Disable picking on overlays (ghost / motion); stays visually opaque via `opaqueWhenDisabled`. */
  pickDisabled?: boolean;
  /**
   * Deck→hand flight overlay: engine still lists this id in the deck until `moveCard` completes,
   * but we render face-up like a drawn card (see {@link isIdInDeckZone}).
   */
  deckDrawFlight?: boolean;
  /**
   * From {@link CardMotion} render prop (`m.faceUp`) — wires the deck flip timeline into {@link Card}'s
   * flip spring instead of inferring from zone/`isFaceUp` alone.
   */
  motionFaceUp?: boolean;
  /** Opponent hand / concealed pile — always render card backs (TCG-style hidden information). */
  hideCardFace?: boolean;
  /**
   * Extra π on outer {@link Card} Y so titles read upright when nested under far `PlayerArea`
   * (`rotation={[0, Math.PI, 0]}`).
   */
  opponentReadableOrientation?: boolean;
};

/**
 * Renders a table `Card` with face from `GameState.cards[id].definitionId`.
 */
export function DemoCard3dTable({
  id,
  state,
  setCardGroupRef,
  isFaceUp,
  selectedId,
  inPlay,
  onToggleFace,
  oneHighlight,
  oneTapped,
  onDragPointer,
  onCardPointerDown: onCardPointerDownProp,
  onCardDoubleClick: onCardDoubleClickProp,
  pickDisabled = false,
  deckDrawFlight = false,
  motionFaceUp,
  hideCardFace = false,
  opponentReadableOrientation = false,
  position: positionP,
}: DemoCard3dTableProps) {
  const c = state.cards[id];
  const fn = definitionIdToFaceN(c?.definitionId ?? "face-1");
  const onDeckStack =
    isCardOnDeckStack(state, id) && !deckDrawFlight;
  const isHand4 = id === "c-hand-4";
  const isHand3 = id === "c-hand-3";
  const isDrag = id === DRAG_CARD_ID;
  return (
    <Card
      ref={setCardGroupRef(id) as never}
      id={id}
      position={positionP}
      rotation={
        opponentReadableOrientation
          ? ([0, Math.PI, 0] as [number, number, number])
          : [0, 0, 0]
      }
      face={face(fn)}
      back={BACK}
      cardScale={cardScaleById(id, state)}
      faceUp={
        hideCardFace
          ? false
          : motionFaceUp !== undefined
            ? motionFaceUp
            : onDeckStack
              ? false
              : isFaceUp(id)
      }
      selected={selectedId === id}
      visible={inPlay(id)}
      disabled={pickDisabled || onDeckStack || isHand4}
      opaqueWhenDisabled={pickDisabled}
      highlighted={isHand3 ? oneHighlight : undefined}
      tapped={isHand3 ? oneTapped : undefined}
      onCardPointerDown={
        onCardPointerDownProp || (isDrag && onDragPointer)
          ? (e) => {
              onCardPointerDownProp?.(e);
              if (isDrag && onDragPointer) onDragPointer.onPointerDown();
            }
          : undefined
      }
      onCardPointerUp={isDrag && onDragPointer ? onDragPointer.onPointerUp : undefined}
      onCardDoubleClick={
        onCardDoubleClickProp != null
          ? () => onCardDoubleClickProp()
          : isHand4 || onDeckStack
            ? undefined
            : () => onToggleFace(id)
      }
    />
  );
}

type DemoReadProps = {
  id: string;
  state: GameState;
  isFaceUp: (id: string) => boolean;
  onToggleFace: (id: string) => void;
  oneHighlight: boolean;
  oneTapped: boolean;
  onDragForRead?: { onPointerDown: () => void; onPointerUp: () => void };
};

const readB = (position: [number, number, number]) => ({
  position,
  back: BACK,
  selected: true,
  renderOrder: 10,
});

/** Read-pose card for `ReadCardFlight`. */
export function DemoCard3dRead({
  id,
  state,
  isFaceUp,
  onToggleFace,
  oneHighlight,
  oneTapped,
  onDragForRead,
}: DemoReadProps) {
  const p: [number, number, number] = [0, 0, 0];
  const c = state.cards[id];
  const fn = definitionIdToFaceN(c?.definitionId ?? "face-1");
  const b = readB(p);
  const onDeckStack = isCardOnDeckStack(state, id);
  const isHand4 = id === "c-hand-4";
  const isHand3 = id === "c-hand-3";
  const isDrag = id === DRAG_CARD_ID;

  if (onDeckStack) {
    return <Card id={id} {...b} face={face(1)} cardScale={1} faceUp={false} />;
  }
  if (isHand3) {
    return (
      <Card
        id={id}
        {...b}
        face={face(fn)}
        cardScale={1.05}
        faceUp={isFaceUp(id)}
        highlighted={oneHighlight}
        tapped={oneTapped}
        onCardDoubleClick={() => onToggleFace(id)}
      />
    );
  }
  if (isHand4) {
    return (
      <Card
        id={id}
        {...b}
        face={face(fn)}
        cardScale={1.05}
        faceUp={isFaceUp(id)}
        disabled
        onCardDoubleClick={() => onToggleFace(id)}
      />
    );
  }
  if (isDrag && onDragForRead) {
    return (
      <Card
        id={id}
        {...b}
        face={face(fn)}
        cardScale={1.08}
        faceUp={isFaceUp(id)}
        onCardPointerDown={onDragForRead.onPointerDown}
        onCardPointerUp={onDragForRead.onPointerUp}
        onCardDoubleClick={() => onToggleFace(id)}
      />
    );
  }
  return (
    <Card
      id={id}
      {...b}
      face={face(fn)}
      cardScale={cardScaleById(id, state)}
      faceUp={isFaceUp(id)}
      onCardDoubleClick={() => onToggleFace(id)}
    />
  );
}
