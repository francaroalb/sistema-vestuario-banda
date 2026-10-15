import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  MusicPlanning,
  MusicPlan,
  MusicNeed,
  MusicScope,
  Participation,
  MusicSuggestions,
  musicStatus,
  musicPlanLink,
} from '../../core/music-planning/music-planning';
import { Json } from '../../core/config/database.types';
import { FolderInventory, MusicalVoice } from '../../core/music/models';
import {
  materialError,
  materialNotice,
} from '../../core/material/material-repository';
import { VoicePicker } from '../folders/voice-picker';
import { StableRequest } from '../folders/folder-ui';
import { Connectivity } from '../../core/connectivity';
import { formatTimestamp } from '../../core/inventory/inventory';
import { madridLocal } from '../../core/events/models';
@Component({
  selector: 'app-music-preparation',
  imports: [RouterLink, FormsModule, VoicePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './music-preparation.html',
  styleUrl: './music-preparation.scss',
})
export class MusicPreparation {
  private readonly route = inject(ActivatedRoute);
  private readonly repo = inject(MusicPlanning);
  readonly connection = inject(Connectivity);
  readonly scope: MusicScope = this.route.snapshot.data['scope'];
  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly plan = signal<MusicPlan | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly active = signal<string | null>(null);
  readonly picking = signal<MusicNeed | null>(null);
  readonly suggestions = signal<MusicSuggestions | null>(null);
  readonly suggesting = signal(false);
  readonly suggestionError = signal('');
  readonly candidate = signal<
    (FolderInventory & { warnings: string[] }) | null
  >(null);
  readonly proposedVoice = signal<{ id: string; name: string } | null>(null);
  readonly window = signal<MusicPlan['events'][number] | null>(null);
  from = '';
  until = '';
  query = '';
  ack = false;
  page = 1;
  suggestionPage = 1;
  readonly label = musicStatus;
  readonly link = musicPlanLink;
  readonly time = formatTimestamp;
  readonly notice = (s: string) =>
    s === 'OWN_DUE'
      ? 'Esta carpeta ya está en su poder, pero su devolución está prevista antes de terminar este periodo. Coordina la devolución; la cesión real no se cambia.'
      : materialNotice('Carpeta: ' + s);
  readonly back =
    this.scope === 'series'
      ? ['/actuaciones/series', this.id]
      : ['/actuaciones', this.id];
  private readonly request = new StableRequest();
  private generation = 0;
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const p = await this.repo.detail(this.scope, this.id, this.page);
      this.plan.set(p);
      if (!p.people.length && this.page > 1) {
        this.page = 1;
        await this.load();
      }
    } catch (e) {
      this.error.set(materialError(e));
    } finally {
      this.loading.set(false);
    }
  }
  async openPerson(id: string) {
    this.active.set(this.active() === id ? null : id);
    this.proposedVoice.set(null);
    this.picking.set(null);
    if (this.active()) {
      try {
        const v = await this.repo.suggestion(id);
        if (this.active() === id) this.proposedVoice.set(v);
      } catch {
        this.error.set(
          'No se pudo cargar la voz habitual. Puedes elegirla manualmente.',
        );
      }
    }
  }
  parts(id: string) {
    return this.plan()?.participations.filter((p) => p.person_id === id) ?? [];
  }
  needs(id: string) {
    return this.plan()?.needs.filter((p) => p.person_id === id) ?? [];
  }
  pending(id: string) {
    return this.needs(id).filter(
      (n) => !['HELD', 'ASSIGNED', 'AWAIT_RETURN'].includes(n.status),
    ).length;
  }
  eventTitle(id: string) {
    return this.plan()?.events.find((e) => e.id === id)?.title ?? '';
  }
  gap(id: string) {
    return this.plan()?.choices.find((c) => c.person_id === id)?.choice ?? null;
  }
  async command(action: string, data: Json) {
    if (this.busy() || !this.connection.online()) return false;
    if (this.window() && action !== 'WINDOW') {
      this.error.set('Guarda o cierra las fechas que estás editando.');
      return false;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.repo.command(
        this.scope,
        this.id,
        action,
        data,
        this.request.for({ action, data }),
      );
      this.window.set(null);
      this.picking.set(null);
      this.candidate.set(null);
      await this.load();
      return true;
    } catch (e) {
      this.error.set(materialError(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  confirmChange() {
    return (
      (!this.plan()?.needs.some((n) => n.assignment_id) &&
        !this.plan()?.stale.length) ||
      confirm(
        'Se recalcularán las necesidades. Las asignaciones afectadas quedarán señaladas para que las revises; las entregas reales se conservan. ¿Continuar?',
      )
    );
  }
  repertoires(e: MusicPlan['events'][number], rep: string) {
    if (!this.confirmChange()) return;
    void this.command('EVENT', {
      event_id: e.id,
      version: e.version,
      repertoires: e.repertoires.includes(rep)
        ? e.repertoires.filter((r) => r !== rep)
        : [...e.repertoires, rep],
    });
  }
  voice(p: Participation, v: { id: string } | null) {
    if (!this.confirmChange()) return;
    void this.command('VOICE', {
      person_id: p.person_id,
      rows: [
        {
          event_id: p.event_id,
          version: p.version,
          voice_id: v?.id ?? null,
          required: p.required,
        },
      ],
    });
  }
  required(p: Participation) {
    if (!this.confirmChange()) return;
    void this.command('VOICE', {
      person_id: p.person_id,
      rows: [
        {
          event_id: p.event_id,
          version: p.version,
          voice_id: p.voice_id,
          required: !p.required,
        },
      ],
    });
  }
  voiceAll(id: string, v: { id: string } | null) {
    if (!this.confirmChange()) return;
    void this.command('VOICE', {
      person_id: id,
      rows: this.parts(id).map((p) => ({
        event_id: p.event_id,
        version: p.version,
        voice_id: v?.id ?? null,
        required: p.required,
      })),
    });
  }
  setGap(id: string, choice: string) {
    if (!this.confirmChange()) return;
    void this.command('GAP', { person_id: id, choice, previous: this.gap(id) });
  }
  editWindow(e: MusicPlan['events'][number]) {
    this.window.set(e);
    this.from = madridLocal(e.planned_from);
    this.until = madridLocal(e.planned_until);
  }
  saveWindow() {
    const e = this.window();
    if (e && this.confirmChange())
      void this.command('WINDOW', {
        event_id: e.id,
        version: e.version,
        from_local: this.from,
        until_local: this.until,
      });
  }
  async choose(n: MusicNeed) {
    this.picking.set(n);
    this.query = '';
    this.suggestionPage = 1;
    this.candidate.set(null);
    await this.search();
  }
  async search() {
    const n = this.picking();
    if (!n) return;
    const g = ++this.generation;
    this.suggesting.set(true);
    this.suggestionError.set('');
    this.candidate.set(null);
    try {
      const r = await this.repo.recommendations(
        n.need_key,
        this.suggestionPage,
        this.query,
      );
      if (g === this.generation) this.suggestions.set(r);
    } catch (e) {
      if (g === this.generation) this.suggestionError.set(materialError(e));
    } finally {
      if (g === this.generation) this.suggesting.set(false);
    }
  }
  pick(f: FolderInventory & { warnings: string[] }) {
    this.candidate.set(f);
    this.ack = false;
  }
  assign() {
    const r = this.suggestions(),
      f = this.candidate();
    if (!r || !f || (f.warnings.length && !this.ack)) return;
    void this.command('ASSIGN', {
      need: r.need,
      folder_id: f.id,
      folder_version: f.version,
      ack: this.ack,
    });
  }
  release(id: string, version: number) {
    if (
      !confirm(
        '¿Quitar esta asignación prevista? Se cancelará su reserva pendiente, si la tiene. Cualquier carpeta ya entregada seguirá en poder de la persona hasta registrar su devolución firmada.',
      )
    )
      return;
    void this.command('RELEASE', { id, version });
  }
  move(delta: number) {
    if (!this.canLeave()) return;
    this.page += delta;
    this.active.set(null);
    this.window.set(null);
    void this.load();
  }
  @HostListener('window:beforeunload', ['$event']) unload(
    e: BeforeUnloadEvent,
  ) {
    if (this.window()) e.preventDefault();
  }
  canLeave() {
    return (
      !this.busy() &&
      (!this.window() ||
        confirm('¿Descartar las fechas de carpeta sin guardar?'))
    );
  }
}
