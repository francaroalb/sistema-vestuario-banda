import { MusicPlanning } from '../../core/music-planning/music-planning';
import { VoicePicker } from '../folders/voice-picker';
import { NgTemplateOutlet } from '@angular/common';
import { summarizeEvent, summarizeParticipant } from './series-preparation';
import { RecommendationPanel } from './recommendation-panel';
import { AssistedPreparation } from './assisted-preparation';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  viewChild,
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
  imports: [
    VoicePicker,
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    ChoicePicker,
    RecommendationPanel,
    AssistedPreparation,
  ],
  templateUrl: './series-detail.html',
  styleUrls: ['../inventory/inventory.scss', './events.scss', './series.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesDetailPage {
  private readonly music = inject(MusicPlanning);
  readonly selectedVoice = signal<{ id: string; name: string } | null>(null);
  applyVoice = false;
  readonly voiceLoading = signal(false);
  async suggestVoice(person: Choice) {
    this.selectedVoice.set(null);
    this.applyVoice = !this.blocks(person.id).length;
    if (!this.applyVoice) return;
    this.voiceLoading.set(true);
    try {
      const v = await this.music.suggestion(person.id);
      if (this.selectedPerson()?.id === person.id) this.selectedVoice.set(v);
    } catch {
      this.error.set(
        'No se pudo cargar la voz habitual. Puedes elegirla manualmente.',
      );
    } finally {
      this.voiceLoading.set(false);
    }
  }
  private readonly repo = inject(EventsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  id = '';
  readonly detail = signal<SeriesDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly assisting = signal(false);
  readonly refreshing = signal(false);
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
  readonly activePersonId = signal<string | null>(null);
  readonly editingPersonId = signal<string | null>(null);
  readonly personQuery = signal('');
  readonly personFilter = signal<'all' | 'pending' | 'ready'>('all');
  readonly rail = viewChild<ElementRef<HTMLElement>>('participantRail');
  readonly eventRail = viewChild<ElementRef<HTMLElement>>('eventRail');
  readonly eventSummaries = computed(
    () =>
      new Map(
        (this.detail()?.events ?? []).map((e) => [
          e.id,
          summarizeEvent(
            e,
            this.detail()?.blocks ?? [],
            this.detail()?.rows ?? [],
          ),
        ]),
      ),
  );
  scrollEvents(direction: number) {
    const rail = this.eventRail()?.nativeElement;
    rail?.scrollBy({
      left: direction * rail.clientWidth * 0.8,
      behavior: 'smooth',
    });
  }
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
      this.activePersonId.set(null);
      this.editingPersonId.set(null);
      this.personQuery.set('');
      this.personFilter.set('all');
      this.editor.set(false);
      this.dirty.set(false);
      void this.load();
    });
  }
  async load(background = false) {
    const g = ++this.generation;
    if (!background) this.loading.set(true);
    this.refreshing.set(background);
    this.error.set('');
    try {
      const d = await this.repo.seriesDetail(this.id);
      if (g !== this.generation) return;
      this.detail.set(d);
      this.seriesName = d.series.name;
      if (!this.people().some((p) => p.person_id === this.activePersonId()))
        this.activePersonId.set(null);
      this.closeHidden();
      this.centerActive();
    } catch (e) {
      if (g === this.generation) this.error.set(planningError(e));
    } finally {
      if (g === this.generation) {
        this.loading.set(false);
        this.refreshing.set(false);
      }
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
  private readonly summaries = computed(
    () =>
      new Map(
        this.people().map((p) => [
          p.person_id,
          summarizeParticipant(
            this.blocks(p.person_id),
            this.detail()?.rows ?? [],
          ),
        ]),
      ),
  );
  summary(person: string) {
    return this.summaries().get(person) ?? summarizeParticipant([], []);
  }
  orderedPeople() {
    return this.people().sort(
      (a, b) =>
        this.summary(a.person_id).priority -
          this.summary(b.person_id).priority ||
        a.full_name.localeCompare(b.full_name, 'es'),
    );
  }
  filteredPeople() {
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const q = normalize(this.personQuery().trim());
    return this.orderedPeople().filter(
      (p) =>
        (!q ||
          normalize(p.full_name + ' ' + (p.instrument ?? '')).includes(q)) &&
        (this.personFilter() === 'all' ||
          (this.summary(p.person_id).state === 'ready') ===
            (this.personFilter() === 'ready')),
    );
  }
  readyCount() {
    return this.people().filter(
      (p) => this.summary(p.person_id).state === 'ready',
    ).length;
  }
  activePerson() {
    return (
      this.people().find((p) => p.person_id === this.activePersonId()) ?? null
    );
  }
  activeIndex() {
    return this.filteredPeople().findIndex(
      (p) => p.person_id === this.activePersonId(),
    );
  }
  filterPeople(value: 'all' | 'pending' | 'ready') {
    this.personFilter.set(value);
    this.closeHidden();
  }
  searchPeople(value: string) {
    this.personQuery.set(value);
    this.closeHidden();
  }
  private closeHidden() {
    if (
      !this.filteredPeople().some((p) => p.person_id === this.activePersonId())
    ) {
      this.activePersonId.set(null);
      this.picking.set(null);
      this.choiceGeneration++;
    }
  }
  selectPerson(id: string, toggle = true) {
    if (!this.canLeave()) return;
    this.dirty.set(false);
    this.editor.set(false);
    this.editingPersonId.set(null);
    this.rename = false;
    this.picking.set(null);
    this.choiceGeneration++;
    this.activePersonId.set(toggle && this.activePersonId() === id ? null : id);
    this.centerActive();
  }
  stepPerson(direction: number) {
    const people = this.filteredPeople(),
      index = this.activeIndex();
    const next =
      index < 0 ? (direction > 0 ? 0 : people.length - 1) : index + direction;
    if (people[next]) this.selectPerson(people[next].person_id, false);
  }
  centerActive() {
    requestAnimationFrame(() => {
      const rail = this.rail()?.nativeElement;
      const card = rail?.querySelector<HTMLElement>(
        '[data-person="' + this.activePersonId() + '"]',
      );
      if (rail && card)
        rail.scrollTo({
          left: card.offsetLeft - (rail.clientWidth - card.clientWidth) / 2,
          behavior: 'instant',
        });
    });
  }
  blocks(person: string) {
    return this.detail()?.blocks.filter((b) => b.person_id === person) ?? [];
  }
  lines(block: string) {
    return this.detail()?.rows.filter((r) => r.block_id === block) ?? [];
  }
  eventStart(id: string) {
    const event = this.detail()?.events.find((e) => e.id === id);
    return event ? this.time(event.starts_at) : '';
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
    if (
      !this.detail() ||
      this.saving() ||
      this.assisting() ||
      this.refreshing() ||
      !this.connection.online()
    )
      return false;
    const key = JSON.stringify([
      action,
      this.detail()!.series.version,
      data,
      this.selectedVoice()?.id,
      this.applyVoice,
    ]);
    if (key !== this.commandKey) {
      this.commandKey = key;
      this.request = crypto.randomUUID();
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const s =
        action === 'ATTENDANCE'
          ? ((await this.music.participant(
              'series',
              this.id,
              this.detail()!.series.version,
              data,
              this.selectedVoice()?.id ?? null,
              this.applyVoice || this.quick,
              this.request,
            )) as unknown as SeriesDetail['series'])
          : await this.repo.seriesCommand(
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
    this.editingPersonId.set(null);
    this.activePersonId.set(null);
    this.selectedPerson.set(null);
    this.selectedVoice.set(null);
    this.applyVoice = false;
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
    void this.suggestVoice(p);
    if (this.blocks(p.id).length) {
      this.activePersonId.set(p.id);
      this.editingPersonId.set(p.id);
      this.personFilter.set('all');
      this.personQuery.set('');
      this.centerActive();
    }
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
  }
  toggle(id: string) {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
    this.gapChoice = '';
    this.dirty.set(true);
  }
  async saveAttendance() {
    if (this.voiceLoading()) return;
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
      this.editingPersonId.set(null);
      this.activePersonId.set(p?.id ?? this.personId);
      this.personQuery.set('');
      this.personFilter.set('all');
      this.dirty.set(false);
      await this.load();
    }
  }
  close() {
    if (this.canLeave()) {
      this.editor.set(false);
      this.rename = false;
      this.editingPersonId.set(null);
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
      await this.load(true);
    }
  }
  canLeave() {
    return (
      !this.saving() &&
      !this.assisting() &&
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
