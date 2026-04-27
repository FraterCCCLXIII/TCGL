import type { CardSpatialPose } from "tcgl";
import type { Group } from "three";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

/**
 * Remaps a pose expressed in legacy PlayerArea hand coordinates into {@link playerArea}'s local
 * space using the **world** transform of {@link handHudRoot} (viewport-/camera-attached hand rig).
 * Keeps deck→hand / strip→hand CardMotion nodes parented under PlayerArea working while hands render
 * under the camera.
 */
export function mapHandPaPoseToPlayerAreaMotionSpace(
  posePa: CardSpatialPose,
  handHudRoot: Group,
  playerArea: Group
): CardSpatialPose {
  handHudRoot.updateMatrixWorld(true);
  playerArea.updateMatrixWorld(true);
  const v = new Vector3(
    posePa.position[0],
    posePa.position[1],
    posePa.position[2]
  );
  const world = v.applyMatrix4(handHudRoot.matrixWorld);
  const invPa = new Matrix4().copy(playerArea.matrixWorld).invert();
  const localPa = world.applyMatrix4(invPa);
  return {
    ...posePa,
    position: [localPa.x, localPa.y, localPa.z],
  };
}

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
