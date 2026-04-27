import { type ReactNode, useMemo } from "react";
import type { PlaymatSide, R3FGroupProps } from "../types";

export type PlayerAreaProps = {
  side: PlaymatSide;
  children?: ReactNode;
} & R3FGroupProps;

const defaultOffset: Record<PlaymatSide, [number, number, number]> = {
  near: [0, 0, 2.2],
  far: [0, 0, -2.2],
};

/**
 * Clusters a player’s table regions. Does not model turns or rules.
 */
export function PlayerArea({
  side,
  userData,
  children,
  position: positionProp,
  ...rest
}: PlayerAreaProps) {
  const merged = useMemo(
    () => ({ ...userData, playmatSide: side }),
    [userData, side]
  );
  const position = (positionProp ?? defaultOffset[side]) as [number, number, number];
  return (
    <group userData={merged} position={position} {...rest}>
      {children}
    </group>
  );
}
