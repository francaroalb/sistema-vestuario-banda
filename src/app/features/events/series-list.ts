import { EventsTabs } from './events-tabs';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventsRepository } from '../../core/events/events-repository';
import { EventSeries, planningError } from '../../core/events/models';
import { Connectivity } from '../../core/connectivity';
@Component({
  selector: 'app-series-list',
  imports: [FormsModule, RouterLink, EventsTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../inventory/inventory.scss', './events.scss', './series.scss'],
  template: `
    <div class="page-heading">
      <div>
        <p class="eyebrow">Preparación conjunta</p>
        <h1>Series de actuaciones</h1>
      </div>
      <button class="btn btn-primary" (click)="creating = !creating">
        Nueva serie
      </button>
    </div>
    <app-events-tabs />
    @if (creating) {
      <form class="card event-card" (ngSubmit)="create()">
        <div class="field">
          <label for="series-name">Nombre de la serie</label
          ><input
            id="series-name"
            name="name"
            [(ngModel)]="name"
            required
            maxlength="160"
            [disabled]="saving()"
            placeholder="Semana Santa 2027"
          />
        </div>
        <div class="event-actions">
          <button
            class="btn btn-primary"
            [disabled]="!name.trim() || saving() || !connection.online()"
          >
            Crear serie
          </button>
        </div>
      </form>
    }
    <form class="event-filters" (ngSubmit)="page = 1; load()">
      <div class="field">
        <label for="series-search">Buscar serie</label
        ><input
          id="series-search"
          name="q"
          [(ngModel)]="q"
          maxlength="160"
          type="search"
        />
      </div>
      <button class="btn btn-secondary">Buscar</button>
    </form>
    @if (error()) {
      <p class="notice notice-error" role="alert">
        {{ error() }}
        <button class="text-button" (click)="load()">Reintentar carga</button>
      </p>
    }
    @if (loading()) {
      <p role="status">Cargando series…</p>
    } @else {
      <div class="event-stack event-list-grid">
        @for (s of rows(); track s.id) {
          <article class="card event-card">
            <h2>
              <a [routerLink]="['/actuaciones/series', s.id]">{{ s.name }}</a>
            </h2>
            <p>Actuaciones, participantes y periodos de vestuario.</p>
            <a
              class="btn btn-secondary"
              [routerLink]="['/actuaciones/series', s.id]"
              >Preparar serie</a
            >
            <a
              class="btn btn-quiet"
              [routerLink]="['/actuaciones/series', s.id, 'duplicar']"
              >Duplicar agenda</a
            >
          </article>
        } @empty {
          <p class="empty-state card">
            Todavía no hay series en esta búsqueda.
          </p>
        }
      </div>
      @if (count() > 24) {
        <nav class="event-actions" aria-label="Páginas de series">
          <button
            class="btn btn-secondary"
            [disabled]="page === 1"
            (click)="page = page - 1; load()"
          >
            Anterior</button
          ><span>Página {{ page }}</span
          ><button
            class="btn btn-secondary"
            [disabled]="page * 24 >= count()"
            (click)="page = page + 1; load()"
          >
            Siguiente
          </button>
        </nav>
      }
    }
  `,
})
export class SeriesList {
  private readonly repo = inject(EventsRepository);
  private readonly router = inject(Router);
  readonly connection = inject(Connectivity);
  readonly rows = signal<EventSeries[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  name = '';
  q = '';
  page = 1;
  creating = false;
  private id = crypto.randomUUID();
  private request = crypto.randomUUID();
  private generation = 0;
  constructor() {
    void this.load();
  }
  async load() {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.seriesList(this.q, this.page);
      if (generation !== this.generation) return;
      this.rows.set(r.rows);
      this.count.set(r.count);
      if (!r.rows.length && this.page > 1) {
        this.page = 1;
        await this.load();
      }
    } catch (e) {
      if (generation === this.generation) this.error.set(planningError(e));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  async create() {
    if (this.saving() || !this.name.trim() || !this.connection.online()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.repo.seriesCommand(
        'SERIES',
        this.id,
        null,
        { name: this.name },
        this.request,
      );
      this.name = '';
      this.saving.set(false);
      await this.router.navigate(['/actuaciones/series', this.id]);
    } catch (e) {
      this.error.set(planningError(e));
    } finally {
      this.saving.set(false);
    }
  }
  canLeave() {
    return (
      !this.saving() &&
      (!this.name.trim() || confirm('¿Descartar la serie sin guardar?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.name.trim()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
