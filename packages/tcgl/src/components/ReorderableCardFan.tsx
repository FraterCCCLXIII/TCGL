import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import { Vector3, type Group, MathUtils } from "three";
import { type FanOptions, cardFanLayout } from "../layout/fanLayout";
import { HandReorderDragIdContext } from "../context/HandReorderDragContext";
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
  /**
   * Extra local **Y** on the **dragged** card only while reordering (`ecard`). Neighbors stay on the
   * row plane. Arc style: also offsets the lifted card. @default 0.1
   */
  dragLiftY?: number;
  /**
   * Frame-rate–independent smoothing **λ** for card follow (arc reorder + rotation easing).
   * **Higher** = snappier. `ecard` reorder uses **instant** positions (no rubber-band). @default 16
   */
  reorderDamping?: number;
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
/** Match `fanLayout.ts` defaults — reorder preview row for cards that aren’t being dragged. */
const FAN_ROW_Y = 0;
const FAN_ROW_Z = 0.22;
/** Camera-ward local Z — **dragged card only** (paint order + readable lift vs neighbors). */
const HAND_DRAGGED_Z_LIFT = 0.12;

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
 * Pointer sampling runs in the **render** loop; `ecard` uses instant slot + positions (no sticky lag).
 */
export function ReorderableCardFan({
  cardIds,
  onHandOrderChange,
  handZoneId,
  renderCard,
  reorderDragThresholdPx = 8,
  dragLiftY = 0.1,
  reorderDamping = 16,
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
  const transformLambdaRef = useRef(reorderDamping);
  const dragLiftYRef = useRef(dragLiftY);
  const cardWrapRefs = useRef(new Map<string, Group>());
  const hasSnapped = useRef(new Set<string>());
  /** React state so Card JSX can apply paint order every commit (react-spring resets imperative tweaks). */
  const [handDragCardId, setHandDragCardId] = useState<string | null>(null);
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

    const dt = Math.max(delta, 1e-4, 1 / 1000);
    const cardSet = new Set(ids);
    for (const s of hasSnapped.current) {
      if (!cardSet.has(s)) {
        hasSnapped.current.delete(s);
      }
    }

    const n0 = ids.length;
    /** Insert index under pointer — **not** smoothed (avoids sluggish “magnetic” slot lag). */
    let previewInsertIndex = -1;
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
        previewInsertIndex = targetIndexFromClientX(
          n0,
          xs,
          pointerClientXRef.current
        );
      } else {
        previewInsertIndex = d.from;
      }
    }

    const previewToDiscretized =
      previewInsertIndex >= 0
        ? MathUtils.clamp(previewInsertIndex, 0, n0 - 1)
        : -1;

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
      const opts = layout as FanOptions;
      const fanStyle = opts.style ?? "ecard";

      if (!d?.armed) {
        posTarget.current.set(position[0]!, position[1]!, position[2]!);
      } else if (fanStyle === "ecard") {
        const yRow = opts.y ?? FAN_ROW_Y;
        const zRow = opts.zHand ?? FAN_ROW_Z;
        if (lift) {
          /** Dragged card only: toward camera + slight Y vs flat neighbor row. */
          posTarget.current.set(
            position[0]!,
            yRow + dLift,
            zRow + HAND_DRAGGED_Z_LIFT
          );
        } else {
          posTarget.current.set(position[0]!, yRow, zRow);
        }
      } else {
        posTarget.current.set(
          position[0]!,
          position[1]! + (lift ? dLift : 0),
          position[2]! + (lift ? HAND_DRAGGED_Z_LIFT : 0)
        );
      }
      /** During reorder: neighbors parallel to row; dragged card follows slot tilt from layout. */
      const reorderNeighborFlat = Boolean(d?.armed && !lift);
      const tx = reorderNeighborFlat ? 0 : rotation[0]!;
      const ty = reorderNeighborFlat ? 0 : rotation[1]!;
      const tz = reorderNeighborFlat ? 0 : rotation[2]!;

      if (!hasSnapped.current.has(id)) {
        g.position.copy(posTarget.current);
        g.rotation.set(tx, ty, tz);
        hasSnapped.current.add(id);
        needFrame = true;
        continue;
      }

      const ecardReorder = Boolean(d?.armed && fanStyle === "ecard");
      if (ecardReorder) {
        /** No positional damping — stops rubber-band “stick” toward slot centers. */
        g.position.copy(posTarget.current);
      } else {
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
      }
      g.rotation.x = MathUtils.damp(g.rotation.x, tx, transformL, dt);
      g.rotation.y = MathUtils.damp(g.rotation.y, ty, transformL, dt);
      g.rotation.z = MathUtils.damp(g.rotation.z, tz, transformL, dt);

      const dist2 = ecardReorder ? 0 : g.position.distanceToSquared(posTarget.current);
      const rotErr =
        Math.abs(g.rotation.x - tx) +
        Math.abs(g.rotation.y - ty) +
        Math.abs(g.rotation.z - tz);
      if (dist2 < POS_EPS * POS_EPS && rotErr < ROT_EPS * 3) {
        if (!ecardReorder) {
          g.position.copy(posTarget.current);
        }
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
          setHandDragCardId(d.startId);
        }
        pointerClientXRef.current = ev.clientX;
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        setHandDragCardId(null);
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
    <HandReorderDragIdContext.Provider value={handDragCardId}>
      <group ref={rootRef as React.Ref<Group>} {...(groupProps as R3FGroupProps)}>
        {faceTiltX === 0 ? perCard : <group rotation-x={faceTiltX}>{perCard}</group>}
      </group>
    </HandReorderDragIdContext.Provider>
  );
}
