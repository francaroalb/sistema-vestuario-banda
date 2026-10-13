import { inject, Injectable } from '@angular/core';
import { MusicApi, musicPage, pageRange } from '../music/music-api';
import { MaintenanceTask, MusicInputs, RepertoireCode } from '../music/models';
@Injectable({ providedIn: 'root' })
export class MaintenanceRepository {
  private readonly api = inject(MusicApi);
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
    if (filters.repertoire) q = q.eq('repertoire_code', filters.repertoire);
    if (filters.category) q = q.eq('category', filters.category);
    if (filters.kind) q = q.eq('kind', filters.kind);
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
