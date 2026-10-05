import {
  inventoryError,
  inventoryReturnUrl,
  literalSearch,
  formatTimestamp,
} from './inventory';
describe('Reglas de presentación de inventario', () => {
  it('busca símbolos SQL como caracteres literales', () => {
    expect(literalSearch(' C%_05 ')).toBe('C\\%\\_05');
    expect(literalSearch('A\\B')).toBe('A\\\\B');
  });
  it('solo conserva retornos al listado de inventario', () => {
    expect(inventoryReturnUrl('/inventario?estado=DANADA&pagina=2')).toBe(
      '/inventario?estado=DANADA&pagina=2',
    );
    for (const path of [
      'https://example.test',
      '//example.test',
      '/inventario/nueva',
      '/inventario\\evil',
      null,
    ])
      expect(inventoryReturnUrl(path)).toBe('/inventario');
  });
  it('explica duplicados y cambios concurrentes sin mostrar errores SQL', () => {
    expect(
      inventoryError({ code: '23505', message: 'private key' }).message,
    ).toContain('archivadas');
    expect(inventoryError({ code: 'PT409' }).conflict).toBe(true);
    expect(inventoryError({ code: '42501' }).message).toContain('sesión');
    expect(
      inventoryError(new Error('database password')).message,
    ).not.toContain('password');
  });
  it('muestra las horas de Madrid también en cambios de horario', () => {
    expect(formatTimestamp('2026-01-10T12:00:00Z')).toContain('13:00');
    expect(formatTimestamp('2026-07-10T12:00:00Z')).toContain('14:00');
  });
});
