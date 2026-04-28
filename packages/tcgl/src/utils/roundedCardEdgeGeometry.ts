import { BufferGeometry, Float32BufferAttribute } from "three";
import { getCardRimWorldRadius } from "./cardRimParams";

/**
 * Side-wall geometry for card stock: quads along the outer perimeter between z = -t/2 and z = +t/2,
 * following the same rounded-rectangle outline as {@link createRoundedCardAlphaMap} /
 * {@link getCardRimWorldRadius}.
 */
export function createRoundedCardEdgeGeometry(
  width: number,
  height: number,
  cornerRadiusNorm: number,
  thickness: number,
  arcSegmentsPerCorner = 10
): BufferGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const cr = Math.min(0.25, Math.max(0, cornerRadiusNorm));
  const rw = cr > 0 ? getCardRimWorldRadius(cr) : 0;
  const r = Math.min(rw, hw, hh);
  const halfT = thickness / 2;

  const pts: Array<[number, number]> = [];

  const addArc = (
    cx: number,
    cy: number,
    rad: number,
    a0: number,
    a1: number,
    segs: number
  ) => {
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const a = a0 + (a1 - a0) * t;
      pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
  };

  if (r <= 1e-6) {
    pts.push([-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]);
  } else {
    pts.push([-hw + r, -hh]);
    pts.push([hw - r, -hh]);
    addArc(hw - r, -hh + r, r, -Math.PI / 2, 0, arcSegmentsPerCorner);
    pts.push([hw, hh - r]);
    addArc(hw - r, hh - r, r, 0, Math.PI / 2, arcSegmentsPerCorner);
    pts.push([-hw + r, hh]);
    addArc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, arcSegmentsPerCorner);
    pts.push([-hw, -hh + r]);
    addArc(-hw + r, -hh + r, r, Math.PI, 1.5 * Math.PI, arcSegmentsPerCorner);
  }

  const first = pts[0];
  const last = pts[pts.length - 1];
  if (
    pts.length >= 2 &&
    Math.abs(first[0] - last[0]) < 1e-6 &&
    Math.abs(first[1] - last[1]) < 1e-6
  ) {
    pts.pop();
  }

  const n = pts.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const p0 = pts[i]!;
    const p1 = pts[(i + 1) % n]!;

    const base = positions.length / 3;
    positions.push(
      p0[0],
      p0[1],
      -halfT,
      p1[0],
      p1[1],
      -halfT,
      p1[0],
      p1[1],
      halfT,
      p0[0],
      p0[1],
      halfT
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}
