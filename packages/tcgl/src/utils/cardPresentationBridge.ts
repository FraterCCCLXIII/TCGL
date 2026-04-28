import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";

function isCardFaceMesh(obj: unknown): obj is Mesh {
  return (
    obj instanceof Mesh &&
    (obj.userData?.tcglCardFace === "front" ||
      obj.userData?.tcglCardFace === "back")
  );
}

/**
 * Swap HUD viewport face materials (MeshBasic) for lit table materials so a reparented card root
 * matches strip/battlefield rendering without remounting {@link Card}.
 */
export function convertCardFaceMaterialsHudToTable(cardRoot: Group): void {
  cardRoot.traverse((obj) => {
    if (!isCardFaceMesh(obj)) {
      return;
    }
    const oldM = obj.material;
    if (!(oldM instanceof MeshBasicMaterial)) {
      return;
    }
    const std = new MeshStandardMaterial({
      color: oldM.color.clone(),
      map: oldM.map ?? undefined,
      transparent: oldM.transparent,
      opacity: oldM.opacity,
      side: oldM.side,
      depthWrite: oldM.depthWrite,
      alphaMap: oldM.alphaMap ?? undefined,
      alphaTest: oldM.alphaTest > 0 ? oldM.alphaTest : 0,
      polygonOffset: oldM.polygonOffset,
      polygonOffsetFactor: oldM.polygonOffsetFactor,
      polygonOffsetUnits: oldM.polygonOffsetUnits,
      roughness: 0.45,
      metalness: 0.1,
      emissive: "#000000",
      emissiveIntensity: 0,
    });
    if (std.map) {
      std.map.colorSpace = SRGBColorSpace;
    }
    oldM.dispose();
    obj.material = std;
    obj.castShadow = true;
  });
}

/**
 * Swap lit table face materials for HUD viewport basics after a flight lands in the screen hand.
 */
export function convertCardFaceMaterialsTableToHud(cardRoot: Group): void {
  cardRoot.traverse((obj) => {
    if (!isCardFaceMesh(obj)) {
      return;
    }
    const oldM = obj.material;
    if (!(oldM instanceof MeshStandardMaterial)) {
      return;
    }
    const basic = new MeshBasicMaterial({
      color: oldM.color.clone(),
      map: oldM.map ?? undefined,
      transparent: oldM.transparent,
      opacity: oldM.opacity,
      side: oldM.side,
      depthWrite: oldM.depthWrite,
      alphaMap: oldM.alphaMap ?? undefined,
      alphaTest: oldM.alphaTest > 0 ? oldM.alphaTest : 0,
      polygonOffset: oldM.polygonOffset,
      polygonOffsetFactor: oldM.polygonOffsetFactor,
      polygonOffsetUnits: oldM.polygonOffsetUnits,
    });
    if (basic.map) {
      basic.map.colorSpace = SRGBColorSpace;
    }
    oldM.dispose();
    obj.material = basic;
    obj.castShadow = false;
  });
}

/** Lay-flat rig: matches JSX when `screenOverlay` is false (table). */
export function applyCardLayFlatGroupTablePitch(cardRoot: Group): void {
  cardRoot.traverse((o) => {
    const ud = o.userData as Record<string, unknown> | undefined;
    if (ud?.tcglLayFlatPitchGroup === true && o instanceof Group) {
      o.rotation.set(-Math.PI / 2, 0, 0);
    }
  });
}

/** Lay-flat rig: matches JSX when `screenOverlay` is true (HUD portrait). */
export function applyCardLayFlatGroupHudPitch(cardRoot: Group): void {
  cardRoot.traverse((o) => {
    const ud = o.userData as Record<string, unknown> | undefined;
    if (ud?.tcglLayFlatPitchGroup === true && o instanceof Group) {
      o.rotation.set(0, 0, 0);
    }
  });
}
