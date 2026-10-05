import { loanError, loanReturnUrl } from './models';
describe('Cesiones: errores y rutas', () => {
  it('explica falta de firma, posesión y fechas inválidas', () => {
    expect(loanError({ message: 'SIGNATURE_REQUIRED' }).message).toContain(
      'firma',
    );
    expect(
      loanError({ message: 'GARMENT_IN_CUSTODY', code: 'PT409' }).conflict,
    ).toBe(true);
    expect(loanError({ message: 'INVALID_DUE_DATE' }).message).toContain(
      'Madrid',
    );
    expect(
      loanError({ message: 'REQUEST_ALREADY_USED', code: 'PT409' }).message,
    ).toContain('Consulta la cesión');
    expect(loanError(new Error('database secret')).message).not.toContain(
      'secret',
    );
  });
  it('solo vuelve a listados de cesiones', () => {
    expect(loanReturnUrl('/cesiones?estado=closed')).toBe(
      '/cesiones?estado=closed',
    );
    for (const value of [
      null,
      '//evil.test',
      '/cesiones/otra',
      'https://evil.test',
      '/cesiones\\evil',
    ])
      expect(loanReturnUrl(value)).toBe('/cesiones');
  });
});
