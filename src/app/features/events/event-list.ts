import { EventsTabs } from './events-tabs';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EventsRepository } from '../../core/events/events-repository';
import { BandEvent, planningError } from '../../core/events/models';
import { formatTimestamp } from '../../core/inventory/inventory';
@Component({
  selector: 'app-event-list',
  imports: [FormsModule, RouterLink, EventsTabs],
  styleUrls: ['../inventory/inventory.scss', './events.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading">
      <div>
        <p class="eyebrow">Agenda y preparación</p>
        <h1>Actuaciones</h1>
      </div>
      <div class="event-actions">
        <a class="btn btn-primary" routerLink="/actuaciones/nueva"
          >Nueva actuación</a
        >
      </div>
    </div>
    <app-events-tabs />
    <form class="event-filters" (ngSubmit)="search()">
      <div class="field">
        <label for="event-search">Buscar actuación</label
        ><input
          id="event-search"
          name="q"
          [(ngModel)]="q"
          maxlength="160"
          type="search"
          placeholder="Nombre de la actuación"
        />
      </div>
      <div class="field">
        <label for="event-status">Mostrar</label
        ><select id="event-status" name="status" [(ngModel)]="status">
          <option value="upcoming">Próximas</option>
          <option value="past">Pasadas</option>
          <option value="cancelled">Canceladas</option>
          <option value="all">Todas</option>
        </select>
      </div>
      <button class="btn btn-secondary">Buscar</button>
    </form>
    @if (loading()) {
      <p class="loading-state" role="status">Cargando actuaciones…</p>
    } @else if (error()) {
      <p class="notice notice-error" role="alert">
        {{ error() }}
        <button class="text-button" (click)="load()">Reintentar</button>
      </p>
    } @else {
      <div class="event-stack event-list-grid">
        @for (e of rows(); track e.id) {
          <article class="card event-card event-list-card">
            <h2>
              <a [routerLink]="['/actuaciones', e.id]">{{ e.title }}</a>
            </h2>
            <p>{{ time(e.starts_at) }} — {{ time(e.ends_at) }}</p>
            <p class="muted">
              {{ e.uniform_name }} ·
              {{
                e.cancelled
                  ? 'Cancelada'
                  : e.type_ids.length + ' tipos de prenda'
              }}
            </p>
            <div class="event-actions">
              <a class="btn btn-secondary" [routerLink]="['/actuaciones', e.id]"
                >Ver preparación</a
              >
            </div>
          </article>
        } @empty {
          <div class="empty-state card">
            <h2>No hay actuaciones en esta vista</h2>
            <p>
              Crea una actuación y añade sus refuerzos para preparar el
              vestuario.
            </p>
          </div>
        }
      </div>
      @if (count() > 24) {
        <nav class="event-actions" aria-label="Páginas de actuaciones">
          <button
            class="btn btn-secondary"
            [disabled]="page === 1"
            (click)="go(page - 1)"
          >
            Anterior</button
          ><span>Página {{ page }} · {{ count() }} actuaciones</span
          ><button
            class="btn btn-secondary"
            [disabled]="page * 24 >= count()"
            (click)="go(page + 1)"
          >
            Siguiente
          </button>
        </nav>
      }
    }
  `,
})
export class EventList {
  private readonly repo = inject(EventsRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly rows = signal<BandEvent[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly time = formatTimestamp;
  q = '';
  status = 'upcoming';
  page = 1;
  private generation = 0;
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.q = p.get('q') ?? '';
      this.status = ['upcoming', 'past', 'all', 'cancelled'].includes(
        p.get('status') ?? '',
      )
        ? p.get('status')!
        : 'upcoming';
      this.page = Math.min(
        100000,
        Math.max(1, Math.floor(Number(p.get('page'))) || 1),
      );
      void this.load();
    });
  }
  search() {
    this.go(1);
  }
  go(page: number) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: this.q || null, status: this.status, page },
      replaceUrl: true,
    });
  }
  async load() {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.list(this.q, this.status, this.page);
      if (generation !== this.generation) return;
      this.rows.set(r.rows);
      this.count.set(r.count);
      if (!r.rows.length && this.page > 1) this.go(1);
    } catch (e) {
      if (generation === this.generation) this.error.set(planningError(e));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
