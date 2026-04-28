import type { ThreeEvent } from "@react-three/fiber";
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
  CardMotion,
  CARD_MOTION_PRESETS,
  applyCardLayFlatGroupHudPitch,
  convertCardFaceMaterialsHudToTable,
  convertCardFaceMaterialsTableToHud,
  flipDeal,
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
  type CardSpatialPose,
  type HandDragTowardTableDetail,
  TCGLCanvas,
  Zone,
} from "tcgl";
import {
  AttachedFlightPilot,
  cardLayFlatHudRx,
  cardLayFlatTableRx,
} from "./flight/AttachedFlightPilot";
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
import { GhostFollowGroup } from "./GhostFollowGroup";
import {
  mapHandPaPoseToPlayerAreaMotionSpace,
  sampleCardSpatialPoseInAncestor,
} from "./engine/poseSample";
import {
  mergeStackOntoLink,
  moveInsertIndexOntoCard,
  nearestZoneCardXZ,
  pruneInvalidStackLinks,
  reorderIndicesForStackOnto,
  STACK_DROP_RADIUS_PA,
  type StackPresentationKind,
} from "./engine/stackModel";
import {
  allOnTableCardIds,
  battlefieldGroupCentersXZ,
  computeFrontPlayCardPoseFromVisualOffsets,
  computeViewportHandSlotPosePA,
  frontPlayPACentersXZ,
  frontPlayReorderTargetIndex,
  getBattlefieldIds,
  getBattlefieldVisualOffsets,
  getFrontPlayIds,
  getFrontPlayVisualOffsets,
  getDeckIds,
  getGraveyardIds,
  getHandIds,
  getOpponentDeckIds,
  getOpponentFrontPlayIds,
  getOpponentGraveyardIds,
  getOpponentHandIds,
  getBattlefieldLocalPosition,
  FRONT_PLAY_ZONE_PA,
  FRONT_PLAY_ZONE_PAD_SIZE,
  GRAVEYARD_ZONE_PA_POSITION,
  handDropInsertIndexFromPALocal,
  HAND_RETURN_TARGET_PA,
  isPointInFrontPlayDropZonePA,
  isPointInGraveyardDropZonePA,
  isPointInHandDropZonePA,
  DRAG_CARD_ID,
} from "./engine/zoneView";
import {
  attachedFlightPoseEndpoints,
  tableCardInnerUniform,
  viewportHandInnerUniform,
} from "./engine/cardMotionUniform";
import {
  DemoCard3dTable,
  DemoCard3dRead,
  demoCardScaleById,
  face,
  BACK,
  VIEWPORT_HAND_HOVER_LIFT_OPPONENT,
  VIEWPORT_HAND_SCALE_OPPONENT,
} from "./DemoCard3d";
import { CameraAttachedHandsRoot } from "./ViewportHandsLayer";
import { DemoGameHudOverlay } from "./DemoGameHudOverlay";

/**
 * World pose for read-mode: billboard + uniform scale. Center Y is high enough that the full
 * portrait (DEFAULT_CARD_H × max card scale × this scale) stays above the frustum bottom.
 */
const READ_BILLBOARD = {
  position: [0, 0.96, 1.9] as [number, number, number],
  scale: 1.1,
} as const;

/**
 * PlayerArea-local poses for the `CardMotion` sample — roughly deck stack → above-hand landing.
 * Tune these (or drive from refs / matrixWorld.decompose) for real zone-to-zone flights.
 */
const MOTION_DEMO_FROM = {
  position: [-4.18, 0.14, 0.26] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: 1,
};
const MOTION_DEMO_TO = {
  position: [-0.42, 0.13, 0.88] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: 1,
};

/** Default demo camera; `lookAt` is origin — distance scales dolly in/out. */
const BASE_CAMERA: [number, number, number] = [0, 6.4, 7.2];

/** Tighter horizontal packing than table fans (viewport HUD cards use a smaller scale). */
const VIEWPORT_HAND_FAN_RADIUS = 0.92;
const VIEWPORT_HAND_FAN_MIN_CENTER_SPACING = 0.76;
/** Opponent HUD cards use {@link VIEWPORT_HAND_SCALE_OPPONENT}; pack centers proportionally tighter. */
const VIEWPORT_HAND_FAN_RADIUS_OPPONENT = 0.55;
const VIEWPORT_HAND_FAN_MIN_CENTER_SPACING_OPPONENT = 0.42;
/** Opposite chirality from near-hand fan — inverted rainbow along the top HUD. */
const VIEWPORT_HAND_FAN_MAX_ROLL_Z_OPPONENT = -0.055;
/** Wing cards dip slightly toward the playmat versus center. */
const VIEWPORT_HAND_FAN_Y_ARCH_OPPONENT = -0.016;
/** Extra X on opponent HUD root — cancels shared HandZone −0.2 so the fan nets centered horizontally. */
const VIEWPORT_HAND_HUD_ROOT_OFFSET_X_OPPONENT = 0.2;

/** Drops duplicate ids (keeps first occurrence) so React list keys stay unique during zone-flight previews. */
function uniqueIdsPreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

type Log = { t: string; m: string };

type ZoneFlightAnim =
  | {
      playerId: "p1" | "p2";
      cardId: string;
      kind: "hand-to-front" | "front-to-hand";
      from: CardSpatialPose;
      to: CardSpatialPose;
      nonce: number;
    }
  | null;

type DeckFlightAnim =
  | {
      playerId: "p1" | "p2";
      cardId: string;
      from: CardSpatialPose;
      to: CardSpatialPose;
      nonce: number;
    }
  | null;

/** Subtle staging-strip tint under front-play cards so empty zones stay visible on both sides. */
function FrontPlayStripPad() {
  const [w, d] = FRONT_PLAY_ZONE_PAD_SIZE;
  return (
    <group position={[0, -0.004, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-20}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color="#8899aa"
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function App() {
  const engine = useDemoSession();
  const handIds = useMemo(() => getHandIds(engine.state), [engine.state]);
  const fpIds = useMemo(() => getFrontPlayIds(engine.state), [engine.state]);
  const bfIds = useMemo(() => getBattlefieldIds(engine.state), [engine.state]);
  const fpIdsP2 = useMemo(
    () => getOpponentFrontPlayIds(engine.state),
    [engine.state]
  );
  const opponentHandIds = useMemo(
    () => getOpponentHandIds(engine.state),
    [engine.state]
  );
  const opponentDeckIds = useMemo(
    () => getOpponentDeckIds(engine.state),
    [engine.state]
  );
  const opponentGyIds = useMemo(
    () => getOpponentGraveyardIds(engine.state),
    [engine.state]
  );
  const [stackOnFp, setStackOnFp] = useState<Record<string, string>>({});
  const [stackOnFpP2, setStackOnFpP2] = useState<Record<string, string>>({});
  const [stackOnBf, setStackOnBf] = useState<Record<string, string>>({});
  const [fpStackKind, setFpStackKind] =
    useState<StackPresentationKind>("vertical");
  const [bfStackKind, setBfStackKind] =
    useState<StackPresentationKind>("overlap");
  const bfOffsets = useMemo(
    () => getBattlefieldVisualOffsets(bfIds, stackOnBf, bfStackKind),
    [bfIds, stackOnBf, bfStackKind]
  );
  const bfCentersXZ = useMemo(
    () => battlefieldGroupCentersXZ(bfIds, stackOnBf, bfStackKind),
    [bfIds, stackOnBf, bfStackKind]
  );
  const gyIds = useMemo(() => getGraveyardIds(engine.state), [engine.state]);
  const deckIds = useMemo(() => getDeckIds(engine.state), [engine.state]);
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
  /** One-shot proxy card flying deck→hand (`CardMotion` API demo). */
  const [motionDemoActive, setMotionDemoActive] = useState(false);
  const [motionDemoNonce, setMotionDemoNonce] = useState(0);
  /** Vertical pull from hand fan → table plane drag (see `ReorderableCardFan` `onDragTowardTable`). */
  const [handPlaneDrag, setHandPlaneDrag] = useState<{
    cardId: string;
    seed: { clientX: number; clientY: number };
  } | null>(null);
  /** Plane-drag ghost poses — refs avoid React rerenders every pointermove (see `GhostFollowGroup`). */
  const handGhostPosRef = useRef<[number, number, number] | null>(null);
  /** Double-click hand ↔ strip: animates before `moveCardAction`. */
  const [zoneFlight, setZoneFlight] = useState<ZoneFlightAnim>(null);
  /** Tap deck card → animated draw into hand (`moveCard` on complete). */
  const [deckFlight, setDeckFlight] = useState<DeckFlightAnim>(null);
  /** Front-strip drag: reorder in row or drop on hand. */
  const [stripPlaneDrag, setStripPlaneDrag] = useState<{
    cardId: string;
    seed: { clientX: number; clientY: number };
  } | null>(null);
  const stripGhostPosRef = useRef<[number, number, number] | null>(null);

  /**
   * Zone order used for front-strip layout — includes preview slots during double-click flight so the
   * row spreads before the card lands (hand→strip) and the fan opens before landing (strip→hand).
   */
  const layoutFpIds = useMemo(() => {
    let ids = fpIds;
    if (
      zoneFlight?.playerId === "p1" &&
      zoneFlight.kind === "front-to-hand"
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (stripPlaneDrag != null) {
      ids = ids.filter((id) => id !== stripPlaneDrag.cardId);
    }
    if (
      zoneFlight?.playerId === "p1" &&
      zoneFlight.kind === "hand-to-front"
    ) {
      ids = [...ids, zoneFlight.cardId];
    }
    return uniqueIdsPreserveOrder(ids);
  }, [fpIds, stripPlaneDrag, zoneFlight]);

  const layoutFpIdsP2 = useMemo(() => {
    let ids = fpIdsP2;
    if (
      zoneFlight?.playerId === "p2" &&
      zoneFlight.kind === "front-to-hand"
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (
      zoneFlight?.playerId === "p2" &&
      zoneFlight.kind === "hand-to-front"
    ) {
      ids = [...ids, zoneFlight.cardId];
    }
    return uniqueIdsPreserveOrder(ids);
  }, [fpIdsP2, zoneFlight]);

  const layoutHandIdsForFan = useMemo(() => {
    let ids = handIds;
    if (
      zoneFlight?.playerId === "p1" &&
      zoneFlight.kind === "hand-to-front"
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (handPlaneDrag != null) {
      ids = ids.filter((id) => id !== handPlaneDrag.cardId);
    }
    if (deckFlight?.playerId === "p1" && !ids.includes(deckFlight.cardId)) {
      ids = [...ids, deckFlight.cardId];
    }
    if (
      zoneFlight?.playerId === "p1" &&
      zoneFlight.kind === "front-to-hand"
    ) {
      const base = ids.filter((id) => id !== zoneFlight.cardId);
      const insertIdx = handDropInsertIndexFromPALocal(
        HAND_RETURN_TARGET_PA.position[0],
        base
      );
      return uniqueIdsPreserveOrder([
        ...base.slice(0, insertIdx),
        zoneFlight.cardId,
        ...base.slice(insertIdx),
      ]);
    }
    return uniqueIdsPreserveOrder(ids);
  }, [deckFlight, handIds, handPlaneDrag, zoneFlight]);

  const layoutHandIdsForFanP2 = useMemo(() => {
    let ids = opponentHandIds;
    if (
      zoneFlight?.playerId === "p2" &&
      zoneFlight.kind === "hand-to-front"
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (deckFlight?.playerId === "p2" && !ids.includes(deckFlight.cardId)) {
      ids = [...ids, deckFlight.cardId];
    }
    if (
      zoneFlight?.playerId === "p2" &&
      zoneFlight.kind === "front-to-hand"
    ) {
      const base = ids.filter((id) => id !== zoneFlight.cardId);
      const insertIdx = handDropInsertIndexFromPALocal(
        HAND_RETURN_TARGET_PA.position[0],
        base
      );
      return uniqueIdsPreserveOrder([
        ...base.slice(0, insertIdx),
        zoneFlight.cardId,
        ...base.slice(insertIdx),
      ]);
    }
    return uniqueIdsPreserveOrder(ids);
  }, [deckFlight, opponentHandIds, zoneFlight]);

  const fpOffsets = useMemo(
    () => getFrontPlayVisualOffsets(layoutFpIds, stackOnFp, fpStackKind),
    [layoutFpIds, stackOnFp, fpStackKind]
  );
  const fpCentersXZ = useMemo(
    () => frontPlayPACentersXZ(layoutFpIds, stackOnFp, fpStackKind),
    [layoutFpIds, stackOnFp, fpStackKind]
  );

  const fpOffsetsP2 = useMemo(
    () =>
      getFrontPlayVisualOffsets(layoutFpIdsP2, stackOnFpP2, fpStackKind),
    [layoutFpIdsP2, stackOnFpP2, fpStackKind]
  );

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
  /** Last drag-sample pose on battlefield plane (for stack-on-drop). */
  const lastBfDragLocal = useRef<[number, number, number] | null>(null);
  /** Near player `PlayerArea` root — used to project hand-drag onto the table plane. */
  const playerAreaRef = useRef<Group>(null);
  /** Far opponent `PlayerArea` — deck draw pose sampling (same local layout as near, mirrored by π yaw). */
  const opponentAreaRef = useRef<Group>(null);
  /** Camera-attached HUD roots — legacy PA-space hand poses map through these for CardMotion under PlayerArea. */
  const viewportP1HandHudRef = useRef<Group>(null);
  const viewportP2HandHudRef = useRef<Group>(null);
  const lastHandDragLocal = useRef<[number, number, number] | null>(null);
  const handDragCardRef = useRef<string | null>(null);
  const lastStripDragLocal = useRef<[number, number, number] | null>(null);
  const stripDragCardRef = useRef<string | null>(null);
  const zoneFlightRef = useRef<ZoneFlightAnim>(null);
  const deckFlightRef = useRef<DeckFlightAnim>(null);
  /** P1 deck→hand reparent target — empty `<group>`; flying mesh attaches via `Object3D.attach`. */
  const flightShellNearRef = useRef<Group>(null);
  const flightShellFarRef = useRef<Group>(null);
  const cardGroupById = useRef(new Map<string, Group>());
  /** Strip / hand slot groups for `attach` landing (same card root, no React remount). */
  const nearFpMountById = useRef(new Map<string, Group>());
  const farFpMountById = useRef(new Map<string, Group>());
  const p1HandMountById = useRef(new Map<string, Group>());
  const p2HandMountById = useRef(new Map<string, Group>());
  const setNearFpMountRef = useCallback((fid: string) => (node: Group | null) => {
    if (node) {
      nearFpMountById.current.set(fid, node);
    } else {
      nearFpMountById.current.delete(fid);
    }
  }, []);
  const setFarFpMountRef = useCallback((fid: string) => (node: Group | null) => {
    if (node) {
      farFpMountById.current.set(fid, node);
    } else {
      farFpMountById.current.delete(fid);
    }
  }, []);
  const setP1HandMountRef = useCallback((hid: string) => (node: Group | null) => {
    if (node) {
      p1HandMountById.current.set(hid, node);
    } else {
      p1HandMountById.current.delete(hid);
    }
  }, []);
  const setP2HandMountRef = useCallback((hid: string) => (node: Group | null) => {
    if (node) {
      p2HandMountById.current.set(hid, node);
    } else {
      p2HandMountById.current.delete(hid);
    }
  }, []);
  /**
   * Card ids whose scene root is parented by flight `attach` + `<primitive />` (not a live
   * `DemoCard3dTable` fiber for that zone).
   */
  const [stripPrimitiveIds, setStripPrimitiveIds] = useState(() => new Set<string>());
  const [handPrimitiveIds, setHandPrimitiveIds] = useState(() => new Set<string>());
  const readCaptureGate = useRef(false);
  const setCardGroupRef = useCallback((id: string) => (node: Group | null) => {
    if (node) {
      cardGroupById.current.set(id, node);
    } else {
      const zf = zoneFlightRef.current;
      const df = deckFlightRef.current;
      if (zf?.cardId === id || df?.cardId === id) {
        return;
      }
      cardGroupById.current.delete(id);
    }
  }, []);

  /** Avoid registering duplicate refs when the same card id is rendered as a ghost / motion overlay. */
  const noopSetCardGroupRef = useCallback(
    (_id: string) => (_node: Group | null) => {},
    []
  );

  zoneFlightRef.current = zoneFlight;
  deckFlightRef.current = deckFlight;

  const visibleP1DeckIds = useMemo(() => {
    if (deckFlight?.playerId === "p1") {
      return deckIds.filter((id) => id !== deckFlight.cardId);
    }
    return deckIds;
  }, [deckFlight, deckIds]);

  const visibleP2DeckIds = useMemo(() => {
    if (deckFlight?.playerId === "p2") {
      return opponentDeckIds.filter((id) => id !== deckFlight.cardId);
    }
    return opponentDeckIds;
  }, [deckFlight, opponentDeckIds]);

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

  const runMotionDemo = useCallback(() => {
    if (deckFlight != null || zoneFlight != null) {
      return;
    }
    setMotionDemoNonce((n) => n + 1);
    setMotionDemoActive(true);
    push("motion demo: CardMotion deck→hand (proxy)");
  }, [deckFlight, push, zoneFlight]);

  const onMotionDemoComplete = useCallback(() => {
    setMotionDemoActive(false);
    push("motion demo: finished");
  }, [push]);

  const onDragTowardTableFromHand = useCallback(
    (d: HandDragTowardTableDetail) => {
      if (
        zoneFlight != null ||
        stripPlaneDrag != null ||
        deckFlight != null
      ) {
        return;
      }
      handDragCardRef.current = d.cardId;
      lastHandDragLocal.current = null;
      handGhostPosRef.current = null;
      setHandPlaneDrag({
        cardId: d.cardId,
        seed: { clientX: d.clientX, clientY: d.clientY },
      });
      push(
        `hand drag (vertical): ${d.cardId} — release over front strip or graveyard`
      );
    },
    [deckFlight, push, stripPlaneDrag, zoneFlight]
  );

  const onHandPlaneDragMove = useCallback(
    (loc: [number, number, number]) => {
      lastHandDragLocal.current = loc;
      handGhostPosRef.current = loc;
    },
    []
  );

  const onHandPlaneEnd = useCallback(() => {
    const cid = handDragCardRef.current;
    handDragCardRef.current = null;
    const loc = lastHandDragLocal.current;
    setHandPlaneDrag(null);
    handGhostPosRef.current = null;
    lastHandDragLocal.current = null;
    if (!cid || !loc) {
      return;
    }
    if (isPointInGraveyardDropZonePA(loc[0]!, loc[2]!)) {
      engine.dispatch(moveCardAction("p1", cid, demoZones.hand, demoZones.gy));
      push(`drop → graveyard: ${cid}`);
      return;
    }
    if (isPointInFrontPlayDropZonePA(loc[0]!, loc[2]!)) {
      const onto = nearestZoneCardXZ(
        loc[0]!,
        loc[2]!,
        fpIds,
        fpCentersXZ,
        cid,
        STACK_DROP_RADIUS_PA
      );
      if (onto) {
        const ins = moveInsertIndexOntoCard(fpIds, onto);
        if (ins != null) {
          const r = engine.dispatch(
            moveCardAction(
              "p1",
              cid,
              demoZones.hand,
              demoZones.frontPlay,
              ins
            )
          );
          if (!r.error) {
            setStackOnFp((prev) =>
              mergeStackOntoLink(
                getFrontPlayIds(r.state),
                prev,
                cid,
                onto
              )
            );
            push(`drop → front play (on ${onto}): ${cid}`);
          }
          return;
        }
      }
      engine.dispatch(
        moveCardAction("p1", cid, demoZones.hand, demoZones.frontPlay)
      );
      push(`drop → front play: ${cid}`);
    } else {
      push(`hand drag: cancelled (outside strip / graveyard)`);
    }
  }, [engine, fpCentersXZ, fpIds, push]);

  const inPlay = useCallback(
    (id: string) => !readMode || selectedId !== id,
    [readMode, selectedId]
  );

  const playHandToFrontPlay = useCallback(
    (cardId: string) => {
      if (
        zoneFlight != null ||
        stripPlaneDrag != null ||
        deckFlight != null
      ) {
        return;
      }
      if (!handIds.includes(cardId)) {
        return;
      }
      const g = cardGroupById.current.get(cardId);
      const pa = playerAreaRef.current;
      if (!g || !pa) {
        engine.dispatch(
          moveCardAction("p1", cardId, demoZones.hand, demoZones.frontPlay)
        );
        push(`hand → front play: ${cardId}`);
        return;
      }
      setHandPrimitiveIds((prev) => {
        const n = new Set(prev);
        n.delete(cardId);
        return n;
      });
      const from = sampleCardSpatialPoseInAncestor(g, pa);
      const nextFp = [...fpIds, cardId];
      const nextOffsets = getFrontPlayVisualOffsets(
        nextFp,
        stackOnFp,
        fpStackKind
      );
      const to = {
        ...computeFrontPlayCardPoseFromVisualOffsets(cardId, nextOffsets),
        scale: tableCardInnerUniform(cardId, engine.state),
      };
      const { from: fromW, to: toW } = attachedFlightPoseEndpoints(from, to);
      const shell = flightShellNearRef.current;
      if (g && shell && pa) {
        shell.attach(g);
      }
      setZoneFlight({
        playerId: "p1",
        cardId,
        kind: "hand-to-front",
        from: fromW,
        to: toW,
        nonce: Date.now(),
      });
      push(`hand → front play (anim): ${cardId}`);
    },
    [
      engine,
      fpIds,
      fpStackKind,
      handIds,
      push,
      deckFlight,
      stackOnFp,
      stripPlaneDrag,
      zoneFlight,
    ]
  );

  const playOpponentHandToFrontPlay = useCallback(
    (cardId: string) => {
      if (
        zoneFlight != null ||
        stripPlaneDrag != null ||
        deckFlight != null
      ) {
        return;
      }
      if (!opponentHandIds.includes(cardId)) {
        return;
      }
      const g = cardGroupById.current.get(cardId);
      const pa = opponentAreaRef.current;
      if (!g || !pa) {
        engine.dispatch(
          moveCardAction(
            "p2",
            cardId,
            demoZones.p2Hand,
            demoZones.p2FrontPlay
          )
        );
        push(`p2 hand → front play: ${cardId}`);
        return;
      }
      setHandPrimitiveIds((prev) => {
        const n = new Set(prev);
        n.delete(cardId);
        return n;
      });
      const from = sampleCardSpatialPoseInAncestor(g, pa);
      const nextFp = [...fpIdsP2, cardId];
      const nextOffsets = getFrontPlayVisualOffsets(
        nextFp,
        stackOnFpP2,
        fpStackKind
      );
      const basePose = computeFrontPlayCardPoseFromVisualOffsets(
        cardId,
        nextOffsets
      );
      const to = {
        ...basePose,
        rotation: [0, Math.PI, 0] as [number, number, number],
        scale: tableCardInnerUniform(cardId, engine.state),
      };
      const { from: fromW, to: toW } = attachedFlightPoseEndpoints(from, to);
      const shell = flightShellFarRef.current;
      if (g && shell && pa) {
        shell.attach(g);
      }
      setZoneFlight({
        playerId: "p2",
        cardId,
        kind: "hand-to-front",
        from: fromW,
        to: toW,
        nonce: Date.now(),
      });
      push(`p2 hand → front play (anim): ${cardId}`);
    },
    [
      deckFlight,
      engine,
      fpIdsP2,
      fpStackKind,
      opponentHandIds,
      push,
      stackOnFpP2,
      stripPlaneDrag,
      zoneFlight,
    ]
  );

  const returnFrontPlayToHand = useCallback(
    (cardId: string) => {
      if (
        zoneFlight != null ||
        stripPlaneDrag != null ||
        deckFlight != null
      ) {
        return;
      }
      if (!fpIds.includes(cardId)) {
        return;
      }
      const g = cardGroupById.current.get(cardId);
      const pa = playerAreaRef.current;
      if (!g || !pa) {
        const insertIdx = handDropInsertIndexFromPALocal(
          HAND_RETURN_TARGET_PA.position[0],
          handIds
        );
        engine.dispatch(
          moveCardAction(
            "p1",
            cardId,
            demoZones.frontPlay,
            demoZones.hand,
            insertIdx
          )
        );
        setStripPrimitiveIds((prev) => {
          const n = new Set(prev);
          n.delete(cardId);
          return n;
        });
        push(`front play → hand: ${cardId}`);
        return;
      }
      const insertIdx = handDropInsertIndexFromPALocal(
        HAND_RETURN_TARGET_PA.position[0],
        handIds
      );
      const nextHand = [
        ...handIds.slice(0, insertIdx),
        cardId,
        ...handIds.slice(insertIdx),
      ];
      const slotIdx = nextHand.indexOf(cardId);
      const from = sampleCardSpatialPoseInAncestor(g, pa);
      let to = computeViewportHandSlotPosePA(slotIdx, nextHand.length, "p1");
      const hud = viewportP1HandHudRef.current;
      if (hud && pa) {
        to = mapHandPaPoseToPlayerAreaMotionSpace(to, hud, pa);
      }
      const { from: fromW, to: toW } = attachedFlightPoseEndpoints(from, {
        ...to,
        scale: viewportHandInnerUniform(cardId, engine.state, "p1"),
      });
      const shell = flightShellNearRef.current;
      if (g && shell && pa) {
        shell.attach(g);
      }
      setZoneFlight({
        playerId: "p1",
        cardId,
        kind: "front-to-hand",
        from: fromW,
        to: toW,
        nonce: Date.now(),
      });
      push(`front play → hand (anim): ${cardId}`);
    },
    [deckFlight, engine, fpIds, handIds, push, stripPlaneDrag, zoneFlight]
  );

  const returnOpponentFrontPlayToHand = useCallback(
    (cardId: string) => {
      if (
        zoneFlight != null ||
        stripPlaneDrag != null ||
        deckFlight != null
      ) {
        return;
      }
      if (!fpIdsP2.includes(cardId)) {
        return;
      }
      const g = cardGroupById.current.get(cardId);
      const pa = opponentAreaRef.current;
      if (!g || !pa) {
        const insertIdx = handDropInsertIndexFromPALocal(
          HAND_RETURN_TARGET_PA.position[0],
          opponentHandIds
        );
        engine.dispatch(
          moveCardAction(
            "p2",
            cardId,
            demoZones.p2FrontPlay,
            demoZones.p2Hand,
            insertIdx
          )
        );
        setStripPrimitiveIds((prev) => {
          const n = new Set(prev);
          n.delete(cardId);
          return n;
        });
        push(`p2 front play → hand: ${cardId}`);
        return;
      }
      const insertIdx = handDropInsertIndexFromPALocal(
        HAND_RETURN_TARGET_PA.position[0],
        opponentHandIds
      );
      const nextHand = [
        ...opponentHandIds.slice(0, insertIdx),
        cardId,
        ...opponentHandIds.slice(insertIdx),
      ];
      const slotIdx = nextHand.indexOf(cardId);
      const from = sampleCardSpatialPoseInAncestor(g, pa);
      let to = computeViewportHandSlotPosePA(slotIdx, nextHand.length, "p2");
      const hud = viewportP2HandHudRef.current;
      if (hud && pa) {
        to = mapHandPaPoseToPlayerAreaMotionSpace(to, hud, pa);
      }
      const { from: fromW, to: toW } = attachedFlightPoseEndpoints(from, {
        ...to,
        scale: viewportHandInnerUniform(cardId, engine.state, "p2"),
      });
      const shell = flightShellFarRef.current;
      if (g && shell && pa) {
        shell.attach(g);
      }
      setZoneFlight({
        playerId: "p2",
        cardId,
        kind: "front-to-hand",
        from: fromW,
        to: toW,
        nonce: Date.now(),
      });
      push(`p2 front play → hand (anim): ${cardId}`);
    },
    [
      deckFlight,
      engine,
      fpIdsP2,
      opponentHandIds,
      push,
      stripPlaneDrag,
      zoneFlight,
    ]
  );

  const finishZoneFlight = useCallback(() => {
    const z = zoneFlightRef.current;
    if (!z) {
      return;
    }
    const pid = z.playerId;
    const shell =
      pid === "p2" ? flightShellFarRef.current : flightShellNearRef.current;
    const child = shell?.children[0] as Group | undefined;

    if (z.kind === "hand-to-front") {
      const mount =
        pid === "p2"
          ? farFpMountById.current.get(z.cardId)
          : nearFpMountById.current.get(z.cardId);
      if (child && mount) {
        mount.attach(child);
        convertCardFaceMaterialsHudToTable(child);
        cardGroupById.current.set(z.cardId, child);
        setStripPrimitiveIds((prev) => new Set(prev).add(z.cardId));
      }
      setHandPrimitiveIds((prev) => {
        const n = new Set(prev);
        n.delete(z.cardId);
        return n;
      });
      if (pid === "p1") {
        engine.dispatch(
          moveCardAction("p1", z.cardId, demoZones.hand, demoZones.frontPlay)
        );
        push(`hand → front play (landed): ${z.cardId}`);
      } else {
        engine.dispatch(
          moveCardAction(
            "p2",
            z.cardId,
            demoZones.p2Hand,
            demoZones.p2FrontPlay
          )
        );
        push(`p2 hand → front play (landed): ${z.cardId}`);
      }
    } else {
      const insertIdx = handDropInsertIndexFromPALocal(
        HAND_RETURN_TARGET_PA.position[0],
        pid === "p1"
          ? getHandIds(engine.state)
          : getOpponentHandIds(engine.state)
      );
      const handMount =
        pid === "p2"
          ? p2HandMountById.current.get(z.cardId)
          : p1HandMountById.current.get(z.cardId);
      if (child && handMount) {
        handMount.attach(child);
        convertCardFaceMaterialsTableToHud(child);
        applyCardLayFlatGroupHudPitch(child);
        cardGroupById.current.set(z.cardId, child);
        setHandPrimitiveIds((prev) => new Set(prev).add(z.cardId));
      }
      setStripPrimitiveIds((prev) => {
        const n = new Set(prev);
        n.delete(z.cardId);
        return n;
      });
      if (pid === "p1") {
        engine.dispatch(
          moveCardAction(
            "p1",
            z.cardId,
            demoZones.frontPlay,
            demoZones.hand,
            insertIdx
          )
        );
        push(`front play → hand (landed): ${z.cardId}`);
      } else {
        engine.dispatch(
          moveCardAction(
            "p2",
            z.cardId,
            demoZones.p2FrontPlay,
            demoZones.p2Hand,
            insertIdx
          )
        );
        push(`p2 front play → hand (landed): ${z.cardId}`);
      }
    }
    setZoneFlight(null);
  }, [engine, push]);

  const beginDeckDraw = useCallback(
    (cardId: string, playerId: "p1" | "p2") => {
      if (
        zoneFlight != null ||
        stripPlaneDrag != null ||
        handPlaneDrag != null ||
        deckFlight != null ||
        motionDemoActive ||
        readMode
      ) {
        return;
      }
      const deckZone =
        playerId === "p1" ? demoZones.deck : demoZones.p2Deck;
      const handZone =
        playerId === "p1" ? demoZones.hand : demoZones.p2Hand;
      const ids =
        playerId === "p1" ? deckIds : opponentDeckIds;
      const curHand =
        playerId === "p1" ? handIds : opponentHandIds;
      const paRoot =
        playerId === "p1"
          ? playerAreaRef.current
          : opponentAreaRef.current;
      if (!ids.includes(cardId)) {
        return;
      }
      const g = cardGroupById.current.get(cardId);
      const pa = paRoot;
      const nextHand = [...curHand, cardId];
      if (!g || !pa) {
        engine.dispatch(
          moveCardAction(playerId, cardId, deckZone, handZone)
        );
        setFaceUpById((prev) => ({ ...prev, [cardId]: true }));
        push(`${playerId} deck → hand: ${cardId}`);
        return;
      }
      const from = sampleCardSpatialPoseInAncestor(g, pa);
      const hudRoot =
        playerId === "p1"
          ? viewportP1HandHudRef.current
          : viewportP2HandHudRef.current;
      const slotIdx = nextHand.indexOf(cardId);
      let to = computeViewportHandSlotPosePA(
        slotIdx,
        nextHand.length,
        playerId
      );
      if (hudRoot && pa) {
        to = mapHandPaPoseToPlayerAreaMotionSpace(to, hudRoot, pa);
      }
      const { from: fromW, to: toW } = attachedFlightPoseEndpoints(from, {
        ...to,
        scale: viewportHandInnerUniform(cardId, engine.state, playerId),
      });
      const shell =
        playerId === "p1"
          ? flightShellNearRef.current
          : flightShellFarRef.current;
      if (g && shell && pa) {
        shell.attach(g);
      }
      setDeckFlight({
        playerId,
        cardId,
        from: fromW,
        to: toW,
        nonce: Date.now(),
      });
      push(`${playerId} deck → hand (anim): ${cardId}`);
    },
    [
      deckFlight,
      deckIds,
      engine,
      handIds,
      opponentDeckIds,
      opponentHandIds,
      handPlaneDrag,
      motionDemoActive,
      push,
      readMode,
      stripPlaneDrag,
      zoneFlight,
      setFaceUpById,
    ]
  );

  const finishDeckFlight = useCallback(() => {
    const z = deckFlightRef.current;
    if (!z) {
      return;
    }
    const shell =
      z.playerId === "p1"
        ? flightShellNearRef.current
        : flightShellFarRef.current;
    const child = shell?.children[0] as Group | undefined;
    const handMount =
      z.playerId === "p1"
        ? p1HandMountById.current.get(z.cardId)
        : p2HandMountById.current.get(z.cardId);
    if (child && handMount) {
      handMount.attach(child);
      convertCardFaceMaterialsTableToHud(child);
      applyCardLayFlatGroupHudPitch(child);
      cardGroupById.current.set(z.cardId, child);
      setHandPrimitiveIds((prev) => new Set(prev).add(z.cardId));
    }
    const deckZone =
      z.playerId === "p1" ? demoZones.deck : demoZones.p2Deck;
    const handZone =
      z.playerId === "p1" ? demoZones.hand : demoZones.p2Hand;
    engine.dispatch(
      moveCardAction(z.playerId, z.cardId, deckZone, handZone)
    );
    setFaceUpById((prev) => ({ ...prev, [z.cardId]: true }));
    push(`${z.playerId} deck → hand (landed): ${z.cardId}`);
    setDeckFlight(null);
  }, [engine, push, setFaceUpById]);

  const attachedPilotFlight = useMemo(() => {
    if (deckFlight) {
      return {
        playerId: deckFlight.playerId,
        from: deckFlight.from,
        to: deckFlight.to,
        nonce: deckFlight.nonce,
        layFlatPitchFrom: cardLayFlatTableRx,
        layFlatPitchTo: cardLayFlatHudRx,
      };
    }
    if (
      zoneFlight &&
      (zoneFlight.kind === "hand-to-front" ||
        zoneFlight.kind === "front-to-hand")
    ) {
      const handToFront = zoneFlight.kind === "hand-to-front";
      return {
        playerId: zoneFlight.playerId,
        from: zoneFlight.from,
        to: zoneFlight.to,
        nonce: zoneFlight.nonce,
        layFlatPitchFrom: handToFront ? cardLayFlatHudRx : cardLayFlatTableRx,
        layFlatPitchTo: handToFront ? cardLayFlatTableRx : cardLayFlatHudRx,
      };
    }
    return null;
  }, [deckFlight, zoneFlight]);

  const finishAttachedFlight = useCallback(() => {
    if (deckFlightRef.current) {
      finishDeckFlight();
      return;
    }
    if (zoneFlightRef.current) {
      finishZoneFlight();
    }
  }, [finishDeckFlight, finishZoneFlight]);

  const visibleFpIds = useMemo(() => {
    if (
      zoneFlight?.playerId === "p1" &&
      zoneFlight.kind === "hand-to-front"
    ) {
      return layoutFpIds.filter((id) => id !== zoneFlight.cardId);
    }
    return layoutFpIds;
  }, [layoutFpIds, zoneFlight]);

  const visibleFpIdsP2 = useMemo(() => {
    if (
      zoneFlight?.playerId === "p2" &&
      zoneFlight.kind === "hand-to-front"
    ) {
      return layoutFpIdsP2.filter((id) => id !== zoneFlight.cardId);
    }
    return layoutFpIdsP2;
  }, [layoutFpIdsP2, zoneFlight]);

  const onStripPlaneDragMove = useCallback(
    (loc: [number, number, number]) => {
      lastStripDragLocal.current = loc;
      stripGhostPosRef.current = loc;
    },
    []
  );

  const onStripPlaneEnd = useCallback(() => {
    const cid = stripDragCardRef.current;
    stripDragCardRef.current = null;
    const loc = lastStripDragLocal.current;
    setStripPlaneDrag(null);
    stripGhostPosRef.current = null;
    lastStripDragLocal.current = null;
    if (!cid || !loc) {
      return;
    }
    if (isPointInHandDropZonePA(loc[0]!, loc[2]!)) {
      const insertIdx = handDropInsertIndexFromPALocal(loc[0]!, handIds);
      engine.dispatch(
        moveCardAction(
          "p1",
          cid,
          demoZones.frontPlay,
          demoZones.hand,
          insertIdx
        )
      );
      push(`strip drag → hand @ ${insertIdx}: ${cid}`);
      return;
    }
    if (isPointInGraveyardDropZonePA(loc[0]!, loc[2]!)) {
      engine.dispatch(
        moveCardAction("p1", cid, demoZones.frontPlay, demoZones.gy)
      );
      push(`strip drag → graveyard: ${cid}`);
      return;
    }
    if (isPointInFrontPlayDropZonePA(loc[0]!, loc[2]!)) {
      const onto = nearestZoneCardXZ(
        loc[0]!,
        loc[2]!,
        fpIds,
        fpCentersXZ,
        cid,
        STACK_DROP_RADIUS_PA
      );
      if (onto && onto !== cid) {
        const ri = reorderIndicesForStackOnto(fpIds, cid, onto);
        if (ri) {
          const r = engine.dispatch(
            reorderZoneCardsAction(
              "p1",
              demoZones.frontPlay,
              ri.fromIdx,
              ri.toIdx
            )
          );
          if (!r.error) {
            setStackOnFp((prev) =>
              mergeStackOntoLink(
                getFrontPlayIds(r.state),
                prev,
                cid,
                onto
              )
            );
            push(`strip stack on ${onto}: ${cid}`);
          }
          return;
        }
      }
      const fromIdx = fpIds.indexOf(cid);
      const toIdx = frontPlayReorderTargetIndex(
        loc[0]!,
        fpIds,
        stackOnFp,
        fpStackKind
      );
      if (fromIdx >= 0 && fromIdx !== toIdx) {
        engine.dispatch(
          reorderZoneCardsAction(
            "p1",
            demoZones.frontPlay,
            fromIdx,
            toIdx
          )
        );
        push(`strip reorder: ${cid}`);
      }
      return;
    }
    push(`strip drag: cancelled`);
  }, [
    engine,
    fpCentersXZ,
    fpIds,
    fpStackKind,
    handIds,
    push,
    stackOnFp,
  ]);

  const onFrontPlayCardPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>, fid: string) => {
      if (
        zoneFlight != null ||
        stripPlaneDrag != null ||
        handPlaneDrag != null ||
        deckFlight != null
      ) {
        return;
      }
      const native = e.nativeEvent;
      if (native.button !== 0) {
        return;
      }
      const pid = native.pointerId;
      const startX = native.clientX;
      const startY = native.clientY;
      let stripDragActivated = false;
      let cleaned = false;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) {
          return;
        }
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy > 64) {
          stripDragActivated = true;
          cleanup();
          stripDragCardRef.current = fid;
          lastStripDragLocal.current = null;
          stripGhostPosRef.current = null;
          setStripPlaneDrag({
            cardId: fid,
            seed: { clientX: ev.clientX, clientY: ev.clientY },
          });
        }
      };
      const onEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) {
          return;
        }
        cleanup();
        if (!stripDragActivated) {
          returnFrontPlayToHand(fid);
        }
      };
      /** Capture phase so we still receive events after tcgl {@link Card} calls `stopPropagation` on bubble. */
      const cap = true;
      function cleanup() {
        if (cleaned) {
          return;
        }
        cleaned = true;
        window.removeEventListener("pointermove", onMove, cap);
        window.removeEventListener("pointerup", onEnd, cap);
        window.removeEventListener("pointercancel", onEnd, cap);
      }
      window.addEventListener("pointermove", onMove, cap);
      window.addEventListener("pointerup", onEnd, cap);
      window.addEventListener("pointercancel", onEnd, cap);
    },
    [
      deckFlight,
      handPlaneDrag,
      returnFrontPlayToHand,
      stripPlaneDrag,
      zoneFlight,
    ]
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

  const onHandOrderChangeP2 = useCallback(
    (detail: { fromIndex: number; toIndex: number }) => {
      if (detail.fromIndex === detail.toIndex) {
        return;
      }
      engine.dispatch(
        reorderZoneCardsAction(
          "p2",
          demoZones.p2Hand,
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
      s.add(`c-p2-deck-${i}`);
    }
    if (selectedId && !s.has(selectedId)) {
      setSelectedId(null);
    }
  }, [engine.state, selectedId]);

  useEffect(() => {
    setStackOnFp((prev) => pruneInvalidStackLinks(fpIds, prev));
  }, [fpIds]);

  useEffect(() => {
    setStackOnFpP2((prev) => pruneInvalidStackLinks(fpIdsP2, prev));
  }, [fpIdsP2]);

  useEffect(() => {
    setStackOnBf((prev) => pruneInvalidStackLinks(bfIds, prev));
  }, [bfIds]);

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
      if (e.key === "m" || e.key === "M") {
        if (!e.repeat) {
          runMotionDemo();
        }
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
  }, [flipSelected, readMode, runMotionDemo, showReadCard, settingsDrawerOpen]);

  const events: CardInteractionEvents = useMemo(
    () => ({
      onCardHover: (id) => push(`hover ${id}`),
      onCardDragStart: (id) => push(`drag start ${id}`),
      onCardDrag: (id, p) =>
        push(`drag ${id} [${p.map((n) => n.toFixed(2)).join(", ")}]`),
      onCardDrop: (id, z) => push(`drop ${id} → ${z}`),
      onCardFlip: (id) => push(`flip done ${id}`),
      onCardTap: (id) => {
        if (id.startsWith("c-p2-deck-")) {
          beginDeckDraw(id, "p2");
          return;
        }
        if (id.startsWith("c-deck-")) {
          beginDeckDraw(id, "p1");
          return;
        }
        push(`tap ${id}`);
      },
      onCardSelect: (id) => {
        setSelectedId(id);
        push(`select ${id}`);
      },
    }),
    [beginDeckDraw, push]
  );

  const onDragBf2 = useCallback(
    (p: [number, number, number]) => {
      lastBfDragLocal.current = p;
      setBf2Pos(p);
      events.onCardDrag(DRAG_CARD_ID, p);
    },
    [events]
  );

  const onDragEnd = useCallback(() => {
    const loc = lastBfDragLocal.current;
    lastBfDragLocal.current = null;
    setDragId(null);
    events.onCardDrop(DRAG_CARD_ID, "battlefield");
    if (!loc || !bfIds.includes(DRAG_CARD_ID)) {
      return;
    }
    const onto = nearestZoneCardXZ(
      loc[0]!,
      loc[2]!,
      bfIds,
      bfCentersXZ,
      DRAG_CARD_ID,
      STACK_DROP_RADIUS_PA
    );
    if (!onto || onto === DRAG_CARD_ID) {
      return;
    }
    const ri = reorderIndicesForStackOnto(bfIds, DRAG_CARD_ID, onto);
    if (!ri) {
      return;
    }
    const r = engine.dispatch(
      reorderZoneCardsAction("p1", demoZones.bf, ri.fromIdx, ri.toIdx)
    );
    if (!r.error) {
      setStackOnBf((prev) =>
        mergeStackOntoLink(
          getBattlefieldIds(r.state),
          prev,
          DRAG_CARD_ID,
          onto
        )
      );
      push(`battlefield stack on ${onto}`);
    }
  }, [bfCentersXZ, bfIds, engine, events, push]);

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

        <Suspense fallback={null}>
          <CameraAttachedHandsRoot>
            <group ref={viewportP1HandHudRef} position={[0, -1.35, -5.2]}>
              <HandZone id="p1-hand" position={[-0.2, 0, 1.1]}>
                <ReorderableCardFan
                  cardIds={layoutHandIdsForFan}
                  onHandOrderChange={onHandOrderChange}
                  handZoneId={demoZones.hand}
                  onDragTowardTable={onDragTowardTableFromHand}
                  reorderDamping={7}
                  previewIndexDamping={6.5}
                  renderCard={(hid) => (
                    <group ref={setP1HandMountRef(hid)}>
                      {handPrimitiveIds.has(hid) ? (
                        <primitive object={cardGroupById.current.get(hid)!} />
                      ) : zoneFlight?.playerId === "p1" &&
                        zoneFlight.kind === "front-to-hand" &&
                        hid === zoneFlight.cardId ? null : deckFlight?.playerId ===
                            "p1" && hid === deckFlight.cardId ? null : (
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
                          viewportScreenFlat
                          onCardDoubleClick={() => playHandToFrontPlay(hid)}
                        />
                      )}
                    </group>
                  )}
                  radius={VIEWPORT_HAND_FAN_RADIUS}
                  minCenterSpacing={VIEWPORT_HAND_FAN_MIN_CENTER_SPACING}
                  style="ecard"
                  zBowl={0.004}
                  maxRollZ={0.05}
                />
              </HandZone>
            </group>

            <group
              ref={viewportP2HandHudRef}
              position={[VIEWPORT_HAND_HUD_ROOT_OFFSET_X_OPPONENT, 1.35, -5.2]}
            >
              <HandZone id="p2-hand" position={[-0.2, 0, 1.1]}>
                <ReorderableCardFan
                  cardIds={layoutHandIdsForFanP2}
                  onHandOrderChange={onHandOrderChangeP2}
                  handZoneId={demoZones.p2Hand}
                  renderCard={(hid) => (
                    <group ref={setP2HandMountRef(hid)}>
                      {handPrimitiveIds.has(hid) ? (
                        <primitive object={cardGroupById.current.get(hid)!} />
                      ) : deckFlight?.playerId === "p2" &&
                        hid === deckFlight.cardId ? null : zoneFlight?.playerId ===
                            "p2" &&
                          zoneFlight.kind === "hand-to-front" &&
                          hid === zoneFlight.cardId ? null : zoneFlight?.playerId ===
                            "p2" &&
                          zoneFlight.kind === "front-to-hand" &&
                          hid === zoneFlight.cardId ? null : (
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
                          viewportScreenFlat
                          viewportFlatScale={VIEWPORT_HAND_SCALE_OPPONENT}
                          hoverLift={VIEWPORT_HAND_HOVER_LIFT_OPPONENT}
                          hideCardFace
                          onCardDoubleClick={() =>
                            playOpponentHandToFrontPlay(hid)
                          }
                        />
                      )}
                    </group>
                  )}
                  radius={VIEWPORT_HAND_FAN_RADIUS_OPPONENT}
                  minCenterSpacing={VIEWPORT_HAND_FAN_MIN_CENTER_SPACING_OPPONENT}
                  style="ecard"
                  zBowl={0.004}
                  yArch={VIEWPORT_HAND_FAN_Y_ARCH_OPPONENT}
                  maxRollZ={VIEWPORT_HAND_FAN_MAX_ROLL_Z_OPPONENT}
                />
              </HandZone>
            </group>
          </CameraAttachedHandsRoot>
        </Suspense>

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
            <PlayerArea ref={playerAreaRef} side="near" position={[0, 0, 2.3]}>
              <Zone
                id={demoZones.frontPlay}
                zoneKind="battlefield"
                layout="row"
                position={FRONT_PLAY_ZONE_PA.position}
              >
                <FrontPlayStripPad />
                <group>
                  {layoutFpIds.map((fid) => (
                    <group
                      key={fid}
                      ref={setNearFpMountRef(fid)}
                      position={fpOffsets[fid] ?? [0, 0, 0]}
                    >
                      {stripPrimitiveIds.has(fid) ? (
                        <primitive object={cardGroupById.current.get(fid)!} />
                      ) : visibleFpIds.includes(fid) ? (
                        <DemoCard3dTable
                          id={fid}
                          state={engine.state}
                          setCardGroupRef={setCardGroupRef}
                          isFaceUp={isFaceUp}
                          selectedId={selectedId}
                          inPlay={inPlay}
                          onToggleFace={toggleFace}
                          oneHighlight={oneHighlight}
                          oneTapped={oneTapped}
                          onCardPointerDown={(e) =>
                            onFrontPlayCardPointerDown(e, fid)
                          }
                          onCardDoubleClick={() => returnFrontPlayToHand(fid)}
                        />
                      ) : null}
                    </group>
                  ))}
                </group>
              </Zone>

              <group ref={flightShellNearRef} renderOrder={43} />
              <AttachedFlightPilot
                flight={attachedPilotFlight}
                shellNearRef={flightShellNearRef}
                shellFarRef={flightShellFarRef}
                onComplete={finishAttachedFlight}
              />

              <DeckZone id="p1-deck" position={[-4.2, 0, 0.2]}>
                <CardStack yStep={0.025}>
                  {visibleP1DeckIds.map((did) => (
                    <Card
                      key={did}
                      ref={setCardGroupRef(did)}
                      id={did}
                      face={face(1)}
                      back={BACK}
                      faceUp={false}
                      selected={selectedId === did}
                      visible={inPlay(did)}
                    />
                  ))}
                </CardStack>
              </DeckZone>

              {motionDemoActive ? (
                <CardMotion
                  key={motionDemoNonce}
                  active
                  from={MOTION_DEMO_FROM}
                  to={MOTION_DEMO_TO}
                  {...CARD_MOTION_PRESETS.deckToHand}
                  flip={flipDeal(true)}
                  onComplete={onMotionDemoComplete}
                  renderOrder={32}
                >
                  {(m) => (
                    <Card
                      id="motion-demo-proxy"
                      face={face(1)}
                      back={BACK}
                      faceUp={m.faceUp}
                      cardScale={1}
                      pointerTilt={false}
                    />
                  )}
                </CardMotion>
              ) : null}

              <GraveyardZone
                id="p1-grave"
                position={[...GRAVEYARD_ZONE_PA_POSITION]}
              >
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

              {handPlaneDrag != null ? (
                <GhostFollowGroup
                  posRef={handGhostPosRef}
                  yLift={0.08}
                  renderOrder={48}
                >
                  <DemoCard3dTable
                    id={handPlaneDrag.cardId}
                    state={engine.state}
                    setCardGroupRef={noopSetCardGroupRef}
                    isFaceUp={isFaceUp}
                    selectedId={null}
                    inPlay={inPlay}
                    onToggleFace={toggleFace}
                    oneHighlight={false}
                    oneTapped={false}
                    pickDisabled
                  />
                </GhostFollowGroup>
              ) : null}

              {stripPlaneDrag != null ? (
                <GhostFollowGroup
                  posRef={stripGhostPosRef}
                  yLift={0.08}
                  renderOrder={46}
                >
                  <DemoCard3dTable
                    id={stripPlaneDrag.cardId}
                    state={engine.state}
                    setCardGroupRef={noopSetCardGroupRef}
                    isFaceUp={isFaceUp}
                    selectedId={null}
                    inPlay={inPlay}
                    onToggleFace={toggleFace}
                    oneHighlight={false}
                    oneTapped={false}
                    pickDisabled
                  />
                </GhostFollowGroup>
              ) : null}
            </PlayerArea>

            <PlayerArea
              ref={opponentAreaRef}
              side="far"
              position={[0, 0, -2.3]}
              rotation={[0, Math.PI, 0]}
            >
              <Zone
                id={demoZones.p2FrontPlay}
                zoneKind="battlefield"
                layout="row"
                position={FRONT_PLAY_ZONE_PA.position}
              >
                <FrontPlayStripPad />
                <group>
                  {layoutFpIdsP2.map((fid) => (
                    <group
                      key={fid}
                      ref={setFarFpMountRef(fid)}
                      position={fpOffsetsP2[fid] ?? [0, 0, 0]}
                    >
                      {stripPrimitiveIds.has(fid) ? (
                        <primitive object={cardGroupById.current.get(fid)!} />
                      ) : visibleFpIdsP2.includes(fid) ? (
                        <DemoCard3dTable
                          id={fid}
                          state={engine.state}
                          setCardGroupRef={setCardGroupRef}
                          isFaceUp={isFaceUp}
                          selectedId={selectedId}
                          inPlay={inPlay}
                          onToggleFace={toggleFace}
                          oneHighlight={oneHighlight}
                          oneTapped={oneTapped}
                          opponentReadableOrientation
                          onCardDoubleClick={() =>
                            returnOpponentFrontPlayToHand(fid)
                          }
                        />
                      ) : null}
                    </group>
                  ))}
                </group>
              </Zone>

              <group ref={flightShellFarRef} renderOrder={43} />

              <DeckZone id="p2-deck" position={[-4.2, 0, 0.2]}>
                <CardStack yStep={0.025}>
                  {visibleP2DeckIds.map((did) => (
                    <Card
                      key={did}
                      ref={setCardGroupRef(did)}
                      id={did}
                      rotation={[0, Math.PI, 0]}
                      face={face(1)}
                      back={BACK}
                      faceUp={false}
                      selected={selectedId === did}
                      visible={inPlay(did)}
                    />
                  ))}
                </CardStack>
              </DeckZone>

              <GraveyardZone
                id="p2-grave"
                position={[...GRAVEYARD_ZONE_PA_POSITION]}
              >
                <CardPile>
                  {opponentGyIds.map((gid) => (
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
                      opponentReadableOrientation
                    />
                  ))}
                </CardPile>
              </GraveyardZone>
            </PlayerArea>

            <TablePlaneDrag
              active={handPlaneDrag != null}
              planeY={0.08}
              parentRef={playerAreaRef}
              seedPointerClient={handPlaneDrag?.seed ?? null}
              onDrag={onHandPlaneDragMove}
              onEnd={onHandPlaneEnd}
            />

            <TablePlaneDrag
              active={stripPlaneDrag != null}
              planeY={0.08}
              parentRef={playerAreaRef}
              seedPointerClient={stripPlaneDrag?.seed ?? null}
              onDrag={onStripPlaneDragMove}
              onEnd={onStripPlaneEnd}
            />

            <BattlefieldZone id="battlefield" position={[0, 0, -0.5]}>
              <group ref={battlefieldGroupRef}>
                {bfIds.map((bid, bfi) => {
                  const pos =
                    bid === DRAG_CARD_ID
                      ? bf2Pos
                      : bfOffsets[bid] ??
                        getBattlefieldLocalPosition(bid, bfIds, bf2Pos);
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

            {readMode && readSnapshot && selectedId && readSnapshot.id === selectedId ? (
              <ReadCardFlight
                key={readFlightKey}
                snapshot={readSnapshot}
                toPos={READ_BILLBOARD.position}
                toScaleU={
                  READ_BILLBOARD.scale * demoCardScaleById(selectedId, engine.state)
                }
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

      <DemoGameHudOverlay />

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
          {...(!settingsDrawerOpen ? { inert: "" } : {})}
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
          <label
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            <span style={{ opacity: 0.85 }}>Front-play piles</span>
            <select
              value={fpStackKind}
              onChange={(e) =>
                setFpStackKind(e.target.value as StackPresentationKind)
              }
            >
              <option value="spread">spread</option>
              <option value="vertical">vertical</option>
              <option value="overlap">overlap</option>
            </select>
          </label>
          <label
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ opacity: 0.85 }}>Battlefield piles</span>
            <select
              value={bfStackKind}
              onChange={(e) =>
                setBfStackKind(e.target.value as StackPresentationKind)
              }
            >
              <option value="spread">spread</option>
              <option value="vertical">vertical</option>
              <option value="overlap">overlap</option>
            </select>
          </label>
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
                setStripPrimitiveIds(() => new Set());
                setHandPrimitiveIds(() => new Set());
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
          <button type="button" onClick={runMotionDemo}>
            Run deck→hand motion demo
          </button>
          <span style={{ marginLeft: 8, opacity: 0.85 }}>
            Uses <code>CardMotion</code> + presets (<code>CARD_MOTION_PRESETS.deckToHand</code>,{" "}
            <code>flipDeal(true)</code>). Logs on start/end.
          </span>
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
            Card VFX (first card on battlefield when you play one): same preset and trigger row — 1 damage · 2 heal · 3
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
          selected · hand→strip: <strong>double-click animates</strong> or drag mostly{" "}
          <strong>up/down</strong> then drop · strip: <strong>click-drag</strong> to reorder or drag toward
          hand to drop · double-click strip→hand (animated) · <kbd>M</kbd> motion demo ·{" "}
          <kbd>1</kbd>–<kbd>5</kbd> card VFX · <kbd>S</kbd> read · <kbd>Esc</kbd> exit read ·
          double-click to flip
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
