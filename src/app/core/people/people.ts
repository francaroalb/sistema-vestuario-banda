import { PersonKind } from '../config/database.types';
export interface PersonInput {
  full_name: string;
  kind: PersonKind;
  instrument: string;
  phone: string;
  notes: string;
}
export interface PeopleFilters {
  q: string;
  kind: PersonKind | '';
  instrument: string;
  archive: 'active' | 'archived' | 'all';
  page: number;
}
export const PEOPLE_PAGE_SIZE = 24;
export const personKinds: { value: PersonKind; label: string }[] = [
  { value: 'BANDA', label: 'Componente' },
  { value: 'REFUERZO', label: 'Refuerzo' },
];
export function personKindLabel(kind: PersonKind): string {
  return personKinds.find((item) => item.value === kind)?.label ?? kind;
}
export function peopleReturnUrl(value: string | null): string {
  return value && /^\/personas(?:\?|$)/.test(value) && !value.includes('\\')
    ? value
    : '/personas';
}
export class PeopleError extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message);
  }
}
export function peopleError(error: unknown): PeopleError {
  if (error instanceof PeopleError) return error;
  const failure = error as { code?: string; message?: string } | null;
  if (failure?.message === 'PERSON_HAS_LOANS')
    return new PeopleError(
      'Esta persona tiene prendas pendientes. Registra su devolución antes de archivar la ficha.',
    );
  if (failure?.code === 'PT409')
    return new PeopleError(
      'Otra persona ha cambiado esta ficha. Vuelve a cargarla y revisa tus cambios antes de guardar.',
      true,
    );
  if (failure?.code === '42501' || failure?.code === 'PGRST301')
    return new PeopleError(
      'Tu sesión no tiene acceso a esta operación. Vuelve a iniciar sesión.',
    );
  if (failure?.code === 'P0002')
    return new PeopleError('No encontramos esta persona. Vuelve al listado.');
  if (failure?.message === 'PERSON_ARCHIVED')
    return new PeopleError(
      'Esta persona está archivada. Reactívala antes de editarla.',
    );
  if (['22023', '22P02', '23514'].includes(failure?.code ?? ''))
    return new PeopleError(
      'Revisa el nombre, el tipo y la longitud de los campos de la ficha.',
    );
  return new PeopleError(
    'No hemos podido completar la operación. Comprueba tu conexión y vuelve a intentarlo.',
  );
}
