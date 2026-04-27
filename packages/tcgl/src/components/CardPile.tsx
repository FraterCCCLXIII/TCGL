import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { cardPileIndex } from "../layout/stackLayout";
import type { R3FGroupProps } from "../types";

export type CardPileProps = {
  children?: ReactNode;
  yStep?: number;
} & R3FGroupProps;

/** Overlapping pile with slight jitter (graveyard / discard feel). */
export function CardPile({ children, yStep = 0.018, ...groupProps }: CardPileProps) {
  const list = Children.toArray(children);
  return (
    <group {...groupProps}>
      {list.map((child, i) => {
        if (!isValidElement(child)) {
          return child;
        }
        const { position, rotation } = cardPileIndex(i, yStep);
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
