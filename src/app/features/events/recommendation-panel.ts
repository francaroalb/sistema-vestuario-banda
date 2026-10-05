import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { EventsRepository } from '../../core/events/events-repository';
import {
  Recommendation,
  recommendationReason,
  planningError,
} from '../../core/events/models';
import { Connectivity } from '../../core/connectivity';
@Component({
  selector: 'app-recommendation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section
    class="suggestion"
    aria-label="Recomendación por histórico"
  >
    @if (loading()) {
      <p role="status">Consultando histórico y disponibilidad…</p>
    } @else if (error()) {
      <p role="alert">
        {{ error() }}
        <button class="text-button" (click)="load()">
          Reintentar recomendación
        </button>
      </p>
    } @else if (result(); as r) {
      <h4>
        {{
          r.historical_size
            ? 'Talla según histórico: ' + r.historical_size
            : 'Sin histórico de vestuario'
        }}
      </h4>
      <p>{{ reason[r.reason] }}</p>
      @if (r.history.length) {
        <p class="history">
          @for (h of r.history.slice(0, 5); track h.size) {
            <span
              >Talla {{ h.size }} · {{ h.uses }}
              {{ h.uses === 1 ? 'entrega' : 'entregas' }}</span
            >
          }
        </p>
      }
      @for (c of r.candidates; track c.id) {
        <div class="candidate">
          <div>
            <strong
              >{{ $first ? 'Mejor opción · ' : 'Alternativa · ' }}{{ c.code }} ·
              {{ c.size }}</strong
            ><small>{{
              c.size_step
                ? 'Talla superior: comprobar cómo le queda'
                : c.own_custody
                  ? 'Ya está en su poder'
                  : 'Disponible durante todo el periodo'
            }}</small>
          </div>
          <button
            class="btn btn-secondary"
            [disabled]="disabled() || !connection.online()"
            (click)="selected.emit(c.id)"
            [attr.aria-label]="'Elegir recomendación ' + c.code"
          >
            Elegir
          </button>
        </div>
      }
      <p class="manual">También puedes buscar y elegir manualmente debajo.</p>
    }
  </section>`,
  styles: `
    :host {
      display: block;
    }
    .suggestion {
      padding: 14px;
      border: 1px solid var(--color-accent-border);
      border-radius: var(--radius-md);
      background: var(--color-accent-soft);
      margin: 12px 0;
    }
    h4 {
      margin: 0;
      color: var(--color-primary-dark);
      font-size: var(--text-sm);
    }
    p {
      font-size: var(--text-xs);
      line-height: 1.6;
      margin: 8px 0;
    }
    .history {
      display: flex;
      gap: 6px 12px;
      flex-wrap: wrap;
      color: var(--color-muted);
    }
    .candidate {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--color-accent-border);
    }
    .candidate > div {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    strong {
      font-size: var(--text-sm);
    }
    small {
      display: block;
      font-size: var(--text-xs);
      margin-top: 4px;
    }
    .manual {
      color: var(--color-muted);
      margin-bottom: 0;
    }
  `,
})
export class RecommendationPanel {
  private readonly repo = inject(EventsRepository);
  readonly connection = inject(Connectivity);
  readonly event = input.required<string>();
  readonly person = input.required<string>();
  readonly type = input.required<string>();
  readonly disabled = input(false);
  readonly selected = output<string>();
  readonly loading = signal(true);
  readonly error = signal('');
  readonly result = signal<Recommendation | null>(null);
  readonly reason = recommendationReason;
  private generation = 0;
  constructor() {
    effect(() => {
      const event = this.event(),
        person = this.person(),
        type = this.type();
      void this.load(event, person, type);
    });
  }
  async load(event = this.event(), person = this.person(), type = this.type()) {
    const g = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.recommend(event, person, type);
      if (g === this.generation) this.result.set(r);
    } catch (e) {
      if (g === this.generation) this.error.set(planningError(e));
    } finally {
      if (g === this.generation) this.loading.set(false);
    }
  }
}
