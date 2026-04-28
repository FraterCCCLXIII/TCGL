import { useTexture } from "@react-three/drei";
import { a, useSpring } from "@react-spring/three";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type MutableRefObject,
  type Ref,
} from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  BackSide,
  FrontSide,
  Group,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Texture,
} from "three";
import { useTCGL, useTCGLEvents } from "../context/TCGLContext";
import {
  DEFAULT_CARD_H,
  DEFAULT_CARD_TABLE_CLEARANCE_Y,
  DEFAULT_CARD_W,
  SCREEN_OVERLAY_GHOST_PICK_Z_NUDGE,
} from "../constants/dimensions";
import { createRoundedCardAlphaMap } from "../utils/roundedCardAlphaMap";
import { createRoundedCardEdgeGeometry } from "../utils/roundedCardEdgeGeometry";
import {
  createCardFaceShadowDepthMaterial,
  TCGL_SHADOW_FADE_UNIFORM,
} from "../materials/cardFaceShadowDepthMaterial";
import { getCardRimWorldRadius } from "../utils/cardRimParams";
import { CardEdgeRim } from "./CardEdgeRim";
import type { CardView, R3FGroupProps, Vec3 } from "../types";

const AnimatedGroup = a.group;
const FlipRig = a.group;
const Mat = a.meshStandardMaterial;

const defaultPosition: Vec3 = [0, 0, 0];
const defaultRotation: Vec3 = [0, 0, 0];

export type CardProps = CardView & {
  hoverLift?: number;
  maxTilt?: number;
  /** SDF edge rim color (hover). */
  emissiveOnHover?: string;
  /** SDF edge rim when selected. */
  emissiveOnSelect?: string;
  /** SDF edge rim when `highlighted` (e.g. valid target). */
  emissiveOnHighlight?: string;
  tableClearance?: number;
  /**
   * Extra world-space lift (at mid-flip) so the 3D flip arc clears the table and cards
   * underneath. Applied as a smooth curve: max × |sin(flipAngle)|.
   */
  flipArcLiftMax?: number;
  /** World-space uniform scale (multiplies the default card size). */
  cardScale?: number;
  /**
   * 0..1, relative to the shorter world edge — baked alpha for rounded corners.
   * 0 disables rounding (sharp quad).
   */
  cornerRadius?: number;
  /** Fires on the inner pointer hitbox (e.g. double-click to flip in host UI). */
  onCardDoubleClick?: (e: ThreeEvent<MouseEvent>) => void;
  onCardPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onCardPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
  /**
   * When true (default), pointer UVs drive a subtle `rotX` / `rotY` parallax. Set false for lift +
   * lift only. Stronger `maxTilt` values are more likely to clip the mat or cards below.
   */
  pointerTilt?: boolean;
  /**
   * When true, the card is a vertical plane in local XY (normal +Z) for use inside a `Billboard` or
   * HUD: no “lay flat on the table” −90° X. Uses the same lit materials and rim behavior as table
   * cards so viewport hands match scene lighting.
   */
  screenOverlay?: boolean;
  /**
   * When `disabled`, cards normally fade to ~42% opacity. Set **`true`** so disabled cards stay fully
   * opaque while remaining non-interactive (e.g. drag ghosts and zone-motion overlays).
   */
  opaqueWhenDisabled?: boolean;
  /**
   * Local Z separation between front and back (world length before `cardScale`). Small edge quads
   * fill the rim so tilted cards read as stock. Set `0` for the previous paper-thin double plane.
   */
  thickness?: number;
} & R3FGroupProps;

/**
 * A textured card with hover lift, pointer tilt, tap, rounded-rect SDF edge rim, and a 3D face flip
 * (not an opacity crossfade, so the card visibly turns over).
 * Rules live outside — this is presentation and pointer feedback only.
 */
export const Card = forwardRef<Group, CardProps>(function Card(
  {
  id,
  face,
  back: backUrl,
  position = defaultPosition,
  rotation = defaultRotation,
  faceUp = true,
  selected = false,
  draggable: _draggable = true,
  tapped = false,
  ghosted = false,
  highlighted = false,
  disabled = false,
  dragging: _dragging = false,
  animationState: _animationState = "idle",
  hoverLift = 0.12,
  /** Radians; kept modest by default so hover tilt stays clear of the mat and stacked cards. */
  maxTilt = 0.14,
  emissiveOnHover = "#9dc5ff",
  emissiveOnSelect = "#5ee4ff",
  emissiveOnHighlight = "#4ade80",
  /** World units: keep every card above the playmat to avoid z-fighting with a huge mat plane. */
  tableClearance = DEFAULT_CARD_TABLE_CLEARANCE_Y,
  flipArcLiftMax = 0.48,
  cardScale = 1,
  cornerRadius = 0.07,
  onCardDoubleClick,
  onCardPointerDown,
  onCardPointerUp,
  pointerTilt = true,
  screenOverlay = false,
  opaqueWhenDisabled = false,
  thickness = 0.018,
  ...groupProps
}: CardProps,
  ref: Ref<Group>
) {
  /** When non-null, root is still in the scene (e.g. reparented via `attach` + `<primitive>`). */
  const rootRef = useRef<Group | null>(null);
  const assignRootRef = useCallback(
    (node: Group | null) => {
      rootRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as MutableRefObject<Group | null>).current = node;
      }
    },
    [ref]
  );

  const { shadows: shadowsOn } = useTCGL();
  const events = useTCGLEvents();
  const allowShadow = shadowsOn;
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const prevFaceUp = useRef(faceUp);

  const [mapFront, mapBack] = useTexture([
    face,
    backUrl ?? face,
  ]) as [Texture, Texture];
  useLayoutEffect(() => {
    mapFront.colorSpace = SRGBColorSpace;
    mapBack.colorSpace = SRGBColorSpace;
  }, [mapFront, mapBack]);

  const alphaMap = useMemo(() => {
    if (typeof document === "undefined" || cornerRadius <= 0) {
      return null;
    }
    return createRoundedCardAlphaMap({
      width: DEFAULT_CARD_W,
      height: DEFAULT_CARD_H,
      cornerRadius: Math.min(0.25, Math.max(0, cornerRadius)),
      resolution: 512,
    });
  }, [cornerRadius]);

  useLayoutEffect(() => {
    return () => {
      if (rootRef.current?.parent) {
        return;
      }
      alphaMap?.dispose();
    };
  }, [alphaMap]);

  const cardShadowDepthMat = useMemo(
    () => createCardFaceShadowDepthMaterial(alphaMap, alphaMap ? 0.12 : 0),
    [alphaMap]
  );

  useLayoutEffect(() => {
    return () => {
      if (rootRef.current?.parent) {
        return;
      }
      cardShadowDepthMat.dispose();
    };
  }, [cardShadowDepthMat]);

  const edgeMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#252525",
        roughness: 0.75,
        metalness: 0.05,
      }),
    []
  );

  useLayoutEffect(() => {
    return () => {
      if (rootRef.current?.parent) {
        return;
      }
      edgeMat.dispose();
    };
  }, [edgeMat]);

  const useStockThickness = thickness > 0;
  const halfDepth = useStockThickness ? thickness / 2 : 0.0002;

  const edgeGeometry = useMemo(() => {
    if (!useStockThickness) {
      return null;
    }
    return createRoundedCardEdgeGeometry(
      DEFAULT_CARD_W,
      DEFAULT_CARD_H,
      cornerRadius,
      thickness
    );
  }, [useStockThickness, cornerRadius, thickness]);

  useLayoutEffect(() => {
    return () => {
      if (rootRef.current?.parent) {
        return;
      }
      edgeGeometry?.dispose();
    };
  }, [edgeGeometry]);

  // After lay-flat (rotate -90° on X), local Z is world +Y, so a tabletop MTG-style tap is
  // rotation on Z — not on Y (which goes through the card edge and reads as a hinge, not a tap).
  const tapRz = useMemo(() => (tapped ? -Math.PI / 2 : 0), [tapped]);

  const { rimColor, rimStrength } = useMemo(() => {
    if (disabled) {
      return { rimColor: "#ffffff", rimStrength: 0 };
    }
    if (highlighted) {
      return {
        rimColor: emissiveOnHighlight,
        rimStrength: hovered ? 0.5 : 0.44,
      };
    }
    if (selected) {
      return { rimColor: emissiveOnSelect, rimStrength: 0.75 };
    }
    if (hovered) {
      return { rimColor: emissiveOnHover, rimStrength: 0.35 };
    }
    return { rimColor: "#ffffff", rimStrength: 0 };
  }, [
    disabled,
    emissiveOnHighlight,
    emissiveOnSelect,
    emissiveOnHover,
    highlighted,
    hovered,
    selected,
  ]);

  const showRim = (hovered || selected || highlighted) && !disabled;

  const hoverLiftAmount = hovered && !disabled ? hoverLift : 0;
  const dimmedOpacity =
    (disabled && !opaqueWhenDisabled) || ghosted ? 0.42 : 1;
  const { lift, rotX, rotY, rotZ, cardOpacity, rimAlpha } = useSpring({
    lift: screenOverlay
      ? hoverLiftAmount
      : tableClearance + hoverLiftAmount,
    rotX: disabled || !pointerTilt ? 0 : tilt.x * maxTilt,
    rotY: disabled || !pointerTilt ? 0 : tilt.y * maxTilt,
    rotZ: disabled ? 0 : tapRz,
    cardOpacity: dimmedOpacity,
    rimAlpha: showRim ? rimStrength : 0,
    config: { mass: 0.45, tension: 400, friction: 28 },
  });

  // 3D flip: rotate π about local Y (axis along the portrait “height” of the art) so the card
  // tumbles over that edge to show the back — not local X (that’s a roll about the short edge).
  const [{ flipR }, flipApi] = useSpring(() => ({
    flipR: faceUp ? 0 : Math.PI,
    config: { tension: 200, friction: 26 },
  }));

  const flipArcRef = useRef<Group>(null);
  const maxFlipLift = flipArcLiftMax * cardScale;
  /** 0 = HUD (no shadow), 1 = table — damped each frame so shadow depth fades smoothly. */
  const shadowFadeRef = useRef(screenOverlay ? 0 : 1);

  useFrame((_, dt) => {
    const g = flipArcRef.current;
    if (g) {
      const t = maxFlipLift * Math.abs(Math.sin(flipR.get()));
      g.position.set(0, t, 0);
    }
    const target = screenOverlay ? 0 : 1;
    const cur = shadowFadeRef.current;
    const lambda = 12;
    const a = 1 - Math.exp(-lambda * Math.min(dt, 0.05));
    shadowFadeRef.current = cur + (target - cur) * a;
    if (shadowsOn) {
      const u = cardShadowDepthMat.userData[TCGL_SHADOW_FADE_UNIFORM] as
        | { value: number }
        | undefined;
      if (u) {
        u.value = shadowFadeRef.current;
      }
    }
  });

  useLayoutEffect(() => {
    if (prevFaceUp.current === faceUp) {
      return;
    }
    prevFaceUp.current = faceUp;
    void flipApi.start({
      to: { flipR: faceUp ? 0 : Math.PI },
      onRest: ({ finished }) => {
        if (finished) {
          events.onCardFlip(id);
        }
      },
    });
  }, [faceUp, flipApi, id, events]);

  const rimWorld = useMemo(
    () => getCardRimWorldRadius(Math.min(0.25, Math.max(0, cornerRadius))),
    [cornerRadius]
  );

  const emitCardContextMenu = useCallback(
    (clientX: number, clientY: number) => {
      events.onCardContextMenu(id, { clientX, clientY });
      events.onCardSelect(id);
    },
    [events, id]
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const ne = e.nativeEvent;
      /**
       * Context menu must work even when `disabled` (e.g. demo “inactive” hand slot): still
       * non-draggable / no primary tap, but inspect / settings via right-click or Ctrl/Cmd+click.
       */
      if (ne.button === 2) {
        e.stopPropagation();
        ne.preventDefault();
        emitCardContextMenu(ne.clientX, ne.clientY);
        return;
      }
      if (ne.button === 0 && (ne.ctrlKey || ne.metaKey)) {
        e.stopPropagation();
        ne.preventDefault();
        emitCardContextMenu(ne.clientX, ne.clientY);
        return;
      }
      if (disabled) {
        return;
      }
      e.stopPropagation();
      /**
       * Open here — not only `onContextMenu`. R3F only delivers `contextmenu` when the hit is in
       * `initialHits` from the same gesture’s `pointerdown`, and hosts (e.g. hand reorder) may
       * capture the pointer on primary button. Secondary button and Ctrl/Cmd+primary must not
       * reach reorder / strip-drag `onCardPointerDown`.
       */
      onCardPointerDown?.(e);
    },
    [disabled, emitCardContextMenu, onCardPointerDown]
  );

  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (disabled) {
        return;
      }
      e.stopPropagation();
      onCardPointerUp?.(e);
    },
    [disabled, onCardPointerUp]
  );

  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (disabled) {
        return;
      }
      e.stopPropagation();
      setHovered(true);
      events.onCardHover(id);
      const uv = e.uv;
      if (uv) {
        setTilt({ x: (uv.y - 0.5) * 2, y: (uv.x - 0.5) * 2 });
      }
    },
    [disabled, events, id]
  );

  const onPointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    setTilt({ x: 0, y: 0 });
  }, []);

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (disabled) {
        return;
      }
      e.stopPropagation();
      const uv = e.uv;
      if (uv) {
        setTilt({ x: (uv.y - 0.5) * 2, y: (uv.x - 0.5) * 2 });
      }
    },
    [disabled]
  );

  const onContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const ne = e.nativeEvent;
      ne.preventDefault();
      emitCardContextMenu(ne.clientX, ne.clientY);
    },
    [emitCardContextMenu]
  );

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (disabled) {
        return;
      }
      e.stopPropagation();
      const ne = e.nativeEvent;
      /** Ctrl/Cmd+primary is handled in `onPointerDown` (fires before fan / strip capture). */
      if (ne.button === 0 && (ne.ctrlKey || ne.metaKey)) {
        return;
      }
      events.onCardTap(id, {
        button: ne.button,
        shiftKey: ne.shiftKey,
        altKey: ne.altKey,
        metaKey: ne.metaKey,
        ctrlKey: ne.ctrlKey,
      });
      events.onCardSelect(id);
    },
    [disabled, events, id]
  );

  const onPointerDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      /** Host actions (e.g. hand → front strip) even when `disabled` blocks single tap / drag. */
      if (disabled && !onCardDoubleClick) {
        return;
      }
      e.stopPropagation();
      onCardDoubleClick?.(e);
    },
    [disabled, onCardDoubleClick]
  );

  const commonMat = {
    emissive: "#000000",
    emissiveIntensity: 0,
    roughness: 0.45,
    metalness: 0.1,
    side: FrontSide,
    transparent: true,
    depthWrite: true,
    alphaMap: alphaMap ?? undefined,
    alphaTest: alphaMap ? 0.12 : 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  };

  return (
    <group
      position={position as [number, number, number]}
      rotation={rotation as [number, number, number]}
      scale={cardScale}
      {...groupProps}
      ref={assignRootRef}
    >
      <AnimatedGroup
        userData={{ tcglCardLiftGroup: true }}
        position-y={screenOverlay ? 0 : lift}
        position-z={screenOverlay ? lift : 0}
        renderOrder={
          hovered && !disabled ? 6 : selected && !disabled ? 5 : 0
        }
      >
        <group
          position-z={
            screenOverlay && ghosted ? SCREEN_OVERLAY_GHOST_PICK_Z_NUDGE : 0
          }
        >
          <group ref={flipArcRef} userData={{ tcglCardFlipArcGroup: true }}>
          <group
            rotation={
              screenOverlay
                ? [0, 0, 0]
                : ([-Math.PI / 2, 0, 0] as [number, number, number])
            }
            userData={{ tcglLayFlatPitchGroup: true }}
          >
            <AnimatedGroup
              userData={{ tcglCardPointerTiltGroup: true }}
              rotation-x={rotX}
              rotation-y={rotY}
              rotation-z={rotZ}
              onPointerOver={onPointerOver}
              onPointerOut={onPointerOut}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onClick={onClick}
              onContextMenu={onContextMenu}
              onDoubleClick={onPointerDoubleClick}
            >
              <FlipRig
                userData={{ tcglCardFlipRigGroup: true }}
                rotation-y={flipR}
              >
                {/* receiveShadow off: PCF shadow maps band on thin tilted quads (diagonal lines on art). */}
                <mesh
                  userData={{ tcglCardFace: "front" as const }}
                  castShadow={allowShadow}
                  receiveShadow={false}
                  customDepthMaterial={cardShadowDepthMat}
                  frustumCulled={false}
                  position={[0, 0, halfDepth]}
                  renderOrder={2}
                >
                  <planeGeometry args={[DEFAULT_CARD_W, DEFAULT_CARD_H]} />
                  <Mat
                    color="#f5f5f5"
                    map={mapFront}
                    opacity={cardOpacity}
                    {...commonMat}
                  />
                  {showRim && (
                    <CardEdgeRim
                      face="front"
                      z={0.0001}
                      color={rimColor}
                      width={DEFAULT_CARD_W}
                      height={DEFAULT_CARD_H}
                      falloff={0.036}
                      cornerRadiusWorld={rimWorld}
                      alphaMap={alphaMap}
                      alphaSpring={rimAlpha}
                    />
                  )}
                </mesh>
                <mesh
                  userData={{ tcglCardFace: "back" as const }}
                  castShadow={allowShadow}
                  receiveShadow={false}
                  customDepthMaterial={cardShadowDepthMat}
                  frustumCulled={false}
                  position={[0, 0, -halfDepth]}
                  renderOrder={1}
                >
                  <planeGeometry args={[DEFAULT_CARD_W, DEFAULT_CARD_H]} />
                  <Mat
                    color="#f5f5f5"
                    map={mapBack}
                    opacity={cardOpacity}
                    {...commonMat}
                    side={BackSide}
                  />
                  {showRim && (
                    <CardEdgeRim
                      face="back"
                      z={0.0001}
                      color={rimColor}
                      width={DEFAULT_CARD_W}
                      height={DEFAULT_CARD_H}
                      falloff={0.036}
                      cornerRadiusWorld={rimWorld}
                      alphaMap={alphaMap}
                      alphaSpring={rimAlpha}
                    />
                  )}
                </mesh>
                {useStockThickness && edgeGeometry ? (
                  <mesh
                    geometry={edgeGeometry}
                    material={edgeMat}
                    castShadow={allowShadow}
                    receiveShadow={false}
                    renderOrder={0}
                  />
                ) : null}
              </FlipRig>
            </AnimatedGroup>
          </group>
        </group>
        </group>
      </AnimatedGroup>
    </group>
  );
});

Card.displayName = "Card";
