import type { R3FGroupProps } from "../../types";

export type DropZoneOverlayProps = {
  /** If true, show semi-transparent overlay (host sets from rules engine). */
  active?: boolean;
  size?: [number, number];
  color?: string;
} & R3FGroupProps;

/**
 * Visual “drop here” region. `active` is a pure visual flag; validity is a host concern.
 */
export function DropZoneOverlay({
  active = false,
  size = [2.2, 2.2],
  color = "#22c55e",
  ...rest
}: DropZoneOverlayProps) {
  const [w, d] = size;
  if (!active) {
    return null;
  }
  return (
    <group {...rest} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh position={[0, 0.01, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
