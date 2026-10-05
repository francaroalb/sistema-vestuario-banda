import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../config/supabase';
import { Json } from '../config/database.types';
import { literalSearch } from '../inventory/inventory';
import { BandEvent, EventChoice, Uniform } from './models';
@Injectable({ providedIn: 'root' })
export class EventsRepository {
  private readonly supabase = inject(SupabaseService);
  private get client() {
    if (!this.supabase.client) throw new Error('Not configured');
    return this.supabase.client;
  }
  async catalog() {
    const types = await this.client
      .from('garment_types')
      .select('*')
      .eq('active', true)
      .order('sort_order');
    if (types.error) throw types.error;
    const uniforms: Uniform[] = [];
    for (let offset = 0; ; offset += 100) {
      const r = await this.client
        .from('uniforms')
        .select('*')
        .order('name')
        .order('id')
        .range(offset, offset + 99);
      if (r.error) throw r.error;
      uniforms.push(...r.data);
      if (r.data.length < 100) break;
    }
    return { types: types.data, uniforms };
  }
  async list(q: string, status: string, page: number) {
    let query = this.client
      .from('events')
      .select('*', { count: 'exact' })
      .ilike('title', '%' + literalSearch(q.slice(0, 160)) + '%');
    if (status === 'upcoming')
      query = query
        .eq('cancelled', false)
        .gte('ends_at', new Date().toISOString());
    if (status === 'past')
      query = query
        .eq('cancelled', false)
        .lt('ends_at', new Date().toISOString());
    if (status === 'cancelled') query = query.eq('cancelled', true);
    const r = await query
      .order('starts_at', { ascending: status !== 'past' })
      .order('id')
      .range((page - 1) * 24, page * 24 - 1);
    if (r.error?.code === 'PGRST103' && page > 1) return { rows: [], count: 0 };
    if (r.error) throw r.error;
    return { rows: r.data, count: r.count ?? 0 };
  }
  async get(id: string) {
    const r = await this.client
      .from('events')
      .select('*')
      .eq('id', id)
      .single();
    if (r.error) throw r.error;
    return r.data;
  }
  async people(id: string, page: number) {
    const people = await this.client
      .from('event_people')
      .select('*', { count: 'exact' })
      .eq('event_id', id)
      .order('full_name')
      .order('person_id')
      .range((page - 1) * 12, page * 12 - 1);
    if (people.error?.code === 'PGRST103' && page > 1)
      return { people: [], rows: [], count: 0 };
    if (people.error) throw people.error;
    const prep = people.data.length
      ? await this.client
          .from('event_preparation')
          .select('*')
          .eq('event_id', id)
          .in(
            'person_id',
            people.data.map((p) => p.person_id),
          )
          .order('type_name')
      : { data: [], error: null };
    if (prep.error) throw prep.error;
    return {
      people: people.data,
      rows: prep.data ?? [],
      count: people.count ?? 0,
    };
  }
  async preparation(id: string, person: string) {
    const r = await this.client
      .from('event_preparation')
      .select('*')
      .eq('event_id', id)
      .eq('person_id', person)
      .order('type_name');
    if (r.error) throw r.error;
    return r.data;
  }
  async command(
    action: string,
    id: string,
    version: number | null,
    data: Json,
    request: string,
  ) {
    const r = await this.client
      .rpc('plan_event', {
        p_request_id: request,
        p_action: action,
        p_id: id,
        p_expected_version: version,
        p_data: data,
      })
      .retry(false);
    if (r.error) throw r.error;
    return r.data as unknown as BandEvent;
  }
  async choices(
    event: string,
    person: string,
    type: string,
    q: string,
    page: number,
  ) {
    const r = await this.client.rpc('event_garment_choices', {
      p_event: event,
      p_person: person,
      p_type: type,
      p_q: q,
      p_page: page,
    });
    if (r.error) throw r.error;
    return r.data as unknown as { rows: EventChoice[]; count: number };
  }
  async reservations(
    field: 'garment_id' | 'person_id',
    id: string,
    page: number,
  ) {
    const r = await this.client
      .from('garment_reservations')
      .select('*', { count: 'exact' })
      .eq(field, id)
      .order('planned_from')
      .order('event_id')
      .range((page - 1) * 6, page * 6 - 1);
    if (r.error) throw r.error;
    return { rows: r.data, count: r.count ?? 0 };
  }
}
