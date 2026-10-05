import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../config/supabase';
import { Json } from '../config/database.types';
import { ImportKind, ImportPreview, ImportRow } from './csv';
export type CopyPreview = {
  source: string;
  source_version: number;
  name: string;
  first_date: string;
  events: {
    uniform_name: string;
    data: {
      title: string;
      starts: string;
      ends: string;
      from: string;
      until: string;
      uniform_id: string;
      notes: string | null;
    };
  }[];
};
export function productivityError(e: unknown) {
  const error = e as { message?: string; code?: string };
  return (
    (
      {
        IMPORT_CHANGED:
          'El archivo contiene errores o los registros han cambiado. Revisa de nuevo el archivo.',
        COPY_CHANGED:
          'La serie o sus uniformes han cambiado. Genera otra vista previa.',
        EMPTY_SERIES: 'La serie no tiene actuaciones activas que copiar.',
        UNIFORM_ARCHIVED:
          'Hay un uniforme archivado. Revisa la serie de origen.',
        INVALID_EVENT_DATE:
          'Las nuevas fechas no son válidas o coinciden con un cambio de hora. Elige otra fecha.',
        ADMIN_REQUIRED: 'Tu sesión ya no tiene acceso. Vuelve a entrar.',
        REQUEST_ALREADY_USED:
          'La solicitud cambió. Vuelve a preparar la operación.',
      } as Record<string, string>
    )[error?.message ?? ''] ??
    'No se ha podido completar la operación. Reintenta; no se duplicarán registros.'
  );
}
@Injectable({ providedIn: 'root' })
export class ProductivityRepository {
  private readonly service = inject(SupabaseService);
  private get client() {
    if (!this.service.client) throw Error('Not configured');
    return this.service.client;
  }
  async previewImport(kind: ImportKind, rows: ImportRow[]) {
    const r = await this.client.rpc('preview_import', {
      p_kind: kind,
      p_rows: rows,
    });
    if (r.error) throw r.error;
    return r.data as unknown as ImportPreview;
  }
  async applyImport(preview: ImportPreview, request: string) {
    const r = await this.client
      .rpc('apply_import', {
        p_request: request,
        p_preview: preview as unknown as Json,
      })
      .retry(false);
    if (r.error) throw r.error;
    return r.data as { count: number };
  }
  async previewCopy(source: string, name: string, date: string) {
    const r = await this.client.rpc('preview_series_copy', {
      p_source: source,
      p_name: name,
      p_first_date: date,
    });
    if (r.error) throw r.error;
    return r.data as unknown as CopyPreview;
  }
  async applyCopy(preview: CopyPreview, request: string) {
    const r = await this.client
      .rpc('apply_series_copy', {
        p_request: request,
        p_preview: preview as unknown as Json,
      })
      .retry(false);
    if (r.error) throw r.error;
    return r.data as { id: string; count: number };
  }
}
