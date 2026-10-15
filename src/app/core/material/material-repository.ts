import { inject, Injectable } from '@angular/core';
import { Json, PhysicalState } from '../config/database.types';
import { MusicApi, musicError, musicPage, pageRange } from '../music/music-api';
import { FolderLoanPreview, folderLoanNotices } from '../folder-loans/models';
import { loanError } from '../loans/models';
export type HeldMaterial = {
  domain: 'GARMENT' | 'FOLDER';
  id: string;
  asset_id: string;
  code: string;
  label: string;
  loan_id: string;
  person_id: string;
  version: number;
  asset_version: number;
  due_at: string | null;
};
export type MaterialPreview = {
  data: Json;
  person_name: string;
  person_version: number;
  garments: {
    id: string;
    code: string;
    label: string;
    due_local?: string | null;
    state?: PhysicalState;
  }[];
  folders: FolderLoanPreview[];
  warnings: string[];
  conflicts: string[];
};
export type MaterialResult = {
  id: string;
  action: string;
  loans: { domain: 'GARMENT' | 'FOLDER'; loan_id: string }[];
};
export function materialNotice(value: string): string {
  const split = value.lastIndexOf(': '),
    key = value.slice(split + 2);
  return split >= 0 && folderLoanNotices[key]
    ? value.slice(0, split + 2) + folderLoanNotices[key]
    : value;
}
export function materialError(e: unknown): string {
  const message = (e as { message?: string })?.message ?? '';
  return /^(GARMENT_|ITEM_|PERSON_ARCHIVED|LOAN_CHANGED)/.test(message)
    ? loanError(e).message
    : musicError(e).message;
}
@Injectable({ providedIn: 'root' })
export class MaterialRepository {
  private readonly api = inject(MusicApi);
  async held(person: string, page: number) {
    return musicPage(
      await this.api.client
        .from('material_held')
        .select('*', { count: 'exact' })
        .eq('person_id', person)
        .order('domain')
        .order('code')
        .order('id')
        .range(...pageRange(page)),
    );
  }
  async garment(id: string) {
    const r = await this.api.client
      .from('garment_inventory')
      .select('*')
      .eq('id', id)
      .single();
    if (r.error) throw r.error;
    return r.data;
  }
  async heldItem(id: string, domain: HeldMaterial['domain']) {
    const r = await this.api.client
      .from('material_held')
      .select('*')
      .eq('id', id)
      .eq('domain', domain)
      .single();
    if (r.error) throw r.error;
    return r.data;
  }
  async preview(data: Json): Promise<MaterialPreview> {
    const r = await this.api.client.rpc('preview_material_operation', {
      p_data: data,
    });
    if (r.error) throw r.error;
    return r.data as unknown as MaterialPreview;
  }
  async apply(
    preview: MaterialPreview,
    request: string,
    ack: boolean,
  ): Promise<MaterialResult> {
    const r = await this.api.client
      .rpc('apply_material_operation', {
        p_request: request,
        p_preview: preview as unknown as Json,
        p_signature: true,
        p_acknowledged: ack,
      })
      .retry(false);
    if (r.error) throw r.error;
    return r.data as unknown as MaterialResult;
  }
}
