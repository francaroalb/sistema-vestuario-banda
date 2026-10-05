import { Preparation, SeriesBlock } from '../../core/events/models';

export type ParticipantSummary = {
  state: 'pending' | 'review' | 'ready';
  priority: number;
  jacket: string;
  assigned: number;
  total: number;
};
export function summarizeParticipant(
  blocks: SeriesBlock[],
  rows: Preparation[],
): ParticipantSummary {
  const ids = new Set(blocks.map((b) => b.id));
  // The API contains one row per event; count each type once within its block.
  const unique = [
    ...new Map(
      rows
        .filter((r) => ids.has(r.block_id!))
        .map((r) => [r.block_id + ':' + r.type_id, r]),
    ).values(),
  ];
  const jackets = unique.filter(
    (r) => r.type_name.toLocaleLowerCase('es') === 'chaqueta',
  );
  const codes = [
    ...new Set(jackets.map((r) => r.code).filter((c): c is string => !!c)),
  ];
  const missingJacket = jackets.some((r) => !r.garment_id);
  const review = unique.some(
    (r) => r.status === 'CONFLICTO' || r.status === 'PENDIENTE_DEVOLUCION',
  );
  const assigned = unique.filter((r) => r.garment_id).length;
  const ready = unique.length > 0 && assigned === unique.length && !review;
  return {
    state: review ? 'review' : ready ? 'ready' : 'pending',
    priority: review ? 0 : missingJacket ? 1 : ready ? 3 : 2,
    jacket: !jackets.length
      ? 'Sin chaqueta en el uniforme'
      : !codes.length
        ? 'Chaqueta sin asignar'
        : codes.join(' · ') + (missingJacket ? ' · Faltan periodos' : ''),
    assigned,
    total: unique.length,
  };
}
