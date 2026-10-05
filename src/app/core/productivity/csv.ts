export type ImportKind = 'people' | 'garments';
export type ImportRow = Record<string, string>;
export type ImportPreview = {
  kind: ImportKind;
  rows: ImportRow[];
  errors: { row: number; message: string }[];
};
const normalize = (s: string) =>
  s
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function parseImport(text: string, kind: ImportKind): ImportRow[] {
  if (new TextEncoder().encode(text).length > 1000000)
    throw Error('El archivo supera 1 MB. Divide la importación.');
  text = text.replace(/^\uFEFF/, '');
  const header = text.split(/\r?\n/, 1)[0];
  const delimiter = header.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else cell += ch;
    } else if (ch === '"') {
      if (cell || closed) throw Error('Comillas incorrectas en el CSV.');
      quoted = true;
    } else if (ch === delimiter || ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      cell = '';
      closed = false;
      if (ch !== delimiter) {
        if (row.some((c) => c !== '')) rows.push(row);
        row = [];
        if (ch === '\r' && text[i + 1] === '\n') i++;
      }
    } else {
      if (closed && ch.trim()) throw Error('Texto después de cerrar comillas.');
      if (!closed) cell += ch;
    }
  }
  if (quoted) throw Error('Hay comillas sin cerrar en el CSV.');
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  const headers = rows.shift()?.map(normalize) ?? [];
  const fields =
    kind === 'people'
      ? ['nombre', 'tipo', 'instrumento', 'telefono', 'observaciones']
      : ['codigo', 'tipo', 'talla', 'estado', 'observaciones'];
  const required =
    kind === 'people' ? ['nombre', 'tipo'] : ['codigo', 'tipo', 'talla'];
  if (
    new Set(headers).size !== headers.length ||
    headers.some((h) => !fields.includes(h)) ||
    required.some((h) => !headers.includes(h))
  )
    throw Error(
      'Cabeceras incorrectas. Utiliza la plantilla de esta pantalla.',
    );
  if (rows.length < 1 || rows.length > 200)
    throw Error('Importa entre 1 y 200 filas por archivo.');
  return rows.map((cells, index): ImportRow => {
    if (cells.length !== headers.length)
      throw Error(
        'La fila ' + (index + 2) + ' no tiene el número correcto de columnas.',
      );
    const r = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    if (kind === 'people')
      return {
        name: r['nombre'],
        kind:
          (
            {
              componente: 'BANDA',
              banda: 'BANDA',
              refuerzo: 'REFUERZO',
            } as Record<string, string>
          )[normalize(r['tipo'])] ?? r['tipo'],
        instrument: r['instrumento'] ?? '',
        phone: r['telefono'] ?? '',
        notes: r['observaciones'] ?? '',
      };
    const state = normalize(r['estado'] || 'Disponible');
    return {
      code: r['codigo'].toUpperCase(),
      type: r['tipo'],
      size: r['talla'].toUpperCase(),
      state:
        (
          {
            disponible: 'DISPONIBLE',
            'pendiente de lavanderia': 'PENDIENTE_LAVANDERIA',
            pendiente_lavanderia: 'PENDIENTE_LAVANDERIA',
            danada: 'DANADA',
          } as Record<string, string>
        )[state] ?? r['estado'],
      notes: r['observaciones'] ?? '',
    };
  });
}
export function importTemplate(kind: ImportKind) {
  return kind === 'people'
    ? 'nombre;tipo;instrumento;telefono;observaciones\nNombre Apellidos;Componente;Clarinete;;\n'
    : 'codigo;tipo;talla;estado;observaciones\nC01-40;Chaqueta;40;Disponible;\n';
}
