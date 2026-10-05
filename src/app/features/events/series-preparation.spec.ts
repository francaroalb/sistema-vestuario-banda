import { summarizeEvent, summarizeParticipant } from './series-preparation';
import { BandEvent, Preparation, SeriesBlock } from '../../core/events/models';
const block = (id = 'b') => ({ id }) as SeriesBlock;
const row = (data: Partial<Preparation> = {}) =>
  ({
    block_id: 'b',
    type_id: 'j',
    type_name: 'Chaqueta',
    code: null,
    garment_id: null,
    status: 'SIN_ASIGNAR',
    ...data,
  }) as Preparation;
describe('Resumen de preparación de un participante', () => {
  it('sitúa las chaquetas pendientes antes que otros tipos pendientes', () => {
    expect(summarizeParticipant([block()], [row()]).priority).toBe(1);
    expect(
      summarizeParticipant([block()], [row({ type_name: 'Camisa' })]).priority,
    ).toBe(2);
  });
  it('no marca preparado por tener solo la chaqueta si falta otra prenda', () => {
    const s = summarizeParticipant(
      [block()],
      [
        row({ garment_id: 'g', code: 'C26-48', status: 'ASIGNADA' }),
        row({ type_id: 's', type_name: 'Camisa' }),
      ],
    );
    expect(s.state).toBe('pending');
    expect(s.jacket).toBe('C26-48');
    expect(s.assigned).toBe(1);
    expect(s.total).toBe(2);
  });
  it('da prioridad a conflictos aunque esté todo asignado', () => {
    for (const status of ['CONFLICTO'] as const) {
      const s = summarizeParticipant(
        [block()],
        [row({ garment_id: 'g', code: 'C26-48', status })],
      );
      expect(s.state).toBe('review');
      expect(s.priority).toBe(0);
    }
  });
  it('cuenta cada tipo una vez por bloque y avisa de chaquetas pendientes en otro periodo', () => {
    const r = row({ garment_id: 'g', code: 'C26-48', status: 'ASIGNADA' });
    const s = summarizeParticipant(
      [block(), block('c')],
      [r, r, row({ block_id: 'c' })],
    );
    expect(s.total).toBe(2);
    expect(s.assigned).toBe(1);
    expect(s.jacket).toContain('Faltan periodos');
    expect(s.state).toBe('pending');
  });
  it('relega al final solo a quienes tienen todo preparado sin incidencias', () => {
    const s = summarizeParticipant(
      [block()],
      [row({ garment_id: 'g', code: 'C26-48', status: 'EN_SU_PODER' })],
    );
    expect(s.state).toBe('ready');
    expect(s.priority).toBe(3);
    expect(summarizeParticipant([block()], []).state).toBe('pending');
  });
});

describe('Resumen de una actuación de la serie', () => {
  const event = { id: 'e2', type_ids: ['j', 's'] } as BandEvent;
  const blocks = [
    { id: 'b', person_id: 'p', event_ids: ['e1', 'e2'] },
    { id: 'c', person_id: 'q', event_ids: ['e1'] },
  ] as SeriesBlock[];
  const jacket = row({
    person_id: 'p',
    event_id: 'e1',
    kind: 'REFUERZO',
    garment_id: 'g',
    status: 'ASIGNADA',
  });
  it('cuenta asistentes sin duplicarlos por prenda ni incluir ausentes, usando el bloque compartido', () => {
    const s = summarizeEvent(event, blocks, [
      jacket,
      row({
        person_id: 'p',
        type_id: 's',
        type_name: 'Camisa',
        kind: 'REFUERZO',
      }),
      row({ block_id: 'c', person_id: 'q' }),
    ]);
    expect(s.total).toBe(1);
    expect(s.reinforcements).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.ready).toBe(false);
    expect(s.types[1]).toMatchObject({ name: 'Camisa', total: 1, assigned: 0 });
  });
  it('solo exige las prendas del uniforme de esta actuación', () => {
    expect(
      summarizeEvent({ ...event, type_ids: ['j'] }, blocks, [jacket]).ready,
    ).toBe(true);
    expect(summarizeEvent(event, blocks, [jacket]).ready).toBe(false);
  });
  it('no marca completo un conflicto ni una actuación vacía', () => {
    for (const status of ['CONFLICTO'] as const) {
      const s = summarizeEvent({ ...event, type_ids: ['j'] }, blocks, [
        { ...jacket, status },
      ]);
      expect(s.ready).toBe(false);
      expect(s.review).toBe(1);
    }
    expect(summarizeEvent(event, [], []).ready).toBe(false);
  });
});

describe('Devolución compatible antes del próximo uso', () => {
  it('cuenta como preparado, conserva el aviso y no lo convierte en conflicto', () => {
    const b = { id: 'b', person_id: 'p', event_ids: ['e'] } as SeriesBlock;
    const r = row({
      person_id: 'p',
      garment_id: 'g',
      code: 'C01-40',
      status: 'PENDIENTE_DEVOLUCION',
    });
    const participant = summarizeParticipant([b], [r]);
    expect(participant.state).toBe('ready');
    expect(participant.notices).toBe(1);
    const event = summarizeEvent(
      { id: 'e', type_ids: ['j'] } as BandEvent,
      [b],
      [r],
    );
    expect(event.ready).toBe(true);
    expect(event.review).toBe(0);
    expect(event.notices).toBe(1);
  });
});
