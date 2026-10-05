import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EventsRepository } from '../../core/events/events-repository';
import {
  BandEvent,
  EventChoice,
  Preparation,
  SeriesBlock,
  SeriesDetail,
  hasParticipationGap,
  planningError,
  preparationLabel,
} from '../../core/events/models';
import { Json } from '../../core/config/database.types';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { formatTimestamp } from '../../core/inventory/inventory';
import { Choice } from '../../core/loans/models';
import { ChoicePicker } from '../loans/choice-picker';
@Component({
  selector: 'app-series-detail',
  imports: [FormsModule, RouterLink, ChoicePicker],
  templateUrl: './series-detail.html',
  styleUrls: ['../inventory/inventory.scss', './events.scss', './series.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesDetailPage {
  private readonly repo = inject(EventsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  id = '';
  readonly detail = signal<SeriesDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly dirty = signal(false);
  readonly candidates = signal<BandEvent[]>([]);
  readonly candidateCount = signal(0);
  readonly searching = signal(false);
  candidateQuery = '';
  candidatePage = 1;
  showEvents = false;
  readonly editor = signal(false);
  readonly selectedPerson = signal<Choice | null>(null);
  readonly selected = signal<string[]>([]);
  gapChoice = '';
  quick = false;
  name = '';
  instrument = '';
  private personId = crypto.randomUUID();
  readonly picking = signal<Preparation | null>(null);
  readonly choices = signal<EventChoice[]>([]);
  readonly choiceCount = signal(0);
  readonly choiceLoading = signal(false);
  choiceQuery = '';
  choicePage = 1;
  personPage = 1;
  rename = false;
  seriesName = '';
  readonly time = formatTimestamp;
  readonly label = preparationLabel;
  private request = crypto.randomUUID();
  private commandKey = '';
  private generation = 0;
  private searchGeneration = 0;
  private choiceGeneration = 0;
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.id = p.get('id')!;
      this.detail.set(null);
      this.editor.set(false);
      this.dirty.set(false);
      void this.load();
    });
  }
  async load() {
    const g = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await this.repo.seriesDetail(this.id);
      if (g !== this.generation) return;
      this.detail.set(d);
      this.seriesName = d.series.name;
      if ((this.personPage - 1) * 12 >= this.people().length)
        this.personPage = 1;
    } catch (e) {
      if (g === this.generation) this.error.set(planningError(e));
    } finally {
      if (g === this.generation) this.loading.set(false);
    }
  }
  async reload() {
    if (this.canLeave()) {
      this.dirty.set(false);
      this.editor.set(false);
      this.picking.set(null);
      await this.load();
    }
  }
  readonly eventId = (e: BandEvent) => e.id;
  events() {
    return this.detail()?.events.filter((e) => !e.cancelled) ?? [];
  }
  people() {
    return [
      ...new Map(
        (this.detail()?.blocks ?? []).map((b) => [b.person_id, b]),
      ).values(),
    ];
  }
  visiblePeople() {
    return this.people().slice(
      (this.personPage - 1) * 12,
      this.personPage * 12,
    );
  }
  blocks(person: string) {
    return this.detail()?.blocks.filter((b) => b.person_id === person) ?? [];
  }
  lines(block: string) {
    return this.detail()?.rows.filter((r) => r.block_id === block) ?? [];
  }
  eventName(id: string) {
    return this.detail()?.events.find((e) => e.id === id)?.title ?? '';
  }
  hasGap() {
    return hasParticipationGap(this.events(), this.selected());
  }
  canDeliver(b: SeriesBlock) {
    return (
      new Date(b.planned_until).getTime() > Date.now() &&
      this.lines(b.id).some(
        (r) => r.status === 'ASIGNADA' || r.status === 'DEVUELTA',
      )
    );
  }
  async command(action: string, data: Json) {
    if (!this.detail() || this.saving() || !this.connection.online())
      return false;
    const key = JSON.stringify([action, this.detail()!.series.version, data]);
    if (key !== this.commandKey) {
      this.commandKey = key;
      this.request = crypto.randomUUID();
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const s = await this.repo.seriesCommand(
        action,
        this.id,
        this.detail()!.series.version,
        data,
        this.request,
      );
      this.detail.update((d) => (d ? { ...d, series: s } : d));
      this.feedback.success('Serie actualizada.');
      return true;
    } catch (e) {
      this.error.set(planningError(e));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    } finally {
      this.saving.set(false);
    }
  }
  async saveName() {
    if (await this.command('SERIES', { name: this.seriesName })) {
      this.dirty.set(false);
      this.rename = false;
      await this.load();
    }
  }
  async searchEvents() {
    const g = ++this.searchGeneration;
    this.searching.set(true);
    try {
      const r = await this.repo.list(
        this.candidateQuery,
        'all',
        this.candidatePage,
      );
      if (g !== this.searchGeneration) return;
      this.candidates.set(r.rows);
      this.candidateCount.set(r.count);
    } catch (e) {
      this.error.set(planningError(e));
    } finally {
      if (g === this.searchGeneration) this.searching.set(false);
    }
  }
  async membership(e: BandEvent, active: boolean) {
    if (!active && !confirm('¿Sacar esta actuación de la serie?')) return;
    if (
      await this.command('MEMBERSHIP', {
        event_id: e.id,
        event_version: e.version,
        active,
      })
    ) {
      await this.load();
      await this.searchEvents();
    }
  }
  start() {
    if (this.dirty() && !confirm('¿Descartar los cambios sin guardar?'))
      return false;
    this.selectedPerson.set(null);
    this.selected.set([]);
    this.gapChoice = '';
    this.quick = false;
    this.name = '';
    this.instrument = '';
    this.personId = crypto.randomUUID();
    this.editor.set(true);
    this.dirty.set(false);
    this.picking.set(null);
    return true;
  }
  choose(p: Choice) {
    this.selectedPerson.set(p);
    this.selected.set(this.blocks(p.id).flatMap((b) => b.event_ids));
    this.gapChoice = '';
    this.dirty.set(true);
  }
  edit(b: SeriesBlock) {
    if (!this.start()) return;
    this.choose({
      id: b.person_id,
      label: b.full_name,
      subtitle: b.instrument ?? '',
    });
    document
      .getElementById('participation-editor')
      ?.scrollIntoView({ behavior: 'smooth' });
  }
  toggle(id: string) {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
    this.gapChoice = '';
    this.dirty.set(true);
  }
  async saveAttendance() {
    const p = this.selectedPerson();
    if ((!p && !this.quick) || (this.hasGap() && !this.gapChoice)) return;
    const old = p ? this.blocks(p.id) : [];
    if (
      old.length &&
      !confirm(
        'Se sustituirán sus periodos y se quitarán sus asignaciones previstas. Las cesiones reales se conservan. ¿Guardar participación?',
      )
    )
      return;
    const data: Json = {
      person_id: p?.id ?? this.personId,
      event_ids: this.selected(),
      gap_choice: this.hasGap() ? this.gapChoice : null,
      ...(!p ? { name: this.name, instrument: this.instrument } : {}),
    };
    if (await this.command('ATTENDANCE', data)) {
      this.editor.set(false);
      this.dirty.set(false);
      await this.load();
    }
  }
  close() {
    if (this.canLeave()) {
      this.editor.set(false);
      this.rename = false;
      this.dirty.set(false);
    }
  }
  async pick(r: Preparation) {
    this.picking.set(r);
    this.choiceQuery = '';
    this.choicePage = 1;
    await this.loadChoices();
  }
  async loadChoices() {
    const r = this.picking();
    if (!r) return;
    const g = ++this.choiceGeneration;
    this.choiceLoading.set(true);
    try {
      const c = await this.repo.choices(
        r.event_id,
        r.person_id,
        r.type_id,
        this.choiceQuery,
        this.choicePage,
      );
      if (g !== this.choiceGeneration) return;
      this.choices.set(c.rows);
      this.choiceCount.set(c.count);
    } catch (e) {
      this.error.set(planningError(e));
    } finally {
      if (g === this.choiceGeneration) this.choiceLoading.set(false);
    }
  }
  async assign(r: Preparation, id: string | null) {
    if (
      await this.command('BLOCK_ASSIGN', {
        block_id: r.block_id!,
        type_id: r.type_id,
        garment_id: id,
      })
    ) {
      this.picking.set(null);
      await this.load();
    }
  }
  canLeave() {
    return (
      !this.saving() &&
      (!this.dirty() ||
        confirm('¿Descartar los cambios de la serie sin guardar?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.dirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
