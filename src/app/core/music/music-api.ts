import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../config/supabase';
import { Json } from '../config/database.types';
import {
  MusicInputs,
  MusicResults,
  PresencePreview,
  PresenceResult,
  MusicPage,
} from './models';

export class MusicError extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message);
  }
}
export function musicError(error: unknown): MusicError {
  if (error instanceof MusicError) return error;
  const e = error as { message?: string; code?: string } | null;
  const messages: Record<string, string> = {
    ADMIN_REQUIRED: 'Tu sesión no tiene acceso. Vuelve a iniciar sesión.',
    MUSIC_CHANGED:
      'Los datos han cambiado. Vuelve a revisar la operación antes de confirmar.',
    MUSIC_PRESENCE_CHANGED:
      'El contenido de alguna carpeta ya no coincide con la operación. Revisa de nuevo la selección.',
    REQUEST_ALREADY_USED:
      'Esta petición ya se utilizó con otros datos. Vuelve a preparar la operación.',
    MUSIC_IDENTITY_FIXED:
      'El código, la voz y el repertorio identifican el material y no pueden cambiarse en esta edición.',
    MUSIC_VOICE_UNAVAILABLE: 'Selecciona una voz activa del catálogo.',
    MUSIC_INVALID_CODE:
      'El código debe coincidir con el repertorio y la voz, seguido del número de la etiqueta.',
    MUSIC_FOLDER_ARCHIVED:
      'Reactiva la carpeta antes de modificar su contenido o registrar nuevas incidencias.',
    MUSIC_REPERTOIRE_MISMATCH:
      'La obra y la carpeta deben pertenecer al mismo repertorio.',
    MUSIC_SCORE_ABSENT:
      'La partitura no consta presente. Registra su ausencia o confirma primero su incorporación.',
    MUSIC_MISSING_UNRESOLVED:
      'Confirma la recuperación de la partitura. Solo puede cerrarse como ausente si la obra está retirada.',
    MUSIC_RESOLVE_MISSING:
      'Resuelve primero la incidencia de partitura faltante confirmando su recuperación.',
    MUSIC_ISSUE_RESOLVED:
      'La incidencia ya está resuelta. Consulta su historial o registra una nueva.',
    MUSIC_NOT_FOUND: 'No encontramos el registro. Vuelve a cargar el listado.',
    MUSIC_INVALID_DATA: 'Revisa los campos de la operación.',
  };
  if (e?.message && messages[e.message])
    return new MusicError(messages[e.message], e.code === 'PT409');
  if (e?.code === '23505')
    return new MusicError(
      'Ya existe ese código o una incidencia abierta equivalente. Revisa el registro existente.',
      true,
    );
  if (e?.code === '42501' || e?.code === 'PGRST301')
    return new MusicError(messages['ADMIN_REQUIRED']);
  if (e?.code === 'PT409')
    return new MusicError(messages['MUSIC_CHANGED'], true);
  if (['22023', '22P02', '23503', '23514', '22003'].includes(e?.code ?? ''))
    return new MusicError(messages['MUSIC_INVALID_DATA']);
  return new MusicError(
    'No se ha podido completar la operación. Comprueba la conexión y reintenta con la misma petición.',
  );
}
export function musicPage<T>(r: {
  data: T[] | null;
  count: number | null;
  error: unknown;
}): MusicPage<T> {
  if (r.error) throw musicError(r.error);
  return { rows: r.data ?? [], count: r.count ?? 0 };
}
export function pageRange(page: number): [number, number] {
  const safe = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return [(safe - 1) * 24, safe * 24 - 1];
}
@Injectable({ providedIn: 'root' })
export class MusicApi {
  private readonly service = inject(SupabaseService);
  get client() {
    if (!this.service.client)
      throw new MusicError('El acceso no está configurado.');
    return this.service.client;
  }
  // Callers keep this UUID through retries. Never generate a new one on a network retry.
  async command<A extends keyof MusicInputs>(
    action: A,
    id: string,
    version: number | null,
    data: MusicInputs[A],
    request: string,
  ): Promise<MusicResults[A]> {
    const r = await this.client
      .rpc('music_command', {
        p_request: request,
        p_action: action,
        p_id: id,
        p_expected_version: version,
        p_data: data as unknown as Json,
      })
      .retry(false);
    if (r.error) throw musicError(r.error);
    return r.data as unknown as MusicResults[A];
  }
  async previewPresence(
    action: PresencePreview['action'],
    work: string,
    folders: string[],
  ): Promise<PresencePreview> {
    const r = await this.client.rpc('preview_music_presence', {
      p_action: action,
      p_work: work,
      p_folders: folders,
    });
    if (r.error) throw musicError(r.error);
    return r.data as unknown as PresencePreview;
  }
  async applyPresence(
    preview: PresencePreview,
    request: string,
  ): Promise<{ count: number; results: PresenceResult[] }> {
    const r = await this.client
      .rpc('apply_music_presence', {
        p_request: request,
        p_preview: preview as unknown as Json,
      })
      .retry(false);
    if (r.error) throw musicError(r.error);
    return r.data as unknown as { count: number; results: PresenceResult[] };
  }
}
