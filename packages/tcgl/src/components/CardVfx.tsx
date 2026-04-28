import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  NormalBlending,
  Points,
  PointsMaterial,
} from "three";
import type { R3FGroupProps } from "../types";
import { cardVfxLifeAlpha, cardVfxPresets, seedCardVfxBurst, type CardVfxKind } from "../vfx/cardVfxPresets";
import { createDiscPointMap } from "../vfx/discPointMap";

/**
 * Default inner rotation for VFX on a `Card` (lay-flat, face-up): local +Y = normal from the
 * front face, X/Z span the art plane. Match this when you place `CardVfx` as a `Card` sibling
 * with the same `position` / `rotation` / `scale` as the card root.
 */
export const TABLE_CARD_FACE_ALIGN: [number, number, number] = [
  -Math.PI / 2,
  0,
  0,
];

export type CardVfxProps = {
  kind: CardVfxKind;
  /**
   * Increment (or any change) to re-fire a burst. Use 0 to idle until a host first increments.
   * Typical: `const [k,setK]=useState(0);` then `onClick={()=>setK(x=>x+1)}` with a fixed `kind`.
   */
  trigger: number;
  /** Slight lift along the card normal so particles start above the ink (face-aligned +Y). */
  surfaceOffset?: [number, number, number];
  /**
   * When true (default), wraps particles in the same -90° X used by table `Card` so bursts read
   * on the art plane. Set false for `screenOverlay` / billboard cards with no table lay-flat.
   */
  faceAlign?: boolean;
  /** Fires once when a burst’s opacity reaches 0. */
  onComplete?: () => void;
} & R3FGroupProps;

export function CardVfx({
  kind,
  trigger,
  surfaceOffset = [0, 0.03, 0],
  faceAlign = true,
  onComplete,
  children,
  ...groupProps
}: CardVfxProps) {
  const { clock } = useThree();
  const pointsRef = useRef<Points | null>(null);
  const assignPointsRef = useCallback((node: Points | null) => {
    pointsRef.current = node;
    if (node) {
      node.raycast = () => {};
    }
  }, []);
  const preset = cardVfxPresets[kind];
  const n = preset.particleCount;
  /** Sized by `n` — `useRef` initial value only runs once, so we resize in an effect when `n` changes. */
  const pos = useRef<Float32Array>(new Float32Array(n * 3));
  const vel = useRef<Float32Array>(new Float32Array(n * 3));
  const col = useRef<Float32Array>(new Float32Array(n * 3));

  useLayoutEffect(() => {
    const len = n * 3;
    if (pos.current.length !== len) {
      pos.current = new Float32Array(len);
      vel.current = new Float32Array(len);
      col.current = new Float32Array(len);
    }
  }, [n]);
  const startRef = useRef<number | null>(null);
  const lastRunSig = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const runSig = `${trigger}:${kind}`;
  const completeOnce = useRef(false);

  const { geometry, discMap } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(n * 3), 3));
    const d =
      typeof document !== "undefined" ? createDiscPointMap(64) : null;
    return { geometry: g, discMap: d };
  }, [n]);

  useLayoutEffect(() => {
    if (lastRunSig.current === runSig) {
      return;
    }
    lastRunSig.current = runSig;
    if (trigger === 0) {
      return;
    }
    startRef.current = clock.elapsedTime;
    completeOnce.current = false;
    seedCardVfxBurst(
      kind,
      n,
      pos.current,
      vel.current,
      col.current,
      preset
    );
    const posAttr = geometry.getAttribute("position") as Float32BufferAttribute;
    const colAttr = geometry.getAttribute("color") as Float32BufferAttribute;
    posAttr.array.set(pos.current);
    colAttr.array.set(col.current);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    const mat0 = pointsRef.current?.material;
    if (mat0 && "opacity" in mat0) {
      (mat0 as PointsMaterial).opacity = 1;
    }
  }, [runSig, trigger, kind, n, clock, geometry, preset]);

  useFrame((_, delta) => {
    const pt = pointsRef.current;
    const m = pt?.material as PointsMaterial | undefined;
    if (!m || !pt || startRef.current === null) {
      return;
    }
    const t = clock.elapsedTime - startRef.current;
    const alpha = cardVfxLifeAlpha(t, preset.duration);
    m.opacity = alpha;
    m.needsUpdate = true;
    if (alpha <= 0.001) {
      if (!completeOnce.current) {
        completeOnce.current = true;
        onCompleteRef.current?.();
      }
      return;
    }
    completeOnce.current = false;
    const g0 = preset.gravity[0] ?? 0;
    const g1 = preset.gravity[1] ?? 0;
    const g2 = preset.gravity[2] ?? 0;
    const drag = preset.drag;
    const pA = pos.current;
    const vA = vel.current;
    const posAttr = geometry.getAttribute("position") as Float32BufferAttribute;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      vA[i3] = vA[i3]! * drag + g0 * delta;
      vA[i3 + 1] = vA[i3 + 1]! * drag + g1 * delta;
      vA[i3 + 2] = vA[i3 + 2]! * drag + g2 * delta;
      pA[i3] = pA[i3]! + vA[i3]! * delta;
      pA[i3 + 1] = pA[i3 + 1]! + vA[i3 + 1]! * delta;
      pA[i3 + 2] = pA[i3 + 2]! + vA[i3 + 2]! * delta;
    }
    posAttr.array.set(pA);
    posAttr.needsUpdate = true;
  });

  useLayoutEffect(() => {
    return () => {
      discMap?.dispose();
      geometry.dispose();
    };
  }, [discMap, geometry]);

  const inner = (
    <group position={surfaceOffset as [number, number, number]}>
      <points
        ref={assignPointsRef}
        geometry={geometry}
        frustumCulled={false}
        renderOrder={10}
      >
        <pointsMaterial
          map={discMap ?? undefined}
          transparent
          depthWrite={false}
          size={preset.pointSize}
          sizeAttenuation
          vertexColors
          opacity={0}
          blending={preset.additive ? AdditiveBlending : NormalBlending}
        />
      </points>
    </group>
  );

  return (
    <group {...groupProps}>
      {faceAlign ? (
        <group rotation={TABLE_CARD_FACE_ALIGN}>{inner}</group>
      ) : (
        inner
      )}
      {children}
    </group>
  );
}

CardVfx.displayName = "CardVfx";
