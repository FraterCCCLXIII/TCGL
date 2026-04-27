import type { CardSpatialPose } from "tcgl";
import type { Group } from "three";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

/**
 * World matrices of `cardRoot` and `ancestor` must be current — callers should run
 * `updateMatrixWorld(true)` if needed (handled here).
 */
export function sampleCardSpatialPoseInAncestor(
  cardRoot: Group,
  ancestor: Group
): CardSpatialPose {
  cardRoot.updateMatrixWorld(true);
  ancestor.updateMatrixWorld(true);
  const inv = new Matrix4().copy(ancestor.matrixWorld).invert();
  const local = new Matrix4().multiplyMatrices(inv, cardRoot.matrixWorld);
  const pos = new Vector3();
  const quat = new Quaternion();
  const scl = new Vector3();
  local.decompose(pos, quat, scl);
  const euler = new Euler().setFromQuaternion(quat, "XYZ");
  return {
    position: [pos.x, pos.y, pos.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: scl.x,
  };
}
