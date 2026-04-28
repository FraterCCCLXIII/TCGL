import type { CardSpatialPose } from "tcgl";
import type { Group } from "three";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

/**
 * Converts a pose expressed **local to {@link handHudRoot}** (HUD fan slot from {@link ./zoneView.computeViewportHandSlotPosePA}) into {@link playerArea}'s local space using the full chain:
 * `inv(playerArea.matrixWorld) * handHudRoot.matrixWorld * TRS(hud-local pose)`.
 * Position-only mapping was wrong once the HUD root carries camera/view rotation — rotation and scale
 * must compose with the HUD rig so attached-shell flights land where on-screen cards actually sit.
 */
export function mapHandPaPoseToPlayerAreaMotionSpace(
  posePa: CardSpatialPose,
  handHudRoot: Group,
  playerArea: Group
): CardSpatialPose {
  handHudRoot.updateMatrixWorld(true);
  playerArea.updateMatrixWorld(true);

  const pos = new Vector3(
    posePa.position[0],
    posePa.position[1],
    posePa.position[2]
  );
  const euler = new Euler(
    posePa.rotation?.[0] ?? 0,
    posePa.rotation?.[1] ?? 0,
    posePa.rotation?.[2] ?? 0,
    "XYZ"
  );
  const quat = new Quaternion().setFromEuler(euler);
  const u = posePa.scale ?? 1;
  const sclVec = new Vector3(u, u, u);

  const localMat = new Matrix4().compose(pos, quat, sclVec);
  const worldMat = new Matrix4().multiplyMatrices(
    handHudRoot.matrixWorld,
    localMat
  );
  const invPa = new Matrix4().copy(playerArea.matrixWorld).invert();
  const paMat = new Matrix4().multiplyMatrices(invPa, worldMat);

  const outPos = new Vector3();
  const outQuat = new Quaternion();
  const outScl = new Vector3();
  paMat.decompose(outPos, outQuat, outScl);
  const outEuler = new Euler().setFromQuaternion(outQuat, "XYZ");

  return {
    ...posePa,
    position: [outPos.x, outPos.y, outPos.z],
    rotation: [outEuler.x, outEuler.y, outEuler.z],
    scale: outScl.x,
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
