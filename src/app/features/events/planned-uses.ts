import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventsRepository } from '../../core/events/events-repository';
import { Reservation, planningError } from '../../core/events/models';
import { formatTimestamp } from '../../core/inventory/inventory';
@Component({
  selector: 'app-planned-uses',
  imports: [RouterLink],
  styleUrls: ['./events.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="card event-card">
    <h2>Asignaciones previstas</h2>
    @if (loading()) {
      <p role="status">Consultando reservas…</p>
    } @else if (error()) {
      <p class="notice notice-error" role="alert">
        {{ error() }}
        <button class="text-button" (click)="load()">Reintentar</button>
      </p>
    } @else {
      @for (r of rows(); track r.event_id + r.person_id + r.garment_id) {
        <div class="event-choice">
          <div>
            <strong>Asignada a {{ r.full_name }}</strong
            ><small
              >{{ time(r.planned_from) }} — {{ time(r.planned_until) }}</small
            >
          </div>
          <a
            class="btn btn-secondary"
            [routerLink]="['/actuaciones', r.event_id]"
            >{{ r.title }}</a
          >
        </div>
      } @empty {
        <p class="muted">Sin asignaciones futuras.</p>
      }
      @if (count() > 6) {
        <nav class="event-actions" aria-label="Páginas de reservas">
          <button
            class="btn btn-secondary"
            [disabled]="page === 1"
            (click)="page = page - 1; load()"
          >
            Anterior</button
          ><span>Página {{ page }}</span
          ><button
            class="btn btn-secondary"
            [disabled]="page * 6 >= count()"
            (click)="page = page + 1; load()"
          >
            Siguiente
          </button>
        </nav>
      }
    }
  </section>`,
})
export class PlannedUses {
  private readonly repo = inject(EventsRepository);
  readonly garment = input('');
  readonly person = input('');
  readonly rows = signal<Reservation[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly time = formatTimestamp;
  page = 1;
  private generation = 0;
  constructor() {
    effect(() => {
      this.garment();
      this.person();
      this.page = 1;
      void this.load();
    });
  }
  async load() {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.reservations(
        this.garment() ? 'garment_id' : 'person_id',
        this.garment() || this.person(),
        this.page,
      );
      if (generation === this.generation) {
        this.rows.set(r.rows);
        this.count.set(r.count);
      }
    } catch (e) {
      if (generation === this.generation) this.error.set(planningError(e));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
