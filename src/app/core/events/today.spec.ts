import { madridDayRange } from './today';
describe('Actuaciones del día de Madrid', () => {
  it('cambia de día según Madrid aunque siga siendo ayer en UTC', () => {
    expect(madridDayRange(new Date('2026-10-05T22:30:00Z'))).toEqual({
      day: '2026-10-06',
      from: '2026-10-05T22:00:00.000Z',
      until: '2026-10-06T22:00:00.000Z',
    });
  });
  it('incluye las 23 horas del cambio de marzo y las 25 del cambio de octubre', () => {
    for (const [date, hours] of [
      ['2026-03-29T12:00:00Z', 23],
      ['2026-10-25T12:00:00Z', 25],
    ] as const) {
      const r = madridDayRange(new Date(date));
      expect((Date.parse(r.until) - Date.parse(r.from)) / 3600000).toBe(hours);
    }
  });
});
