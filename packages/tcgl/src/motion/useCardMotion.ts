import { useSpring } from "@react-spring/three";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { CardSpatialPose, CardMotionFlip } from "./cardMotionTypes";
import { easeInOutCubic } from "./easing";
import { interpolateCardPose } from "./interpolateCardPose";
import { resolveFaceUpAtProgress } from "./resolveFaceUp";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export type UseCardMotionOptions = {
  from: CardSpatialPose;
  to: CardSpatialPose;
  /** When true, animates toward `to`. When false, snaps back toward `from` (progress = 0). */
  active: boolean;
  /** Vertical sine bump along the chord (world units). */
  arcLiftMax?: number;
  /**
   * Maps duration-mode progress through easing. When `durationMs === 0` (physics spring), progress
   * is clamped to `[0, 1]` only — extra easing is skipped so motion follows the spring curve.
   */
  easing?: (raw: number) => number;
  flip?: CardMotionFlip;
  onComplete?: () => void;
  /**
   * Duration-based tween (ms). Pass **`0`** to use physics spring (`tension` / `friction` instead).
   * @default 520
   */
  durationMs?: number;
  tension?: number;
  friction?: number;
};

export type UseCardMotionResult = {
  groupRef: RefObject<Group>;
  /** Latest Card `faceUp` derived from eased progress + `flip` rule (updates during motion). */
  faceUp: boolean;
  /** Raw motion progress before easing — `.get()` each frame — useful for debugging / shaders. */
  motionProgress: { get: () => number };
};

export function useCardMotion({
  from,
  to,
  active,
  arcLiftMax = 0,
  easing = easeInOutCubic,
  flip,
  onComplete,
  durationMs = 520,
  tension = 180,
  friction = 26,
}: UseCardMotionOptions): UseCardMotionResult {
  const groupRef = useRef<Group>(null);
  const activeRef = useRef(false);
  activeRef.current = active;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const fromRef = useRef(from);
  const toRef = useRef(to);
  fromRef.current = from;
  toRef.current = to;

  const pathKey = useMemo(
    () =>
      JSON.stringify({
        from,
        to,
        arcLiftMax,
        flip,
      }),
    [from, to, arcLiftMax, flip]
  );

  const [{ progress }, api] = useSpring(() => ({
    progress: 0,
    config:
      durationMs === 0
        ? { tension, friction }
        : { duration: durationMs },
  }));

  useEffect(() => {
    const physics = durationMs === 0;
    const cfg = physics ? { tension, friction } : { duration: durationMs };

    if (active) {
      void api.start({
        progress: 1,
        config: cfg,
        onRest: ({ finished }) => {
          if (finished && activeRef.current) {
            onCompleteRef.current?.();
          }
        },
      });
    } else {
      void api.start({ progress: 0, immediate: true });
    }
  }, [active, api, durationMs, friction, pathKey, tension]);

  const [faceUp, setFaceUp] = useState(() =>
    resolveFaceUpAtProgress(flip, 0)
  );

  useFrame(() => {
    const g = groupRef.current;
    if (!g) {
      return;
    }

    const raw = progress.get();
    const u = durationMs === 0 ? clamp01(raw) : easing(raw);
    const pose = interpolateCardPose(
      fromRef.current,
      toRef.current,
      u,
      arcLiftMax
    );

    g.position.set(pose.position[0]!, pose.position[1]!, pose.position[2]!);
    const rot = pose.rotation ?? [0, 0, 0];
    g.rotation.set(rot[0]!, rot[1]!, rot[2]!);
    g.scale.setScalar(pose.scale ?? 1);

    const fu = resolveFaceUpAtProgress(flip, u);
    setFaceUp((prev) => (prev !== fu ? fu : prev));
  });

  return { groupRef, faceUp, motionProgress: progress };
}
