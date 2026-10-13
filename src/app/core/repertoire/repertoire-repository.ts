import { inject, Injectable } from '@angular/core';
import { literalSearch } from '../inventory/inventory';
import { MusicApi, musicError, musicPage, pageRange } from '../music/music-api';
import {
  MusicInputs,
  PresencePreview,
  PresenceState,
  RepertoireCode,
} from '../music/models';
@Injectable({ providedIn: 'root' })
export class RepertoireRepository {
  private readonly api = inject(MusicApi);
  async catalog() {
    const r = await this.api.client
      .from('music_repertoires')
      .select('*')
      .order('code');
    if (r.error) throw musicError(r.error);
    return r.data;
  }
  async works(
    filters: {
      repertoire?: RepertoireCode;
      q?: string;
      active?: boolean;
      page?: number;
    },
    signal?: AbortSignal,
  ) {
    let q = this.api.client
      .from('repertoire_works')
      .select('*', { count: 'exact' });
    if (filters.repertoire) q = q.eq('repertoire_code', filters.repertoire);
    if (filters.q)
      q = q.ilike('title', '%' + literalSearch(filters.q.slice(0, 200)) + '%');
    if (filters.active !== undefined) q = q.eq('active', filters.active);
    q = q
      .order('title')
      .order('id')
      .range(...pageRange(filters.page ?? 1));
    if (signal) q = q.abortSignal(signal);
    return musicPage(await q);
  }
  async content(
    filters: {
      folder?: string;
      work?: string;
      state?: PresenceState;
      q?: string;
      page?: number;
    },
    signal?: AbortSignal,
  ) {
    let q = this.api.client
      .from('folder_work_state')
      .select('*', { count: 'exact' });
    if (filters.folder) q = q.eq('folder_id', filters.folder);
    if (filters.work) q = q.eq('work_id', filters.work);
    if (filters.state) q = q.eq('state', filters.state);
    if (filters.q)
      q = q.ilike('title', '%' + literalSearch(filters.q.slice(0, 200)) + '%');
    q = q
      .order('title')
      .order('work_id')
      .order('folder_id')
      .range(...pageRange(filters.page ?? 1));
    if (signal) q = q.abortSignal(signal);
    return musicPage(await q);
  }
  saveWork(
    id: string,
    version: number | null,
    data: MusicInputs['WORK_SAVE'],
    request: string,
  ) {
    return this.api.command('WORK_SAVE', id, version, data, request);
  }
  changePresence(
    folder: string,
    version: number,
    data: MusicInputs['PRESENCE'],
    request: string,
  ) {
    return this.api.command('PRESENCE', folder, version, data, request);
  }
  previewPresence(
    action: PresencePreview['action'],
    work: string,
    folders: string[],
  ) {
    return this.api.previewPresence(action, work, folders);
  }
  applyPresence(preview: PresencePreview, request: string) {
    return this.api.applyPresence(preview, request);
  }
  async movements(folder: string, page = 1) {
    return musicPage(
      await this.api.client
        .from('folder_work_movements')
        .select('*', { count: 'exact' })
        .eq('folder_id', folder)
        .order('occurred_at', { ascending: false })
        .order('id')
        .range(...pageRange(page)),
    );
  }
  async workHistory(work: string, page = 1) {
    return musicPage(
      await this.api.client
        .from('audit_log')
        .select('*', { count: 'exact' })
        .eq('entity_type', 'music_work')
        .eq('entity_id', work)
        .order('occurred_at', { ascending: false })
        .order('id')
        .range(...pageRange(page)),
    );
  }
}
