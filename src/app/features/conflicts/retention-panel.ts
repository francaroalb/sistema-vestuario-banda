import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConflictsRepository } from '../../core/conflicts/conflicts-repository';
import { RetentionPreview } from '../../core/conflicts/models';
import { LoanItem, loanError } from '../../core/loans/models';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { formatTimestamp } from '../../core/inventory/inventory';
@Component({
  selector: 'app-retention-panel',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="retention card">
    <div class="heading">
      <div>
        <h2>Mantiene la prenda</h2>
        <p>
          Registra lo que ocurre realmente: la cesión seguirá abierta, con su
          fecha prevista original.
        </p>
      </div>
      @if (!open()) {
        <button
          class="btn btn-secondary"
          [disabled]="!connection.online() || !eligible().length"
          (click)="open.set(true)"
        >
          Registrar que mantiene prendas
        </button>
      }
    </div>
    @if (open()) {
      <fieldset [disabled]="saving() || loading()">
        <legend>Prendas que mantiene</legend>
        @for (i of eligible(); track i.id) {
          <label
            ><input
              type="checkbox"
              [checked]="selected().includes(i.id)"
              (change)="toggle(i.id)"
            /><span
              ><strong>{{ i.code }}</strong> · Talla {{ i.size }}</span
            ></label
          >
        }
      </fieldset>
      <div class="actions">
        <button
          class="btn btn-secondary"
          [disabled]="
            !selected().length || saving() || loading() || !connection.online()
          "
          (click)="review()"
        >
          {{ loading() ? 'Consultando…' : 'Revisar impacto' }}</button
        ><button
          class="btn btn-quiet"
          [disabled]="saving() || loading()"
          (click)="close()"
        >
          Cancelar
        </button>
      </div>
      @if (error()) {
        <p class="notice notice-error" role="alert">{{ error() }}</p>
      }
      @if (preview(); as p) {
        @if (p.impacts.length) {
          <p class="notice" role="status">
            <strong
              >Esta decisión afecta a {{ p.impacts.length }}
              {{
                p.impacts.length === 1
                  ? 'asignación futura'
                  : 'asignaciones futuras'
              }}.</strong
            >
            Las reservas se conservarán y aparecerán en Conflictos.
          </p>
          @for (
            r of p.impacts.slice((page - 1) * 6, page * 6);
            track r.event_id + r.person_id + r.garment_id
          ) {
            <div class="impact">
              <div>
                <strong>{{ r.code }} · {{ r.full_name }}</strong
                ><small
                  >{{ r.title }} · {{ time(r.planned_from) }} —
                  {{ time(r.planned_until) }}</small
                >
              </div>
              <a
                class="text-button"
                [routerLink]="
                  r.series_id
                    ? ['/actuaciones/series', r.series_id]
                    : ['/actuaciones', r.event_id]
                "
                >Ver preparación</a
              >
            </div>
          }
          @if (p.impacts.length > 6) {
            <nav class="actions" aria-label="Páginas de asignaciones afectadas">
              <button
                class="btn btn-quiet"
                [disabled]="page === 1"
                (click)="page = page - 1"
              >
                Anterior</button
              ><span>Página {{ page }}</span
              ><button
                class="btn btn-quiet"
                [disabled]="page * 6 >= p.impacts.length"
                (click)="page = page + 1"
              >
                Siguiente
              </button>
            </nav>
          }
        } @else {
          <p class="notice">
            No hay asignaciones futuras de otras personas afectadas en este
            momento.
          </p>
        }
        <p>
          La prenda sigue en poder de {{ p.person_name }}. No se registra
          ninguna devolución ni se cambia su estado físico.
        </p>
        <button
          class="btn btn-primary"
          [disabled]="saving() || loading() || !connection.online()"
          (click)="confirm()"
        >
          {{
            saving()
              ? 'Guardando…'
              : p.impacts.length
                ? 'Mantener igualmente'
                : 'Confirmar que mantiene'
          }}
        </button>
      }
    }
  </section>`,
  styles: `
    :host {
      display: block;
      margin-bottom: 16px;
    }
    .retention {
      padding: var(--card-padding);
      border: 1px solid var(--color-accent-border);
      background: var(--color-accent-soft);
    }
    .heading,
    .actions,
    .impact {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    h2 {
      margin: 0;
      font-size: var(--text-section);
      color: var(--color-primary-dark);
    }
    p,
    legend,
    label,
    small {
      font-size: var(--text-sm);
      line-height: 1.6;
    }
    p {
      margin: 8px 0 12px;
    }
    fieldset {
      border: 0;
      padding: 8px 0;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    label {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      cursor: pointer;
    }
    input {
      width: 20px;
      height: 20px;
      accent-color: var(--color-primary);
    }
    .actions {
      justify-content: flex-start;
      margin: 12px 0;
    }
    .impact {
      border-top: 1px solid var(--color-accent-border);
      padding: 10px 0;
      overflow-wrap: anywhere;
    }
    .impact > div {
      min-width: 0;
    }
    small {
      display: block;
      color: var(--color-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class RetentionPanel {
  private readonly repo = inject(ConflictsRepository);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly loan = input.required<string>();
  readonly items = input.required<LoanItem[]>();
  readonly saved = output<void>();
  readonly busy = output<boolean>();
  readonly open = signal(false);
  readonly selected = signal<string[]>([]);
  readonly preview = signal<RetentionPreview | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly time = formatTimestamp;
  page = 1;
  private request = crypto.randomUUID();
  eligible() {
    return this.items().filter((i) => !i.returned_at && !i.retained_at);
  }
  toggle(id: string) {
    if (this.loading() || this.saving()) return;
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
    this.preview.set(null);
    this.error.set('');
  }
  close() {
    this.open.set(false);
    this.preview.set(null);
    this.selected.set([]);
    this.error.set('');
  }
  async review() {
    if (
      this.loading() ||
      this.saving() ||
      !this.selected().length ||
      !this.connection.online()
    )
      return;
    this.loading.set(true);
    this.preview.set(null);
    this.error.set('');
    try {
      this.preview.set(await this.repo.preview(this.loan(), this.selected()));
      this.request = crypto.randomUUID();
      this.page = 1;
    } catch (e) {
      this.error.set(loanError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
  async confirm() {
    const p = this.preview();
    if (!p || this.saving() || !this.connection.online()) return;
    this.saving.set(true);
    this.busy.emit(true);
    this.error.set('');
    try {
      await this.repo.confirm(p, this.request);
      this.feedback.success('Decisión registrada. La cesión continúa abierta.');
      this.close();
      this.saved.emit();
    } catch (e) {
      this.error.set(loanError(e).message);
    } finally {
      this.saving.set(false);
      this.busy.emit(false);
    }
  }
}
