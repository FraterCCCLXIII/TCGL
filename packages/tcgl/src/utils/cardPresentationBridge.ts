import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import { TCGL_SHADOW_FADE_UNIFORM } from "../materials/cardFaceShadowDepthMaterial";

function isCardFaceMesh(obj: unknown): obj is Mesh {
  return (
    obj instanceof Mesh &&
    (obj.userData?.tcglCardFace === "front" ||
      obj.userData?.tcglCardFace === "back")
  );
}

/** Update shadow-map fade on face meshes (see {@link createCardFaceShadowDepthMaterial}). */
export function setCardFaceShadowFade(cardRoot: Group, fade: number): void {
  cardRoot.traverse((obj) => {
    if (!isCardFaceMesh(obj)) {
      return;
    }
    const ud = obj.customDepthMaterial?.userData as
      | Record<string, unknown>
      | undefined;
    const u = ud?.[TCGL_SHADOW_FADE_UNIFORM] as { value: number } | undefined;
    if (u) {
      u.value = fade;
    }
  });
}

const TABLE_FACE_ROUGHNESS = 0.45;
const TABLE_FACE_METALNESS = 0.1;

/**
 * Ensure reparented card faces match table presentation: lit standard material + shadow cast.
 * Replaces legacy {@link MeshBasicMaterial} HUD faces; if already standard, aligns PBR params only.
 */
export function convertCardFaceMaterialsHudToTable(cardRoot: Group): void {
  cardRoot.traverse((obj) => {
    if (!isCardFaceMesh(obj)) {
      return;
    }
    const oldM = obj.material;
    if (oldM instanceof MeshBasicMaterial) {
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
        roughness: TABLE_FACE_ROUGHNESS,
        metalness: TABLE_FACE_METALNESS,
        emissive: "#000000",
        emissiveIntensity: 0,
      });
      if (std.map) {
        std.map.colorSpace = SRGBColorSpace;
      }
      oldM.dispose();
      obj.material = std;
    } else if (oldM instanceof MeshStandardMaterial) {
      oldM.roughness = TABLE_FACE_ROUGHNESS;
      oldM.metalness = TABLE_FACE_METALNESS;
      oldM.emissive.setHex(0x000000);
      oldM.emissiveIntensity = 0;
    }
    obj.castShadow = true;
  });
  setCardFaceShadowFade(cardRoot, 1);
}

/**
 * Table → HUD: viewport cards use the same lit materials and keep shadow cast (matches {@link Card}).
 */
export function convertCardFaceMaterialsTableToHud(cardRoot: Group): void {
  cardRoot.traverse((obj) => {
    if (!isCardFaceMesh(obj)) {
      return;
    }
    obj.castShadow = true;
  });
  setCardFaceShadowFade(cardRoot, 0);
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
