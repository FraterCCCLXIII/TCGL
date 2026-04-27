import { useTexture } from "@react-three/drei";
import { a, useSpring } from "@react-spring/three";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type Ref,
} from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  BackSide,
  FrontSide,
  Group,
  SRGBColorSpace,
  type Texture,
} from "three";
import { useTCGL, useTCGLEvents } from "../context/TCGLContext";
import { DEFAULT_CARD_H, DEFAULT_CARD_W } from "../constants/dimensions";
import { createRoundedCardAlphaMap } from "../utils/roundedCardAlphaMap";
import { getCardRimWorldRadius } from "../utils/cardRimParams";
import { CardEdgeRim } from "./CardEdgeRim";
import type { CardView, R3FGroupProps, Vec3 } from "../types";

const AnimatedGroup = a.group;
const FlipRig = a.group;
const Mat = a.meshStandardMaterial;
const MatBasic = a.meshBasicMaterial;

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
   * HUD: no “lay flat on the table” −90° X, unlit albedo, no SDF rim. Table cards omit this.
   */
  screenOverlay?: boolean;
  /**
   * When `disabled`, cards normally fade to ~42% opacity. Set **`true`** so disabled cards stay fully
   * opaque while remaining non-interactive (e.g. drag ghosts and zone-motion overlays).
   */
  opaqueWhenDisabled?: boolean;
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
  tableClearance = 0.06,
  flipArcLiftMax = 0.48,
  cardScale = 1,
  cornerRadius = 0.07,
  onCardDoubleClick,
  onCardPointerDown,
  onCardPointerUp,
  pointerTilt = true,
  screenOverlay = false,
  opaqueWhenDisabled = false,
  ...groupProps
}: CardProps,
  ref: Ref<Group>
) {
  const { shadows: shadowsOn } = useTCGL();
  const events = useTCGLEvents();
  const allowShadow = shadowsOn && !screenOverlay;
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
      alphaMap?.dispose();
    };
  }, [alphaMap]);

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

  const showRim =
    (hovered || selected || highlighted) && !disabled && !screenOverlay;

  const { lift, rotX, rotY, rotZ, cardOpacity, rimAlpha } = useSpring({
    lift: tableClearance + (hovered && !disabled ? hoverLift : 0),
    rotX: disabled || !pointerTilt ? 0 : tilt.x * maxTilt,
    rotY: disabled || !pointerTilt ? 0 : tilt.y * maxTilt,
    rotZ: disabled ? 0 : tapRz,
    cardOpacity: disabled && !opaqueWhenDisabled ? 0.42 : 1,
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

  useFrame(() => {
    const g = flipArcRef.current;
    if (!g) {
      return;
    }
    const t = maxFlipLift * Math.abs(Math.sin(flipR.get()));
    g.position.set(0, t, 0);
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

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (disabled) {
        return;
      }
      e.stopPropagation();
      onCardPointerDown?.(e);
    },
    [disabled, onCardPointerDown]
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

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (disabled) {
        return;
      }
      e.stopPropagation();
      events.onCardTap(id);
      events.onCardSelect(id);
    },
    [disabled, events, id]
  );

  const onPointerDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (disabled) {
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
      ref={ref}
    >
      <AnimatedGroup
        position-y={lift}
        renderOrder={
          hovered && !disabled ? 6 : selected && !disabled ? 5 : 0
        }
      >
        <group ref={flipArcRef}>
          <group
            rotation={
              screenOverlay
                ? [0, 0, 0]
                : ([-Math.PI / 2, 0, 0] as [number, number, number])
            }
          >
            <AnimatedGroup
              rotation-x={rotX}
              rotation-y={rotY}
              rotation-z={rotZ}
              onPointerOver={onPointerOver}
              onPointerOut={onPointerOut}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onClick={onClick}
              onDoubleClick={onPointerDoubleClick}
            >
              <FlipRig rotation-y={flipR}>
                {/* receiveShadow off: PCF shadow maps band on thin tilted quads (diagonal lines on art). */}
                <mesh
                  castShadow={allowShadow}
                  receiveShadow={false}
                  frustumCulled={false}
                  position={[0, 0, 0.0002]}
                  renderOrder={2}
                >
                  <planeGeometry args={[DEFAULT_CARD_W, DEFAULT_CARD_H]} />
                  {screenOverlay ? (
                    <MatBasic
                      color="#ffffff"
                      map={mapFront}
                      opacity={cardOpacity}
                      transparent
                      side={FrontSide}
                      alphaMap={alphaMap ?? undefined}
                      alphaTest={alphaMap ? 0.12 : 0}
                      depthWrite
                      polygonOffset
                      polygonOffsetFactor={-1}
                      polygonOffsetUnits={-1}
                    />
                  ) : (
                    <Mat
                      color="#f5f5f5"
                      map={mapFront}
                      opacity={cardOpacity}
                      {...commonMat}
                    />
                  )}
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
                  castShadow={allowShadow}
                  receiveShadow={false}
                  frustumCulled={false}
                  position={[0, 0, -0.0002]}
                  renderOrder={1}
                >
                  <planeGeometry args={[DEFAULT_CARD_W, DEFAULT_CARD_H]} />
                  {screenOverlay ? (
                    <MatBasic
                      color="#ffffff"
                      map={mapBack}
                      opacity={cardOpacity}
                      transparent
                      side={BackSide}
                      depthWrite
                      alphaMap={alphaMap ?? undefined}
                      alphaTest={alphaMap ? 0.12 : 0}
                      polygonOffset
                      polygonOffsetFactor={-1}
                      polygonOffsetUnits={-1}
                    />
                  ) : (
                    <Mat
                      color="#f5f5f5"
                      map={mapBack}
                      opacity={cardOpacity}
                      {...commonMat}
                      side={BackSide}
                    />
                  )}
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
              </FlipRig>
            </AnimatedGroup>
          </group>
        </group>
      </AnimatedGroup>
    </group>
  );
});

Card.displayName = "Card";
