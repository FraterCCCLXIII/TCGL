import { ContactShadows, Line, MeshReflectorMaterial } from "@react-three/drei";
import { type ReactNode, useMemo } from "react";
import { Vector3 } from "three";
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
    <group position={[0, yNum, 0]} {...groupProps}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {splitSides ? (
          <>
            <mesh position={[-halfW / 2, 0, 0]} receiveShadow renderOrder={0}>
              <planeGeometry args={halfArgs} />
              <meshStandardMaterial
                color={splitSides.near}
                roughness={0.92}
                metalness={0.04}
              />
            </mesh>
            <mesh position={[halfW / 2, 0, 0]} receiveShadow renderOrder={0}>
              <planeGeometry args={halfArgs} />
              <meshStandardMaterial
                color={splitSides.far}
                roughness={0.92}
                metalness={0.04}
              />
            </mesh>
            {showCenterSeam && (
              <mesh position={[0, 0, 0.001]} renderOrder={0}>
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
          <mesh receiveShadow>
            <planeGeometry args={args} />
            <MeshReflectorMaterial
              color={color}
              blur={[256, 128]}
              resolution={256}
              mirror={0.35}
            />
          </mesh>
        ) : (
          <mesh receiveShadow>
            <planeGeometry args={args} />
            <meshStandardMaterial color={color} roughness={0.9} metalness={0.05} />
          </mesh>
        )}

        {showZoneGuides && !splitSides && (
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
      {contactShadows && (
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
      )}
      {children}
    </group>
  );
}
