import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  useCallback,
  useMemo,
  useRef,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import { Vector3, type Group, MathUtils } from "three";
import { type FanOptions, cardFanLayout } from "../layout/fanLayout";
import type { R3FGroupProps } from "../types";
import type { CardFanProps } from "./CardFan";

export type HandReorderDetail = {
  cardIds: string[];
  fromIndex: number;
  toIndex: number;
  handZoneId?: string;
};

export type ReorderableCardFanProps = {
  cardIds: readonly string[];
  onHandOrderChange: (detail: HandReorderDetail) => void;
  handZoneId?: string;
  renderCard: (cardId: string) => ReactElement;
  reorderDragThresholdPx?: number;
  dragLiftY?: number;
  /**
   * Frame-rate–independent smoothing **λ** for card follow toward the fan layout.
   * **Lower** = slower, smoother; **higher** = snappier. @default 9
   */
  reorderDamping?: number;
  /**
   * Smooths the **insert index** (0…n−1) toward the pointer’s discrete slot.
   * **Lower** = slower, silkier index changes. @default 7.5
   */
  previewIndexDamping?: number;
} & Omit<CardFanProps, "children">;

function moveInOrder<T>(arr: readonly T[], from: number, to: number): T[] {
  if (from === to) {
    return [...arr];
  }
  const a = arr.slice() as T[];
  const [it] = a.splice(from, 1);
  a.splice(to, 0, it!);
  return a;
}

type CardWithPointer = { onCardPointerDown?: (e: ThreeEvent<PointerEvent>) => void };

const POS_EPS = 0.0004;
const ROT_EPS = 0.0003;

function computeSlotScreenX(
  g: Group,
  n: number,
  layout: Parameters<typeof cardFanLayout>[1] & FanOptions,
  /** R3F `useThree().camera` can disagree with this package’s `three` types when multiple `@types/three` copies exist. */
  camera: unknown,
  width: number
): Float32Array {
  const v = new Vector3();
  const out = new Float32Array(n);
  g.updateMatrixWorld(true);
  for (let i = 0; i < n; i++) {
    const { position } = cardFanLayout(i, layout);
    v.set(position[0]!, position[1]!, position[2]!);
    v.applyMatrix4(g.matrixWorld);
    v.project(camera as Parameters<Vector3["project"]>[0]);
    out[i] = (v.x * 0.5 + 0.5) * width;
  }
  return out;
}

function targetIndexFromClientX(
  n: number,
  xs: Float32Array,
  clientX: number
): number {
  if (n <= 1) {
    return 0;
  }
  if (n === 2) {
    return clientX < (xs[0]! + xs[1]!) * 0.5 ? 0 : 1;
  }
  let best = 0;
  let bestD = Math.abs(clientX - xs[0]!);
  for (let i = 1; i < n; i++) {
    const d = Math.abs(clientX - xs[i]!);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * ecard/arc `CardFan` with **press-drag** to reorder. Wire `onHandOrderChange` to your engine.
 * Pointer sampling is coalesced to the **render** loop; follow uses **damped** interpolation.
 */
export function ReorderableCardFan({
  cardIds,
  onHandOrderChange,
  handZoneId,
  renderCard,
  reorderDragThresholdPx = 8,
  dragLiftY = 0.12,
  reorderDamping = 9,
  previewIndexDamping = 7.5,
  radius,
  arc,
  style = "ecard",
  minCenterSpacing,
  maxRollZ,
  yArch,
  zBowl,
  zHand,
  y,
  faceTiltX = 0,
  ...groupProps
}: ReorderableCardFanProps) {
  const { camera, size, gl, invalidate } = useThree();
  const frameloop = useThree((s) => s.frameloop);
  const rootRef = useRef<Group>(null);
  const drag = useRef<{
    from: number;
    startId: string;
    startX: number;
    startY: number;
    armed: boolean;
    pointerId: number;
  } | null>(null);

  /** RAF-sampled — avoid heavy hit-testing on every `pointermove` (can fire 100×/s). */
  const pointerClientXRef = useRef(0);
  /** Smoothed 0…n−1 “insert index” while dragging, damped toward the discrete target each frame. */
  const previewToFloatRef = useRef(0);
  const transformLambdaRef = useRef(reorderDamping);
  const previewIndexLambdaRef = useRef(previewIndexDamping);
  const dragLiftYRef = useRef(dragLiftY);
  const cardWrapRefs = useRef(new Map<string, Group>());
  const hasSnapped = useRef(new Set<string>());
  const posTarget = useRef(new Vector3());
  const cardIdsRef = useRef(cardIds);
  const layoutOptsRef = useRef<Parameters<typeof cardFanLayout>[1] & FanOptions>(
    null as unknown as Parameters<typeof cardFanLayout>[1] & FanOptions
  );
  const cameraRef = useRef(camera);
  const sizeWidthRef = useRef(size.width);
  const nRef = useRef(cardIds.length);

  const n = cardIds.length;
  const layoutOpts = useMemo(
    () =>
      ({
        count: n,
        radius,
        arc,
        style,
        minCenterSpacing,
        maxRollZ,
        yArch,
        zBowl,
        zHand,
        y,
      }) as Parameters<typeof cardFanLayout>[1] & FanOptions,
    [n, radius, arc, style, minCenterSpacing, maxRollZ, yArch, zBowl, zHand, y]
  );

  cardIdsRef.current = cardIds;
  layoutOptsRef.current = layoutOpts;
  dragLiftYRef.current = dragLiftY;
  transformLambdaRef.current = reorderDamping;
  previewIndexLambdaRef.current = previewIndexDamping;
  cameraRef.current = camera;
  sizeWidthRef.current = size.width;
  nRef.current = n;

  const setCardWrapRef = useCallback(
    (id: string) => (g: Group | null) => {
      const m = cardWrapRefs.current;
      if (g) {
        m.set(id, g);
      } else {
        m.delete(id);
        hasSnapped.current.delete(id);
      }
    },
    []
  );

  useFrame((_, delta) => {
    const d = drag.current;
    const ids = cardIdsRef.current;
    const layout = layoutOptsRef.current;
    const dLift = dragLiftYRef.current;
    const transformL = transformLambdaRef.current;
    const previewL = previewIndexLambdaRef.current;

    const dt = Math.max(delta, 1e-4, 1 / 1000);
    const cardSet = new Set(ids);
    for (const s of hasSnapped.current) {
      if (!cardSet.has(s)) {
        hasSnapped.current.delete(s);
      }
    }

    const n0 = ids.length;
    if (d?.armed && n0 > 0) {
      const root = rootRef.current;
      if (root) {
        const xs = computeSlotScreenX(
          root,
          n0,
          layout,
          cameraRef.current,
          sizeWidthRef.current
        );
        const rawTo = targetIndexFromClientX(
          n0,
          xs,
          pointerClientXRef.current
        );
        previewToFloatRef.current = MathUtils.damp(
          previewToFloatRef.current,
          rawTo,
          previewL,
          dt
        );
      }
    }

    const previewToDiscretized = (() => {
      if (d?.armed && n0 > 0) {
        return MathUtils.clamp(
          Math.round(previewToFloatRef.current),
          0,
          n0 - 1
        );
      }
      return -1;
    })();

    let needFrame = false;
    for (const id of ids) {
      const g = cardWrapRefs.current.get(id);
      if (!g) {
        continue;
      }

      let slot: number;
      if (d?.armed) {
        const order = moveInOrder(ids, d.from, previewToDiscretized);
        slot = order.indexOf(id);
      } else {
        slot = ids.indexOf(id);
      }
      if (slot < 0) {
        continue;
      }
      const { position, rotation } = cardFanLayout(slot, layout);
      const lift = d?.armed && d.startId === id;
      posTarget.current.set(
        position[0]!,
        position[1]! + (lift ? dLift : 0),
        position[2]!
      );
      const tx = rotation[0]!;
      const ty = rotation[1]!;
      const tz = rotation[2]!;

      const isLifted = Boolean(d?.armed && d.startId === id);
      g.renderOrder = isLifted ? 20 : 0;

      if (!hasSnapped.current.has(id)) {
        g.position.copy(posTarget.current);
        g.rotation.set(tx, ty, tz);
        hasSnapped.current.add(id);
        needFrame = true;
        continue;
      }
      g.position.x = MathUtils.damp(
        g.position.x,
        posTarget.current.x,
        transformL,
        dt
      );
      g.position.y = MathUtils.damp(
        g.position.y,
        posTarget.current.y,
        transformL,
        dt
      );
      g.position.z = MathUtils.damp(
        g.position.z,
        posTarget.current.z,
        transformL,
        dt
      );
      g.rotation.x = MathUtils.damp(g.rotation.x, tx, transformL, dt);
      g.rotation.y = MathUtils.damp(g.rotation.y, ty, transformL, dt);
      g.rotation.z = MathUtils.damp(g.rotation.z, tz, transformL, dt);

      const dist2 = g.position.distanceToSquared(posTarget.current);
      const rotErr =
        Math.abs(g.rotation.x - tx) +
        Math.abs(g.rotation.y - ty) +
        Math.abs(g.rotation.z - tz);
      if (dist2 < POS_EPS * POS_EPS && rotErr < ROT_EPS * 3) {
        g.position.copy(posTarget.current);
        g.rotation.set(tx, ty, tz);
      } else if (dist2 > POS_EPS * POS_EPS || rotErr > ROT_EPS) {
        needFrame = true;
      }
    }

    if (d?.armed) {
      needFrame = true;
    }
    if (needFrame && frameloop !== "always") {
      invalidate(1);
    }
  });

  const onCardPointerDown = useCallback(
    (cardId: string, e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (nRef.current <= 1) {
        return;
      }
      const g = rootRef.current;
      if (!g) {
        return;
      }
      const from = cardIdsRef.current.indexOf(cardId);
      if (from < 0) {
        return;
      }
      const { clientX, clientY, pointerId } = e.nativeEvent;
      pointerClientXRef.current = clientX;
      previewToFloatRef.current = from;
      const d0: NonNullable<typeof drag.current> = {
        from,
        startId: cardId,
        startX: clientX,
        startY: clientY,
        armed: false,
        pointerId,
      };
      drag.current = d0;

      const dom = gl?.domElement;
      if (dom && typeof (dom as HTMLCanvasElement).setPointerCapture === "function") {
        try {
          (dom as HTMLCanvasElement).setPointerCapture(pointerId);
        } catch {
          /* other element may hold capture */
        }
      }

      const onMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) {
          return;
        }
        const mdx = ev.clientX - d.startX;
        const mdy = ev.clientY - d.startY;
        if (!d.armed) {
          if (mdx * mdx + mdy * mdy < reorderDragThresholdPx * reorderDragThresholdPx) {
            return;
          }
          d.armed = true;
          previewToFloatRef.current = d.from;
        }
        pointerClientXRef.current = ev.clientX;
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        const d = drag.current;
        const capId = d?.pointerId;
        if (d) {
          drag.current = null;
        }
        if (dom && capId != null) {
          try {
            (dom as HTMLCanvasElement).releasePointerCapture(capId);
          } catch {
            /* no capture */
          }
        }
        if (!d?.armed) {
          return;
        }
        const n1 = nRef.current;
        const lo = layoutOptsRef.current;
        const cam = cameraRef.current;
        const w = sizeWidthRef.current;
        const root = rootRef.current;
        if (!root || n1 <= 0) {
          return;
        }
        const xs = computeSlotScreenX(root, n1, lo, cam, w);
        const lastTo = targetIndexFromClientX(n1, xs, ev.clientX);
        if (d.from === lastTo) {
          return;
        }
        onHandOrderChange({
          cardIds: moveInOrder(cardIdsRef.current, d.from, lastTo),
          fromIndex: d.from,
          toIndex: lastTo,
          handZoneId,
        });
        if (frameloop !== "always") {
          invalidate(1);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [
      gl,
      invalidate,
      onHandOrderChange,
      handZoneId,
      reorderDragThresholdPx,
      frameloop,
    ]
  );

  const perCard = cardIds.map((id) => {
    const el = renderCard(id) as ReactElement<CardWithPointer>;
    if (!isValidElement(el)) {
      return null;
    }
    const next = cloneElement(el, {
      onCardPointerDown: (ev: ThreeEvent<PointerEvent>) => {
        onCardPointerDown(id, ev);
        el.props.onCardPointerDown?.(ev);
      },
    });
    return (
      <group key={id} ref={setCardWrapRef(id)}>
        {next}
      </group>
    );
  });

  return (
    <group ref={rootRef as React.Ref<Group>} {...(groupProps as R3FGroupProps)}>
      {faceTiltX === 0 ? perCard : <group rotation-x={faceTiltX}>{perCard}</group>}
    </group>
  );
}
