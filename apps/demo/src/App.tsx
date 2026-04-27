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
  type CardVfxKind,
  ReorderableCardFan,
  CardPile,
  CardStack,
  CardVfx,
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
import {
  advanceStepAction,
  castToStackAction,
  endTurnAction,
  moveCardAction,
  passPriorityAction,
  reorderZoneCardsAction,
} from "@tcgl/core";
import { demoZones } from "./engine/seedDemoGame";
import { useDemoSession } from "./engine/useDemoSession";
import {
  allOnTableCardIds,
  getBattlefieldIds,
  getGraveyardIds,
  getHandIds,
  getStack3dIds,
  getBattlefieldLocalPosition,
  DRAG_CARD_ID,
} from "./engine/zoneView";
import {
  DemoCard3dTable,
  DemoCard3dRead,
  demoCardScaleById,
  face,
  BACK,
} from "./DemoCard3d";

/**
 * World pose for read-mode: billboard + uniform scale. Center Y is high enough that the full
 * portrait (DEFAULT_CARD_H × max card scale × this scale) stays above the frustum bottom.
 */
const READ_BILLBOARD = {
  position: [0, 0.96, 1.9] as [number, number, number],
  scale: 1.1,
} as const;

/** Default demo camera; `lookAt` is origin — distance scales dolly in/out. */
const BASE_CAMERA: [number, number, number] = [0, 6.4, 7.2];

type Log = { t: string; m: string };

export function App() {
  const engine = useDemoSession();
  const handIds = useMemo(() => getHandIds(engine.state), [engine.state]);
  const bfIds = useMemo(() => getBattlefieldIds(engine.state), [engine.state]);
  const gyIds = useMemo(() => getGraveyardIds(engine.state), [engine.state]);
  const stack3dIds = useMemo(() => getStack3dIds(engine.state), [engine.state]);

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
  const [shadowsOn, setShadowsOn] = useState(true);
  /** 1 = default framing; <1 closer (zoom in), >1 further (zoom out). */
  const [cameraDistance, setCameraDistance] = useState(1);
  const cameraPosition = useMemo(
    (): [number, number, number] => [
      BASE_CAMERA[0]! * cameraDistance,
      BASE_CAMERA[1]! * cameraDistance,
      BASE_CAMERA[2]! * cameraDistance,
    ],
    [cameraDistance]
  );
  /** Table plane tilt in degrees (applied to `Playmat` root). */
  const [tiltPitchDeg, setTiltPitchDeg] = useState(0);
  const [tiltYawDeg, setTiltYawDeg] = useState(0);
  const [tiltRollDeg, setTiltRollDeg] = useState(0);
  const [vfxKind, setVfxKind] = useState<CardVfxKind>("damage");
  const [vfxTrigger, setVfxTrigger] = useState(0);
  /**
   * 2D playmat image behind the WebGL view (not a 3D texture). With 3D table off, a transparent
   * clear + invisible `ShadowMaterial` floor still shows contact shadows.
   */
  const [playmatImageBehind, setPlaymatImageBehind] = useState(false);
  /** When false, hides the 3D table split planes, seam, and playmat contact-shadow (not card shadows). */
  const [showPlaymatSurface, setShowPlaymatSurface] = useState(true);
  const use2dPlaymatBackdrop = playmatImageBehind && !showPlaymatSurface;
  /** Top-face grid (only when 3D table surface is on). @default off */
  const [playmatGridOn, setPlaymatGridOn] = useState(false);
  /** Right-side control drawer; FAB toggles. */
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const tableTilt = useMemo(
    () =>
      [
        (tiltPitchDeg * Math.PI) / 180,
        (tiltYawDeg * Math.PI) / 180,
        (tiltRollDeg * Math.PI) / 180,
      ] as [number, number, number],
    [tiltPitchDeg, tiltYawDeg, tiltRollDeg]
  );
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

  const onHandOrderChange = useCallback(
    (detail: { fromIndex: number; toIndex: number }) => {
      if (detail.fromIndex === detail.toIndex) {
        return;
      }
      engine.dispatch(
        reorderZoneCardsAction(
          "p1",
          demoZones.hand,
          detail.fromIndex,
          detail.toIndex
        )
      );
    },
    [engine]
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

  useEffect(() => {
    const s = allOnTableCardIds(engine.state);
    for (let i = 0; i < 5; i++) {
      s.add(`c-deck-${i}`);
    }
    if (selectedId && !s.has(selectedId)) {
      setSelectedId(null);
    }
  }, [engine.state, selectedId]);

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
      if (e.key === "Escape") {
        if (readMode) {
          setReadExiting(true);
        } else if (settingsDrawerOpen) {
          setSettingsDrawerOpen(false);
        }
      }
      const vmap: CardVfxKind[] = [
        "damage",
        "heal",
        "buff",
        "debuff",
        "generic",
      ];
      const idx = "12345".indexOf(e.key);
      if (idx >= 0) {
        setVfxKind(vmap[idx]!);
        setVfxTrigger((k) => k + 1);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipSelected, readMode, showReadCard, settingsDrawerOpen]);

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
      return (
        <DemoCard3dRead
          id={id}
          state={engine.state}
          isFaceUp={isFaceUp}
          onToggleFace={toggleFace}
          oneHighlight={oneHighlight}
          oneTapped={oneTapped}
          onDragForRead={
            id === DRAG_CARD_ID
              ? {
                  onPointerDown: () => {
                    setDragId(DRAG_CARD_ID);
                    events.onCardDragStart(DRAG_CARD_ID);
                  },
                  onPointerUp: () => {
                    /* TablePlaneDrag ends via window; read mode rarely drags */
                  },
                }
              : undefined
          }
        />
      );
    },
    [DRAG_CARD_ID, engine.state, isFaceUp, oneHighlight, oneTapped, toggleFace, events]
  );

  return (
    <div
      className="demo-viewport"
      style={
        use2dPlaymatBackdrop
          ? {
              minHeight: "100vh",
              background: `#5a5a62 url("/arena-playmat.png") center / cover no-repeat`,
            }
          : { minHeight: "100vh" }
      }
    >
        <TCGLCanvas
          events={events}
          shadows={shadowsOn}
          style={{ height: "100vh" }}
          backgroundColor="#5a5a62"
          transparentBackground={use2dPlaymatBackdrop}
        >
        <CameraRig position={cameraPosition} fov={40} />
        <LightingRig />

        <Playmat
          size={[16, 14]}
          y={0}
          tilt={tableTilt}
          splitSides={{ near: "#55555d", far: "#65656d" }}
          showCenterSeam
          showSurface={showPlaymatSurface}
          shadowCatcher={use2dPlaymatBackdrop}
          playmatGrid={playmatGridOn && showPlaymatSurface}
        >
          <Suspense fallback={null}>
            <PlayerArea side="near" position={[0, 0, 2.3]}>
              <HandZone id="p1-hand" position={[-0.2, 0, 1.1]}>
                <ReorderableCardFan
                  cardIds={handIds}
                  onHandOrderChange={onHandOrderChange}
                  handZoneId={demoZones.hand}
                  renderCard={(hid) => (
                    <DemoCard3dTable
                      id={hid}
                      state={engine.state}
                      setCardGroupRef={setCardGroupRef}
                      isFaceUp={isFaceUp}
                      selectedId={selectedId}
                      inPlay={inPlay}
                      onToggleFace={toggleFace}
                      oneHighlight={oneHighlight}
                      oneTapped={oneTapped}
                    />
                  )}
                  radius={1.2}
                  style="ecard"
                  zBowl={0.004}
                  maxRollZ={0.05}
                />
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
                  {gyIds.map((gid) => (
                    <DemoCard3dTable
                      key={gid}
                      id={gid}
                      state={engine.state}
                      setCardGroupRef={setCardGroupRef}
                      isFaceUp={isFaceUp}
                      selectedId={selectedId}
                      inPlay={inPlay}
                      onToggleFace={toggleFace}
                      oneHighlight={oneHighlight}
                      oneTapped={oneTapped}
                    />
                  ))}
                </CardPile>
              </GraveyardZone>
            </PlayerArea>

            <BattlefieldZone id="battlefield" position={[0, 0, -0.5]}>
              <group ref={battlefieldGroupRef}>
                {bfIds.map((bid, bfi) => {
                  const pos = getBattlefieldLocalPosition(bid, bfIds, bf2Pos);
                  return (
                    <group key={bid} position={pos}>
                      <DemoCard3dTable
                        id={bid}
                        state={engine.state}
                        setCardGroupRef={setCardGroupRef}
                        isFaceUp={isFaceUp}
                        selectedId={selectedId}
                        inPlay={inPlay}
                        onToggleFace={toggleFace}
                        oneHighlight={oneHighlight}
                        oneTapped={oneTapped}
                        onDragPointer={
                          bid === DRAG_CARD_ID
                            ? {
                                onPointerDown: () => {
                                  setDragId(DRAG_CARD_ID);
                                  events.onCardDragStart(DRAG_CARD_ID);
                                },
                                onPointerUp: () => {
                                  /* end handled by window pointerup in TablePlaneDrag */
                                },
                              }
                            : undefined
                        }
                      />
                      {bfi === 0 && bfIds[0] != null ? (
                        <CardVfx
                          kind={vfxKind}
                          trigger={vfxTrigger}
                          scale={demoCardScaleById(bfIds[0])}
                          faceAlign
                        />
                      ) : null}
                    </group>
                  );
                })}
              </group>
              <TablePlaneDrag
                active={
                  dragId === DRAG_CARD_ID && bfIds.includes(DRAG_CARD_ID)
                }
                planeY={0.08}
                parentRef={battlefieldGroupRef}
                onDrag={onDragBf2}
                onEnd={onDragEnd}
              />
            </BattlefieldZone>

            <StackZone id="stack" position={[-0.2, 0, -1.2]}>
              <CardStack yStep={0.03}>
                {stack3dIds.map((sid) => (
                  <DemoCard3dTable
                    key={sid}
                    id={sid}
                    state={engine.state}
                    setCardGroupRef={setCardGroupRef}
                    isFaceUp={isFaceUp}
                    selectedId={selectedId}
                    inPlay={inPlay}
                    onToggleFace={toggleFace}
                    oneHighlight={oneHighlight}
                    oneTapped={oneTapped}
                  />
                ))}
              </CardStack>
            </StackZone>

            {readMode && readSnapshot && selectedId && readSnapshot.id === selectedId ? (
              <ReadCardFlight
                key={readFlightKey}
                snapshot={readSnapshot}
                toPos={READ_BILLBOARD.position}
                toScaleU={READ_BILLBOARD.scale * demoCardScaleById(selectedId)}
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

      <div className="demo-chrome">
        <button
          type="button"
          className="demo-drawer-fab"
          onClick={() => setSettingsDrawerOpen((o) => !o)}
          aria-expanded={settingsDrawerOpen}
          aria-controls="tcgl-settings-drawer"
          title={settingsDrawerOpen ? "Close settings" : "Open settings"}
        >
          {settingsDrawerOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="6" y1="12" x2="18" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          )}
          <span className="sr-only">Settings</span>
        </button>

        <aside
          id="tcgl-settings-drawer"
          className={settingsDrawerOpen ? "demo-side-drawer demo-side-drawer--open" : "demo-side-drawer"}
          role="complementary"
          aria-label="Demo settings"
          aria-hidden={!settingsDrawerOpen}
          {...(!settingsDrawerOpen ? { inert: true } : {})}
        >
          <header className="demo-side-drawer__header">
            <span className="demo-side-drawer__title">TCGL — controls</span>
            <button
              type="button"
              className="demo-side-drawer__close"
              onClick={() => setSettingsDrawerOpen(false)}
              aria-label="Close settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
        <div className="hud-scroll demo-side-drawer__scroll">
        <p
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 8,
            maxWidth: 420,
            opacity: 0.95,
          }}
        >
          <span style={{ fontWeight: 600 }}>View</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={playmatImageBehind}
              onChange={(e) => setPlaymatImageBehind(e.target.checked)}
            />
            <span>Playmat art (2D layer under the view — not 3D; shadows use an invisible floor)</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPlaymatSurface}
              onChange={(e) => setShowPlaymatSurface(e.target.checked)}
            />
            <span>Show 3D table (split + seam + playmat contact shadow)</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={playmatGridOn}
              onChange={(e) => setPlaymatGridOn(e.target.checked)}
              disabled={!showPlaymatSurface}
            />
            <span>Playmat grid</span>
          </label>
          {playmatImageBehind && showPlaymatSurface ? (
            <span style={{ opacity: 0.8, fontSize: 11 }}>
              Turn <strong>3D table</strong> off: WebGL is transparent and the playmat is only CSS;{" "}
              <strong>shadows</strong> still render in 3D on an invisible floor.
            </span>
          ) : null}
          {playmatImageBehind && !showPlaymatSurface ? (
            <span style={{ opacity: 0.75, fontSize: 11 }}>
              <code>public/arena-playmat.png</code> → <code>/arena-playmat.png</code> (checkered if
              missing)
            </span>
          ) : null}
        </p>
        <p>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={shadowsOn}
              onChange={(e) => setShadowsOn(e.target.checked)}
            />
            <span>Shadows (map + card cast/receive)</span>
          </label>
        </p>
        <p style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 360 }}>
          <span style={{ opacity: 0.85 }}>Zoom: camera distance (same view angle toward table center)</span>
          <label
            style={{ display: "grid", gridTemplateColumns: "88px 1fr 40px", alignItems: "center", gap: 6 }}
          >
            <span>Distance</span>
            <input
              type="range"
              min={0.55}
              max={1.45}
              step={0.01}
              value={cameraDistance}
              onChange={(e) => setCameraDistance(Number(e.target.value))}
            />
            <span style={{ textAlign: "right" }}>×{cameraDistance.toFixed(2)}</span>
          </label>
          <button type="button" onClick={() => setCameraDistance(1)}>
            Reset zoom
          </button>
        </p>
        <p style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 360 }}>
          <span style={{ opacity: 0.85 }}>Table tilt (°): tip the whole playmat in world space</span>
          <label
            style={{ display: "grid", gridTemplateColumns: "88px 1fr 32px", alignItems: "center", gap: 6 }}
          >
            <span>Pitch</span>
            <input
              type="range"
              min={-25}
              max={25}
              step={0.5}
              value={tiltPitchDeg}
              onChange={(e) => setTiltPitchDeg(Number(e.target.value))}
            />
            <span style={{ textAlign: "right" }}>{tiltPitchDeg.toFixed(1)}</span>
          </label>
          <label
            style={{ display: "grid", gridTemplateColumns: "88px 1fr 32px", alignItems: "center", gap: 6 }}
          >
            <span>Yaw</span>
            <input
              type="range"
              min={-60}
              max={60}
              step={0.5}
              value={tiltYawDeg}
              onChange={(e) => setTiltYawDeg(Number(e.target.value))}
            />
            <span style={{ textAlign: "right" }}>{tiltYawDeg.toFixed(1)}</span>
          </label>
          <label
            style={{ display: "grid", gridTemplateColumns: "88px 1fr 32px", alignItems: "center", gap: 6 }}
          >
            <span>Roll</span>
            <input
              type="range"
              min={-25}
              max={25}
              step={0.5}
              value={tiltRollDeg}
              onChange={(e) => setTiltRollDeg(Number(e.target.value))}
            />
            <span style={{ textAlign: "right" }}>{tiltRollDeg.toFixed(1)}</span>
          </label>
          <button
            type="button"
            onClick={() => {
              setTiltPitchDeg(0);
              setTiltYawDeg(0);
              setTiltRollDeg(0);
            }}
          >
            Reset table
          </button>
        </p>
        <p
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 420,
            alignItems: "flex-start",
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 600 }}>Rules engine (@tcgl/core)</span>
          <span style={{ opacity: 0.85 }}>
            Authoritative state is separate from 3D layout. Use controls to dispatch actions; last
            error and event log update here.
          </span>
          <code style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            active={engine.state.activePlayer} phase={engine.state.turnPhase} stack=
            {engine.state.stack.length} priority={engine.state.priorityPlayer ?? "—"}
          </code>
          {engine.lastError ? (
            <span style={{ color: "#f87171" }}>Last error: {engine.lastError}</span>
          ) : null}
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                const r = engine.dispatch(
                  moveCardAction("p1", "c-hand-1", demoZones.hand, demoZones.bf)
                );
                if (!r.error) {
                  push(`engine: ${r.events.map((e) => e.type).join(", ")}`);
                }
              }}
            >
              Move c-hand-1 → battlefield
            </button>
            <button
              type="button"
              onClick={() => {
                const r = engine.dispatch(endTurnAction("p1"));
                if (!r.error) {
                  push(`engine: ${r.events.map((e) => e.type).join(", ")}`);
                }
              }}
            >
              End turn (p1)
            </button>
            <button
              type="button"
              onClick={() => {
                const r = engine.dispatch(advanceStepAction("p1"));
                if (!r.error) {
                  push(`engine: ${r.events.map((e) => e.type).join(", ")}`);
                }
              }}
            >
              Advance step
            </button>
            <button
              type="button"
              onClick={() => {
                const r = engine.dispatch(
                  castToStackAction("p1", "c-hand-2", demoZones.hand)
                );
                if (!r.error) {
                  push(`engine: ${r.events.map((e) => e.type).join(", ")}`);
                }
              }}
            >
              Cast c-hand-2
            </button>
            <button
              type="button"
              onClick={() => {
                const p = engine.state.priorityPlayer;
                if (!p) {
                  return;
                }
                const r = engine.dispatch(passPriorityAction(p));
                if (!r.error) {
                  push(`engine: pass ${p}: ${r.events.map((e) => e.type).join(", ")}`);
                }
              }}
            >
              Pass priority
            </button>
            <button
              type="button"
              onClick={() => {
                engine.reset();
                push("engine: reset to seedDemoGame");
              }}
            >
              Reset engine
            </button>
          </span>
          <span style={{ opacity: 0.8 }}>Recent engine events (tail)</span>
          <code style={{ fontSize: 10, maxHeight: 120, overflow: "auto" }}>
            {JSON.stringify(
              engine.log.entries.slice(-8).map((e) => e.type),
              null,
              0
            )}
          </code>
        </p>
        <p>
          <strong>TCGL v0</strong> — presentation + interaction. Hover, tilt, click/double-click,
          drag on the battlefield sample, <kbd>F</kbd> flips the selected card.
        </p>
        <p
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 420,
            alignItems: "flex-start",
          }}
        >
          <span style={{ opacity: 0.85 }}>
            Card VFX (left battlefield creature): same preset and trigger row — 1 damage · 2 heal · 3
            buff · 4 debuff · 5 generic
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {(
              [
                ["damage", "Damage", "#f97316"] as const,
                ["heal", "Heal", "#4ade80"] as const,
                ["buff", "Buff", "#f5d15c"] as const,
                ["debuff", "Debuff", "#c084fc"] as const,
                ["generic", "Generic", "#e2e8f0"] as const,
              ] as const
            ).map(([k, label, c]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setVfxKind(k);
                  setVfxTrigger((n) => n + 1);
                }}
                style={{ borderColor: c }}
              >
                {label}
              </button>
            ))}
          </span>
        </p>
        <p>
          <kbd>H</kbd> outline · <kbd>T</kbd> tap · <kbd>D</kbd> drop overlay · <kbd>F</kbd> flip
          selected · <kbd>1</kbd>–<kbd>5</kbd> card VFX · <kbd>S</kbd> read · <kbd>Esc</kbd> exit
          read · double-click to flip
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
        </aside>
      </div>
    </div>
  );
}
