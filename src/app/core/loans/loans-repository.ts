import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../config/supabase';
import { literalSearch } from '../inventory/inventory';
import {
  Choice,
  LoanCommand,
  LoanError,
  LoanFilters,
  LoanRow,
  UUID,
  loanError,
} from './models';
@Injectable({ providedIn: 'root' })
export class LoansRepository {
  private readonly supabase = inject(SupabaseService);
  private get client() {
    if (!this.supabase.client)
      throw new LoanError('El acceso no está configurado.');
    return this.supabase.client;
  }
  async list(filters: LoanFilters, signal?: AbortSignal, limit = 24) {
    let query = this.client
      .from('loan_overview')
      .select('*', { count: 'exact' });
    if (filters.q)
      query = query.ilike(
        'person_name',
        '%' + literalSearch(filters.q.slice(0, 120)) + '%',
      );
    if (filters.status === 'active' || filters.status === 'overdue')
      query = query.is('closed_at', null);
    if (filters.status === 'closed') query = query.not('closed_at', 'is', null);
    if (filters.status === 'overdue')
      query = query.lt('due_at', new Date().toISOString());
    if (filters.person && UUID.test(filters.person))
      query = query.eq('person_id', filters.person);
    if (filters.garment && UUID.test(filters.garment))
      query = query.contains('garment_ids', [filters.garment]);
    const start = (filters.page - 1) * limit;
    query = query
      .order('closed_at', { ascending: false, nullsFirst: true })
      .order('opened_at', { ascending: false })
      .order('id')
      .range(start, start + limit - 1);
    if (signal) query = query.abortSignal(signal);
    let result = await query;
    if (result.error?.code === 'PGRST103' && filters.page > 1) {
      result = await query.range(0, 0);
      if (!result.error) return { rows: [], count: result.count ?? 0 };
    }
    if (result.error) throw loanError(result.error);
    return { rows: result.data ?? [], count: result.count ?? 0 };
  }
  async get(id: string) {
    if (!UUID.test(id))
      throw new LoanError('No encontramos esta cesión. Vuelve al listado.');
    const { data, error } = await this.client
      .from('loan_overview')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw loanError(error);
    if (!data)
      throw new LoanError('No encontramos esta cesión. Vuelve al listado.');
    return data;
  }
  async detail(id: string) {
    const loan = await this.get(id);
    const [items, movements] = await Promise.all([
      this.client
        .from('loan_items')
        .select('*')
        .eq('loan_id', id)
        .order('delivered_at')
        .order('id'),
      this.client
        .from('loan_movements')
        .select('*')
        .eq('loan_id', id)
        .order('occurred_at')
        .order('id'),
    ]);
    if (items.error || movements.error)
      throw loanError(items.error ?? movements.error);
    return { loan, items: items.data ?? [], movements: movements.data ?? [] };
  }
  async choices(
    mode: 'person' | 'garment',
    q: string,
    type: string,
    page: number,
    excluded: string[],
    signal: AbortSignal,
  ): Promise<{ rows: Choice[]; count: number }> {
    const start = (page - 1) * 12;
    if (mode === 'person') {
      let query = this.client
        .from('people')
        .select('*', { count: 'exact' })
        .is('archived_at', null);
      if (q)
        query = query.ilike(
          'full_name',
          '%' + literalSearch(q.slice(0, 120)) + '%',
        );
      const { data, error, count } = await query
        .order('full_name')
        .order('id')
        .range(start, start + 11)
        .abortSignal(signal);
      if (error?.code === 'PGRST103' && page > 1) return { rows: [], count: 0 };
      if (error) throw loanError(error);
      return {
        rows: (data ?? []).map((p) => ({
          id: p.id,
          label: p.full_name,
          subtitle:
            (p.kind === 'BANDA' ? 'Banda' : 'Refuerzo') +
            ' · ' +
            (p.instrument ?? 'Sin instrumento'),
        })),
        count: count ?? 0,
      };
    }
    let query = this.client
      .from('garment_inventory')
      .select('*', { count: 'exact' })
      .is('archived_at', null)
      .is('loan_id', null)
      .eq('physical_state', 'DISPONIBLE');
    if (q)
      query = query.ilike('code', '%' + literalSearch(q.slice(0, 60)) + '%');
    if (type && UUID.test(type)) query = query.eq('garment_type_id', type);
    if (excluded.length)
      query = query.not(
        'id',
        'in',
        '(' + excluded.filter((id) => UUID.test(id)).join(',') + ')',
      );
    const { data, error, count } = await query
      .order('code')
      .order('id')
      .range(start, start + 11)
      .abortSignal(signal);
    if (error?.code === 'PGRST103' && page > 1) return { rows: [], count: 0 };
    if (error) throw loanError(error);
    return {
      rows: (data ?? []).map((g) => ({
        id: g.id,
        label: g.code,
        subtitle: g.type_name + ' · Talla ' + g.size,
        type_id: g.garment_type_id,
      })),
      count: count ?? 0,
    };
  }
  async personChoice(id: string): Promise<Choice> {
    if (!UUID.test(id)) throw new LoanError('No encontramos esta persona.');
    const { data, error } = await this.client
      .from('people')
      .select('*')
      .eq('id', id)
      .is('archived_at', null)
      .maybeSingle();
    if (error) throw loanError(error);
    if (!data)
      throw new LoanError(
        'La persona no está disponible. Selecciona una ficha activa.',
      );
    return {
      id: data.id,
      label: data.full_name,
      subtitle: data.instrument ?? 'Sin instrumento',
    };
  }
  async record(command: LoanCommand) {
    const { data, error } = await this.client
      .rpc('record_loan_movement', command)
      .retry(false)
      .single<LoanRow>();
    if (error) throw loanError(error);
    return data;
  }
}
