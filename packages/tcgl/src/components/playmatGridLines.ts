import { BufferAttribute, BufferGeometry } from "three";

function pushLine2(
  a: number[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number
) {
  a.push(x0, y0, z0, x1, y1, z1);
}

export type BuildPlaymatGridOptions = {
  w: number;
  d: number;
  /**
   * Z in the floor group’s local space (XY table, +Z = normal). Use the same value as the playmat
   * surface mesh for coplanar lines.
   */
  z: number;
  divisionsX: number;
  divisionsY: number;
  /**
   * When true, ensure a line exists at **y = 0** (depth center): the same line as the near/far
   * `splitSides` join. Even `divisionsY` may already place a line there; odd counts usually do not,
   * so a segment is added only when no horizontal line is already on the split (within tolerance).
   */
  includeTableSplitLine?: boolean;
};

function horizontalLineHitsSplitDepth(
  ny: number,
  d: number,
  hd: number,
  ySplit = 0
): boolean {
  const eps = Math.max(1e-6, d * 1e-7);
  for (let j = 0; j <= ny; j++) {
    const yl = -hd + (j * d) / ny;
    if (Math.abs(yl - ySplit) < eps) {
      return true;
    }
  }
  return false;
}

/**
 * `LineSegments` position buffer in the playmat **floor** group (local: plane in XY, +Z = “up”
 * from the table in that group before parent tilt).
 */
export function buildPlaymatGridGeometryBuffer(o: BuildPlaymatGridOptions): BufferGeometry {
  const { w, d, z, divisionsX, divisionsY, includeTableSplitLine = false } = o;
  const hw = w / 2;
  const hd = d / 2;
  const pos: number[] = [];
  const nx = Math.max(1, Math.floor(divisionsX));
  const ny = Math.max(1, Math.floor(divisionsY));
  for (let i = 0; i <= nx; i++) {
    const x = -hw + (i * w) / nx;
    pushLine2(pos, x, -hd, z, x, hd, z);
  }
  for (let j = 0; j <= ny; j++) {
    const yl = -hd + (j * d) / ny;
    pushLine2(pos, -hw, yl, z, hw, yl, z);
  }
  if (includeTableSplitLine && !horizontalLineHitsSplitDepth(ny, d, hd, 0)) {
    pushLine2(pos, -hw, 0, z, hw, 0, z);
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  return geom;
}
