import { BandEvent, Preparation, SeriesBlock } from '../../core/events/models';

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

/** Rows are returned once per block, even when it spans several performances. */
export function summarizeEvent(
  event: BandEvent,
  blocks: SeriesBlock[],
  rows: Preparation[],
) {
  const attending = blocks.filter((b) => b.event_ids.includes(event.id));
  const people = new Map(attending.map((b) => [b.person_id, b]));
  const blockIds = new Set(attending.map((b) => b.id));
  const relevant = rows.filter((r) => blockIds.has(r.block_id!));
  const lookup = new Map(
    relevant.map((r) => [r.person_id + ':' + r.type_id, r]),
  );
  const types = event.type_ids.map((id) => {
    let assigned = 0,
      review = 0;
    for (const person of people.keys()) {
      const r = lookup.get(person + ':' + id);
      if (r?.garment_id && r.status !== 'SIN_ASIGNAR') assigned++;
      if (r?.status === 'CONFLICTO' || r?.status === 'PENDIENTE_DEVOLUCION')
        review++;
    }
    return {
      id,
      name: rows.find((r) => r.type_id === id)?.type_name ?? 'Prenda',
      total: people.size,
      assigned,
      review,
    };
  });
  const reinforcements = new Set(
    relevant.filter((r) => r.kind === 'REFUERZO').map((r) => r.person_id),
  ).size;
  const pending = types.reduce((n, t) => n + t.total - t.assigned, 0);
  const review = types.reduce((n, t) => n + t.review, 0);
  return {
    total: people.size,
    reinforcements,
    types,
    pending,
    review,
    ready: people.size > 0 && types.length > 0 && pending === 0 && review === 0,
  };
}
