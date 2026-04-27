import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { cardGridIndex } from "../layout/stackLayout";
import type { R3FGroupProps } from "../types";

export type CardGridProps = {
  children?: ReactNode;
  cols: number;
  colGap?: number;
  rowGap?: number;
} & R3FGroupProps;

export function CardGrid({
  children,
  cols,
  colGap = 1.1,
  rowGap = 1.45,
  ...groupProps
}: CardGridProps) {
  const list = Children.toArray(children);
  return (
    <group {...groupProps}>
      {list.map((child, i) => {
        if (!isValidElement(child)) {
          return child;
        }
        const { position, rotation } = cardGridIndex(i, { cols, colGap, rowGap });
        return (
          <group
            key={child.key ?? i}
            position={position}
            rotation={rotation}
          >
            {cloneElement(child, {})}
          </group>
        );
      })}
    </group>
  );
}
