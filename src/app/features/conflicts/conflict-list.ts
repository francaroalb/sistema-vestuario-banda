import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConflictsRepository } from '../../core/conflicts/conflicts-repository';
import { Conflict, conflictReason } from '../../core/conflicts/models';
import { planningError } from '../../core/events/models';
import { formatTimestamp } from '../../core/inventory/inventory';
@Component({
  selector: 'app-conflict-list',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <a class="back-link" routerLink="/inicio">Volver al inicio</a>
    <div class="page-heading">
      <div>
        <p class="eyebrow">Seguimiento de vestuario</p>
        <h1>Conflictos y avisos</h1>
        <p class="page-intro">
          Las asignaciones se conservan hasta que decidas cómo resolverlas.
        </p>
      </div>
      <button class="btn btn-secondary" [disabled]="loading()" (click)="load()">
        Actualizar
      </button>
    </div>
    <nav class="filters" aria-label="Filtrar incidencias">
      @for (f of filters; track f.value) {
        <button
          class="btn"
          [class.btn-primary]="filter === f.value"
          [class.btn-secondary]="filter !== f.value"
          [attr.aria-pressed]="filter === f.value"
          (click)="filter = f.value; page = 1; load()"
        >
          {{ f.label }}
        </button>
      }
    </nav>
    @if (loading()) {
      <p role="status" class="loading-state">Consultando incidencias…</p>
    } @else if (error()) {
      <p class="notice notice-error" role="alert">
        {{ error() }}
        <button class="text-button" (click)="load()">Reintentar</button>
      </p>
    } @else {
      <p class="count">
        {{ count() }} incidencias · cada periodo de una serie se cuenta una vez.
      </p>
      <div class="conflicts">
        @for (
          r of rows();
          track (r.block_id || r.event_id) + r.person_id + r.type_id
        ) {
          <article class="card conflict-card" [class.pending]="!r.critical">
            <header>
              <a [routerLink]="['/inventario', r.garment_id]"
                ><strong>{{ r.code }}</strong> · {{ r.type_name }} · Talla
                {{ r.size }}</a
              ><span class="badge">{{
                r.critical ? 'Conflicto' : 'Devolución pendiente'
              }}</span>
            </header>
            <h2>{{ r.full_name }}</h2>
            <p>
              <strong>{{ r.title }}</strong> · {{ time(r.starts_at) }}
            </p>
            <p class="period">
              Reserva: {{ time(r.planned_from) }} — {{ time(r.planned_until) }}
            </p>
            <ul>
              @for (reason of r.reasons; track reason) {
                <li>{{ reasons[reason] }}</li>
              }
            </ul>
            @if (r.holder_name) {
              <p>
                En poder de <strong>{{ r.holder_name }}</strong>
                @if (r.due_at) {
                  · devolución prevista {{ time(r.due_at) }}
                }
                .
              </p>
            }
            <div class="actions">
              <a
                class="btn btn-primary"
                [routerLink]="
                  r.series_id
                    ? ['/actuaciones/series', r.series_id]
                    : ['/actuaciones', r.event_id]
                "
                >Revisar asignación</a
              >
              @if (r.loan_id) {
                <a
                  class="btn btn-secondary"
                  [routerLink]="['/cesiones', r.loan_id, 'devolver']"
                  >Registrar devolución</a
                >
              }
              <a
                class="btn btn-quiet"
                [routerLink]="['/inventario', r.garment_id]"
                >Revisar prenda</a
              >
            </div>
          </article>
        } @empty {
          <p class="notice">
            No hay incidencias en este filtro. Las devoluciones reales y los
            cambios de asignación actualizan este panel.
          </p>
        }
      </div>
      @if (count() > 12 || page > 1) {
        <nav class="actions" aria-label="Páginas de incidencias">
          <button
            class="btn btn-secondary"
            [disabled]="page === 1"
            (click)="page = page - 1; load()"
          >
            Anterior</button
          ><span>Página {{ page }}</span
          ><button
            class="btn btn-secondary"
            [disabled]="page * 12 >= count()"
            (click)="page = page + 1; load()"
          >
            Siguiente
          </button>
        </nav>
      }
    }`,
  styles: `
    .filters,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 16px;
    }
    .count,
    .period {
      font-size: var(--text-xs);
      color: var(--color-muted);
    }
    .conflicts {
      display: grid;
      gap: 12px;
    }
    .conflict-card {
      padding: var(--card-padding);
      border-left: 4px solid var(--color-primary);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .pending {
      border-left-color: var(--color-accent-dark);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    header a {
      color: var(--color-primary-dark);
      font-size: var(--text-sm);
    }
    .badge {
      font-size: var(--text-xs);
      background: var(--color-accent-soft);
      padding: 4px 8px;
      border-radius: 6px;
    }
    h2 {
      font-size: var(--text-section);
      margin: 12px 0 4px;
    }
    p,
    li {
      font-size: var(--text-sm);
      line-height: 1.6;
    }
    p {
      margin: 4px 0;
    }
    ul {
      padding-left: 18px;
      margin: 8px 0 12px;
    }
    .actions {
      margin: 12px 0 0;
    }
    @media (min-width: 70rem) {
      .conflicts {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class ConflictList {
  private readonly repo = inject(ConflictsRepository);
  readonly rows = signal<Conflict[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly time = formatTimestamp;
  readonly reasons = conflictReason;
  readonly filters = [
    { value: 'all', label: 'Todos' },
    { value: 'critical', label: 'Conflictos' },
    { value: 'pending', label: 'Devoluciones previstas' },
  ];
  filter = 'all';
  page = 1;
  private generation = 0;
  constructor() {
    void this.load();
  }
  async load() {
    const g = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.list(this.filter, this.page);
      if (g === this.generation) {
        this.rows.set(r.rows);
        this.count.set(r.count);
      }
    } catch (e) {
      if (g === this.generation) this.error.set(planningError(e));
    } finally {
      if (g === this.generation) this.loading.set(false);
    }
  }
}
