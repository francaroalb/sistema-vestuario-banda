import { parseImport } from './csv';
describe('Importación CSV', () => {
  it('lee Excel UTF-8 con BOM, punto y coma, comillas y saltos dentro de notas', () => {
    const r = parseImport(
      '\uFEFFnombre;tipo;instrumento;observaciones\r\n"Ana; García";Componente;Clarinete;"Una nota\ncon ""comillas"""',
      'people',
    );
    expect(r[0]).toMatchObject({
      name: 'Ana; García',
      kind: 'BANDA',
      notes: 'Una nota\ncon "comillas"',
    });
  });
  it('acepta comas y normaliza tallas y códigos sin convertir fórmulas', () => {
    expect(
      parseImport('codigo,tipo,talla\nc01-40,Chaqueta,40', 'garments')[0],
    ).toMatchObject({ code: 'C01-40', size: '40', state: 'DISPONIBLE' });
  });
  it('rechaza cabeceras repetidas, filas desalineadas, comillas incompletas y exceso de filas', () => {
    for (const text of [
      'nombre,nombre,tipo\nAna,Ana,Componente',
      'nombre,tipo\nAna,Componente,extra',
      'nombre,tipo\n"Ana,Componente',
      'nombre,tipo\n' + Array(201).fill('Ana,Componente').join('\n'),
    ])
      expect(() => parseImport(text, 'people')).toThrow();
  });
});
