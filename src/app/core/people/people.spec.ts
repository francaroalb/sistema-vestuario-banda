import { peopleError, peopleReturnUrl, personKindLabel } from './people';
describe('Personas: navegación y mensajes', () => {
  it('solo permite volver al listado privado de personas', () => {
    expect(peopleReturnUrl('/personas?tipo=BANDA&pagina=2')).toBe(
      '/personas?tipo=BANDA&pagina=2',
    );
    for (const value of [
      null,
      '//example.test',
      'https://example.test',
      '/personas/nueva',
      '/personas\\evil',
      '/personas-mal',
    ])
      expect(peopleReturnUrl(value)).toBe('/personas');
  });
  it('explica conflicto, archivo y errores sin exponer datos técnicos', () => {
    expect(peopleError({ code: 'PT409' }).conflict).toBe(true);
    expect(
      peopleError({ code: '22023', message: 'PERSON_ARCHIVED' }).message,
    ).toContain('Reactívala');
    expect(peopleError({ code: '42501' }).message).toContain('sesión');
    expect(peopleError({ code: '22023' }).message).toContain('nombre');
    expect(
      peopleError(new Error('sensitive database error')).message,
    ).not.toContain('database');
  });
  it('distingue banda de refuerzo', () => {
    expect(personKindLabel('BANDA')).toBe('Músico de la Banda');
    expect(personKindLabel('REFUERZO')).toBe('Refuerzo');
  });
});
