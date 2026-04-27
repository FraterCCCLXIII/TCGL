import { useTexture } from "@react-three/drei";
import { useLayoutEffect } from "react";
import { SRGBColorSpace, type Texture } from "three";
import { useTCGL } from "../context/TCGLContext";
import { DEFAULT_CARD_H, DEFAULT_CARD_W } from "../constants/dimensions";
import type { R3FGroupProps } from "../types";

export type CardBackProps = {
  back: string;
} & R3FGroupProps;

/**
 * A single back face — useful for deck tops or all-hand-as-backs. No rules, just a mesh.
 */
export function CardBack({ back, ...groupProps }: CardBackProps) {
  const { shadows: shadowsOn } = useTCGL();
  const [t] = useTexture([back]) as [Texture];
  useLayoutEffect(() => {
    t.colorSpace = SRGBColorSpace;
  }, [t]);
  return (
    <group {...groupProps}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh castShadow={shadowsOn}>
          <planeGeometry args={[DEFAULT_CARD_W, DEFAULT_CARD_H]} />
          <meshStandardMaterial map={t} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}
