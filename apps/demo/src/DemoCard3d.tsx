import type { ThreeEvent } from "@react-three/fiber";
import { Card } from "tcgl";
import type { GameState } from "@tcgl/core";
import { definitionIdToFaceN, DRAG_CARD_ID } from "./engine/zoneView";

const BASE = "/cards";
const face = (n: number) => `${BASE}/face-${n}.png`;
const BACK = `${BASE}/back.png`;

function cardScaleById(id: string): number {
  if (id.startsWith("c-deck-")) {
    return 1;
  }
  switch (id) {
    case "c-hand-1":
    case "c-hand-2":
    case "c-hand-3":
    case "c-hand-4":
      return 1.05;
    case "c-bf-1":
    case DRAG_CARD_ID:
      return 1.08;
    case "c-gy-1":
    case "c-gy-2":
    case "c-gy-3":
    case "c-stack-1":
    case "c-stack-2":
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
  position: positionP,
}: DemoCard3dTableProps) {
  const c = state.cards[id];
  const fn = definitionIdToFaceN(c?.definitionId ?? "face-1");
  const isDeck = id.startsWith("c-deck-");
  const isHand4 = id === "c-hand-4";
  const isHand3 = id === "c-hand-3";
  const isDrag = id === DRAG_CARD_ID;
  return (
    <Card
      ref={setCardGroupRef(id) as never}
      id={id}
      position={positionP}
      face={face(fn)}
      back={BACK}
      cardScale={cardScaleById(id)}
      faceUp={isDeck ? false : isFaceUp(id)}
      selected={selectedId === id}
      visible={inPlay(id)}
      disabled={isDeck || isHand4}
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
      onCardDoubleClick={isHand4 || isDeck ? undefined : () => onToggleFace(id)}
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
  const isDeck = id.startsWith("c-deck-");
  const isHand4 = id === "c-hand-4";
  const isHand3 = id === "c-hand-3";
  const isDrag = id === DRAG_CARD_ID;

  if (isDeck) {
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
      cardScale={cardScaleById(id)}
      faceUp={isFaceUp(id)}
      onCardDoubleClick={() => onToggleFace(id)}
    />
  );
}
