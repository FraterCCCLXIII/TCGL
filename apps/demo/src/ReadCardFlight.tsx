import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { useSpring } from "@react-spring/three";
import {
  Euler,
  Group,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { ReactNode } from "react";

export type ReadSnapshot = {
  id: string;
  pos: [number, number, number];
  quat: [number, number, number, number];
  scaleU: number;
};

const LAY_FLAT = new Quaternion().setFromEuler(
  new Euler(-Math.PI / 2, 0, 0, "XYZ")
);

/**
 * World-space rotation of the card root group so a face (+Z in mesh space after `LAY_FLAT`) points
 * toward the camera, matching a billboard-style read.
 */
function readRootQuatFacingCamera(
  readPos: Vector3,
  cameraPos: Vector3
): Quaternion {
  const toCam = new Vector3()
    .subVectors(cameraPos, readPos)
    .normalize();
  const up = new Vector3(0, 1, 0);
  const x = new Vector3().crossVectors(up, toCam);
  if (x.lengthSq() < 1e-10) {
    x.set(1, 0, 0);
  } else {
    x.normalize();
  }
  const y = new Vector3().crossVectors(toCam, x).normalize();
  const m = new Matrix4();
  m.makeBasis(x, y, toCam);
  const qBill = new Quaternion().setFromRotationMatrix(m);
  return qBill.clone().multiply(LAY_FLAT.clone().invert());
}

type ReadCardFlightProps = {
  /** Captured from the on-table `Card` root when read starts. */
  snapshot: ReadSnapshot;
  toPos: [number, number, number];
  /**
   * Target world uniform scale of the `Card` root (same as `decompose` on the `Card` ref on table
   * at read pose) — e.g. `READ_BILLBOARD.scale * cardScale` from the demo.
   */
  toScaleU: number;
  /** When true, animates from read pose back to `snapshot` then calls `onReturnComplete`. */
  leaving: boolean;
  onReturnComplete: () => void;
  children: ReactNode;
};

/**
 * Drives a single `group` in world space from a captured 3D table pose to a front read pose.
 */
export function ReadCardFlight({
  snapshot,
  toPos,
  toScaleU,
  leaving,
  onReturnComplete,
  children,
}: ReadCardFlightProps) {
  const { camera } = useThree();
  const groupRef = useRef<Group>(null);
  const q0 = useMemo(
    () =>
      new Quaternion(
        snapshot.quat[0]!,
        snapshot.quat[1]!,
        snapshot.quat[2]!,
        snapshot.quat[3]!
      ),
    [snapshot]
  );
  const readPosV = useMemo(
    () => new Vector3(toPos[0]!, toPos[1]!, toPos[2]!),
    [toPos]
  );
  const q1 = useMemo(
    () => readRootQuatFacingCamera(readPosV, camera.position),
    [readPosV, camera.position]
  );
  const qBlend = useMemo(() => new Quaternion(), []);

  const [{ px, py, pz, s, t }, api] = useSpring(() => ({
    from: {
      px: snapshot.pos[0]!,
      py: snapshot.pos[1]!,
      pz: snapshot.pos[2]!,
      s: snapshot.scaleU,
      t: 0,
    },
    to: {
      px: toPos[0]!,
      py: toPos[1]!,
      pz: toPos[2]!,
      s: toScaleU,
      t: 1,
    },
    config: { tension: 180, friction: 26 },
  }));

  const leaveFire = useRef(false);

  useEffect(() => {
    if (leaving) {
      if (leaveFire.current) {
        return;
      }
      leaveFire.current = true;
      void api.start({
        to: {
          px: snapshot.pos[0]!,
          py: snapshot.pos[1]!,
          pz: snapshot.pos[2]!,
          s: snapshot.scaleU,
          t: 0,
        },
        config: { tension: 200, friction: 28 },
        onRest: ({ finished }) => {
          if (finished) {
            onReturnComplete();
          }
        },
      });
    } else {
      leaveFire.current = false;
    }
  }, [leaving, api, onReturnComplete, snapshot]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) {
      return;
    }
    g.position.set(px.get(), py.get(), pz.get());
    g.scale.setScalar(s.get());
    const tv = t.get();
    qBlend.copy(q0).slerp(q1, tv);
    g.quaternion.copy(qBlend);
  });

  return (
    <group ref={groupRef} renderOrder={10}>
      {children}
    </group>
  );
}
