import { describe, expect, it } from 'vitest';
import { folderSection } from './navigation';
describe('Folder navigation context', () => {
  it('keeps inventory, repertoire, incidents and loans in their own section', () => {
    expect(folderSection('/carpetas')).toBe('/carpetas');
    expect(folderSection('/inventario/carpetas/123/contenido?volver=x')).toBe(
      '/inventario/carpetas',
    );
    expect(folderSection('/inventario/carpetas/repertorio/123/editar')).toBe(
      '/inventario/carpetas/repertorio',
    );
    expect(folderSection('/inventario/carpetas/incidencias/COPY/nueva')).toBe(
      '/inventario/carpetas/mantenimiento',
    );
    expect(folderSection('/cesiones/carpetas/123/devolver')).toBe(
      '/cesiones/carpetas',
    );
  });
  it('does not capture wardrobe or similar path names', () => {
    for (const url of [
      '/inventario/123',
      '/cesiones/123',
      '/inicio',
      '/personas/123',
      '/inventario/carpetas-extra',
    ]) {
      expect(folderSection(url)).toBeNull();
    }
  });
});
