import { safeReturnUrl } from './auth.guard';
describe('Destinos tras el login', () => {
  it('permite destinos privados internos', () => {
    expect(safeReturnUrl('/inventario?buscar=C-05')).toBe(
      '/inventario?buscar=C-05',
    );
    expect(safeReturnUrl('/personas')).toBe('/personas');
    expect(safeReturnUrl('/actividad')).toBe('/actividad');
    expect(safeReturnUrl('/conflictos')).toBe('/conflictos');
  });
  it('rechaza redirecciones externas y bucles al login', () => {
    for (const url of [
      null,
      '//example.com',
      'https://example.com',
      '/login',
      '/inicio\\evil',
      '/iniciomalicioso',
      '/%2fexample.com',
    ]) {
      expect(safeReturnUrl(url)).toBe('/inicio');
    }
  });
});
