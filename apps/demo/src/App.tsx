import type { ThreeEvent } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  type Group,
  type Object3D,
  Vector3,
} from "three";
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
  resetCardPointerTiltGroup,
  setCardFlipRigY,
  setCardPointerTiltFromUv,
  setScreenOverlayCardLiftZ,
  flipDeal,
  type CardVfxKind,
  ReorderableCardFan,
  CardPile,
  CardStack,
  CardVfx,
  CARD_VFX_KINDS,
  DeckZone,
  DropZoneOverlay,
  GraveyardZone,
  HandZone,
  LightingRig,
  type CardInteractionEvents,
  type CardContextMenuPoint,
  type CardPointerClickDetail,
  Playmat,
  PlayerArea,
  type CardSpatialPose,
  type HandDragTowardTableDetail,
  SCREEN_OVERLAY_GHOST_PICK_Z_NUDGE,
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
  toggleCardTappedAction,
  type GameState,
} from "@tcgl/core";
import { demoZones } from "./engine/seedDemoGame";
import { useDemoSession } from "./engine/useDemoSession";
import { GhostFollowGroup } from "./GhostFollowGroup";
import {
  mapHandPaPoseToPlayerAreaMotionSpace,
  reexpressSpatialPoseInAncestor,
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
  findZoneIdForCard,
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
  canControllerUseZone,
  computeRelocateTargetPose,
  landForZoneId,
  type RelocateLand,
  RELOCATE_ZONE_OPTIONS,
  zoneListsAfterMove,
} from "./engine/zoneRelocate";
import {
  getZoneDefaultFaceUp,
  logicalFaceUpForCard,
} from "./engine/zonePresentation";
import { cardFlipRigYInZone } from "./flight/cardFlipRigY";
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
import { TableTiltAxesGizmo } from "./TableTiltAxesGizmo";

/** Alt+click cycles through these zones (instant `moveCardAction`) — per controller. */
const P1_ALT_ZONE_CYCLE = [
  demoZones.hand,
  demoZones.frontPlay,
  demoZones.bf,
  demoZones.gy,
] as const;
const P2_ALT_ZONE_CYCLE = [
  demoZones.p2Hand,
  demoZones.p2FrontPlay,
  demoZones.bf,
  demoZones.p2Gy,
] as const;

function pointerDetailFromPointerEvent(
  ev: PointerEvent
): CardPointerClickDetail {
  return {
    button: ev.button,
    shiftKey: ev.shiftKey,
    altKey: ev.altKey,
    metaKey: ev.metaKey,
    ctrlKey: ev.ctrlKey,
  };
}

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
  | {
      playerId: "p1" | "p2";
      cardId: string;
      kind: "relocate";
      fromZone: string;
      toZone: string;
      land: RelocateLand;
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

/**
 * After a {@link Card} unmounts, nested meshes can keep stale `__r3f` from the old fiber. Hits then
 * dispatch to dead instances and never reach handlers on `<primitive object={cardRoot}>`.
 */
function clearStaleR3fBelow(cardRoot: Object3D): void {
  cardRoot.traverse((o) => {
    if (o === cardRoot) {
      return;
    }
    const any = o as Object3D & { __r3f?: unknown };
    if (any.__r3f != null) {
      delete any.__r3f;
    }
  });
}

/** Viewport-hand `<primitive>` roots have no live {@link Card} fiber — match {@link Card} ghost opacity. */
function applyHudPrimitiveGhostOpacity(root: Group, ghosted: boolean): void {
  const opacity = ghosted ? 0.42 : 1;
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) {
      return;
    }
    const raw = obj.material;
    const mats = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const m of mats) {
      if (m instanceof MeshStandardMaterial) {
        m.transparent = true;
        m.opacity = opacity;
        m.needsUpdate = true;
      }
    }
  });
}

/**
 * {@link ReorderableCardFan} injects `onCardPointerDown` on the innermost node. {@link Card} honors
 * that prop, but R3F `<primitive>` only wires **`onPointerDown`** into `__r3f.eventCount`. Without a
 * bridge, hits on reparented deck/strip meshes never bubble to a listener and the hand feels dead.
 *
 * {@link Card} registers `onClick` on an **inner** `AnimatedGroup`; we only have the outer root, so
 * `onClick` must run on the root after stale child `__r3f` is cleared (see {@link clearStaleR3fBelow}).
 */
function HandHudCardPrimitive({
  object: root,
  ghosted = false,
  faceUpLogical,
  hoverLift = 0.12,
  pointerTilt = false,
  maxTilt = 0.14,
  disabled = false,
  onCardPointerDown,
  onClick,
  onRequestCardMenu,
}: {
  object: Group;
  /** Muted opacity while staying interactive (see {@link applyHudPrimitiveGhostOpacity}). */
  ghosted?: boolean;
  /**
   * Effective face-up for the flip rig (matches {@link DemoCard3dTable} `faceUp` / concealed map).
   * Required so deck→hand primitives stay in sync after the React {@link Card} unmounts.
   */
  faceUpLogical: boolean;
  /** Screen-overlay hover lift on local Z ({@link setScreenOverlayCardLiftZ}). */
  hoverLift?: number;
  pointerTilt?: boolean;
  maxTilt?: number;
  /** When true, skip hover lift / tilt ({@link Card} disabled hand slots). */
  disabled?: boolean;
  onCardPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  /** Right-click or Ctrl/Cmd+primary — R3F `contextmenu` alone is unreliable on primitives. */
  onRequestCardMenu: (clientX: number, clientY: number) => void;
}) {
  const effMaxTilt = pointerTilt ? maxTilt : 0;

  useLayoutEffect(() => {
    setCardFlipRigY(root, faceUpLogical ? 0 : Math.PI);
  }, [root, faceUpLogical]);

  useLayoutEffect(() => {
    applyHudPrimitiveGhostOpacity(root, ghosted);
    const key = "__tcglGhostPickNudgeZ";
    const prev = (root.userData[key] as number | undefined) ?? 0;
    if (prev !== 0) {
      root.position.z -= prev;
    }
    const n = ghosted ? SCREEN_OVERLAY_GHOST_PICK_Z_NUDGE : 0;
    root.position.z += n;
    root.userData[key] = n;
    root.updateMatrixWorld(true);
  }, [root, ghosted]);

  useLayoutEffect(() => {
    return () => {
      setScreenOverlayCardLiftZ(root, 0);
      resetCardPointerTiltGroup(root);
    };
  }, [root]);

  const applyHoverLift = (active: boolean) => {
    setScreenOverlayCardLiftZ(root, active && !disabled ? hoverLift : 0);
  };

  return (
    <primitive
      object={root}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (disabled) {
          return;
        }
        e.stopPropagation();
        applyHoverLift(true);
        setCardPointerTiltFromUv(root, e.uv, effMaxTilt);
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        applyHoverLift(false);
        resetCardPointerTiltGroup(root);
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (disabled) {
          return;
        }
        e.stopPropagation();
        setCardPointerTiltFromUv(root, e.uv, effMaxTilt);
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        const ne = e.nativeEvent;
        if (ne.button === 2 || (ne.button === 0 && (ne.ctrlKey || ne.metaKey))) {
          e.stopPropagation();
          ne.preventDefault();
          onRequestCardMenu(ne.clientX, ne.clientY);
          return;
        }
        onCardPointerDown?.(e);
      }}
      onClick={onClick}
      onContextMenu={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        e.nativeEvent.preventDefault();
        const ne = e.nativeEvent;
        onRequestCardMenu(ne.clientX, ne.clientY);
      }}
    />
  );
}

type DemoCardContextMenuState = CardContextMenuPoint & { cardId: string };

const CARD_VFX_MENU_LABELS: Record<CardVfxKind, string> = {
  damage: "Damage",
  heal: "Heal",
  buff: "Buff",
  debuff: "Debuff",
  generic: "Generic",
};

/** Pixels the submenu rail overlaps the main menu (wider = easier diagonal travel). */
const CONTEXT_SUBMENU_OVERLAP_PX = 32;
/** Invisible hit strip between main column and panel (catches the pointer on the way). */
const CONTEXT_SUBMENU_BRIDGE_W_PX = 44;
/** Grace period before closing when the pointer leaves (forgives shaky movement). */
const CONTEXT_SUBMENU_CLOSE_DELAY_MS = 220;

const CONTEXT_SUBMENU_PANEL_STYLE: CSSProperties = {
  minWidth: 200,
  background: "#2a2a30",
  border: "1px solid #555",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  padding: 6,
};

function ContextMenuSubmenuRail({
  open,
  ariaLabel,
  onPointerEnterRail,
  onPointerLeaveRail,
  children,
}: {
  open: boolean;
  ariaLabel: string;
  onPointerEnterRail: () => void;
  onPointerLeaveRail: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }
  return (
    <div
      style={{
        position: "absolute",
        left: `calc(100% - ${CONTEXT_SUBMENU_OVERLAP_PX}px)`,
        top: 0,
        zIndex: 1,
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
      }}
      onPointerEnter={onPointerEnterRail}
      onPointerLeave={onPointerLeaveRail}
    >
      <div
        aria-hidden
        style={{
          width: CONTEXT_SUBMENU_BRIDGE_W_PX,
          minHeight: 48,
          flexShrink: 0,
        }}
      />
      <div
        role="menu"
        aria-label={ariaLabel}
        className="demo-card-context-submenu"
        style={CONTEXT_SUBMENU_PANEL_STYLE}
      >
        {children}
      </div>
    </div>
  );
}

function DemoCardContextMenu({
  menu,
  onClose,
  readMode,
  onFlip,
  ghosted,
  onToggleGhosted,
  tapped,
  onToggleTap,
  onVfx,
  relocateTargets: relocateTargetsProp,
  onRelocate,
}: {
  menu: DemoCardContextMenuState;
  onClose: () => void;
  readMode: boolean;
  onFlip: () => void;
  /** Presentation-only muted “ghost” look (not tap rotation). */
  ghosted: boolean;
  onToggleGhosted: () => void;
  /** Engine tapped flag — in-plane 90° rotation. */
  tapped: boolean;
  onToggleTap: () => void;
  onVfx: (kind: CardVfxKind) => void;
  relocateTargets?: { zoneId: string; label: string }[];
  onRelocate: (zoneId: string) => void;
}) {
  const relocateTargets = relocateTargetsProp ?? [];
  const ref = useRef<HTMLDivElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [vfxOpen, setVfxOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    left: number;
    top: number;
    flipUp: boolean;
  } | null>(null);
  const vfxCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearVfxCloseTimer = useCallback(() => {
    if (vfxCloseTimerRef.current != null) {
      clearTimeout(vfxCloseTimerRef.current);
      vfxCloseTimerRef.current = null;
    }
  }, []);
  const clearMoveCloseTimer = useCallback(() => {
    if (moveCloseTimerRef.current != null) {
      clearTimeout(moveCloseTimerRef.current);
      moveCloseTimerRef.current = null;
    }
  }, []);

  const scheduleVfxClose = useCallback(() => {
    clearVfxCloseTimer();
    vfxCloseTimerRef.current = setTimeout(() => {
      vfxCloseTimerRef.current = null;
      setVfxOpen(false);
    }, CONTEXT_SUBMENU_CLOSE_DELAY_MS);
  }, [clearVfxCloseTimer]);

  const scheduleMoveClose = useCallback(() => {
    clearMoveCloseTimer();
    moveCloseTimerRef.current = setTimeout(() => {
      moveCloseTimerRef.current = null;
      setMoveOpen(false);
    }, CONTEXT_SUBMENU_CLOSE_DELAY_MS);
  }, [clearMoveCloseTimer]);

  useEffect(() => {
    return () => {
      clearVfxCloseTimer();
      clearMoveCloseTimer();
    };
  }, [clearMoveCloseTimer, clearVfxCloseTimer]);

  /**
   * Close on outside pointerdown. Subscribe only after the opening gesture is fully finished
   * (macrotask), otherwise React commits the portal, the same pointerdown bubbles to `window`,
   * `contains(canvas)` is false, and we close immediately before you can click anything.
   */
  useEffect(() => {
    const onDown = (ev: PointerEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) {
        onClose();
      }
    };
    let cleaned = false;
    const t = window.setTimeout(() => {
      if (!cleaned) {
        window.addEventListener("pointerdown", onDown);
      }
    }, 0);
    return () => {
      cleaned = true;
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const pad = 8;
    const { width: mw, height: mh } = el.getBoundingClientRect();
    let left = menu.clientX;
    let top = menu.clientY;
    left = Math.max(pad, Math.min(left, window.innerWidth - mw - pad));

    const spaceBelow = window.innerHeight - menu.clientY - pad;
    const spaceAbove = menu.clientY - pad;
    let flipUp = false;
    if (mh <= spaceBelow) {
      top = menu.clientY;
    } else if (spaceAbove > spaceBelow && mh <= spaceAbove) {
      top = menu.clientY - mh;
      flipUp = true;
    } else {
      top = Math.max(pad, window.innerHeight - pad - mh);
      flipUp = top + mh / 2 < menu.clientY;
    }
    if (top + mh > window.innerHeight - pad) {
      top = window.innerHeight - pad - mh;
    }
    if (top < pad) {
      top = pad;
    }
    setPlacement({ left, top, flipUp });
  }, [
    menu.cardId,
    menu.clientX,
    menu.clientY,
    moveOpen,
    vfxOpen,
    relocateTargets.length,
    readMode,
    ghosted,
    tapped,
  ]);

  const pad = 8;
  const minW = 200;
  const left = placement?.left ?? Math.max(pad, menu.clientX);
  const top = placement?.top ?? Math.max(pad, menu.clientY);
  const flipUp = placement?.flipUp ?? false;

  const disabled = readMode;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Card actions"
      className="demo-card-context-menu"
      data-flip-up={flipUp ? "true" : "false"}
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 10000,
        minWidth: minW,
        background: "#2a2a30",
        border: "1px solid #555",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        padding: 6,
      }}
    >
      {disabled ? (
        <div className="demo-card-context-menu__hint">
          Exit read mode to use these actions.
        </div>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="demo-card-context-menu__item"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            onFlip();
            onClose();
          }
        }}
      >
        Flip face
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={ghosted}
        className="demo-card-context-menu__item demo-card-context-menu__item--row"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            onToggleGhosted();
          }
        }}
      >
        <span>Inactive</span>
        <span className="demo-card-context-menu__state-pill" aria-hidden>
          {ghosted ? "On" : "Off"}
        </span>
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={tapped}
        className="demo-card-context-menu__item demo-card-context-menu__item--row"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            onToggleTap();
          }
        }}
      >
        <span>Tap</span>
        <span className="demo-card-context-menu__state-pill" aria-hidden>
          {tapped ? "On" : "Off"}
        </span>
      </button>
      <div
        style={{ position: "relative" }}
        onPointerEnter={() => {
          if (!disabled) {
            clearVfxCloseTimer();
            clearMoveCloseTimer();
            setMoveOpen(false);
            setVfxOpen(true);
          }
        }}
        onPointerLeave={() => {
          if (!disabled) {
            scheduleVfxClose();
          }
        }}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={vfxOpen}
          className="demo-card-context-menu__item demo-card-context-menu__item--row"
          disabled={disabled}
        >
          <span>VFX…</span>
          <span className="demo-card-context-menu__chevron" aria-hidden>
            ›
          </span>
        </button>
        <ContextMenuSubmenuRail
          open={vfxOpen && !disabled}
          ariaLabel="Play card VFX"
          onPointerEnterRail={() => {
            clearVfxCloseTimer();
          }}
          onPointerLeaveRail={() => {
            scheduleVfxClose();
          }}
        >
          {CARD_VFX_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className="demo-card-context-menu__item"
              onClick={() => {
                onVfx(kind);
                onClose();
              }}
            >
              {CARD_VFX_MENU_LABELS[kind]}
            </button>
          ))}
        </ContextMenuSubmenuRail>
      </div>
      <div
        style={{ position: "relative" }}
        onPointerEnter={() => {
          if (!disabled) {
            clearMoveCloseTimer();
            clearVfxCloseTimer();
            setVfxOpen(false);
            setMoveOpen(true);
          }
        }}
        onPointerLeave={() => {
          if (!disabled) {
            scheduleMoveClose();
          }
        }}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={moveOpen}
          className="demo-card-context-menu__item demo-card-context-menu__item--row"
          disabled={disabled}
        >
          <span>Move to…</span>
          <span className="demo-card-context-menu__chevron" aria-hidden>
            ›
          </span>
        </button>
        <ContextMenuSubmenuRail
          open={moveOpen && !disabled && relocateTargets.length > 0}
          ariaLabel="Move card to zone"
          onPointerEnterRail={() => {
            clearMoveCloseTimer();
          }}
          onPointerLeaveRail={() => {
            scheduleMoveClose();
          }}
        >
          {relocateTargets.map((t) => (
            <button
              key={t.zoneId}
              type="button"
              role="menuitem"
              className="demo-card-context-menu__item"
              onClick={() => {
                onRelocate(t.zoneId);
                onClose();
              }}
            >
              {t.label}
            </button>
          ))}
        </ContextMenuSubmenuRail>
      </div>
    </div>,
    document.body
  );
}

/** VFX burst on the card the user selected (context menu / Shift+click), in any zone. */
function SelectedCardVfxOverlay({
  cardId,
  selectedId,
  vfxKind,
  vfxTrigger,
  state,
  faceAlign,
}: {
  cardId: string;
  selectedId: string | null;
  vfxKind: CardVfxKind;
  vfxTrigger: number;
  state: GameState;
  faceAlign: boolean;
}) {
  if (selectedId !== cardId) {
    return null;
  }
  return (
    <CardVfx
      kind={vfxKind}
      trigger={vfxTrigger}
      scale={demoCardScaleById(cardId, state)}
      faceAlign={faceAlign}
    />
  );
}

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
  const getEngineState = engine.getState;
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
  const gyIds = useMemo(() => getGraveyardIds(engine.state), [engine.state]);
  const deckIds = useMemo(() => getDeckIds(engine.state), [engine.state]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [dropOn, setDropOn] = useState(false);
  const [oneHighlight, setOneHighlight] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardContextMenu, setCardContextMenu] =
    useState<DemoCardContextMenuState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [bf2Pos, setBf2Pos] = useState<[number, number, number]>([0.55, 0, 0]);
  const [faceUpById, setFaceUpById] = useState<Record<string, boolean>>({});
  /**
   * Presentation-only ghosted cards (muted opacity); not the same as engine tap rotation.
   * `c-hand-4` is disabled for tap/drag but uses `ghosted` (not `disabled`) for dimming so the
   * context-menu Inactive switch visibly toggles opacity.
   */
  const [ghostedCardIds, setGhostedCardIds] = useState<Record<string, boolean>>(
    () => ({ "c-hand-4": true })
  );
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
  /** World axes + X/Y/Z labels at scene origin — on by default for orientation. */
  const [axesLabelsOn, setAxesLabelsOn] = useState(true);
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
  const stripPlaneDragRef = useRef<typeof stripPlaneDrag>(null);
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
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.frontPlay
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.toZone === demoZones.frontPlay
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
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.p2FrontPlay
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.toZone === demoZones.p2FrontPlay
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
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.hand
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
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.toZone === demoZones.hand &&
      zoneFlight.playerId === "p1"
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
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.p2Hand
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
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.toZone === demoZones.p2Hand &&
      zoneFlight.playerId === "p2"
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

  /** Keep empty hand wrappers aligned with slot poses while the mesh flies on `flightShell*` (avoids damped lag + post-attach settle). */
  const layoutHardSnapHandP1 = useMemo((): readonly string[] => {
    if (deckFlight?.playerId === "p1") {
      return [deckFlight.cardId];
    }
    if (
      zoneFlight?.playerId === "p1" &&
      (zoneFlight.kind === "front-to-hand" ||
        (zoneFlight.kind === "relocate" &&
          zoneFlight.toZone === demoZones.hand))
    ) {
      return [zoneFlight.cardId];
    }
    return [];
  }, [deckFlight, zoneFlight]);

  const layoutHardSnapHandP2 = useMemo((): readonly string[] => {
    if (deckFlight?.playerId === "p2") {
      return [deckFlight.cardId];
    }
    if (
      zoneFlight?.playerId === "p2" &&
      (zoneFlight.kind === "front-to-hand" ||
        (zoneFlight.kind === "relocate" &&
          zoneFlight.toZone === demoZones.p2Hand))
    ) {
      return [zoneFlight.cardId];
    }
    return [];
  }, [deckFlight, zoneFlight]);

  const layoutBfIds = useMemo(() => {
    let ids = bfIds;
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.bf
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (zoneFlight?.kind === "relocate" && zoneFlight.toZone === demoZones.bf) {
      ids = [...ids, zoneFlight.cardId];
    }
    return uniqueIdsPreserveOrder(ids);
  }, [bfIds, zoneFlight]);

  const layoutGyIds = useMemo(() => {
    let ids = gyIds;
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.gy
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (zoneFlight?.kind === "relocate" && zoneFlight.toZone === demoZones.gy) {
      ids = [...ids, zoneFlight.cardId];
    }
    return uniqueIdsPreserveOrder(ids);
  }, [gyIds, zoneFlight]);

  const layoutGyIdsP2 = useMemo(() => {
    let ids = opponentGyIds;
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.p2Gy
    ) {
      ids = ids.filter((id) => id !== zoneFlight.cardId);
    }
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.toZone === demoZones.p2Gy
    ) {
      ids = [...ids, zoneFlight.cardId];
    }
    return uniqueIdsPreserveOrder(ids);
  }, [opponentGyIds, zoneFlight]);

  const bfOffsets = useMemo(
    () =>
      getBattlefieldVisualOffsets(layoutBfIds, stackOnBf, bfStackKind),
    [layoutBfIds, stackOnBf, bfStackKind]
  );
  const bfCentersXZ = useMemo(
    () =>
      battlefieldGroupCentersXZ(layoutBfIds, stackOnBf, bfStackKind),
    [layoutBfIds, stackOnBf, bfStackKind]
  );

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
  const beginRelocateFlightRef = useRef<(cardId: string, toZone: string) => void>(
    () => {}
  );
  /** P1 deck→hand reparent target — empty `<group>`; flying mesh attaches via `Object3D.attach`. */
  const flightShellNearRef = useRef<Group>(null);
  const flightShellFarRef = useRef<Group>(null);
  const cardGroupById = useRef(new Map<string, Group>());
  /** Strip / hand slot groups for `attach` landing (same card root, no React remount). */
  const nearFpMountById = useRef(new Map<string, Group>());
  const farFpMountById = useRef(new Map<string, Group>());
  const p1HandMountById = useRef(new Map<string, Group>());
  const p2HandMountById = useRef(new Map<string, Group>());
  const bfMountById = useRef(new Map<string, Group>());
  const p1GyPileRootRef = useRef<Group>(null);
  const p2GyPileRootRef = useRef<Group>(null);
  const p1DeckStackRootRef = useRef<Group>(null);
  const p2DeckStackRootRef = useRef<Group>(null);
  const p1GyMountById = useRef(new Map<string, Group>());
  const p2GyMountById = useRef(new Map<string, Group>());
  const p1DeckMountById = useRef(new Map<string, Group>());
  const p2DeckMountById = useRef(new Map<string, Group>());
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
  const setBfMountRef = useCallback((bid: string) => (node: Group | null) => {
    if (node) {
      bfMountById.current.set(bid, node);
    } else {
      bfMountById.current.delete(bid);
    }
  }, []);
  const setP1GyMountRef = useCallback((gid: string) => (node: Group | null) => {
    if (node) {
      p1GyMountById.current.set(gid, node);
    } else {
      p1GyMountById.current.delete(gid);
    }
  }, []);
  const setP2GyMountRef = useCallback((gid: string) => (node: Group | null) => {
    if (node) {
      p2GyMountById.current.set(gid, node);
    } else {
      p2GyMountById.current.delete(gid);
    }
  }, []);
  const setP1DeckMountRef = useCallback((did: string) => (node: Group | null) => {
    if (node) {
      p1DeckMountById.current.set(did, node);
    } else {
      p1DeckMountById.current.delete(did);
    }
  }, []);
  const setP2DeckMountRef = useCallback((did: string) => (node: Group | null) => {
    if (node) {
      p2DeckMountById.current.set(did, node);
    } else {
      p2DeckMountById.current.delete(did);
    }
  }, []);
  /**
   * Card ids whose scene root is parented by flight `attach` + `<primitive />` (not a live
   * `DemoCard3dTable` fiber for that zone).
   */
  const [stripPrimitiveIds, setStripPrimitiveIds] = useState(() => new Set<string>());
  const [handPrimitiveIds, setHandPrimitiveIds] = useState(() => new Set<string>());
  const [battlefieldPrimitiveIds, setBattlefieldPrimitiveIds] = useState(
    () => new Set<string>()
  );
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
  stripPlaneDragRef.current = stripPlaneDrag;

  const visibleP1DeckIds = useMemo(() => {
    if (deckFlight?.playerId === "p1") {
      return deckIds.filter((id) => id !== deckFlight.cardId);
    }
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.deck &&
      zoneFlight.playerId === "p1"
    ) {
      return deckIds.filter((id) => id !== zoneFlight.cardId);
    }
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.toZone === demoZones.deck &&
      zoneFlight.playerId === "p1" &&
      !deckIds.includes(zoneFlight.cardId)
    ) {
      return uniqueIdsPreserveOrder([...deckIds, zoneFlight.cardId]);
    }
    return deckIds;
  }, [deckFlight, deckIds, zoneFlight]);

  const visibleP2DeckIds = useMemo(() => {
    if (deckFlight?.playerId === "p2") {
      return opponentDeckIds.filter((id) => id !== deckFlight.cardId);
    }
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.fromZone === demoZones.p2Deck &&
      zoneFlight.playerId === "p2"
    ) {
      return opponentDeckIds.filter((id) => id !== zoneFlight.cardId);
    }
    if (
      zoneFlight?.kind === "relocate" &&
      zoneFlight.toZone === demoZones.p2Deck &&
      zoneFlight.playerId === "p2" &&
      !opponentDeckIds.includes(zoneFlight.cardId)
    ) {
      return uniqueIdsPreserveOrder([
        ...opponentDeckIds,
        zoneFlight.cardId,
      ]);
    }
    return opponentDeckIds;
  }, [deckFlight, opponentDeckIds, zoneFlight]);

  const isFaceUp = useCallback(
    (id: string) =>
      logicalFaceUpForCard(id, findZoneIdForCard(engine.state, id), faceUpById),
    [faceUpById, engine.state]
  );

  const toggleFace = useCallback((id: string) => {
    setFaceUpById((prev) => {
      const z = findZoneIdForCard(getEngineState(), id);
      let cur = logicalFaceUpForCard(id, z, prev);
      return { ...prev, [id]: !cur };
    });
  }, [getEngineState]);

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

  const showCardContextMenu = useCallback(
    (cardId: string, point: CardContextMenuPoint) => {
      setSelectedId(cardId);
      setCardContextMenu({ cardId, ...point });
      push(`context menu — ${cardId}`);
    },
    [push]
  );

  /** Shared by Alt+shortcut and context menu “next zone”. */
  const performAltZoneCycleForCard = useCallback(
    (cardId: string): void => {
      if (
        zoneFlightRef.current != null ||
        deckFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
        handPlaneDrag != null ||
        motionDemoActive ||
        readMode
      ) {
        push("zone cycle: ignored (animation / drag)");
        return;
      }
      const snap = getEngineState();
      const row = snap.cards[cardId];
      if (!row) {
        push(`zone cycle: unknown card ${cardId}`);
        return;
      }
      const playerId = row.controllerId;
      const fromZ = findZoneIdForCard(snap, cardId);
      if (!fromZ) {
        push(`zone cycle: ${cardId} not in a zone`);
        return;
      }
      const cycle =
        playerId === "p2" ? P2_ALT_ZONE_CYCLE : P1_ALT_ZONE_CYCLE;
      const fi = (cycle as readonly string[]).indexOf(fromZ);
      if (fi < 0) {
        push(`zone cycle: zone ${fromZ} not in cycle`);
        return;
      }
      const toZ = cycle[(fi + 1) % cycle.length]!;
      if (toZ === fromZ) {
        return;
      }
      beginRelocateFlightRef.current(cardId, toZ);
      push(`zone cycle: ${fromZ} → ${toZ} (${cardId})`);
    },
    [getEngineState, handPlaneDrag, motionDemoActive, push, readMode]
  );

  /**
   * Modifier shortcuts on any card: Shift+VFX, Alt+cycle zone. (Ctrl/Cmd+click opens context menu.)
   * @returns `true` if the event was consumed (including when ignored due to read mode / in-flight anim).
   */
  const applyCardPointerShortcuts = useCallback(
    (id: string, d: CardPointerClickDetail): boolean => {
      if (d.button !== 0) {
        return false;
      }
      if (!(d.shiftKey || d.altKey)) {
        return false;
      }
      if (readMode) {
        push("shortcut: ignored (read mode)");
        return true;
      }
      if (
        zoneFlightRef.current != null ||
        deckFlightRef.current != null ||
        stripPlaneDragRef.current != null
      ) {
        return true;
      }
      const snap = getEngineState();
      const row = snap.cards[id];
      if (!row) {
        push(`shortcut: unknown card ${id}`);
        return true;
      }
      if (d.shiftKey) {
        setSelectedId(id);
        setVfxTrigger((k) => k + 1);
        push(`shortcut: VFX — ${id}`);
      }
      if (d.altKey) {
        performAltZoneCycleForCard(id);
      }
      return true;
    },
    [getEngineState, performAltZoneCycleForCard, push, readMode]
  );

  const runMotionDemo = useCallback(() => {
    if (deckFlight != null || zoneFlightRef.current != null) {
      return;
    }
    setMotionDemoNonce((n) => n + 1);
    setMotionDemoActive(true);
    push("motion demo: CardMotion deck→hand (proxy)");
  }, [deckFlight, push]);

  const onMotionDemoComplete = useCallback(() => {
    setMotionDemoActive(false);
    push("motion demo: finished");
  }, [push]);

  const onDragTowardTableFromHand = useCallback(
    (d: HandDragTowardTableDetail) => {
      if (
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
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
    [deckFlight, push]
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
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
        deckFlightRef.current != null
      ) {
        return;
      }
      const snap = getEngineState();
      if (!getHandIds(snap).includes(cardId)) {
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
      const nextFp = [...getFrontPlayIds(snap), cardId];
      const nextOffsets = getFrontPlayVisualOffsets(
        nextFp,
        stackOnFp,
        fpStackKind
      );
      const to = {
        ...computeFrontPlayCardPoseFromVisualOffsets(cardId, nextOffsets),
        scale: tableCardInnerUniform(cardId, snap),
      };
      const { from: fromW, to: toW } = attachedFlightPoseEndpoints(from, to);
      const nextZ: ZoneFlightAnim = {
        playerId: "p1",
        cardId,
        kind: "hand-to-front",
        from: fromW,
        to: toW,
        nonce: Date.now(),
      };
      zoneFlightRef.current = nextZ;
      setZoneFlight(nextZ);
      push(`hand → front play (anim): ${cardId}`);
    },
    [engine, fpStackKind, getEngineState, push, stackOnFp]
  );

  const playOpponentHandToFrontPlay = useCallback(
    (cardId: string) => {
      if (
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
        deckFlightRef.current != null
      ) {
        return;
      }
      const snap = getEngineState();
      if (!getOpponentHandIds(snap).includes(cardId)) {
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
      const nextFp = [...getOpponentFrontPlayIds(snap), cardId];
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
        scale: tableCardInnerUniform(cardId, snap),
      };
      const { from: fromW, to: toW } = attachedFlightPoseEndpoints(from, to);
      const nextZ: ZoneFlightAnim = {
        playerId: "p2",
        cardId,
        kind: "hand-to-front",
        from: fromW,
        to: toW,
        nonce: Date.now(),
      };
      zoneFlightRef.current = nextZ;
      setZoneFlight(nextZ);
      push(`p2 hand → front play (anim): ${cardId}`);
    },
    [engine, fpStackKind, getEngineState, push, stackOnFpP2]
  );

  const returnFrontPlayToHand = useCallback(
    (cardId: string) => {
      if (
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
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
      const nextZ: ZoneFlightAnim = {
        playerId: "p1",
        cardId,
        kind: "front-to-hand",
        from: fromW,
        to: toW,
        nonce: Date.now(),
      };
      zoneFlightRef.current = nextZ;
      setZoneFlight(nextZ);
      push(`front play → hand (anim): ${cardId}`);
    },
    [deckFlight, engine, fpIds, handIds, push]
  );

  const returnOpponentFrontPlayToHand = useCallback(
    (cardId: string) => {
      if (
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
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
      const nextZ: ZoneFlightAnim = {
        playerId: "p2",
        cardId,
        kind: "front-to-hand",
        from: fromW,
        to: toW,
        nonce: Date.now(),
      };
      zoneFlightRef.current = nextZ;
      setZoneFlight(nextZ);
      push(`p2 front play → hand (anim): ${cardId}`);
    },
    [
      deckFlight,
      engine,
      fpIdsP2,
      opponentHandIds,
      push,
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
        convertCardFaceMaterialsHudToTable(child);
        if (pid === "p2") {
          setCardFlipRigY(child, 0);
        }
        mount.attach(child);
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
    } else if (z.kind === "front-to-hand") {
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
        convertCardFaceMaterialsTableToHud(child);
        applyCardLayFlatGroupHudPitch(child);
        clearStaleR3fBelow(child);
        if (pid === "p2") {
          setCardFlipRigY(child, Math.PI);
        }
        handMount.attach(child);
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
    } else if (z.kind === "relocate") {
      const fromZ = z.fromZone;
      const fromHand =
        fromZ === demoZones.hand || fromZ === demoZones.p2Hand;
      const handPrimDel = () =>
        setHandPrimitiveIds((prev) => {
          const n = new Set(prev);
          n.delete(z.cardId);
          return n;
        });
      const stripPrimDel = () =>
        setStripPrimitiveIds((prev) => {
          const n = new Set(prev);
          n.delete(z.cardId);
          return n;
        });
      const handPrimAdd = () =>
        setHandPrimitiveIds((prev) => new Set(prev).add(z.cardId));
      const stripPrimAdd = () =>
        setStripPrimitiveIds((prev) => new Set(prev).add(z.cardId));
      const bfPrimDel = () =>
        setBattlefieldPrimitiveIds((prev) => {
          const n = new Set(prev);
          n.delete(z.cardId);
          return n;
        });
      const bfPrimAdd = () =>
        setBattlefieldPrimitiveIds((prev) => new Set(prev).add(z.cardId));

      switch (z.land.t) {
        case "p1-hand": {
          const insertIdx = handDropInsertIndexFromPALocal(
            HAND_RETURN_TARGET_PA.position[0],
            getHandIds(engine.state)
          );
          const handMount = p1HandMountById.current.get(z.cardId);
          if (child && handMount) {
            convertCardFaceMaterialsTableToHud(child);
            applyCardLayFlatGroupHudPitch(child);
            clearStaleR3fBelow(child);
            setCardFlipRigY(child, 0);
            handMount.attach(child);
            cardGroupById.current.set(z.cardId, child);
            handPrimAdd();
          }
          stripPrimDel();
          engine.dispatch(
            moveCardAction("p1", z.cardId, fromZ, demoZones.hand, insertIdx)
          );
          push(`relocate → p1 hand (landed): ${z.cardId}`);
          bfPrimDel();
          break;
        }
        case "p2-hand": {
          const insertIdx = handDropInsertIndexFromPALocal(
            HAND_RETURN_TARGET_PA.position[0],
            getOpponentHandIds(engine.state)
          );
          const handMount = p2HandMountById.current.get(z.cardId);
          if (child && handMount) {
            convertCardFaceMaterialsTableToHud(child);
            applyCardLayFlatGroupHudPitch(child);
            clearStaleR3fBelow(child);
            setCardFlipRigY(child, Math.PI);
            handMount.attach(child);
            cardGroupById.current.set(z.cardId, child);
            handPrimAdd();
          }
          stripPrimDel();
          engine.dispatch(
            moveCardAction("p2", z.cardId, fromZ, demoZones.p2Hand, insertIdx)
          );
          push(`relocate → p2 hand (landed): ${z.cardId}`);
          bfPrimDel();
          break;
        }
        case "p1-strip": {
          const mount = nearFpMountById.current.get(z.cardId);
          if (child && mount) {
            if (fromHand) {
              convertCardFaceMaterialsHudToTable(child);
            }
            mount.attach(child);
            cardGroupById.current.set(z.cardId, child);
            stripPrimAdd();
          }
          handPrimDel();
          engine.dispatch(
            moveCardAction("p1", z.cardId, fromZ, demoZones.frontPlay)
          );
          push(`relocate → p1 strip (landed): ${z.cardId}`);
          bfPrimDel();
          break;
        }
        case "p2-strip": {
          const mount = farFpMountById.current.get(z.cardId);
          if (child && mount) {
            if (fromHand) {
              convertCardFaceMaterialsHudToTable(child);
            }
            setCardFlipRigY(child, 0);
            mount.attach(child);
            cardGroupById.current.set(z.cardId, child);
            stripPrimAdd();
          }
          handPrimDel();
          engine.dispatch(
            moveCardAction("p2", z.cardId, fromZ, demoZones.p2FrontPlay)
          );
          push(`relocate → p2 strip (landed): ${z.cardId}`);
          bfPrimDel();
          break;
        }
        case "bf": {
          const mount = bfMountById.current.get(z.cardId);
          if (child && mount) {
            if (fromHand) {
              convertCardFaceMaterialsHudToTable(child);
            }
            mount.attach(child);
            cardGroupById.current.set(z.cardId, child);
            bfPrimAdd();
          }
          handPrimDel();
          stripPrimDel();
          engine.dispatch(
            moveCardAction(pid, z.cardId, fromZ, demoZones.bf)
          );
          push(`relocate → battlefield (landed): ${z.cardId}`);
          break;
        }
        case "p1-gy": {
          const mount = p1GyMountById.current.get(z.cardId);
          if (child && mount) {
            if (fromHand) {
              convertCardFaceMaterialsHudToTable(child);
            }
            mount.attach(child);
            cardGroupById.current.set(z.cardId, child);
          }
          handPrimDel();
          stripPrimDel();
          engine.dispatch(
            moveCardAction("p1", z.cardId, fromZ, demoZones.gy)
          );
          push(`relocate → p1 graveyard (landed): ${z.cardId}`);
          bfPrimDel();
          break;
        }
        case "p2-gy": {
          const mount = p2GyMountById.current.get(z.cardId);
          if (child && mount) {
            if (fromHand) {
              convertCardFaceMaterialsHudToTable(child);
            }
            setCardFlipRigY(child, Math.PI);
            mount.attach(child);
            cardGroupById.current.set(z.cardId, child);
          }
          handPrimDel();
          stripPrimDel();
          engine.dispatch(
            moveCardAction("p2", z.cardId, fromZ, demoZones.p2Gy)
          );
          push(`relocate → p2 graveyard (landed): ${z.cardId}`);
          bfPrimDel();
          break;
        }
        case "p1-deck": {
          const mount = p1DeckMountById.current.get(z.cardId);
          if (child && mount) {
            if (fromHand) {
              convertCardFaceMaterialsHudToTable(child);
            }
            mount.attach(child);
            cardGroupById.current.set(z.cardId, child);
          }
          handPrimDel();
          stripPrimDel();
          engine.dispatch(
            moveCardAction("p1", z.cardId, fromZ, demoZones.deck)
          );
          push(`relocate → p1 deck (landed): ${z.cardId}`);
          bfPrimDel();
          break;
        }
        case "p2-deck": {
          const mount = p2DeckMountById.current.get(z.cardId);
          if (child && mount) {
            if (fromHand) {
              convertCardFaceMaterialsHudToTable(child);
            }
            setCardFlipRigY(child, Math.PI);
            mount.attach(child);
            cardGroupById.current.set(z.cardId, child);
          }
          handPrimDel();
          stripPrimDel();
          engine.dispatch(
            moveCardAction("p2", z.cardId, fromZ, demoZones.p2Deck)
          );
          push(`relocate → p2 deck (landed): ${z.cardId}`);
          bfPrimDel();
          break;
        }
      }
    }
    zoneFlightRef.current = null;
    setZoneFlight(null);
  }, [engine, push]);

  const beginDeckDraw = useCallback(
    (cardId: string, playerId: "p1" | "p2") => {
      if (
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
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
        setFaceUpById((prev) => ({
          ...prev,
          [cardId]: getZoneDefaultFaceUp(handZone),
        }));
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
      const nextDeck: DeckFlightAnim = {
        playerId,
        cardId,
        from: fromW,
        to: toW,
        nonce: Date.now(),
      };
      deckFlightRef.current = nextDeck;
      setDeckFlight(nextDeck);
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
      convertCardFaceMaterialsTableToHud(child);
      applyCardLayFlatGroupHudPitch(child);
      clearStaleR3fBelow(child);
      if (z.playerId === "p1") {
        setCardFlipRigY(child, 0);
      } else {
        setCardFlipRigY(child, Math.PI);
      }
      handMount.attach(child);
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
    setFaceUpById((prev) => ({
      ...prev,
      [z.cardId]: getZoneDefaultFaceUp(handZone),
    }));
    push(`${z.playerId} deck → hand (landed): ${z.cardId}`);
    deckFlightRef.current = null;
    setDeckFlight(null);
  }, [engine, push, setFaceUpById]);

  const beginRelocateFlight = useCallback(
    (cardId: string, toZone: string) => {
      if (
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
        handPlaneDrag != null ||
        deckFlight != null ||
        motionDemoActive ||
        readMode
      ) {
        return;
      }
      const snap = getEngineState();
      const row = snap.cards[cardId];
      if (!row) {
        return;
      }
      const playerId = row.controllerId;
      if (playerId !== "p1" && playerId !== "p2") {
        return;
      }
      const fromZ = findZoneIdForCard(snap, cardId);
      if (!fromZ || fromZ === toZone) {
        return;
      }
      if (!canControllerUseZone(playerId, toZone)) {
        return;
      }
      const land = landForZoneId(toZone);
      if (!land) {
        return;
      }
      const deckZ = playerId === "p1" ? demoZones.deck : demoZones.p2Deck;
      const handZ = playerId === "p1" ? demoZones.hand : demoZones.p2Hand;
      if (fromZ === deckZ && toZone === handZ) {
        beginDeckDraw(cardId, playerId);
        return;
      }

      const motionPa =
        playerId === "p1"
          ? playerAreaRef.current
          : opponentAreaRef.current;
      const shell =
        playerId === "p1"
          ? flightShellNearRef.current
          : flightShellFarRef.current;
      const g = cardGroupById.current.get(cardId);
      if (!g || !motionPa || !shell) {
        engine.dispatch(moveCardAction(playerId, cardId, fromZ, toZone));
        push(`relocate (instant): ${fromZ} → ${toZone} (${cardId})`);
        return;
      }

      const lists = zoneListsAfterMove(snap, cardId, fromZ, toZone);
      let toPose: CardSpatialPose;

      if (toZone === demoZones.hand || toZone === demoZones.p2Hand) {
        const nextHand = lists[toZone] ?? [];
        const slotIdx = nextHand.indexOf(cardId);
        const handPlayer: "p1" | "p2" =
          toZone === demoZones.hand ? "p1" : "p2";
        let toHud = computeViewportHandSlotPosePA(
          slotIdx,
          nextHand.length,
          handPlayer
        );
        const hudRoot =
          handPlayer === "p1"
            ? viewportP1HandHudRef.current
            : viewportP2HandHudRef.current;
        const paForHud =
          handPlayer === "p1"
            ? playerAreaRef.current
            : opponentAreaRef.current;
        if (hudRoot && paForHud) {
          toHud = mapHandPaPoseToPlayerAreaMotionSpace(
            toHud,
            hudRoot,
            paForHud
          );
        }
        toPose = {
          ...toHud,
          scale: viewportHandInnerUniform(cardId, snap, handPlayer),
        };
        if (paForHud && paForHud !== motionPa) {
          toPose = reexpressSpatialPoseInAncestor(
            toPose,
            paForHud,
            motionPa
          );
        }
      } else {
        const bfg = battlefieldGroupRef.current;
        const p1gy = p1GyPileRootRef.current;
        const p2gy = p2GyPileRootRef.current;
        const p1d = p1DeckStackRootRef.current;
        const p2d = p2DeckStackRootRef.current;
        if (!bfg || !p1gy || !p2gy || !p1d || !p2d) {
          engine.dispatch(moveCardAction(playerId, cardId, fromZ, toZone));
          push(
            `relocate (instant, layout refs): ${fromZ} → ${toZone} (${cardId})`
          );
          return;
        }
        toPose = computeRelocateTargetPose({
          cardId,
          toZone,
          lists,
          playerArea: motionPa,
          stackOnFp,
          stackOnFpP2,
          fpStackKind,
          battlefieldGroup: bfg,
          p1GyGroup: p1gy,
          p2GyGroup: p2gy,
          p1DeckStackGroup: p1d,
          p2DeckStackGroup: p2d,
          tableCardScale: tableCardInnerUniform(cardId, snap),
        });
      }

      const from = sampleCardSpatialPoseInAncestor(g, motionPa);
      const { from: fromW, to: toW } = attachedFlightPoseEndpoints(
        from,
        toPose
      );

      if (fromZ === demoZones.hand || fromZ === demoZones.p2Hand) {
        setHandPrimitiveIds((prev) => {
          const n = new Set(prev);
          n.delete(cardId);
          return n;
        });
      }
      if (fromZ === demoZones.frontPlay || fromZ === demoZones.p2FrontPlay) {
        setStripPrimitiveIds((prev) => {
          const n = new Set(prev);
          n.delete(cardId);
          return n;
        });
      }

      shell.attach(g);

      const nextZ: ZoneFlightAnim = {
        playerId,
        cardId,
        kind: "relocate",
        fromZone: fromZ,
        toZone,
        land,
        from: fromW,
        to: toW,
        nonce: Date.now(),
      };
      zoneFlightRef.current = nextZ;
      setZoneFlight(nextZ);
      push(`relocate (anim): ${fromZ} → ${toZone} (${cardId})`);
    },
    [
      beginDeckDraw,
      deckFlight,
      engine,
      getEngineState,
      handPlaneDrag,
      motionDemoActive,
      fpStackKind,
      push,
      readMode,
      stackOnFp,
      stackOnFpP2,
    ]
  );

  beginRelocateFlightRef.current = beginRelocateFlight;

  const attachedPilotFlight = useMemo(() => {
    const logical = (cardId: string, zoneId: string | null) =>
      logicalFaceUpForCard(cardId, zoneId, faceUpById);

    if (deckFlight) {
      const deckZ =
        deckFlight.playerId === "p1" ? demoZones.deck : demoZones.p2Deck;
      const handZ =
        deckFlight.playerId === "p1" ? demoZones.hand : demoZones.p2Hand;
      return {
        playerId: deckFlight.playerId,
        from: deckFlight.from,
        to: deckFlight.to,
        nonce: deckFlight.nonce,
        layFlatPitchFrom: cardLayFlatTableRx,
        layFlatPitchTo: cardLayFlatHudRx,
        flipRYFrom: cardFlipRigYInZone(
          deckFlight.playerId,
          deckZ,
          logical(deckFlight.cardId, deckZ)
        ),
        flipRYTo: cardFlipRigYInZone(
          deckFlight.playerId,
          handZ,
          logical(deckFlight.cardId, handZ)
        ),
      };
    }
    if (
      zoneFlight &&
      (zoneFlight.kind === "hand-to-front" ||
        zoneFlight.kind === "front-to-hand")
    ) {
      const handToFront = zoneFlight.kind === "hand-to-front";
      const pid = zoneFlight.playerId;
      const fromZ = handToFront
        ? pid === "p1"
          ? demoZones.hand
          : demoZones.p2Hand
        : pid === "p1"
          ? demoZones.frontPlay
          : demoZones.p2FrontPlay;
      const toZ = handToFront
        ? pid === "p1"
          ? demoZones.frontPlay
          : demoZones.p2FrontPlay
        : pid === "p1"
          ? demoZones.hand
          : demoZones.p2Hand;
      return {
        playerId: pid,
        from: zoneFlight.from,
        to: zoneFlight.to,
        nonce: zoneFlight.nonce,
        layFlatPitchFrom: handToFront ? cardLayFlatHudRx : cardLayFlatTableRx,
        layFlatPitchTo: handToFront ? cardLayFlatTableRx : cardLayFlatHudRx,
        flipRYFrom: cardFlipRigYInZone(
          pid,
          fromZ,
          logical(zoneFlight.cardId, fromZ)
        ),
        flipRYTo: cardFlipRigYInZone(pid, toZ, logical(zoneFlight.cardId, toZ)),
      };
    }
    if (zoneFlight && zoneFlight.kind === "relocate") {
      const fromHand =
        zoneFlight.fromZone === demoZones.hand ||
        zoneFlight.fromZone === demoZones.p2Hand;
      const toHand =
        zoneFlight.toZone === demoZones.hand ||
        zoneFlight.toZone === demoZones.p2Hand;
      const pid = zoneFlight.playerId;
      return {
        playerId: pid,
        from: zoneFlight.from,
        to: zoneFlight.to,
        nonce: zoneFlight.nonce,
        layFlatPitchFrom: fromHand ? cardLayFlatHudRx : cardLayFlatTableRx,
        layFlatPitchTo: toHand ? cardLayFlatHudRx : cardLayFlatTableRx,
        flipRYFrom: cardFlipRigYInZone(
          pid,
          zoneFlight.fromZone,
          logical(zoneFlight.cardId, zoneFlight.fromZone)
        ),
        flipRYTo: cardFlipRigYInZone(
          pid,
          zoneFlight.toZone,
          logical(zoneFlight.cardId, zoneFlight.toZone)
        ),
      };
    }
    return null;
  }, [deckFlight, zoneFlight, faceUpById]);

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
      (zoneFlight.kind === "hand-to-front" ||
        (zoneFlight.kind === "relocate" &&
          zoneFlight.toZone === demoZones.frontPlay))
    ) {
      return layoutFpIds.filter((id) => id !== zoneFlight.cardId);
    }
    return layoutFpIds;
  }, [layoutFpIds, zoneFlight]);

  const visibleFpIdsP2 = useMemo(() => {
    if (
      zoneFlight?.playerId === "p2" &&
      (zoneFlight.kind === "hand-to-front" ||
        (zoneFlight.kind === "relocate" &&
          zoneFlight.toZone === demoZones.p2FrontPlay))
    ) {
      return layoutFpIdsP2.filter((id) => id !== zoneFlight.cardId);
    }
    return layoutFpIdsP2;
  }, [layoutFpIdsP2, zoneFlight]);

  const cardContextRelocateTargets = useMemo(() => {
    if (!cardContextMenu) {
      return [];
    }
    const snap = getEngineState();
    const fromZ = findZoneIdForCard(snap, cardContextMenu.cardId);
    const row = snap.cards[cardContextMenu.cardId];
    if (!fromZ || !row) {
      return [];
    }
    const pid = row.controllerId;
    if (pid !== "p1" && pid !== "p2") {
      return [];
    }
    return RELOCATE_ZONE_OPTIONS.filter(
      (o) => o.id !== fromZ && canControllerUseZone(pid, o.id)
    ).map((o) => ({ zoneId: o.id, label: o.label }));
  }, [cardContextMenu, engine.state, getEngineState]);

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
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
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
        /** ~20px slop — avoids starting strip drag on small motion during double-clicks. */
        if (dx * dx + dy * dy > 400) {
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
        if (stripDragActivated) {
          return;
        }
        const detail = pointerDetailFromPointerEvent(ev);
        if (detail.button === 0 && (detail.ctrlKey || detail.metaKey)) {
          showCardContextMenu(fid, {
            clientX: ev.clientX,
            clientY: ev.clientY,
          });
          return;
        }
        if (applyCardPointerShortcuts(fid, detail)) {
          return;
        }
        returnFrontPlayToHand(fid);
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
      applyCardPointerShortcuts,
      deckFlight,
      handPlaneDrag,
      returnFrontPlayToHand,
      showCardContextMenu,
    ]
  );

  /**
   * Double-click return: primitives had no `onCardDoubleClick`; also clears accidental strip drag
   * so `returnFrontPlayToHand` is not blocked by stale React state before the next paint.
   */
  const onFrontPlayStripDoubleClick = useCallback(
    (fid: string) => {
      if (stripPlaneDragRef.current?.cardId === fid) {
        stripDragCardRef.current = null;
        lastStripDragLocal.current = null;
        stripGhostPosRef.current = null;
        stripPlaneDragRef.current = null;
        setStripPlaneDrag(null);
      }
      returnFrontPlayToHand(fid);
    },
    [returnFrontPlayToHand]
  );

  const onOpponentPlayStripDoubleClick = useCallback(
    (fid: string) => {
      if (stripPlaneDragRef.current?.cardId === fid) {
        stripDragCardRef.current = null;
        lastStripDragLocal.current = null;
        stripGhostPosRef.current = null;
        stripPlaneDragRef.current = null;
        setStripPlaneDrag(null);
      }
      returnOpponentFrontPlayToHand(fid);
    },
    [returnOpponentFrontPlayToHand]
  );

  /** Same tap-to-return as {@link onFrontPlayCardPointerDown} for the far strip (no p1 strip drag). */
  const onOpponentFrontPlayCardPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>, fid: string) => {
      if (
        zoneFlightRef.current != null ||
        stripPlaneDragRef.current != null ||
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
      let dragActivated = false;
      let cleaned = false;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) {
          return;
        }
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy > 400) {
          dragActivated = true;
          cleanup();
        }
      };
      const onEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) {
          return;
        }
        cleanup();
        if (dragActivated) {
          return;
        }
        const detail = pointerDetailFromPointerEvent(ev);
        if (detail.button === 0 && (detail.ctrlKey || detail.metaKey)) {
          showCardContextMenu(fid, {
            clientX: ev.clientX,
            clientY: ev.clientY,
          });
          return;
        }
        if (applyCardPointerShortcuts(fid, detail)) {
          return;
        }
        returnOpponentFrontPlayToHand(fid);
      };
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
      applyCardPointerShortcuts,
      deckFlight,
      handPlaneDrag,
      returnOpponentFrontPlayToHand,
      showCardContextMenu,
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
        const sid = selectedId ?? "c-hand-3";
        const card = engine.getState().cards[sid];
        if (card) {
          engine.dispatch(toggleCardTappedAction(card.controllerId, sid));
          push(`tap toggle ${sid}`);
        }
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
  }, [
    engine,
    flipSelected,
    push,
    readMode,
    runMotionDemo,
    selectedId,
    showReadCard,
    settingsDrawerOpen,
  ]);

  const events: CardInteractionEvents = useMemo(
    () => ({
      onCardHover: (id) => push(`hover ${id}`),
      onCardDragStart: (id) => push(`drag start ${id}`),
      onCardDrag: (id, p) =>
        push(`drag ${id} [${p.map((n) => n.toFixed(2)).join(", ")}]`),
      onCardDrop: (id, z) => push(`drop ${id} → ${z}`),
      onCardFlip: (id) => push(`flip done ${id}`),
      onCardTap: (id, detail) => {
        if (applyCardPointerShortcuts(id, detail)) {
          return;
        }
        if (detail.button !== 0) {
          return;
        }
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
      onCardContextMenu: (id, point) => {
        showCardContextMenu(id, point);
      },
    }),
    [applyCardPointerShortcuts, beginDeckDraw, push, showCardContextMenu]
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
          ghosted={!!ghostedCardIds[id]}
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
    [
      DRAG_CARD_ID,
      engine.state,
      ghostedCardIds,
      isFaceUp,
      oneHighlight,
      toggleFace,
      events,
    ]
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
        <TableTiltAxesGizmo tilt={tableTilt} visible={axesLabelsOn} />

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
                defaultFaceUp={getZoneDefaultFaceUp(demoZones.frontPlay)}
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
                        <>
                          <primitive
                            object={cardGroupById.current.get(fid)!}
                            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                              const ne = e.nativeEvent;
                              if (
                                ne.button === 2 ||
                                (ne.button === 0 &&
                                  (ne.ctrlKey || ne.metaKey))
                              ) {
                                e.stopPropagation();
                                ne.preventDefault();
                                showCardContextMenu(fid, {
                                  clientX: ne.clientX,
                                  clientY: ne.clientY,
                                });
                                return;
                              }
                              onFrontPlayCardPointerDown(e, fid);
                            }}
                            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
                              e.stopPropagation();
                              e.nativeEvent.preventDefault();
                              showCardContextMenu(fid, {
                                clientX: e.nativeEvent.clientX,
                                clientY: e.nativeEvent.clientY,
                              });
                            }}
                            onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                              e.stopPropagation();
                              onFrontPlayStripDoubleClick(fid);
                            }}
                          />
                          <SelectedCardVfxOverlay
                            cardId={fid}
                            selectedId={selectedId}
                            vfxKind={vfxKind}
                            vfxTrigger={vfxTrigger}
                            state={engine.state}
                            faceAlign
                          />
                        </>
                      ) : visibleFpIds.includes(fid) ? (
                        <>
                          <DemoCard3dTable
                            id={fid}
                            state={engine.state}
                            setCardGroupRef={setCardGroupRef}
                            isFaceUp={isFaceUp}
                            selectedId={selectedId}
                            inPlay={inPlay}
                            onToggleFace={toggleFace}
                            oneHighlight={oneHighlight}
                            ghosted={!!ghostedCardIds[fid]}
                            onCardPointerDown={(e) =>
                              onFrontPlayCardPointerDown(e, fid)
                            }
                            onCardDoubleClick={() =>
                              onFrontPlayStripDoubleClick(fid)
                            }
                            pointerTilt={false}
                          />
                          <SelectedCardVfxOverlay
                            cardId={fid}
                            selectedId={selectedId}
                            vfxKind={vfxKind}
                            vfxTrigger={vfxTrigger}
                            state={engine.state}
                            faceAlign
                          />
                        </>
                      ) : null}
                    </group>
                  ))}
                </group>
              </Zone>

              {/**
               * Zone flights must keep the card under this shell via declarative `<primitive>` so R3F
               * does not remove the mesh when the strip/hand unmounts their primitive (imperative
               * `attach` alone left `shell.children[0]` empty — no pilot, no animation).
               */}
              <group ref={flightShellNearRef} renderOrder={43}>
                {zoneFlight?.playerId === "p1" &&
                (zoneFlight.kind === "hand-to-front" ||
                  zoneFlight.kind === "front-to-hand" ||
                  zoneFlight.kind === "relocate") &&
                cardGroupById.current.get(zoneFlight.cardId) ? (
                  <primitive
                    key={zoneFlight.nonce}
                    object={cardGroupById.current.get(zoneFlight.cardId)!}
                  />
                ) : null}
              </group>
              <AttachedFlightPilot
                flight={attachedPilotFlight}
                shellNearRef={flightShellNearRef}
                shellFarRef={flightShellFarRef}
                onComplete={finishAttachedFlight}
              />

              <DeckZone
                id="p1-deck"
                defaultFaceUp={getZoneDefaultFaceUp(demoZones.deck)}
                position={[-4.2, 0, 0.2]}
              >
                <CardStack ref={p1DeckStackRootRef} yStep={0.025}>
                  {visibleP1DeckIds.map((did) => {
                    const hideFlyingToDeck =
                      zoneFlight?.kind === "relocate" &&
                      zoneFlight.toZone === demoZones.deck &&
                      zoneFlight.cardId === did;
                    return (
                      <group key={did} ref={setP1DeckMountRef(did)}>
                        {hideFlyingToDeck ? null : (
                          <>
                            <DemoCard3dTable
                              id={did}
                              state={engine.state}
                              setCardGroupRef={setCardGroupRef}
                              isFaceUp={isFaceUp}
                              selectedId={selectedId}
                              inPlay={inPlay}
                              onToggleFace={toggleFace}
                              oneHighlight={oneHighlight}
                              ghosted={!!ghostedCardIds[did]}
                              pointerTilt={false}
                            />
                            <SelectedCardVfxOverlay
                              cardId={did}
                              selectedId={selectedId}
                              vfxKind={vfxKind}
                              vfxTrigger={vfxTrigger}
                              state={engine.state}
                              faceAlign
                            />
                          </>
                        )}
                      </group>
                    );
                  })}
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
                  {(m: { faceUp: boolean }) => (
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
                defaultFaceUp={getZoneDefaultFaceUp(demoZones.gy)}
                position={[...GRAVEYARD_ZONE_PA_POSITION]}
              >
                <CardPile ref={p1GyPileRootRef}>
                  {layoutGyIds.map((gid) => {
                    const hideFlyingToGy =
                      zoneFlight?.kind === "relocate" &&
                      zoneFlight.toZone === demoZones.gy &&
                      zoneFlight.cardId === gid;
                    return (
                      <group key={gid} ref={setP1GyMountRef(gid)}>
                        {hideFlyingToGy ? null : (
                          <>
                            <DemoCard3dTable
                              id={gid}
                              state={engine.state}
                              setCardGroupRef={setCardGroupRef}
                              isFaceUp={isFaceUp}
                              selectedId={selectedId}
                              inPlay={inPlay}
                              onToggleFace={toggleFace}
                              oneHighlight={oneHighlight}
                              ghosted={!!ghostedCardIds[gid]}
                            />
                            <SelectedCardVfxOverlay
                              cardId={gid}
                              selectedId={selectedId}
                              vfxKind={vfxKind}
                              vfxTrigger={vfxTrigger}
                              state={engine.state}
                              faceAlign
                            />
                          </>
                        )}
                      </group>
                    );
                  })}
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
                    ghosted={!!ghostedCardIds[handPlaneDrag.cardId]}
                    pickDisabled
                    pointerTilt={false}
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
                    ghosted={!!ghostedCardIds[stripPlaneDrag.cardId]}
                    pickDisabled
                    pointerTilt={false}
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
                defaultFaceUp={getZoneDefaultFaceUp(demoZones.p2FrontPlay)}
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
                        <>
                          <primitive
                            object={cardGroupById.current.get(fid)!}
                            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                              const ne = e.nativeEvent;
                              if (
                                ne.button === 2 ||
                                (ne.button === 0 &&
                                  (ne.ctrlKey || ne.metaKey))
                              ) {
                                e.stopPropagation();
                                ne.preventDefault();
                                showCardContextMenu(fid, {
                                  clientX: ne.clientX,
                                  clientY: ne.clientY,
                                });
                                return;
                              }
                              onOpponentFrontPlayCardPointerDown(e, fid);
                            }}
                            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
                              e.stopPropagation();
                              e.nativeEvent.preventDefault();
                              showCardContextMenu(fid, {
                                clientX: e.nativeEvent.clientX,
                                clientY: e.nativeEvent.clientY,
                              });
                            }}
                            onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                              e.stopPropagation();
                              onOpponentPlayStripDoubleClick(fid);
                            }}
                          />
                          <SelectedCardVfxOverlay
                            cardId={fid}
                            selectedId={selectedId}
                            vfxKind={vfxKind}
                            vfxTrigger={vfxTrigger}
                            state={engine.state}
                            faceAlign
                          />
                        </>
                      ) : visibleFpIdsP2.includes(fid) ? (
                        <>
                          <DemoCard3dTable
                            id={fid}
                            state={engine.state}
                            setCardGroupRef={setCardGroupRef}
                            isFaceUp={isFaceUp}
                            selectedId={selectedId}
                            inPlay={inPlay}
                            onToggleFace={toggleFace}
                            oneHighlight={oneHighlight}
                            ghosted={!!ghostedCardIds[fid]}
                            opponentReadableOrientation
                            onCardPointerDown={(e) =>
                              onOpponentFrontPlayCardPointerDown(e, fid)
                            }
                            onCardDoubleClick={() =>
                              onOpponentPlayStripDoubleClick(fid)
                            }
                            pointerTilt={false}
                          />
                          <SelectedCardVfxOverlay
                            cardId={fid}
                            selectedId={selectedId}
                            vfxKind={vfxKind}
                            vfxTrigger={vfxTrigger}
                            state={engine.state}
                            faceAlign
                          />
                        </>
                      ) : null}
                    </group>
                  ))}
                </group>
              </Zone>

              <group ref={flightShellFarRef} renderOrder={43}>
                {zoneFlight?.playerId === "p2" &&
                (zoneFlight.kind === "hand-to-front" ||
                  zoneFlight.kind === "front-to-hand" ||
                  zoneFlight.kind === "relocate") &&
                cardGroupById.current.get(zoneFlight.cardId) ? (
                  <primitive
                    key={zoneFlight.nonce}
                    object={cardGroupById.current.get(zoneFlight.cardId)!}
                  />
                ) : null}
              </group>

              <DeckZone
                id="p2-deck"
                defaultFaceUp={getZoneDefaultFaceUp(demoZones.p2Deck)}
                position={[-4.2, 0, 0.2]}
              >
                <CardStack ref={p2DeckStackRootRef} yStep={0.025}>
                  {visibleP2DeckIds.map((did) => {
                    const hideFlyingToDeck =
                      zoneFlight?.kind === "relocate" &&
                      zoneFlight.toZone === demoZones.p2Deck &&
                      zoneFlight.cardId === did;
                    return (
                      <group key={did} ref={setP2DeckMountRef(did)}>
                        {hideFlyingToDeck ? null : (
                          <>
                            <DemoCard3dTable
                              id={did}
                              state={engine.state}
                              setCardGroupRef={setCardGroupRef}
                              isFaceUp={isFaceUp}
                              selectedId={selectedId}
                              inPlay={inPlay}
                              onToggleFace={toggleFace}
                              oneHighlight={oneHighlight}
                              ghosted={!!ghostedCardIds[did]}
                              opponentReadableOrientation
                              pointerTilt={false}
                            />
                            <SelectedCardVfxOverlay
                              cardId={did}
                              selectedId={selectedId}
                              vfxKind={vfxKind}
                              vfxTrigger={vfxTrigger}
                              state={engine.state}
                              faceAlign
                            />
                          </>
                        )}
                      </group>
                    );
                  })}
                </CardStack>
              </DeckZone>

              <GraveyardZone
                id="p2-grave"
                defaultFaceUp={getZoneDefaultFaceUp(demoZones.p2Gy)}
                position={[...GRAVEYARD_ZONE_PA_POSITION]}
              >
                <CardPile ref={p2GyPileRootRef}>
                  {layoutGyIdsP2.map((gid) => {
                    const hideFlyingToGy =
                      zoneFlight?.kind === "relocate" &&
                      zoneFlight.toZone === demoZones.p2Gy &&
                      zoneFlight.cardId === gid;
                    return (
                      <group key={gid} ref={setP2GyMountRef(gid)}>
                        {hideFlyingToGy ? null : (
                          <>
                            <DemoCard3dTable
                              id={gid}
                              state={engine.state}
                              setCardGroupRef={setCardGroupRef}
                              isFaceUp={isFaceUp}
                              selectedId={selectedId}
                              inPlay={inPlay}
                              onToggleFace={toggleFace}
                              oneHighlight={oneHighlight}
                              ghosted={!!ghostedCardIds[gid]}
                              opponentReadableOrientation
                            />
                            <SelectedCardVfxOverlay
                              cardId={gid}
                              selectedId={selectedId}
                              vfxKind={vfxKind}
                              vfxTrigger={vfxTrigger}
                              state={engine.state}
                              faceAlign
                            />
                          </>
                        )}
                      </group>
                    );
                  })}
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

            <BattlefieldZone
              id="battlefield"
              defaultFaceUp={getZoneDefaultFaceUp(demoZones.bf)}
              position={[0, 0, -0.5]}
            >
              <group ref={battlefieldGroupRef}>
                {layoutBfIds.map((bid) => {
                  const pos =
                    bid === DRAG_CARD_ID
                      ? bf2Pos
                      : bfOffsets[bid] ??
                        getBattlefieldLocalPosition(
                          bid,
                          layoutBfIds,
                          bf2Pos
                        );
                  const hideFlyingToBf =
                    zoneFlight?.kind === "relocate" &&
                    zoneFlight.toZone === demoZones.bf &&
                    zoneFlight.cardId === bid;
                  return (
                    <group
                      key={bid}
                      ref={setBfMountRef(bid)}
                      position={pos}
                    >
                      {hideFlyingToBf ? null : battlefieldPrimitiveIds.has(
                          bid
                        ) ? (
                        <>
                          <primitive
                            object={cardGroupById.current.get(bid)!}
                            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                              const ne = e.nativeEvent;
                              if (
                                ne.button === 2 ||
                                (ne.button === 0 &&
                                  (ne.ctrlKey || ne.metaKey))
                              ) {
                                e.stopPropagation();
                                ne.preventDefault();
                                showCardContextMenu(bid, {
                                  clientX: ne.clientX,
                                  clientY: ne.clientY,
                                });
                                return;
                              }
                              if (bid === DRAG_CARD_ID) {
                                setDragId(DRAG_CARD_ID);
                                events.onCardDragStart(DRAG_CARD_ID);
                              }
                            }}
                            onClick={(e: ThreeEvent<MouseEvent>) => {
                              e.stopPropagation();
                              const ne = e.nativeEvent as MouseEvent;
                              if (
                                ne.button === 0 &&
                                (ne.ctrlKey || ne.metaKey)
                              ) {
                                return;
                              }
                              events.onCardTap(bid, {
                                button: ne.button,
                                shiftKey: ne.shiftKey,
                                altKey: ne.altKey,
                                metaKey: ne.metaKey,
                                ctrlKey: ne.ctrlKey,
                              });
                              events.onCardSelect(bid);
                            }}
                            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
                              e.stopPropagation();
                              e.nativeEvent.preventDefault();
                              showCardContextMenu(bid, {
                                clientX: e.nativeEvent.clientX,
                                clientY: e.nativeEvent.clientY,
                              });
                            }}
                            onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                              e.stopPropagation();
                              toggleFace(bid);
                            }}
                          />
                          <SelectedCardVfxOverlay
                            cardId={bid}
                            selectedId={selectedId}
                            vfxKind={vfxKind}
                            vfxTrigger={vfxTrigger}
                            state={engine.state}
                            faceAlign
                          />
                        </>
                      ) : (
                        <>
                          <DemoCard3dTable
                            id={bid}
                            state={engine.state}
                            setCardGroupRef={setCardGroupRef}
                            isFaceUp={isFaceUp}
                            selectedId={selectedId}
                            inPlay={inPlay}
                            onToggleFace={toggleFace}
                            oneHighlight={oneHighlight}
                            ghosted={!!ghostedCardIds[bid]}
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
                          <SelectedCardVfxOverlay
                            cardId={bid}
                            selectedId={selectedId}
                            vfxKind={vfxKind}
                            vfxTrigger={vfxTrigger}
                            state={engine.state}
                            faceAlign
                          />
                        </>
                      )}
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

        <Suspense fallback={null}>
          <CameraAttachedHandsRoot>
            <group ref={viewportP1HandHudRef} position={[0, -1.35, -5.2]}>
              <HandZone
                id="p1-hand"
                defaultFaceUp={getZoneDefaultFaceUp(demoZones.hand)}
                position={[-0.2, 0, 1.1]}
              >
                <ReorderableCardFan
                  cardIds={layoutHandIdsForFan}
                  layoutHardSnapCardIds={layoutHardSnapHandP1}
                  onHandOrderChange={onHandOrderChange}
                  handZoneId={demoZones.hand}
                  onDragTowardTable={onDragTowardTableFromHand}
                  reorderDamping={7}
                  previewIndexDamping={6.5}
                  renderCard={(hid) => (
                    <group ref={setP1HandMountRef(hid)}>
                      {handPrimitiveIds.has(hid) ? (
                        (() => {
                          const root = cardGroupById.current.get(hid);
                          return root ? (
                            <>
                              <HandHudCardPrimitive
                                object={root}
                                ghosted={!!ghostedCardIds[hid]}
                                faceUpLogical={isFaceUp(hid)}
                                pointerTilt={false}
                                disabled={hid === "c-hand-4"}
                                onRequestCardMenu={(cx, cy) =>
                                  showCardContextMenu(hid, {
                                    clientX: cx,
                                    clientY: cy,
                                  })
                                }
                                onClick={(e: ThreeEvent<MouseEvent>) => {
                                  e.stopPropagation();
                                  const ne = e.nativeEvent as MouseEvent;
                                  if (ne.detail === 2) {
                                    playHandToFrontPlay(hid);
                                    return;
                                  }
                                  if (
                                    ne.button === 0 &&
                                    (ne.ctrlKey || ne.metaKey)
                                  ) {
                                    return;
                                  }
                                  events.onCardTap(hid, {
                                    button: ne.button,
                                    shiftKey: ne.shiftKey,
                                    altKey: ne.altKey,
                                    metaKey: ne.metaKey,
                                    ctrlKey: ne.ctrlKey,
                                  });
                                  events.onCardSelect(hid);
                                }}
                              />
                              <SelectedCardVfxOverlay
                                cardId={hid}
                                selectedId={selectedId}
                                vfxKind={vfxKind}
                                vfxTrigger={vfxTrigger}
                                state={engine.state}
                                faceAlign={false}
                              />
                            </>
                          ) : null;
                        })()
                      ) : zoneFlight?.playerId === "p1" &&
                        hid === zoneFlight.cardId &&
                        (zoneFlight.kind === "front-to-hand" ||
                          (zoneFlight.kind === "relocate" &&
                            zoneFlight.toZone === demoZones.hand)) ? null : deckFlight?.playerId ===
                            "p1" && hid === deckFlight.cardId ? null : (
                        <>
                          <DemoCard3dTable
                            id={hid}
                            state={engine.state}
                            setCardGroupRef={setCardGroupRef}
                            isFaceUp={isFaceUp}
                            selectedId={selectedId}
                            inPlay={inPlay}
                            onToggleFace={toggleFace}
                            oneHighlight={oneHighlight}
                            ghosted={!!ghostedCardIds[hid]}
                            viewportScreenFlat
                            pointerTilt={false}
                            onCardDoubleClick={() => playHandToFrontPlay(hid)}
                          />
                          <SelectedCardVfxOverlay
                            cardId={hid}
                            selectedId={selectedId}
                            vfxKind={vfxKind}
                            vfxTrigger={vfxTrigger}
                            state={engine.state}
                            faceAlign={false}
                          />
                        </>
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
              <HandZone
                id="p2-hand"
                defaultFaceUp={getZoneDefaultFaceUp(demoZones.p2Hand)}
                position={[-0.2, 0, 1.1]}
              >
                <ReorderableCardFan
                  cardIds={layoutHandIdsForFanP2}
                  layoutHardSnapCardIds={layoutHardSnapHandP2}
                  onHandOrderChange={onHandOrderChangeP2}
                  handZoneId={demoZones.p2Hand}
                  renderCard={(hid) => (
                    <group ref={setP2HandMountRef(hid)}>
                      {handPrimitiveIds.has(hid) ? (
                        (() => {
                          const root = cardGroupById.current.get(hid);
                          return root ? (
                            <>
                              <HandHudCardPrimitive
                                object={root}
                                ghosted={!!ghostedCardIds[hid]}
                                faceUpLogical={faceUpById[hid] ?? false}
                                hoverLift={VIEWPORT_HAND_HOVER_LIFT_OPPONENT}
                                pointerTilt
                                onRequestCardMenu={(cx, cy) =>
                                  showCardContextMenu(hid, {
                                    clientX: cx,
                                    clientY: cy,
                                  })
                                }
                                onClick={(e: ThreeEvent<MouseEvent>) => {
                                  e.stopPropagation();
                                  const ne = e.nativeEvent as MouseEvent;
                                  if (ne.detail === 2) {
                                    playOpponentHandToFrontPlay(hid);
                                    return;
                                  }
                                  if (
                                    ne.button === 0 &&
                                    (ne.ctrlKey || ne.metaKey)
                                  ) {
                                    return;
                                  }
                                  events.onCardTap(hid, {
                                    button: ne.button,
                                    shiftKey: ne.shiftKey,
                                    altKey: ne.altKey,
                                    metaKey: ne.metaKey,
                                    ctrlKey: ne.ctrlKey,
                                  });
                                  events.onCardSelect(hid);
                                }}
                              />
                              <SelectedCardVfxOverlay
                                cardId={hid}
                                selectedId={selectedId}
                                vfxKind={vfxKind}
                                vfxTrigger={vfxTrigger}
                                state={engine.state}
                                faceAlign={false}
                              />
                            </>
                          ) : null;
                        })()
                      ) : deckFlight?.playerId === "p2" &&
                        hid === deckFlight.cardId ? null : zoneFlight?.playerId ===
                            "p2" &&
                          zoneFlight.kind === "hand-to-front" &&
                          hid === zoneFlight.cardId ? null : zoneFlight?.playerId ===
                            "p2" &&
                          hid === zoneFlight.cardId &&
                          (zoneFlight.kind === "front-to-hand" ||
                            (zoneFlight.kind === "relocate" &&
                              zoneFlight.toZone === demoZones.p2Hand)) ? null : (
                        <>
                          <DemoCard3dTable
                            id={hid}
                            state={engine.state}
                            setCardGroupRef={setCardGroupRef}
                            isFaceUp={isFaceUp}
                            selectedId={selectedId}
                            inPlay={inPlay}
                            onToggleFace={toggleFace}
                            oneHighlight={oneHighlight}
                            ghosted={!!ghostedCardIds[hid]}
                            viewportScreenFlat
                            pointerTilt
                            viewportFlatScale={VIEWPORT_HAND_SCALE_OPPONENT}
                            hoverLift={VIEWPORT_HAND_HOVER_LIFT_OPPONENT}
                            hideCardFace
                            concealedFaceById={faceUpById}
                            onCardDoubleClick={() =>
                              playOpponentHandToFrontPlay(hid)
                            }
                          />
                          <SelectedCardVfxOverlay
                            cardId={hid}
                            selectedId={selectedId}
                            vfxKind={vfxKind}
                            vfxTrigger={vfxTrigger}
                            state={engine.state}
                            faceAlign={false}
                          />
                        </>
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
        </TCGLCanvas>

        {cardContextMenu ? (
          <DemoCardContextMenu
            key={cardContextMenu.cardId}
            menu={cardContextMenu}
            readMode={readMode}
            onClose={() => setCardContextMenu(null)}
            onFlip={() => {
              if (!readMode) {
                toggleFace(cardContextMenu.cardId);
                push(`menu: flip — ${cardContextMenu.cardId}`);
              }
            }}
            ghosted={!!ghostedCardIds[cardContextMenu.cardId]}
            onToggleGhosted={() => {
              if (readMode) {
                return;
              }
              const id = cardContextMenu.cardId;
              setGhostedCardIds((prev) => ({ ...prev, [id]: !prev[id] }));
              push(`menu: inactive (ghost) — ${id}`);
            }}
            tapped={
              engine.state.cards[cardContextMenu.cardId]?.tapped ?? false
            }
            onToggleTap={() => {
              if (readMode) {
                return;
              }
              const id = cardContextMenu.cardId;
              const c = engine.getState().cards[id];
              if (!c) {
                return;
              }
              const r = engine.dispatch(
                toggleCardTappedAction(c.controllerId, id)
              );
              if (!r.error) {
                push(`menu: tap — ${id}`);
              }
            }}
            onVfx={(kind) => {
              if (!readMode) {
                setVfxKind(kind);
                setSelectedId(cardContextMenu.cardId);
                setVfxTrigger((k) => k + 1);
                push(`menu: VFX (${kind}) — ${cardContextMenu.cardId}`);
              }
            }}
            relocateTargets={cardContextRelocateTargets}
            onRelocate={(zoneId) => {
              if (!readMode) {
                beginRelocateFlight(cardContextMenu.cardId, zoneId);
              }
            }}
          />
        ) : null}

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
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={axesLabelsOn}
              onChange={(e) => setAxesLabelsOn(e.target.checked)}
            />
            <span>
              Table orientation gizmo (bottom-right XYZ, above FAB): mirrors Playmat tilt sliders and camera
            </span>
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
                setBattlefieldPrimitiveIds(() => new Set());
                setGhostedCardIds({ "c-hand-4": true });
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
            Card VFX (selected card in any zone): same preset and trigger row — 1 damage · 2 heal · 3
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
          double-click to flip · <strong>right-click</strong> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>
          +click a card for the action menu · <kbd>Shift</kbd>+click VFX · <kbd>Alt</kbd>+click cycle
          zone
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
