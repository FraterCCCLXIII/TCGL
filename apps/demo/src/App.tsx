import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Quaternion, type Group, Vector3 } from "three";
import { ReadCardFlight, type ReadSnapshot } from "./ReadCardFlight";
import {
  BattlefieldZone,
  CameraRig,
  Card,
  CardFan,
  CardPile,
  CardStack,
  DeckZone,
  DropZoneOverlay,
  GraveyardZone,
  HandZone,
  LightingRig,
  type CardInteractionEvents,
  Playmat,
  PlayerArea,
  StackZone,
  TCGLCanvas,
} from "tcgl";
import { TablePlaneDrag } from "./TablePlaneDrag";

const BASE = "/cards";
const face = (n: number) => `${BASE}/face-${n}.png`;
const BACK = `${BASE}/back.png`;

const DRAG_CARD_ID = "c-bf-2";

/**
 * World pose for read-mode: billboard + uniform scale. Center Y is high enough that the full
 * portrait (DEFAULT_CARD_H × max card scale × this scale) stays above the frustum bottom.
 */
const READ_BILLBOARD = {
  position: [0, 0.96, 1.9] as [number, number, number],
  scale: 1.1,
} as const;

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

type Log = { t: string; m: string };

export function App() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [dropOn, setDropOn] = useState(false);
  const [oneTapped, setOneTapped] = useState(false);
  const [oneHighlight, setOneHighlight] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [bf2Pos, setBf2Pos] = useState<[number, number, number]>([0.55, 0, 0]);
  const [faceUpById, setFaceUpById] = useState<Record<string, boolean>>({});
  /** Selected card is moved to a front “reading” pose (see <kbd>S</kbd> / Esc). */
  const [readMode, setReadMode] = useState(false);
  /** When true, the flying read card is animating back to its table transform. */
  const [readExiting, setReadExiting] = useState(false);
  /** Set in useLayout once per read session from the on-table `Card` ref (world decompose). */
  const [readSnapshot, setReadSnapshot] = useState<ReadSnapshot | null>(null);
  const [readFlightKey, setReadFlightKey] = useState(0);
  const battlefieldGroupRef = useRef<Group>(null);
  const cardGroupById = useRef(new Map<string, Group>());
  const readCaptureGate = useRef(false);
  const setCardGroupRef = useCallback((id: string) => (node: Group | null) => {
    if (node) {
      cardGroupById.current.set(id, node);
    } else {
      cardGroupById.current.delete(id);
    }
  }, []);

  const isFaceUp = useCallback(
    (id: string) => (id in faceUpById ? faceUpById[id]! : true),
    [faceUpById]
  );

  const toggleFace = useCallback((id: string) => {
    setFaceUpById((prev) => ({
      ...prev,
      [id]: !(id in prev ? prev[id]! : true),
    }));
  }, []);

  const flipSelected = useCallback(() => {
    if (!selectedId) {
      return;
    }
    toggleFace(selectedId);
  }, [selectedId, toggleFace]);

  const push = useCallback((m: string) => {
    setLogs((prev) =>
      [{ t: new Date().toLocaleTimeString(), m }, ...prev].slice(0, 12)
    );
  }, []);

  const inPlay = useCallback(
    (id: string) => !readMode || selectedId !== id,
    [readMode, selectedId]
  );

  const showReadCard = useCallback(() => {
    if (!selectedId) {
      push("show: select a card first");
      return;
    }
    if (readMode) {
      setReadExiting(true);
      push("read: exiting");
    } else {
      setReadExiting(false);
      setReadMode(true);
      push("read: on");
    }
  }, [readMode, selectedId, push]);

  const onReadReturnComplete = useCallback(() => {
    setReadExiting(false);
    setReadMode(false);
    setReadSnapshot(null);
    readCaptureGate.current = false;
  }, []);

  useLayoutEffect(() => {
    if (!readMode || !selectedId || readExiting) {
      if (!readMode) {
        readCaptureGate.current = false;
      }
      return;
    }
    if (readCaptureGate.current) {
      return;
    }
    const id = selectedId;
    const raf = requestAnimationFrame(() => {
      const g = cardGroupById.current.get(id);
      if (!g) {
        return;
      }
      g.updateMatrixWorld(true);
      const p = new Vector3();
      const q = new Quaternion();
      const s = new Vector3();
      g.matrixWorld.decompose(p, q, s);
      setReadSnapshot({
        id,
        pos: [p.x, p.y, p.z],
        quat: [q.x, q.y, q.z, q.w],
        scaleU: (s.x + s.y + s.z) / 3,
      });
      readCaptureGate.current = true;
      setReadFlightKey((k) => k + 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [readExiting, readMode, selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "h" || e.key === "H") {
        setOneHighlight((h) => !h);
      }
      if (e.key === "t" || e.key === "T") {
        setOneTapped((t) => !t);
      }
      if (e.key === "d" || e.key === "D") {
        setDropOn((d) => !d);
      }
      if (e.key === "f" || e.key === "F") {
        flipSelected();
      }
      if (e.key === "s" || e.key === "S") {
        showReadCard();
      }
      if (e.key === "Escape" && readMode) {
        setReadExiting(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipSelected, readMode, showReadCard]);

  const events: CardInteractionEvents = useMemo(
    () => ({
      onCardHover: (id) => push(`hover ${id}`),
      onCardDragStart: (id) => push(`drag start ${id}`),
      onCardDrag: (id, p) =>
        push(`drag ${id} [${p.map((n) => n.toFixed(2)).join(", ")}]`),
      onCardDrop: (id, z) => push(`drop ${id} → ${z}`),
      onCardFlip: (id) => push(`flip done ${id}`),
      onCardTap: (id) => push(`tap ${id}`),
      onCardSelect: (id) => {
        setSelectedId(id);
        push(`select ${id}`);
      },
    }),
    [push]
  );

  const onDragBf2 = useCallback(
    (p: [number, number, number]) => {
      setBf2Pos(p);
      events.onCardDrag(DRAG_CARD_ID, p);
    },
    [events]
  );

  const onDragEnd = useCallback(() => {
    setDragId(null);
    events.onCardDrop(DRAG_CARD_ID, "battlefield");
  }, [events]);

  /** 3D read duplicate (moved in world by `ReadCardFlight`) — not `screenOverlay`. */
  const renderReadCard3d = useCallback(
    (id: string): ReactNode => {
      const p: [number, number, number] = [0, 0, 0];
      const b = { position: p, back: BACK, selected: true, renderOrder: 10 };
      switch (id) {
        case "c-hand-1":
          return (
            <Card
              id="c-hand-1"
              {...b}
              face={face(1)}
              cardScale={1.05}
              faceUp={isFaceUp("c-hand-1")}
              onCardDoubleClick={() => toggleFace("c-hand-1")}
            />
          );
        case "c-hand-2":
          return (
            <Card
              id="c-hand-2"
              {...b}
              face={face(2)}
              cardScale={1.05}
              faceUp={isFaceUp("c-hand-2")}
              highlighted={oneHighlight}
              onCardDoubleClick={() => toggleFace("c-hand-2")}
            />
          );
        case "c-hand-3":
          return (
            <Card
              id="c-hand-3"
              {...b}
              face={face(2)}
              cardScale={1.05}
              faceUp={isFaceUp("c-hand-3")}
              tapped={oneTapped}
              onCardDoubleClick={() => toggleFace("c-hand-3")}
            />
          );
        case "c-hand-4":
          return (
            <Card
              id="c-hand-4"
              {...b}
              face={face(1)}
              cardScale={1.05}
              faceUp={isFaceUp("c-hand-4")}
              disabled
            />
          );
        case "c-bf-1":
          return (
            <Card
              id="c-bf-1"
              {...b}
              face={face(1)}
              cardScale={1.08}
              faceUp={isFaceUp("c-bf-1")}
              onCardDoubleClick={() => toggleFace("c-bf-1")}
            />
          );
        case DRAG_CARD_ID:
          return (
            <Card
              id={DRAG_CARD_ID}
              {...b}
              face={face(2)}
              cardScale={1.08}
              faceUp={isFaceUp(DRAG_CARD_ID)}
              onCardPointerDown={() => {
                setDragId(DRAG_CARD_ID);
                events.onCardDragStart(DRAG_CARD_ID);
              }}
              onCardPointerUp={() => {}}
              onCardDoubleClick={() => toggleFace(DRAG_CARD_ID)}
            />
          );
        case "c-gy-1":
          return <Card id="c-gy-1" {...b} face={face(2)} cardScale={1} faceUp={isFaceUp("c-gy-1")} />;
        case "c-gy-2":
          return <Card id="c-gy-2" {...b} face={face(1)} cardScale={1} faceUp={isFaceUp("c-gy-2")} />;
        case "c-gy-3":
          return <Card id="c-gy-3" {...b} face={face(2)} cardScale={1} faceUp={isFaceUp("c-gy-3")} />;
        case "c-stack-1":
          return <Card id="c-stack-1" {...b} face={face(1)} cardScale={1} faceUp={isFaceUp("c-stack-1")} />;
        case "c-stack-2":
          return <Card id="c-stack-2" {...b} face={face(2)} cardScale={1} faceUp={isFaceUp("c-stack-2")} />;
        default: {
          if (id.startsWith("c-deck-")) {
            return <Card id={id} {...b} face={face(1)} cardScale={1} faceUp={false} />;
          }
          return null;
        }
      }
    },
    [DRAG_CARD_ID, isFaceUp, oneHighlight, oneTapped, toggleFace, events]
  );

  return (
    <>
      <TCGLCanvas events={events} style={{ height: "100vh" }}>
        <CameraRig position={[0, 6.4, 7.2]} fov={40} />
        <LightingRig />

        <Playmat
          size={[16, 14]}
          y={0}
          splitSides={{ near: "#55555d", far: "#65656d" }}
          showCenterSeam
        >
          <Suspense fallback={null}>
            <PlayerArea side="near" position={[0, 0, 2.3]}>
              <HandZone id="p1-hand" position={[-0.2, 0, 1.1]}>
                <CardFan radius={1.2} style="ecard" zBowl={0.004} maxRollZ={0.05}>
                  <Card
                    ref={setCardGroupRef("c-hand-1")}
                    id="c-hand-1"
                    face={face(1)}
                    back={BACK}
                    cardScale={1.05}
                    faceUp={isFaceUp("c-hand-1")}
                    selected={selectedId === "c-hand-1"}
                    visible={inPlay("c-hand-1")}
                    onCardDoubleClick={() => toggleFace("c-hand-1")}
                  />
                  <Card
                    ref={setCardGroupRef("c-hand-2")}
                    id="c-hand-2"
                    face={face(2)}
                    back={BACK}
                    cardScale={1.05}
                    faceUp={isFaceUp("c-hand-2")}
                    selected={selectedId === "c-hand-2"}
                    highlighted={oneHighlight}
                    visible={inPlay("c-hand-2")}
                    onCardDoubleClick={() => toggleFace("c-hand-2")}
                  />
                  <Card
                    ref={setCardGroupRef("c-hand-3")}
                    id="c-hand-3"
                    face={face(2)}
                    back={BACK}
                    cardScale={1.05}
                    faceUp={isFaceUp("c-hand-3")}
                    selected={selectedId === "c-hand-3"}
                    tapped={oneTapped}
                    visible={inPlay("c-hand-3")}
                    onCardDoubleClick={() => toggleFace("c-hand-3")}
                  />
                  <Card
                    ref={setCardGroupRef("c-hand-4")}
                    id="c-hand-4"
                    face={face(1)}
                    back={BACK}
                    cardScale={1.05}
                    faceUp={isFaceUp("c-hand-4")}
                    selected={selectedId === "c-hand-4"}
                    disabled
                    visible={inPlay("c-hand-4")}
                  />
                </CardFan>
              </HandZone>

              <DeckZone id="p1-deck" position={[-4.2, 0, 0.2]}>
                <CardStack yStep={0.025}>
                  {Array.from({ length: 5 }, (_, i) => {
                    const did = `c-deck-${i}` as const;
                    return (
                      <Card
                        key={i}
                        ref={setCardGroupRef(did)}
                        id={did}
                        face={face(1)}
                        back={BACK}
                        faceUp={false}
                        selected={selectedId === did}
                        visible={inPlay(did)}
                      />
                    );
                  })}
                </CardStack>
              </DeckZone>

              <GraveyardZone id="p1-grave" position={[3.2, 0, 0.1]}>
                <CardPile>
                  <Card
                    ref={setCardGroupRef("c-gy-1")}
                    id="c-gy-1"
                    face={face(2)}
                    back={BACK}
                    faceUp
                    selected={selectedId === "c-gy-1"}
                    visible={inPlay("c-gy-1")}
                  />
                  <Card
                    ref={setCardGroupRef("c-gy-2")}
                    id="c-gy-2"
                    face={face(1)}
                    back={BACK}
                    faceUp
                    selected={selectedId === "c-gy-2"}
                    visible={inPlay("c-gy-2")}
                  />
                  <Card
                    ref={setCardGroupRef("c-gy-3")}
                    id="c-gy-3"
                    face={face(2)}
                    back={BACK}
                    faceUp
                    selected={selectedId === "c-gy-3"}
                    visible={inPlay("c-gy-3")}
                  />
                </CardPile>
              </GraveyardZone>
            </PlayerArea>

            <BattlefieldZone id="battlefield" position={[0, 0, -0.5]}>
              <group ref={battlefieldGroupRef}>
                <Card
                  ref={setCardGroupRef("c-bf-1")}
                  id="c-bf-1"
                  position={[-0.55, 0, 0]}
                  face={face(1)}
                  back={BACK}
                  cardScale={1.08}
                  faceUp={isFaceUp("c-bf-1")}
                  selected={selectedId === "c-bf-1"}
                  visible={inPlay("c-bf-1")}
                  onCardDoubleClick={() => toggleFace("c-bf-1")}
                />
                <Card
                  ref={setCardGroupRef(DRAG_CARD_ID)}
                  id={DRAG_CARD_ID}
                  position={bf2Pos}
                  face={face(2)}
                  back={BACK}
                  cardScale={1.08}
                  faceUp={isFaceUp(DRAG_CARD_ID)}
                  selected={selectedId === DRAG_CARD_ID}
                  visible={inPlay(DRAG_CARD_ID)}
                  onCardPointerDown={() => {
                    setDragId(DRAG_CARD_ID);
                    events.onCardDragStart(DRAG_CARD_ID);
                  }}
                  onCardPointerUp={() => {
                    /* end handled by window pointerup in TablePlaneDrag */
                  }}
                  onCardDoubleClick={() => toggleFace(DRAG_CARD_ID)}
                />
              </group>
              <TablePlaneDrag
                active={dragId === DRAG_CARD_ID}
                planeY={0.08}
                parentRef={battlefieldGroupRef}
                onDrag={onDragBf2}
                onEnd={onDragEnd}
              />
            </BattlefieldZone>

            <StackZone id="stack" position={[-0.2, 0, -1.2]}>
              <CardStack yStep={0.03}>
                <Card
                  ref={setCardGroupRef("c-stack-1")}
                  id="c-stack-1"
                  face={face(1)}
                  back={BACK}
                  faceUp
                  selected={selectedId === "c-stack-1"}
                  visible={inPlay("c-stack-1")}
                />
                <Card
                  ref={setCardGroupRef("c-stack-2")}
                  id="c-stack-2"
                  face={face(2)}
                  back={BACK}
                  faceUp
                  selected={selectedId === "c-stack-2"}
                  visible={inPlay("c-stack-2")}
                />
              </CardStack>
            </StackZone>

            {readMode && readSnapshot && selectedId && readSnapshot.id === selectedId ? (
              <ReadCardFlight
                key={readFlightKey}
                snapshot={readSnapshot}
                toPos={READ_BILLBOARD.position}
                toScaleU={READ_BILLBOARD.scale * cardScaleById(selectedId)}
                leaving={readExiting}
                onReturnComplete={onReadReturnComplete}
              >
                {renderReadCard3d(selectedId)}
              </ReadCardFlight>
            ) : null}

            <DropZoneOverlay
              active={dropOn}
              position={[-0.1, 0, -0.1]}
              size={[3, 1.2]}
              color="#22c55e"
            />
          </Suspense>
        </Playmat>
      </TCGLCanvas>

      <div className="hud">
        <p>
          <strong>TCGL v0</strong> — presentation + interaction. Hover, tilt, click/double-click,
          drag on the battlefield sample, <kbd>F</kbd> flips the selected card.
        </p>
        <p>
          <kbd>H</kbd> outline · <kbd>T</kbd> tap · <kbd>D</kbd> drop overlay · <kbd>F</kbd> flip
          selected · <kbd>S</kbd> read · <kbd>Esc</kbd> exit read · double-click to flip
        </p>
        <p style={{ opacity: 0.85 }}>
          <kbd>S</kbd> / <kbd>Esc</kbd> — with a card selected, <kbd>S</kbd> moves that 3D card in world
          space to a front read pose; press <kbd>S</kbd> again or <kbd>Esc</kbd> to send it back to the
          table.
        </p>
        {logs.length === 0 ? (
          <p style={{ opacity: 0.7 }}>Events will appear here…</p>
        ) : (
          logs.map((l, i) => (
            <p key={`${l.t}-${i}`}>
              {l.t} — {l.m}
            </p>
          ))
        )}
      </div>
    </>
  );
}
