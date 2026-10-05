import { RecommendationPanel } from './recommendation-panel';
import { AssistedPreparation } from './assisted-preparation';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EventsRepository } from '../../core/events/events-repository';
import {
  BandEvent,
  EventChoice,
  EventPerson,
  Preparation,
  planningError,
  preparationLabel,
} from '../../core/events/models';
import { formatTimestamp } from '../../core/inventory/inventory';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { Json } from '../../core/config/database.types';
import { Choice } from '../../core/loans/models';
import { ChoicePicker } from '../loans/choice-picker';
@Component({
  selector: 'app-event-detail',
  imports: [
    FormsModule,
    RouterLink,
    ChoicePicker,
    RecommendationPanel,
    AssistedPreparation,
  ],
  templateUrl: './event-detail.html',
  styleUrls: ['../inventory/inventory.scss', './events.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetail {
  private readonly repo = inject(EventsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  id = this.route.snapshot.paramMap.get('id')!;
  readonly event = signal<BandEvent | null>(null);
  readonly people = signal<EventPerson[]>([]);
  readonly rows = signal<Preparation[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly assisting = signal(false);
  readonly adding = signal(false);
  readonly quick = signal(false);
  readonly dirty = signal(false);
  readonly picking = signal<Preparation | null>(null);
  readonly choices = signal<EventChoice[]>([]);
  readonly choiceCount = signal(0);
  readonly choicesLoading = signal(false);
  readonly choiceError = signal('');
  readonly time = formatTimestamp;
  readonly label = preparationLabel;
  page = 1;
  choicePage = 1;
  query = '';
  name = '';
  instrument = '';
  private personId = crypto.randomUUID();
  private lastCommand = '';
  private request = crypto.randomUUID();
  private choicesGeneration = 0;
  private loadGeneration = 0;
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id = params.get('id')!;
      this.page = 1;
      this.picking.set(null);
      this.event.set(null);
      void this.load();
    });
  }
  async load() {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.error.set('');
    try {
      const [event, people] = await Promise.all([
        this.repo.get(this.id),
        this.repo.people(this.id, this.page),
      ]);
      if (generation !== this.loadGeneration) return;
      this.event.set(event);
      this.people.set(people.people);
      this.rows.set(people.rows);
      this.count.set(people.count);
      if (!people.people.length && this.page > 1) {
        this.page = 1;
        await this.load();
      }
    } catch (e) {
      if (generation === this.loadGeneration) this.error.set(planningError(e));
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }
  lines(person: string) {
    return this.rows().filter((r) => r.person_id === person);
  }
  canDeliver(person: string) {
    if (
      !this.event() ||
      new Date(
        this.lines(person)[0]?.block_until ?? this.event()!.planned_until,
      ).getTime() <= Date.now()
    )
      return false;
    return this.lines(person).some(
      (r) => r.status === 'ASIGNADA' || r.status === 'DEVUELTA',
    );
  }
  async command(action: string, data: Json): Promise<boolean> {
    if (
      !this.event() ||
      this.saving() ||
      this.assisting() ||
      !this.connection.online()
    )
      return false;
    const key = JSON.stringify([action, this.event()!.version, data]);
    if (key !== this.lastCommand) {
      this.request = crypto.randomUUID();
      this.lastCommand = key;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const e = await this.repo.command(
        action,
        this.id,
        this.event()!.version,
        data,
        this.request,
      );
      this.event.set(e);
      this.feedback.success('Preparación actualizada.');
      return true;
    } catch (e) {
      this.error.set(planningError(e));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    } finally {
      this.saving.set(false);
    }
  }
  async add(person: Choice) {
    if (
      await this.command('PARTICIPANT', { person_id: person.id, active: true })
    ) {
      this.adding.set(false);
      await this.load();
    }
  }
  async createPerson() {
    if (
      await this.command('PARTICIPANT', {
        person_id: this.personId,
        active: true,
        name: this.name,
        instrument: this.instrument,
      })
    ) {
      this.dirty.set(false);
      this.name = '';
      this.instrument = '';
      this.personId = crypto.randomUUID();
      this.quick.set(false);
      this.adding.set(false);
      await this.load();
    }
  }
  async remove(person: EventPerson) {
    if (
      !confirm(
        '¿Quitar a ' +
          person.full_name +
          ' de esta actuación? Sus cesiones reales se mantienen.',
      )
    )
      return;
    if (
      await this.command('PARTICIPANT', {
        person_id: person.person_id,
        active: false,
      })
    )
      await this.load();
  }
  async cancel() {
    if (
      !confirm(
        '¿Cancelar esta actuación y liberar sus reservas? Las prendas entregadas seguirán cedidas hasta registrar su devolución.',
      )
    )
      return;
    if (await this.command('CANCEL', {})) await this.load();
  }
  async pick(row: Preparation) {
    this.picking.set(row);
    this.query = '';
    this.choicePage = 1;
    await this.loadChoices();
  }
  async loadChoices() {
    const row = this.picking();
    if (!row) return;
    const generation = ++this.choicesGeneration;
    this.choicesLoading.set(true);
    this.choiceError.set('');
    try {
      const r = await this.repo.choices(
        this.id,
        row.person_id,
        row.type_id,
        this.query,
        this.choicePage,
      );
      if (generation !== this.choicesGeneration) return;
      this.choices.set(r.rows);
      this.choiceCount.set(r.count);
    } catch (e) {
      if (generation === this.choicesGeneration)
        this.choiceError.set(planningError(e));
    } finally {
      if (generation === this.choicesGeneration) this.choicesLoading.set(false);
    }
  }
  async assign(row: Preparation, garment: string | null) {
    if (
      await this.command('ASSIGN', {
        person_id: row.person_id,
        type_id: row.type_id,
        garment_id: garment,
      })
    ) {
      this.picking.set(null);
      await this.load();
    }
  }
  async go(page: number) {
    this.page = page;
    await this.load();
  }
  closeQuick() {
    if (this.canLeave()) {
      this.dirty.set(false);
      this.quick.set(false);
    }
  }
  canLeave() {
    return (
      !this.saving() &&
      !this.assisting() &&
      (!this.dirty() ||
        confirm('El refuerzo aún no se ha guardado. ¿Descartar el borrador?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    event: BeforeUnloadEvent,
  ) {
    if (this.dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
