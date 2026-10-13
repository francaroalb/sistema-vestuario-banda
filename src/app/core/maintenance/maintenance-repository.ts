import { inject, Injectable } from '@angular/core';
import { MusicApi, musicError, musicPage, pageRange } from '../music/music-api';
import {
  MaintenanceEntry,
  MaintenanceTask,
  MusicInputs,
  RepertoireCode,
} from '../music/models';
export type MaintenanceFilters = {
  folder?: string;
  work?: string;
  code?: string;
  title?: string;
  repertoire?: string;
  category?: string;
  kind?: string;
  state?: string;
  operability?: string;
  page?: number;
};
@Injectable({ providedIn: 'root' })
export class MaintenanceRepository {
  private readonly api = inject(MusicApi);
  private query(filters: MaintenanceFilters, countOnly = false) {
    let q = this.api.client
      .from('music_maintenance_index')
      .select('*', { count: 'exact', head: countOnly });
    if (filters.folder) q = q.eq('folder_id', filters.folder);
    if (filters.work) q = q.eq('work_id', filters.work);
    if (filters.code?.trim())
      q = q.ilike(
        'folder_code',
        '%' + filters.code.trim().replace(/[%_]/g, '') + '%',
      );
    if (filters.title?.trim())
      q = q.ilike(
        'title',
        '%' + filters.title.trim().replace(/[%_]/g, '') + '%',
      );
    if (filters.repertoire)
      q = q.eq(
        'repertoire_code',
        filters.repertoire as MaintenanceEntry['repertoire_code'],
      );
    if (filters.category)
      q = q.eq('category', filters.category as MaintenanceEntry['category']);
    if (filters.kind)
      q = q.eq('kind', filters.kind as MaintenanceEntry['kind']);
    if (filters.operability)
      q = q.eq(
        'operability',
        filters.operability as MaintenanceEntry['operability'],
      );
    if (filters.state === 'resolved') q = q.not('resolved_at', 'is', null);
    else if (filters.state !== 'all') q = q.is('resolved_at', null);
    return q;
  }
  async index(
    filters: MaintenanceFilters,
    signal?: AbortSignal,
  ): Promise<{
    rows: MaintenanceEntry[];
    count: number;
    repertoire: number;
    conservation: number;
  }> {
    let q = this.query(filters)
      .order('folder_code')
      .order('kind')
      .order('task_id')
      .range(...pageRange(filters.page ?? 1));
    let r = this.query({ ...filters, category: 'REPERTOIRE' }, true);
    let c = this.query({ ...filters, category: 'CONSERVATION' }, true);
    if (signal) {
      q = q.abortSignal(signal);
      r = r.abortSignal(signal);
      c = c.abortSignal(signal);
    }
    const [list, repertoire, conservation] = await Promise.all([q, r, c]);
    if (list.error?.code === 'PGRST103' && (filters.page ?? 1) > 1)
      return this.index({ ...filters, page: 1 }, signal);
    const page = musicPage(list);
    if (repertoire.error || conservation.error)
      throw musicError(repertoire.error || conservation.error);
    return {
      ...page,
      repertoire: repertoire.count ?? 0,
      conservation: conservation.count ?? 0,
    };
  }
  async entry(id: string, family: string): Promise<MaintenanceEntry> {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !['SCORE', 'PHYSICAL'].includes(family))
      throw musicError({ message: 'MUSIC_NOT_FOUND' });
    const r = await this.api.client
      .from('music_maintenance_index')
      .select('*')
      .eq('issue_id', id)
      .eq('family', family as MaintenanceEntry['family'])
      .single();
    if (r.error) throw musicError(r.error);
    return r.data;
  }
  async tasks(
    filters: {
      folder?: string;
      work?: string;
      repertoire?: RepertoireCode;
      category?: MaintenanceTask['category'];
      kind?: MaintenanceTask['kind'];
      page?: number;
    },
    signal?: AbortSignal,
  ) {
    let q = this.api.client
      .from('music_maintenance_tasks')
      .select('*', { count: 'exact' });
    if (filters.folder) q = q.eq('folder_id', filters.folder);
    if (filters.work) q = q.eq('work_id', filters.work);
    if (filters.repertoire)
      q = q.eq(
        'repertoire_code',
        filters.repertoire as MaintenanceEntry['repertoire_code'],
      );
    if (filters.category)
      q = q.eq('category', filters.category as MaintenanceEntry['category']);
    if (filters.kind)
      q = q.eq('kind', filters.kind as MaintenanceEntry['kind']);
    q = q
      .order('folder_id')
      .order('kind')
      .order('task_id')
      .range(...pageRange(filters.page ?? 1));
    if (signal) q = q.abortSignal(signal);
    return musicPage(await q);
  }
  async scoreIssues(folder: string, resolved = false, page = 1) {
    let q = this.api.client
      .from('folder_score_issues')
      .select('*', { count: 'exact' })
      .eq('folder_id', folder);
    q = resolved ? q.not('resolved_at', 'is', null) : q.is('resolved_at', null);
    return musicPage(
      await q
        .order('created_at', { ascending: false })
        .order('id')
        .range(...pageRange(page)),
    );
  }
  async physicalIssues(folder: string, resolved = false, page = 1) {
    let q = this.api.client
      .from('folder_physical_issues')
      .select('*', { count: 'exact' })
      .eq('folder_id', folder);
    q = resolved ? q.not('resolved_at', 'is', null) : q.is('resolved_at', null);
    return musicPage(
      await q
        .order('created_at', { ascending: false })
        .order('id')
        .range(...pageRange(page)),
    );
  }
  saveScore(
    id: string,
    version: number | null,
    data: MusicInputs['SCORE_SAVE'],
    request: string,
  ) {
    return this.api.command('SCORE_SAVE', id, version, data, request);
  }
  resolveScore(
    id: string,
    version: number,
    data: MusicInputs['SCORE_RESOLVE'],
    request: string,
  ) {
    return this.api.command('SCORE_RESOLVE', id, version, data, request);
  }
  savePhysical(
    id: string,
    version: number | null,
    data: MusicInputs['PHYSICAL_SAVE'],
    request: string,
  ) {
    return this.api.command('PHYSICAL_SAVE', id, version, data, request);
  }
  resolvePhysical(
    id: string,
    version: number,
    data: MusicInputs['PHYSICAL_RESOLVE'],
    request: string,
  ) {
    return this.api.command('PHYSICAL_RESOLVE', id, version, data, request);
  }
}
