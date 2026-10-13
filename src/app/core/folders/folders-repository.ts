import { inject, Injectable } from '@angular/core';
import { literalSearch } from '../inventory/inventory';
import { MusicApi, musicError, musicPage, pageRange } from '../music/music-api';
import { MusicInputs, RepertoireCode } from '../music/models';
@Injectable({ providedIn: 'root' })
export class FoldersRepository {
  private readonly api = inject(MusicApi);
  async list(
    filters: {
      q?: string;
      repertoire?: RepertoireCode;
      voice?: string;
      archived?: boolean;
      usable?: boolean;
      page?: number;
    },
    signal?: AbortSignal,
  ) {
    let q = this.api.client
      .from('music_folder_inventory')
      .select('*', { count: 'exact' });
    if (filters.q)
      q = q.ilike('code', '%' + literalSearch(filters.q.slice(0, 60)) + '%');
    if (filters.repertoire) q = q.eq('repertoire_code', filters.repertoire);
    if (filters.voice) q = q.eq('voice_id', filters.voice);
    if (filters.archived !== undefined) q = q.eq('archived', filters.archived);
    if (filters.usable !== undefined) q = q.eq('usable', filters.usable);
    q = q
      .order('code')
      .order('id')
      .range(...pageRange(filters.page ?? 1));
    if (signal) q = q.abortSignal(signal);
    return musicPage(await q);
  }
  async get(id: string) {
    const r = await this.api.client
      .from('music_folder_inventory')
      .select('*')
      .eq('id', id)
      .single();
    if (r.error) throw musicError(r.error);
    return r.data;
  }
  async voices(
    filters: { q?: string; archived?: boolean; page?: number } = {},
    signal?: AbortSignal,
  ) {
    let q = this.api.client
      .from('musical_voices')
      .select('*', { count: 'exact' });
    if (filters.q)
      q = q.ilike('name', '%' + literalSearch(filters.q.slice(0, 120)) + '%');
    if (filters.archived !== undefined) q = q.eq('archived', filters.archived);
    q = q
      .order('name')
      .order('id')
      .range(...pageRange(filters.page ?? 1));
    if (signal) q = q.abortSignal(signal);
    return musicPage(await q);
  }
  save(
    id: string,
    version: number | null,
    data: MusicInputs['FOLDER_SAVE'],
    request: string,
  ) {
    return this.api.command('FOLDER_SAVE', id, version, data, request);
  }
  saveVoice(
    id: string,
    version: number | null,
    data: MusicInputs['VOICE_SAVE'],
    request: string,
  ) {
    return this.api.command('VOICE_SAVE', id, version, data, request);
  }
  async history(id: string, page = 1) {
    const r = await this.api.client
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('entity_type', 'music_folder')
      .eq('entity_id', id)
      .order('occurred_at', { ascending: false })
      .order('id')
      .range(...pageRange(page));
    return musicPage(r);
  }
}
