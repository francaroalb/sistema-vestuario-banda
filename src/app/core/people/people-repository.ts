import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../config/supabase';
import { PersonRow } from '../config/database.types';
import { literalSearch } from '../inventory/inventory';
import {
  PeopleError,
  PeopleFilters,
  PersonInput,
  PEOPLE_PAGE_SIZE,
  peopleError,
} from './people';
@Injectable({ providedIn: 'root' })
export class PeopleRepository {
  private readonly supabase = inject(SupabaseService);
  private get client() {
    if (!this.supabase.client)
      throw new PeopleError(
        'El acceso no está configurado. Contacta con un responsable.',
      );
    return this.supabase.client;
  }
  async list(filters: PeopleFilters, signal: AbortSignal) {
    let query = this.client.from('people').select('*', { count: 'exact' });
    if (filters.archive === 'active') query = query.is('archived_at', null);
    if (filters.archive === 'archived')
      query = query.not('archived_at', 'is', null);
    if (filters.q.trim())
      query = query.ilike(
        'full_name',
        '%' + literalSearch(filters.q.slice(0, 120)) + '%',
      );
    if (filters.kind) query = query.eq('kind', filters.kind);
    if (filters.instrument.trim())
      query = query.ilike(
        'instrument',
        '%' + literalSearch(filters.instrument.slice(0, 80)) + '%',
      );
    const start = (filters.page - 1) * PEOPLE_PAGE_SIZE;
    const result = await query
      .order('kind')
      .order('instrument', { nullsFirst: false })
      .order('full_name')
      .order('id')
      .range(start, start + PEOPLE_PAGE_SIZE - 1)
      .abortSignal(signal);
    // A page can disappear when its last person is archived from the detail view.
    if (result.error?.code === 'PGRST103' && filters.page > 1) {
      const fallback = await query.range(0, 0);
      if (fallback.error) throw peopleError(fallback.error);
      return { rows: [], count: fallback.count ?? 0 };
    }
    if (result.error) throw peopleError(result.error);
    return { rows: result.data ?? [], count: result.count ?? 0 };
  }
  async get(id: string): Promise<PersonRow> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new PeopleError('No encontramos esta persona. Vuelve al listado.');
    const { data, error } = await this.client
      .from('people')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw peopleError(error);
    if (!data)
      throw new PeopleError(
        'No encontramos esta persona o ya no tienes acceso. Vuelve al listado.',
      );
    return data;
  }
  async save(id: string, version: number | null, input: PersonInput) {
    const { data, error } = await this.client
      .rpc('save_person', {
        p_id: id,
        p_expected_version: version,
        p_full_name: input.full_name.trim(),
        p_kind: input.kind,
        p_instrument: input.instrument.trim() || null,
        p_phone: input.phone.trim() || null,
        p_notes: input.notes.trim() || null,
      })
      .single<PersonRow>();
    if (error) throw peopleError(error);
    return data;
  }
  async archive(person: PersonRow, archived: boolean) {
    const { data, error } = await this.client
      .rpc('set_person_archived', {
        p_id: person.id,
        p_expected_version: person.version,
        p_archived: archived,
      })
      .single<PersonRow>();
    if (error) throw peopleError(error);
    return data;
  }
}
