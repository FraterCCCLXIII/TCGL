/**
 * Client-side stacking metadata for demo zones (engine stays flat `zoneContents` arrays).
 * `stackOn[upperId] = lowerId` means **upper** sits immediately above **lower** in play order
 * (same convention as CardStack: bottom → top = ascending indices).
 */

/** Visual offsets inside one pile — tuned with zone spacing in zoneView. */
export type StackPresentationKind =
  /** Mostly horizontal strip; stacks offset mostly in Z/Y (minimal footprint change). */
  | "spread"
  /** Neat vertical pile (deck/resolution style). */
  | "vertical"
  /** Loose overlapping discard pile (small jitter). */
  | "overlap";

export type StackOnMap = Record<string, string>;

/** Max horizontal distance (PlayerArea XZ plane, ignoring Y) to treat drop as “onto” another card. */
export const STACK_DROP_RADIUS_PA = 1.05;

/** Apply “card stacked onto card below” and prune inconsistent edges. */
export function mergeStackOntoLink(
  zoneIds: readonly string[],
  prev: StackOnMap,
  upperId: string,
  lowerId: string
): StackOnMap {
  const next: StackOnMap = { ...prev };
  delete next[upperId];
  for (const [k, v] of Object.entries(next)) {
    if (v === upperId) {
      delete next[k];
    }
  }
  next[upperId] = lowerId;
  return pruneInvalidStackLinks(zoneIds, next);
}

export function pruneInvalidStackLinks(
  zoneIds: readonly string[],
  stackOn: StackOnMap
): StackOnMap {
  const ix = new Map(zoneIds.map((id, i) => [id, i]));
  const next: StackOnMap = {};
  for (const [upper, lower] of Object.entries(stackOn)) {
    const iu = ix.get(upper);
    const il = ix.get(lower);
    if (iu === undefined || il === undefined) {
      continue;
    }
    if (iu !== il + 1) {
      continue;
    }
    next[upper] = lower;
  }
  return next;
}

/** Partition ordered zone ids into piles using adjacency implied by `stackOn`. */
export function partitionIntoPiles(
  zoneIds: readonly string[],
  stackOn: StackOnMap
): string[][] {
  if (zoneIds.length === 0) {
    return [];
  }
  const piles: string[][] = [];
  let cur: string[] = [zoneIds[0]!];
  for (let i = 1; i < zoneIds.length; i++) {
    const id = zoneIds[i]!;
    const prev = zoneIds[i - 1]!;
    if (stackOn[id] === prev) {
      cur.push(id);
    } else {
      piles.push(cur);
      cur = [id];
    }
  }
  piles.push(cur);
  return piles;
}

/**
 * Indices for {@link reorderZoneCardsAction}: `toIndex` is in the array **after** removing `fromIndex`.
 */
export function reorderIndicesForStackOnto(
  zoneIds: readonly string[],
  draggedId: string,
  ontoId: string
): { fromIdx: number; toIdx: number } | null {
  const fromIdx = zoneIds.indexOf(draggedId);
  const ontoIdx0 = zoneIds.indexOf(ontoId);
  if (fromIdx < 0 || ontoIdx0 < 0 || draggedId === ontoId) {
    return null;
  }
  const arr = [...zoneIds];
  arr.splice(fromIdx, 1);
  const ontoIdx = arr.indexOf(ontoId);
  if (ontoIdx < 0) {
    return null;
  }
  return { fromIdx, toIdx: ontoIdx + 1 };
}

/** Insert index for MOVE_CARD into `toZone` when placing immediately above `ontoId`. */
export function moveInsertIndexOntoCard(
  destZoneIds: readonly string[],
  ontoId: string
): number | null {
  const j = destZoneIds.indexOf(ontoId);
  if (j < 0) {
    return null;
  }
  return j + 1;
}

/** Pick another card whose projected XZ center is nearest `(lx,lz)` within `radius`. */
export function nearestZoneCardXZ(
  lx: number,
  lz: number,
  zoneIds: readonly string[],
  centersXZ: Record<string, [number, number]>,
  excludeId: string,
  radius: number
): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const id of zoneIds) {
    if (id === excludeId) {
      continue;
    }
    const xz = centersXZ[id];
    if (!xz) {
      continue;
    }
    const dx = lx - xz[0]!;
    const dz = lz - xz[1]!;
    const d = Math.hypot(dx, dz);
    if (d <= bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function stackOffsetsForKind(
  kind: StackPresentationKind,
  depthInPile: number
): [number, number, number] {
  switch (kind) {
    case "spread":
      return [0, depthInPile * 0.022, depthInPile * 0.006];
    case "vertical":
      return [0, depthInPile * 0.035, depthInPile * 0.0015];
    case "overlap": {
      const a = (depthInPile * 0.71) % 0.2;
      const b = (depthInPile * 0.31) % 0.12;
      return [
        a * 0.55 - 0.045,
        depthInPile * 0.02,
        b * 0.55 - 0.03,
      ];
    }
    default:
      return [0, 0, 0];
  }
}
