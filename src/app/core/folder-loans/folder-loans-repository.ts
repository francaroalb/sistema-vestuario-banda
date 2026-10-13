import { MusicPage } from '../music/models';
import { inject, Injectable } from '@angular/core';
import { MusicApi, musicError, musicPage, pageRange } from '../music/music-api';
import { Json } from '../config/database.types';
import { FolderLoan, FolderLoanAction, FolderLoanPreview } from './models';
import { UUID } from '../loans/models';
@Injectable({ providedIn: 'root' })
export class FolderLoansRepository {
  private readonly api = inject(MusicApi);
  async list(
    filters: {
      person?: string;
      folder?: string;
      q?: string;
      code?: string;
      status?: string;
      page?: number;
    },
    signal?: AbortSignal,
  ): Promise<MusicPage<FolderLoan>> {
    let q = this.api.client
      .from('folder_loan_overview')
      .select('*', { count: 'exact' });
    if (filters.person) q = q.eq('person_id', filters.person);
    if (filters.folder) q = q.eq('folder_id', filters.folder);
    if (filters.q?.trim())
      q = q.ilike(
        'person_name',
        '%' + filters.q.trim().replace(/[%_]/g, '') + '%',
      );
    if (filters.code?.trim())
      q = q.ilike(
        'folder_code',
        '%' + filters.code.trim().replace(/[%_]/g, '') + '%',
      );
    if (filters.status === 'overdue') q = q.eq('overdue', true);
    else if (filters.status === 'conflict') q = q.eq('conflict', true);
    else if (filters.status === 'open')
      q = q.in('status', ['ACTIVE', 'RESERVED']);
    else if (
      ['ACTIVE', 'RESERVED', 'RETURNED', 'CANCELLED'].includes(
        filters.status ?? '',
      )
    )
      q = q.eq('status', filters.status as 'ACTIVE');
    q = q
      .order('created_at', { ascending: false })
      .order('id')
      .range(...pageRange(filters.page ?? 1));
    if (signal) q = q.abortSignal(signal);
    const r = await q;
    if (r.error?.code === 'PGRST103' && (filters.page ?? 1) > 1)
      return this.list({ ...filters, page: 1 }, signal);
    return musicPage(r);
  }
  async get(id: string) {
    if (!UUID.test(id)) throw musicError({ message: 'MUSIC_NOT_FOUND' });
    const r = await this.api.client
      .from('folder_loan_overview')
      .select('*')
      .eq('id', id)
      .single();
    if (r.error) throw musicError(r.error);
    return r.data;
  }
  async movements(id: string, page = 1) {
    return musicPage(
      await this.api.client
        .from('folder_loan_movements')
        .select('*', { count: 'exact' })
        .eq('loan_id', id)
        .order('occurred_at', { ascending: false })
        .order('id')
        .range(...pageRange(page)),
    );
  }
  async works(folder: string, q: string, page = 1, signal?: AbortSignal) {
    let r = this.api.client
      .from('folder_work_state')
      .select('*', { count: 'exact' })
      .eq('folder_id', folder)
      .eq('present', true)
      .ilike('title', '%' + q.trim().replace(/[%_]/g, '') + '%')
      .order('title')
      .order('work_id')
      .range(...pageRange(page));
    if (signal) r = r.abortSignal(signal);
    return musicPage(await r);
  }
  async preview(
    action: FolderLoanAction,
    id: string,
    version: number | null,
    data: Json,
  ): Promise<FolderLoanPreview> {
    const r = await this.api.client.rpc('preview_folder_loan', {
      p_action: action,
      p_id: id,
      p_version: version,
      p_data: data,
    });
    if (r.error) throw musicError(r.error);
    return r.data as unknown as FolderLoanPreview;
  }
  async apply(
    preview: FolderLoanPreview,
    signature: boolean,
    ack: boolean,
    request: string,
  ) {
    const r = await this.api.client
      .rpc('apply_folder_loan', {
        p_request: request,
        p_preview: preview as unknown as Json,
        p_signature: signature,
        p_acknowledged: ack,
      })
      .retry(false);
    if (r.error) throw musicError(r.error);
    return r.data as unknown as { id: string; action: FolderLoanAction };
  }
}
