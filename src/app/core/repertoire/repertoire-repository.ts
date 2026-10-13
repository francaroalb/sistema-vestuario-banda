import { inject, Injectable } from '@angular/core';
import { literalSearch } from '../inventory/inventory';
import {
  MusicApi,
  MusicError,
  musicError,
  musicPage,
  pageRange,
} from '../music/music-api';
import {
  MusicInputs,
  MusicPage,
  RepertoireWork,
  FolderWorkState,
  PresencePreview,
  PresenceState,
  RepertoireCode,
} from '../music/models';
@Injectable({ providedIn: 'root' })
export class RepertoireRepository {
  private readonly api = inject(MusicApi);
  async get(id: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new MusicError('No encontramos esta obra. Vuelve al repertorio.');
    const r = await this.api.client
      .from('repertoire_works')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (r.error) throw musicError(r.error);
    if (!r.data)
      throw new MusicError('No encontramos esta obra. Vuelve al repertorio.');
    return r.data;
  }
  async affected(
    work: string,
    state: PresenceState | undefined,
    page: number,
    signal?: AbortSignal,
  ) {
    const r = await this.content({ work, state, page }, signal);
    if (!r.rows.length) return { rows: [], count: r.count };
    let q = this.api.client
      .from('music_folder_inventory')
      .select('*')
      .in(
        'id',
        r.rows.map((row) => row.folder_id),
      );
    if (signal) q = q.abortSignal(signal);
    const folders = await q;
    if (folders.error) throw musicError(folders.error);
    return {
      rows: r.rows.map((row) => ({
        ...row,
        folder: folders.data?.find((f) => f.id === row.folder_id) ?? null,
      })),
      count: r.count,
    };
  }
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
  ): Promise<MusicPage<RepertoireWork>> {
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
    const r = await q;
    if (r.error?.code === 'PGRST103' && (filters.page ?? 1) > 1)
      return this.works({ ...filters, page: 1 }, signal);
    return musicPage(r);
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
  ): Promise<MusicPage<FolderWorkState>> {
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
    const r = await q;
    if (r.error?.code === 'PGRST103' && (filters.page ?? 1) > 1)
      return this.content({ ...filters, page: 1 }, signal);
    return musicPage(r);
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
    const result = musicPage(
      await this.api.client
        .from('folder_work_movements')
        .select('*', { count: 'exact' })
        .eq('folder_id', folder)
        .order('occurred_at', { ascending: false })
        .order('id')
        .range(...pageRange(page)),
    );
    if (!result.rows.length) return { rows: [], count: result.count };
    const [works, audits] = await Promise.all([
      this.api.client
        .from('repertoire_works')
        .select('id,title')
        .in('id', [...new Set(result.rows.map((r) => r.work_id))]),
      this.api.client
        .from('audit_log')
        .select('actor_name,after_data')
        .eq('entity_type', 'music_folder')
        .eq('entity_id', folder)
        .in(
          'after_data->>request_id',
          result.rows.map((r) => r.request_id),
        ),
    ]);
    if (works.error) throw musicError(works.error);
    if (audits.error) throw musicError(audits.error);
    return {
      rows: result.rows.map((row) => ({
        ...row,
        title: works.data.find((w) => w.id === row.work_id)?.title ?? 'Obra',
        actor_name:
          audits.data.find(
            (a) =>
              (a.after_data as { request_id?: string })?.request_id ===
              row.request_id,
          )?.actor_name ?? 'Responsable registrado',
      })),
      count: result.count,
    };
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
