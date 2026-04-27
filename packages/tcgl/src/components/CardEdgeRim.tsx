import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BackSide, FrontSide, Mesh, Raycaster, type Intersection, type Object3D, type Texture } from "three";
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

  useFrame(() => {
    const a = matRef.current;
    if (a) {
      a.uniforms.uAlpha.value = alphaSpring.get();
    }
  });

  // Must update depth side when flipping — double-sided is safer for shallow angles.
  return (
    <mesh
      frustumCulled={false}
      position={[0, 0, z]}
      renderOrder={3}
      onUpdate={(self: Object3D) => {
        (self as Mesh).raycast = noRaycast;
      }}
    >
      <planeGeometry args={[w, h]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
