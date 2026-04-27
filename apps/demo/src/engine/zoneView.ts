import type { GameState } from "@tcgl/core";
import type { CardSpatialPose } from "tcgl";
import { DEFAULT_CARD_W, cardFanLayout } from "tcgl";
import { demoZones } from "./seedDemoGame";
import {
  partitionIntoPiles,
  pruneInvalidStackLinks,
  stackOffsetsForKind,
  type StackOnMap,
  type StackPresentationKind,
} from "./stackModel";

export type { StackPresentationKind, StackOnMap };

/** Matches `DemoCard3dTable` scale for `c-hand-*` cards in this demo strip. */
const FRONT_PLAY_DEMO_CARD_SCALE = 1.05;
/** Extra air past side-by-side silhouettes so flat cards do not overlap when laid out along X. */
const FRONT_PLAY_GAP_MUL = 1.14;

/** Same center distance as {@link getFrontPlayLocalPosition} single-row spacing. */
const FP_VISUAL_SPACING =
  DEFAULT_CARD_W * FRONT_PLAY_DEMO_CARD_SCALE * FRONT_PLAY_GAP_MUL;

const BF_PILE_SPACING = 1.1;

export const DRAG_CARD_ID = "c-bf-2" as const;

/**
 * Front-play strip layout under `PlayerArea` (same space as `Zone position`). Pulled toward the
 * shared battlefield so it clears the hand fan; tweak with drag-drop bounds below together.
 */
export const FRONT_PLAY_ZONE_PA = {
  /** `[x, y, z]` local to near `PlayerArea`. */
  position: [-0.14, 0.055, -0.42] as [number, number, number],
} as const;

/** Half extents (XZ) for {@link isPointInFrontPlayDropZonePA}, matching staging-strip visuals. */
export const FRONT_PLAY_DROP_HALF_EXTENTS = {
  x: 3.25,
  z: 1.55,
} as const;

/**
 * Width × depth for a flat pad under front-play cards (`planeGeometry` on XZ after −π/2 rotation).
 */
export const FRONT_PLAY_ZONE_PAD_SIZE: [number, number] = [
  FRONT_PLAY_DROP_HALF_EXTENTS.x * 2,
  FRONT_PLAY_DROP_HALF_EXTENTS.z * 2,
];

/** Axis-aligned drop rect in PlayerArea XZ (same plane Y flattened by `TablePlaneDrag`). */
export function isPointInFrontPlayDropZonePA(lx: number, lz: number): boolean {
  const cx = FRONT_PLAY_ZONE_PA.position[0]!;
  const cz = FRONT_PLAY_ZONE_PA.position[2]!;
  const { x: halfX, z: halfZ } = FRONT_PLAY_DROP_HALF_EXTENTS;
  return Math.abs(lx - cx) <= halfX && Math.abs(lz - cz) <= halfZ;
}

export function getZoneIds(state: GameState, zoneId: string): string[] {
  return [...(state.zoneContents[zoneId] ?? [])];
}

export function getHandIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.hand);
}

export function getBattlefieldIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.bf);
}

/** Near-player staging strip — cards moved from hand before hitting shared battlefield (demo). */
export function getFrontPlayIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.frontPlay);
}

export function getGraveyardIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.gy);
}

export function getDeckIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.deck);
}

export function getOpponentHandIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.p2Hand);
}

export function getOpponentFrontPlayIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.p2FrontPlay);
}

export function getOpponentGraveyardIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.p2Gy);
}

export function getOpponentDeckIds(state: GameState): string[] {
  return getZoneIds(state, demoZones.p2Deck);
}

/** Local spread inside `front-play` zone group (row toward center table). */
export function getFrontPlayLocalPosition(
  id: string,
  fpIds: string[]
): [number, number, number] {
  const j = fpIds.indexOf(id);
  if (j < 0) {
    return [0, 0, 0];
  }
  const n = fpIds.length;
  if (n === 1) {
    return [0, 0, 0];
  }
  const spacing =
    DEFAULT_CARD_W * FRONT_PLAY_DEMO_CARD_SCALE * FRONT_PLAY_GAP_MUL;
  return [(j - (n - 1) / 2) * spacing, 0, 0];
}

/** Landing pose on the front strip (`fpIds` is the **ordered** zone list after the move). */
export function computeFrontPlayCardPosePA(
  cardId: string,
  fpIdsOrdered: string[],
  opts?: { scale?: number }
): CardSpatialPose {
  const off = getFrontPlayLocalPosition(cardId, fpIdsOrdered);
  const pose: CardSpatialPose = {
    position: [
      FRONT_PLAY_ZONE_PA.position[0] + off[0],
      FRONT_PLAY_ZONE_PA.position[1] + off[1],
      FRONT_PLAY_ZONE_PA.position[2] + off[2],
    ],
    rotation: [0, 0, 0],
  };
  if (opts?.scale !== undefined) {
    pose.scale = opts.scale;
  }
  return pose;
}

/**
 * Approximate hand fan centroid (PlayerArea space). Tune next to `HandZone`
 * `position={[-0.2, 0, 1.1]}`.
 */
export const HAND_RETURN_TARGET_PA: CardSpatialPose = {
  position: [-0.18, 0.09, 0.96],
  rotation: [0, 0, 0],
};

/**
 * Matches demo `<HandZone position={[-0.2, 0, 1.1]}>` — PlayerArea-local origin for the hand fan.
 */
export const HAND_ZONE_PA_POSITION = [-0.2, 0, 1.1] as const;

/** Matches `<ReorderableCardFan radius={1.2} style="ecard" zBowl={0.004} maxRollZ={0.05} />` in App. */
const DEMO_HAND_FAN_LAYOUT = {
  radius: 1.2,
  style: "ecard" as const,
  zBowl: 0.004,
  maxRollZ: 0.05,
};

/** Landing pose in PlayerArea space (`handIdsOrdered` is the hand zone list **after** the draw). */
export function computeHandCardPosePA(
  cardId: string,
  handIdsOrdered: string[],
  opts?: { scale?: number }
): CardSpatialPose {
  const j = handIdsOrdered.indexOf(cardId);
  const n = Math.max(1, handIdsOrdered.length);
  const i = j >= 0 ? j : n - 1;
  const { position } = cardFanLayout(i, {
    ...DEMO_HAND_FAN_LAYOUT,
    count: n,
  });
  const pose: CardSpatialPose = {
    position: [
      HAND_ZONE_PA_POSITION[0] + position[0]!,
      HAND_ZONE_PA_POSITION[1] + position[1]!,
      HAND_ZONE_PA_POSITION[2] + position[2]!,
    ],
    rotation: [0, 0, 0],
  };
  if (opts?.scale !== undefined) {
    pose.scale = opts.scale;
  }
  return pose;
}

/**
 * Insert index (0…`handIdsBeforeInsert.length`) so the arriving card sits under `dropLX`, using the
 * same fan centers as {@link cardFanLayout} / `ReorderableCardFan`.
 */
export function handDropInsertIndexFromPALocal(
  dropLX: number,
  handIdsBeforeInsert: readonly string[]
): number {
  const n = handIdsBeforeInsert.length;
  const totalAfter = n + 1;
  if (totalAfter <= 1) {
    return 0;
  }
  const zx = HAND_ZONE_PA_POSITION[0]!;
  let best = 0;
  let bestD = Infinity;
  for (let insertIdx = 0; insertIdx < totalAfter; insertIdx++) {
    const { position } = cardFanLayout(insertIdx, {
      ...DEMO_HAND_FAN_LAYOUT,
      count: totalAfter,
    });
    const cx = zx + position[0]!;
    const d = Math.abs(dropLX - cx);
    if (d < bestD) {
      bestD = d;
      best = insertIdx;
    }
  }
  return best;
}

/** Drop plane test for dragging from front strip back into the hand fan area. */
export function isPointInHandDropZonePA(lx: number, lz: number): boolean {
  const cx = -0.2;
  const cz = 1.08;
  const halfX = 3.1;
  const halfZ = 1.35;
  return Math.abs(lx - cx) <= halfX && Math.abs(lz - cz) <= halfZ;
}

/** Matches `<GraveyardZone position={[…]}>` under near `PlayerArea` — tune with drop rect below. */
export const GRAVEYARD_ZONE_PA_POSITION = [3.2, 0, 0.1] as const;

/** Axis-aligned drop rect over the discard pile (PlayerArea XZ). */
export function isPointInGraveyardDropZonePA(lx: number, lz: number): boolean {
  const cx = GRAVEYARD_ZONE_PA_POSITION[0]!;
  const cz = GRAVEYARD_ZONE_PA_POSITION[2]!;
  const halfX = 1.35;
  const halfZ = 1.25;
  return Math.abs(lx - cx) <= halfX && Math.abs(lz - cz) <= halfZ;
}

/** Maps a drop X coordinate (PlayerArea plane) to the nearest slot index in the strip order. */
export function frontPlayReorderTargetIndex(
  dropLX: number,
  fpIds: string[],
  stackOn: StackOnMap,
  stackKind: StackPresentationKind
): number {
  const n = fpIds.length;
  if (n <= 1) {
    return 0;
  }
  const cxz = frontPlayPACentersXZ(fpIds, stackOn, stackKind);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const id = fpIds[i]!;
    const xz = cxz[id];
    if (!xz) {
      continue;
    }
    const d = Math.abs(dropLX - xz[0]!);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Per-card offset inside the front-play `Zone` group (supports multi-card piles). */
export function getFrontPlayVisualOffsets(
  fpIds: readonly string[],
  stackOn: StackOnMap,
  kind: StackPresentationKind
): Record<string, [number, number, number]> {
  const links = pruneInvalidStackLinks(fpIds, stackOn);
  const piles = partitionIntoPiles(fpIds, links);
  const np = piles.length;
  const out: Record<string, [number, number, number]> = {};
  piles.forEach((pile, j) => {
    const baseX = np <= 1 ? 0 : (j - (np - 1) / 2) * FP_VISUAL_SPACING;
    pile.forEach((id, depth) => {
      const [dx, dy, dz] = stackOffsetsForKind(kind, depth);
      out[id] = [baseX + dx, dy, dz];
    });
  });
  return out;
}

/** PlayerArea XZ centers for stack / slot hit-testing (ray is flattened on the drag plane). */
export function frontPlayPACentersXZ(
  fpIds: readonly string[],
  stackOn: StackOnMap,
  kind: StackPresentationKind
): Record<string, [number, number]> {
  const ox = FRONT_PLAY_ZONE_PA.position[0]!;
  const oz = FRONT_PLAY_ZONE_PA.position[2]!;
  const offs = getFrontPlayVisualOffsets(fpIds, stackOn, kind);
  const m: Record<string, [number, number]> = {};
  for (const id of fpIds) {
    const o = offs[id];
    if (!o) {
      continue;
    }
    m[id] = [ox + o[0]!, oz + o[2]!];
  }
  return m;
}

/** Battlefield-group-local offsets (excludes drag-proxy id — positioned via `bf2Pos`). */
export function getBattlefieldVisualOffsets(
  bfIdsAll: readonly string[],
  stackOn: StackOnMap,
  kind: StackPresentationKind
): Record<string, [number, number, number]> {
  const bfIds = bfIdsAll.filter((id) => id !== DRAG_CARD_ID);
  const links = pruneInvalidStackLinks(bfIds, stackOn);
  const piles = partitionIntoPiles(bfIds, links);
  const np = piles.length;
  const out: Record<string, [number, number, number]> = {};
  piles.forEach((pile, j) => {
    let baseX: number;
    if (np === 1 && pile.length === 1) {
      baseX = -0.55;
    } else {
      baseX = np <= 1 ? 0 : (j - (np - 1) / 2) * BF_PILE_SPACING;
    }
    pile.forEach((id, depth) => {
      const [dx, dy, dz] = stackOffsetsForKind(kind, depth);
      out[id] = [baseX + dx, dy, dz];
    });
  });
  return out;
}

/** Local XZ in battlefield group space for stacking hit-tests (drag plane uses same parentRef). */
export function battlefieldGroupCentersXZ(
  bfIdsAll: readonly string[],
  stackOn: StackOnMap,
  kind: StackPresentationKind
): Record<string, [number, number]> {
  const offs = getBattlefieldVisualOffsets(bfIdsAll, stackOn, kind);
  const m: Record<string, [number, number]> = {};
  for (const id of bfIdsAll) {
    if (id === DRAG_CARD_ID) {
      continue;
    }
    const o = offs[id];
    if (!o) {
      continue;
    }
    m[id] = [o[0]!, o[2]!];
  }
  return m;
}

/** Local XZ offset on the battlefield (group space). The drag sample uses `bf2Pos` in full 3D. */
export function getBattlefieldLocalPosition(
  id: string,
  bfIds: string[],
  bf2Pos: [number, number, number]
): [number, number, number] {
  if (id === DRAG_CARD_ID) {
    return bf2Pos;
  }
  const nonDrag = bfIds.filter((c) => c !== DRAG_CARD_ID);
  const j = nonDrag.indexOf(id);
  if (j < 0) {
    return [0, 0, 0];
  }
  const n = nonDrag.length;
  if (n === 1) {
    return [-0.55, 0, 0];
  }
  return [(j - (n - 1) / 2) * 1.1, 0, 0];
}

export function definitionIdToFaceN(definitionId: string): number {
  const m = /face-(\d+)/.exec(definitionId);
  if (m) {
    return Math.max(1, parseInt(m[1]!, 10) || 1);
  }
  return 1;
}

export function allOnTableCardIds(state: GameState): Set<string> {
  const s = new Set<string>();
  for (const k of Object.keys(state.zoneContents)) {
    for (const id of state.zoneContents[k] ?? []) {
      s.add(id);
    }
  }
  for (const o of state.stack) {
    s.add(o.sourceCardId);
  }
  return s;
}
