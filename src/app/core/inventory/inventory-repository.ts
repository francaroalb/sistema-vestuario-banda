import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../config/supabase';
import { GarmentRow } from '../config/database.types';
import {
  Garment,
  GarmentInput,
  InventoryError,
  InventoryFilters,
  inventoryError,
  literalSearch,
  PAGE_SIZE,
} from './inventory';
@Injectable({ providedIn: 'root' })
export class InventoryRepository {
  private readonly supabase = inject(SupabaseService);
  private get client() {
    if (!this.supabase.client)
      throw new InventoryError(
        'El acceso no está configurado. Contacta con un responsable.',
      );
    return this.supabase.client;
  }
  async types() {
    const { data, error } = await this.client
      .from('garment_types')
      .select('*')
      .order('sort_order')
      .order('name');
    if (error) throw inventoryError(error);
    return data ?? [];
  }
  async list(filters: InventoryFilters, signal: AbortSignal) {
    let query = this.client
      .from('garments')
      .select('*, garment_types(name)', { count: 'exact' });
    if (filters.archive === 'active') query = query.is('archived_at', null);
    if (filters.archive === 'archived')
      query = query.not('archived_at', 'is', null);
    if (filters.q.trim())
      query = query.ilike(
        'code',
        '%' + literalSearch(filters.q.slice(0, 60)) + '%',
      );
    if (filters.type) query = query.eq('garment_type_id', filters.type);
    if (filters.size.trim())
      query = query.eq('size', filters.size.trim().toUpperCase());
    if (filters.state) query = query.eq('physical_state', filters.state);
    const start = (filters.page - 1) * PAGE_SIZE;
    const { data, error, count } = await query
      .order('code')
      .order('id')
      .range(start, start + PAGE_SIZE - 1)
      .abortSignal(signal);
    if (error) throw inventoryError(error);
    return { rows: (data ?? []) as Garment[], count: count ?? 0 };
  }
  async get(id: string): Promise<Garment> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new InventoryError(
        'No encontramos esta prenda. Vuelve al inventario.',
      );
    const { data, error } = await this.client
      .from('garments')
      .select('*, garment_types(name)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw inventoryError(error);
    if (!data)
      throw new InventoryError(
        'No encontramos esta prenda o ya no tienes acceso. Vuelve al inventario.',
      );
    return data as Garment;
  }
  async save(id: string, version: number | null, input: GarmentInput) {
    const { data, error } = await this.client
      .rpc('save_garment', {
        p_id: id,
        p_expected_version: version,
        p_code: input.code.trim(),
        p_garment_type_id: input.garment_type_id,
        p_size: input.size.trim(),
        p_physical_state: input.physical_state,
        p_notes: input.notes.trim() || null,
      })
      .single<GarmentRow>();
    if (error) throw inventoryError(error);
    return data;
  }
  async archive(garment: GarmentRow, archived: boolean) {
    const { data, error } = await this.client
      .rpc('set_garment_archived', {
        p_id: garment.id,
        p_expected_version: garment.version,
        p_archived: archived,
      })
      .single<GarmentRow>();
    if (error) throw inventoryError(error);
    return data;
  }
  async summary() {
    const { data, error } = await this.client.rpc('inventory_summary').single();
    if (error) throw inventoryError(error);
    return data;
  }
}
