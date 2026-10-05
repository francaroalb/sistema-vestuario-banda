import { summarizeParticipant } from './series-preparation';
import { Preparation, SeriesBlock } from '../../core/events/models';
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
  it('da prioridad a conflictos y devoluciones pendientes aunque esté todo asignado', () => {
    for (const status of ['CONFLICTO', 'PENDIENTE_DEVOLUCION'] as const) {
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
