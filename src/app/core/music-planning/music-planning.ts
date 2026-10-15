import { inject, Injectable } from '@angular/core';
import { Json } from '../config/database.types';
import { MusicApi } from '../music/music-api';
import { FolderInventory } from '../music/models';
export type MusicScope = 'event' | 'series';
export type Participation = {
  event_id: string;
  person_id: string;
  voice_id: string | null;
  voice_name: string | null;
  required: boolean;
  version: number;
};
export type MusicNeed = {
  need_key: string;
  person_id: string;
  full_name: string;
  voice_id: string | null;
  voice_name: string | null;
  repertoire_code: string;
  event_ids: string[];
  planned_from: string;
  planned_until: string;
  has_gap: boolean;
  choice: string | null;
  assignment_id: string | null;
  assignment_version: number | null;
  folder_id: string | null;
  folder_code: string | null;
  reservation_id: string | null;
  loan_id: string | null;
  status: string;
  own_due_warning?: boolean;
  maintenance_count: number | null;
  holder_name: string | null;
  holder_due_at: string | null;
};
export type MusicPlan = {
  title: string;
  series_id: string | null;
  events: {
    id: string;
    title: string;
    starts_at: string;
    planned_from: string;
    planned_until: string;
    cancelled: boolean;
    repertoires: string[];
    version: number;
  }[];
  people: {
    id: string;
    full_name: string;
    instrument: string | null;
    kind: string;
  }[];
  count: number;
  participations: Participation[];
  needs: MusicNeed[];
  stale: {
    id: string;
    version: number;
    person_id: string;
    folder_code: string;
    person_name: string;
  }[];
  choices: { series_id: string; person_id: string; choice: string }[];
};
export type MusicSuggestions = {
  need: Json;
  count: number;
  rows: (FolderInventory & { warnings: string[] })[];
};
export type MusicAlertsData = {
  pending: number;
  conflicts: number;
  warnings: number;
  count: number;
  rows: {
    scope: MusicScope;
    scope_id: string;
    title: string;
    pending: number;
    conflicts: number;
    warnings: number;
  }[];
};
export const musicStatus: Record<string, string> = {
  VOICE_PENDING: 'Voz pendiente',
  GAP_PENDING: 'Decidir continuidad',
  UNASSIGNED: 'Pendiente de carpeta',
  CONFLICT: 'Revisar asignación',
  RETURNED: 'Devuelta · revisar próxima entrega',
  HELD: 'En su poder',
  AWAIT_RETURN: 'Asignada · pendiente de devolución previa',
  ASSIGNED: 'Reservada · pendiente de entregar',
};
export const musicPlanLink = (scope: MusicScope, id: string) =>
  scope === 'series'
    ? ['/actuaciones/series', id, 'carpetas']
    : ['/actuaciones', id, 'carpetas'];
@Injectable({ providedIn: 'root' })
export class MusicPlanning {
  private readonly api = inject(MusicApi);
  async detail(scope: MusicScope, id: string, page = 1): Promise<MusicPlan> {
    const r = await this.api.client.rpc('music_planning_detail', {
      p_scope: scope,
      p_id: id,
      p_page: page,
      p_person: null,
    });
    if (r.error) throw r.error;
    return r.data as unknown as MusicPlan;
  }
  async suggestion(
    person: string,
  ): Promise<{ id: string; name: string } | null> {
    const r = await this.api.client.rpc('music_voice_suggestion', {
      p_person: person,
    });
    if (r.error) throw r.error;
    return r.data as unknown as { id: string; name: string } | null;
  }
  async command(
    scope: MusicScope,
    id: string,
    action: string,
    data: Json,
    request: string,
  ) {
    const r = await this.api.client
      .rpc('music_planning_command', {
        p_request: request,
        p_scope: scope,
        p_id: id,
        p_action: action,
        p_data: data,
      })
      .retry(false);
    if (r.error) throw r.error;
    return r.data;
  }
  async recommendations(
    key: string,
    page = 1,
    q = '',
  ): Promise<MusicSuggestions> {
    const r = await this.api.client.rpc('recommend_music_folders', {
      p_key: key,
      p_page: page,
      p_q: q,
    });
    if (r.error) throw r.error;
    return r.data as unknown as MusicSuggestions;
  }
  async participant(
    scope: MusicScope,
    id: string,
    version: number,
    data: Json,
    voice: string | null,
    apply: boolean,
    request: string,
  ) {
    const r = await this.api.client
      .rpc('plan_music_participant', {
        p_request: request,
        p_scope: scope,
        p_id: id,
        p_version: version,
        p_data: data,
        p_voice: voice,
        p_apply_voice: apply,
      })
      .retry(false);
    if (r.error) throw r.error;
    return r.data;
  }
  async alerts(
    event: string | null = null,
    page = 1,
  ): Promise<MusicAlertsData> {
    const r = await this.api.client.rpc('music_planning_alerts', {
      p_event: event,
      p_page: page,
    });
    if (r.error) throw r.error;
    return r.data as unknown as MusicAlertsData;
  }
}
