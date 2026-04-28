import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import { DEFAULT_CARD_TABLE_CLEARANCE_Y } from "../constants/dimensions";
import { TCGL_SHADOW_FADE_UNIFORM } from "../materials/cardFaceShadowDepthMaterial";

function isCardFaceMesh(obj: unknown): obj is Mesh {
  return (
    obj instanceof Mesh &&
    (obj.userData?.tcglCardFace === "front" ||
      obj.userData?.tcglCardFace === "back")
  );
}

/** Matches {@link Card} inner `AnimatedGroup` that applies pointer parallax (not tap `rotZ`). */
export function resetCardPointerTiltGroup(cardRoot: Group): void {
  cardRoot.traverse((o) => {
    const ud = o.userData as Record<string, unknown> | undefined;
    if (ud?.tcglCardPointerTiltGroup === true && o instanceof Group) {
      o.rotation.x = 0;
      o.rotation.y = 0;
    }
  });
}

/**
 * Sets {@link Card} 3D face-flip rig `rotation.y`: `0` = face-up, `Math.PI` = face-down (matches JSX `flipR`).
 * Used when the React `Card` is unmounted (e.g. flight shell / `primitive`) but the mesh tree persists.
 */
export function setCardFlipRigY(cardRoot: Group, rotationY: number): void {
  cardRoot.traverse((o) => {
    const ud = o.userData as Record<string, unknown> | undefined;
    if (ud?.tcglCardFlipRigGroup === true && o instanceof Group) {
      o.rotation.y = rotationY;
    }
  });
}

/**
 * HUD {@link Card} with `screenOverlay`: hover lift is {@link tcglCardLiftGroup} local **Z**
 * (`position-z` in JSX). Use when the React tree is gone but the mesh persists (e.g. hand primitive).
 */
export function setScreenOverlayCardLiftZ(cardRoot: Group, z: number): void {
  cardRoot.traverse((o) => {
    const ud = o.userData as Record<string, unknown> | undefined;
    if (ud?.tcglCardLiftGroup === true && o instanceof Group) {
      o.position.z = z;
    }
  });
}

/**
 * Pointer parallax like {@link Card} pointer handlers: UV in [0,1]² → rotations on
 * {@link tcglCardPointerTiltGroup}. Pass `null` for UV or `maxTilt === 0` to clear tilt.
 */
export function setCardPointerTiltFromUv(
  cardRoot: Group,
  uv: { x: number; y: number } | null,
  maxTilt: number,
): void {
  if (!uv || maxTilt === 0) {
    resetCardPointerTiltGroup(cardRoot);
    return;
  }
  const tx = (uv.y - 0.5) * 2;
  const ty = (uv.x - 0.5) * 2;
  cardRoot.traverse((o) => {
    const ud = o.userData as Record<string, unknown> | undefined;
    if (ud?.tcglCardPointerTiltGroup === true && o instanceof Group) {
      o.rotation.x = tx * maxTilt;
      o.rotation.y = ty * maxTilt;
    }
  });
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
  resetCardPointerTiltGroup(cardRoot);
  /**
   * HUD {@link Card} puts hover/clearance on **local Z**; table {@link Card} uses **local Y**
   * (`tableClearance`). Hand→strip only swapped materials before — inner transforms could stay in
   * HUD space so the mesh reads “wrong” on the strip (often misread as Z depth vs other cards).
   */
  applyCardLayFlatGroupTablePitch(cardRoot);
  const liftWrap = cardRoot.children[0];
  if (liftWrap instanceof Group) {
    liftWrap.position.set(0, DEFAULT_CARD_TABLE_CLEARANCE_Y, 0);
    const flipArc = liftWrap.children[0];
    if (flipArc instanceof Group) {
      flipArc.position.set(0, 0, 0);
    }
  }
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
  resetCardPointerTiltGroup(cardRoot);
  resetCardTableToHudLayoutOffsets(cardRoot);
}

/**
 * Table {@link Card} applies `tableClearance` + hover on the lift group (local Y) and flip-arc lift
 * on a child group. After reparenting into a viewport hand (`screenOverlay`), those offsets must be
 * cleared or the card sits above fan mates that were mounted as HUD cards.
 */
export function resetCardTableToHudLayoutOffsets(cardRoot: Group): void {
  cardRoot.traverse((o) => {
    const ud = o.userData as Record<string, unknown> | undefined;
    if (
      (ud?.tcglCardLiftGroup === true || ud?.tcglCardFlipArcGroup === true) &&
      o instanceof Group
    ) {
      o.position.set(0, 0, 0);
    }
  });

  /**
   * `@react-spring/three` animated groups may not retain `userData` on the underlying node the same
   * way as plain R3F groups — the traverse above can miss. {@link Card} layout is stable:
   * root → lift wrapper → flip-arc group → lay-flat rig…
   */
  const liftWrap = cardRoot.children[0];
  if (liftWrap instanceof Group) {
    liftWrap.position.set(0, 0, 0);
    const flipArc = liftWrap.children[0];
    if (flipArc instanceof Group) {
      flipArc.position.set(0, 0, 0);
    }
  }
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
