import { ContactShadows, Line, MeshReflectorMaterial } from "@react-three/drei";
import { type ReactNode, useMemo } from "react";
import { Vector3 } from "three";
import { useTCGL } from "../context/TCGLContext";
import type { R3FGroupProps } from "../types";

export type PlaymatProps = {
  children?: ReactNode;
  size?: [number, number];
  y?: number;
  color?: string;
  reflector?: boolean;
  splitSides?: { near: string; far: string };
  showCenterSeam?: boolean;
  showZoneGuides?: boolean;
  /** Soft contact-style shadows for objects above the mat (drei `ContactShadows`). @default true */
  contactShadows?: boolean;
  /**
   * When false, omits the procedural table meshes and contact shadows; `tilt` / `position` still
   * apply to children. @default true
   */
  showSurface?: boolean;
  /**
   * Renders a full `w`×`d` `ShadowMaterial` floor (invisible except for received shadows) when
   * there is no procedural `showSurface` — use with a 2D playmat under a transparent WebGL clear.
   * @default false
   */
  shadowCatcher?: boolean;
  /**
   * How dark the received directional + ambient-shadow term reads on the shadow catcher. @default 0.22
   */
  shadowCatcherOpacity?: number;
  /**
   * World-space Euler rotation of the playmat **root** (radians, `[x, y, z]` = pitch / yaw / roll).
   * Tips the table surface and all children together. @default [0, 0, 0]
   */
  tilt?: [number, number, number];
} & Omit<R3FGroupProps, "position"> & {
  position?: R3FGroupProps["position"];
};

/**
 * Main table surface. A player/opponent “split” is only visual, not a rule.
 */
export function Playmat({
  children,
  size = [16, 12],
  y = 0,
  color = "#5c5c64",
  reflector = false,
  splitSides,
  showCenterSeam = true,
  showZoneGuides = false,
  contactShadows = true,
  showSurface = true,
  shadowCatcher = false,
  shadowCatcherOpacity = 0.22,
  tilt = [0, 0, 0] as [number, number, number],
  ...groupProps
}: PlaymatProps) {
  const [w, d] = size;
  const halfW = w / 2;
  const args = useMemo(() => [w, d] as [number, number], [w, d]);
  const halfArgs = useMemo(
    () => [halfW, d] as [number, number],
    [halfW, d]
  );
  const yNum = y;
  const margin = 0.98;
  const { shadows: shadowsOn } = useTCGL();
  /** Invisible table that only shows shadows — not combined with a solid procedural top (that would block a 2D playmat). */
  const useShadowCatcher = shadowCatcher && !showSurface;
  const hasFloor = showSurface || useShadowCatcher;
  const showContact = contactShadows && shadowsOn && hasFloor;
  const guide = useMemo(() => {
    const hw = (w * margin) / 2;
    const hd = (d * margin) / 2;
    return [
      new Vector3(-hw, 0, -hd),
      new Vector3(hw, 0, -hd),
      new Vector3(hw, 0, hd),
      new Vector3(-hw, 0, hd),
      new Vector3(-hw, 0, -hd),
    ];
  }, [d, w]);

  return (
    <group
      position={[0, yNum, 0]}
      {...groupProps}
      rotation={tilt as [number, number, number]}
    >
      {hasFloor ? (
        <>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            {useShadowCatcher ? (
              <mesh position={[0, 0, 0]} receiveShadow={shadowsOn}>
                <planeGeometry args={args} />
                <shadowMaterial
                  color="#000000"
                  opacity={shadowCatcherOpacity}
                  transparent
                />
              </mesh>
            ) : null}
            {showSurface ? (
              splitSides ? (
                <>
                  <mesh
                    position={[-halfW / 2, 0, 0.0015]}
                    receiveShadow={shadowsOn}
                    renderOrder={0}
                  >
                    <planeGeometry args={halfArgs} />
                    <meshStandardMaterial
                      color={splitSides.near}
                      roughness={0.92}
                      metalness={0.04}
                    />
                  </mesh>
                  <mesh
                    position={[halfW / 2, 0, 0.0015]}
                    receiveShadow={shadowsOn}
                    renderOrder={0}
                  >
                    <planeGeometry args={halfArgs} />
                    <meshStandardMaterial
                      color={splitSides.far}
                      roughness={0.92}
                      metalness={0.04}
                    />
                  </mesh>
                  {showCenterSeam && (
                    <mesh position={[0, 0, 0.0025]} renderOrder={0}>
                      <planeGeometry args={[0.04, d]} />
                      <meshStandardMaterial
                        color="#6c6c74"
                        emissive="#4e4e56"
                        emissiveIntensity={0.12}
                      />
                    </mesh>
                  )}
                </>
              ) : reflector ? (
                <mesh position={[0, 0, 0.001]} receiveShadow={shadowsOn}>
                  <planeGeometry args={args} />
                  <MeshReflectorMaterial
                    color={color}
                    blur={[256, 128]}
                    resolution={256}
                    mirror={0.35}
                  />
                </mesh>
              ) : (
                <mesh position={[0, 0, 0.001]} receiveShadow={shadowsOn}>
                  <planeGeometry args={args} />
                  <meshStandardMaterial color={color} roughness={0.9} metalness={0.05} />
                </mesh>
              )
            ) : null}

            {showZoneGuides && !splitSides && showSurface && (
              <Line
                points={guide}
                color="#7a7a86"
                lineWidth={1}
                opacity={0.4}
                transparent
                position={[0, 0.002, 0]}
              />
            )}
          </group>
          {showContact ? (
            <ContactShadows
              position={[0, 0.002, 0]}
              resolution={256}
              width={1}
              height={1}
              scale={[w, d]}
              opacity={0.48}
              blur={1.4}
              far={16}
            />
          ) : null}
        </>
      ) : null}
      {children}
    </group>
  );
}
