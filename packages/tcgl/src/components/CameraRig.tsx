import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import type { PerspectiveCamera as PerspectiveCameraImpl } from "three";
import { Vector3 } from "three";

export type CameraRigProps = {
  children?: ReactNode;
  position?: [number, number, number];
  fov?: number;
  makeDefault?: boolean;
  /** World point the camera looks at. Default: table center. */
  lookAt?: [number, number, number];
};

/**
 * Sensible table-style perspective. The default view direction does not auto-point at the table;
 * we `lookAt` every frame after R3F updates position so the playmat and cards stay in frame.
 */
export function CameraRig({
  children,
  position = [0, 7, 8],
  fov = 45,
  makeDefault = true,
  lookAt: lookAtArg = [0, 0, 0] as [number, number, number],
}: CameraRigProps) {
  const ref = useRef<PerspectiveCameraImpl>(null);
  const target = useMemo(
    () => new Vector3(lookAtArg[0]!, lookAtArg[1]!, lookAtArg[2]!),
    [lookAtArg[0], lookAtArg[1], lookAtArg[2]]
  );

  useFrame(() => {
    ref.current?.lookAt(target);
  });

  return (
    <>
      <PerspectiveCamera
        ref={ref}
        makeDefault={makeDefault}
        fov={fov}
        near={0.1}
        far={200}
        position={position}
      />
      {children}
    </>
  );
}
