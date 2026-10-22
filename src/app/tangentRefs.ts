import type { Item2D, TangentRef } from './types';
import { item2DLabel } from './curveRefs';

export interface TangentChoice extends TangentRef {
  label: string;
}

export function tangentRefKey(ref: TangentRef): string {
  return `${ref.ownerId}:${ref.tangentId}`;
}

export function sameTangent(a: TangentRef | null, b: TangentRef | null): boolean {
  return !!a && !!b && a.ownerId === b.ownerId && a.tangentId === b.tangentId;
}

export function buildTangentChoices(items2d: Item2D[]): TangentChoice[] {
  const choices: TangentChoice[] = [];
  for (const item of items2d) {
    item.tangents.forEach((tangent, index) => {
      const equation = tangent.meta?.equation ? ` ${tangent.meta.equation}` : '';
      choices.push({
        ownerId: item.id,
        tangentId: tangent.id,
        label: `${item2DLabel(item)} · 切线 ${index + 1}${equation}`,
      });
    });
  }
  return choices;
}

export function findTangentRef(
  items2d: Item2D[],
  ref: TangentRef,
): { item: Item2D; tangentId: string; index: number } | null {
  const item = items2d.find((candidate) => candidate.id === ref.ownerId);
  if (!item) return null;
  const index = item.tangents.findIndex((tangent) => tangent.id === ref.tangentId);
  if (index < 0) return null;
  return { item, tangentId: ref.tangentId, index };
}
