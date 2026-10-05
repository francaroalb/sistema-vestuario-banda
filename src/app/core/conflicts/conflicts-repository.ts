import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../config/supabase';
import { Json } from '../config/database.types';
import { ConflictSummary, RetentionPreview } from './models';
@Injectable({ providedIn: 'root' })
export class ConflictsRepository {
  private readonly service = inject(SupabaseService);
  private get client() {
    if (!this.service.client) throw Error('Acceso no configurado');
    return this.service.client;
  }
  async summary() {
    const r = await this.client.rpc('conflict_summary');
    if (r.error) throw r.error;
    return r.data as unknown as ConflictSummary;
  }
  async list(filter: string, page: number) {
    let q = this.client
      .from('wardrobe_conflicts')
      .select('*', { count: 'exact' });
    if (filter !== 'all') q = q.eq('critical', filter === 'critical');
    const r = await q
      .order('starts_at')
      .order('event_id')
      .order('person_id')
      .order('type_id')
      .range((page - 1) * 12, page * 12 - 1);
    if (r.error?.code === 'PGRST103' && page > 1) return { rows: [], count: 0 };
    if (r.error) throw r.error;
    return { rows: r.data ?? [], count: r.count ?? 0 };
  }
  async preview(loan: string, items: string[]) {
    const r = await this.client.rpc('preview_retention', {
      p_loan: loan,
      p_items: items,
    });
    if (r.error) throw r.error;
    return r.data as unknown as RetentionPreview;
  }
  async confirm(preview: RetentionPreview, request: string) {
    const r = await this.client
      .rpc('confirm_retention', {
        p_request: request,
        p_preview: preview as unknown as Json,
      })
      .retry(false);
    if (r.error) throw r.error;
  }
}
