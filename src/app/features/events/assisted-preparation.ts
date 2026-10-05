import { Feedback } from '../../core/feedback';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { EventsRepository } from '../../core/events/events-repository';
import {
  AssistedPlan,
  planningError,
  recommendationReason,
} from '../../core/events/models';
import { Connectivity } from '../../core/connectivity';
import { formatTimestamp } from '../../core/inventory/inventory';
@Component({
  selector: 'app-assisted-preparation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="assistant-panel">
    <div class="assistant-heading">
      <div>
        <h2>Preparación asistida</h2>
        <p>
          Propone prendas según el histórico y la disponibilidad del periodo.
        </p>
      </div>
      <button
        class="btn btn-secondary"
        [disabled]="loading() || saving() || disabled() || !connection.online()"
        (click)="preview()"
      >
        {{ loading() ? 'Preparando propuestas…' : 'Ver propuestas' }}
      </button>
    </div>
    @if (error()) {
      <p class="notice notice-error" role="alert">{{ error() }}</p>
    }
    @if (done()) {
      <p class="notice" role="status">{{ done() }}</p>
    }
    @if (plan(); as p) {
      <div class="result-summary">
        <strong>{{ p.suggested }} asignaciones propuestas</strong
        ><span>{{ p.review }} necesitan revisión</span
        ><span>{{ p.preserved }} asignaciones conservadas</span>
      </div>
      @if (p.existing_review) {
        <p class="notice">
          {{ p.existing_review }} asignaciones existentes necesitan revisión. Se
          conservan para revisarlas en la preparación.
        </p>
      }
      <p class="help">
        Solo se aplican coincidencias claras de talla. Los empates, tallas
        superiores y casos sin histórico se revisan manualmente. Las prendas ya
        asignadas se conservan.
      </p>
      @for (
        r of p.lines.slice((page - 1) * 8, page * 8);
        track r.event_id + r.person_id + r.type_id
      ) {
        <div class="proposal" [class.review]="!r.garment_id">
          <div>
            <strong>{{ r.full_name }} · {{ r.type_name }}</strong
            ><small>{{ time(r.from) }} — {{ time(r.until) }}</small>
            <p>{{ reason[r.reason] }}</p>
          </div>
          <div class="proposal-choice">
            @if (r.garment_id) {
              <strong
                >{{ r.candidates[0].code }} · Talla
                {{ r.candidates[0].size }}</strong
              >
            } @else {
              <strong>Revisión manual</strong>
            }
            @if (r.historical_size) {
              <small>Talla histórica {{ r.historical_size }}</small>
            }
          </div>
        </div>
      }
      @if (!p.lines.length) {
        <p>No hay prendas pendientes de asignar.</p>
      }
      @if (p.lines.length > 8) {
        <nav aria-label="Páginas de propuestas">
          <button
            class="btn btn-quiet"
            [disabled]="page === 1"
            (click)="page = page - 1"
          >
            Anterior</button
          ><span>Página {{ page }}</span
          ><button
            class="btn btn-quiet"
            [disabled]="page * 8 >= p.lines.length"
            (click)="page = page + 1"
          >
            Siguiente
          </button>
        </nav>
      }
      <div class="assistant-actions">
        <button
          class="btn btn-primary"
          [disabled]="
            !p.suggested || saving() || disabled() || !connection.online()
          "
          (click)="apply()"
        >
          {{
            saving() ? 'Aplicando…' : 'Aplicar ' + p.suggested + ' propuestas'
          }}</button
        ><button
          class="btn btn-quiet"
          [disabled]="saving()"
          (click)="plan.set(null)"
        >
          Cerrar
        </button>
      </div>
    }
  </section>`,
  styles: `
    :host {
      display: block;
    }
    .assistant-panel {
      border: 1px solid var(--color-accent-border);
      background: var(--color-accent-soft);
      padding: var(--card-padding);
      border-radius: var(--radius-lg);
      margin-bottom: 16px;
    }
    .assistant-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    h2 {
      font-size: var(--text-section);
      margin: 0;
      color: var(--color-primary-dark);
    }
    p {
      font-size: var(--text-xs);
      line-height: 1.6;
      margin: 6px 0 0;
    }
    .result-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      margin: 16px 0 8px;
      font-size: var(--text-sm);
      color: var(--color-primary-dark);
    }
    .help {
      color: var(--color-muted);
      margin-bottom: 12px;
    }
    .proposal {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 16px;
      border-top: 1px solid var(--color-accent-border);
      padding: 12px 0;
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }
    .proposal > div {
      min-width: 0;
    }
    .proposal small {
      display: block;
      color: var(--color-muted);
      font-size: var(--text-xs);
      margin-top: 4px;
    }
    .proposal-choice {
      color: var(--color-success);
    }
    .review .proposal-choice {
      color: var(--color-accent-dark);
    }
    .assistant-actions,
    nav {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
  `,
})
export class AssistedPreparation {
  private readonly feedback = inject(Feedback);
  private readonly repo = inject(EventsRepository);
  readonly connection = inject(Connectivity);
  readonly scope = input.required<'event' | 'series'>();
  readonly id = input.required<string>();
  readonly disabled = input(false);
  readonly applied = output<void>();
  readonly busy = output<boolean>();
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly done = signal('');
  readonly plan = signal<AssistedPlan | null>(null);
  readonly reason = recommendationReason;
  readonly time = formatTimestamp;
  page = 1;
  private request = crypto.randomUUID();
  async preview() {
    if (
      this.loading() ||
      this.saving() ||
      this.disabled() ||
      !this.connection.online()
    )
      return;
    this.loading.set(true);
    this.error.set('');
    this.done.set('');
    this.plan.set(null);
    try {
      this.plan.set(await this.repo.assistedPreview(this.scope(), this.id()));
      this.request = crypto.randomUUID();
      this.page = 1;
    } catch (e) {
      this.error.set(planningError(e));
    } finally {
      this.loading.set(false);
    }
  }
  async apply() {
    const p = this.plan();
    if (!p || this.saving() || this.disabled() || !this.connection.online())
      return;
    this.saving.set(true);
    this.busy.emit(true);
    this.error.set('');
    try {
      const r = await this.repo.assistedApply(p, this.request);
      this.plan.set(null);
      this.done.set(
        r.assigned +
          ' asignaciones aplicadas. ' +
          r.review +
          ' pendientes de revisión manual.',
      );
      this.feedback.success(r.assigned + ' asignaciones aplicadas.');
      this.applied.emit();
    } catch (e) {
      this.error.set(planningError(e));
    } finally {
      this.saving.set(false);
      this.busy.emit(false);
    }
  }
}
