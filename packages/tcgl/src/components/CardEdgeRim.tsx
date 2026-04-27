import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BackSide, FrontSide, Mesh, Raycaster, type Intersection, type Object3D, type Texture } from "three";
import {
  HAND_REORDER_MESH_DRAGGED_ON_TOP,
  HAND_REORDER_MESH_UNDER,
} from "../constants/handReorderPaint";
import { createCardEdgeRimMaterial, setCardRimColor } from "../materials/cardEdgeRimMaterial";

type CardEdgeRimProps = {
  face: "front" | "back";
  /** Slightly offset along local Z (front: positive = toward viewer). */
  z: number;
  color: string;
  width: number;
  height: number;
  falloff: number;
  cornerRadiusWorld: number;
  alphaMap: Texture | null;
  /** Animated 0 = invisible; >0 = rim strength. */
  alphaSpring: { get: () => number };
  /** Hand reorder paint — additive rim must follow face quads or it occludes wrongly. */
  handReorderRole?: "dragged" | "neighbor";
};

function noRaycast(_r: Raycaster, _i: Intersection[]) {}

export function CardEdgeRim({
  face,
  z,
  color,
  width: w,
  height: h,
  falloff,
  cornerRadiusWorld,
  alphaMap,
  alphaSpring,
  handReorderRole,
}: CardEdgeRimProps) {
  const mat = useMemo(
    () =>
      createCardEdgeRimMaterial({
        color: "#ffffff",
        falloff,
        sizeW: w,
        sizeH: h,
        cornerRadiusWorld,
        alphaMap,
        side: face === "back" ? BackSide : FrontSide,
      }),
    [face, falloff, w, h, cornerRadiusWorld, alphaMap]
  );

  const matRef = useRef(mat);
  matRef.current = mat;

  useLayoutEffect(() => {
    return () => {
      mat.dispose();
    };
  }, [mat]);

  useLayoutEffect(() => {
    setCardRimColor(mat, color);
  }, [color, mat]);

  useLayoutEffect(() => {
    mat.depthTest = handReorderRole !== "dragged";
  }, [handReorderRole, mat]);

  useFrame(() => {
    const a = matRef.current;
    if (a) {
      a.uniforms.uAlpha.value = alphaSpring.get();
    }
  });

  // Must update depth side when flipping — double-sided is safer for shallow angles.
  const rimRo =
    handReorderRole === "dragged"
      ? HAND_REORDER_MESH_DRAGGED_ON_TOP + 3
      : handReorderRole === "neighbor"
        ? HAND_REORDER_MESH_UNDER + 3
        : 3;

  return (
    <mesh
      frustumCulled={false}
      position={[0, 0, z]}
      renderOrder={rimRo}
      onUpdate={(self: Object3D) => {
        (self as Mesh).raycast = noRaycast;
      }}
    >
      <planeGeometry args={[w, h]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
