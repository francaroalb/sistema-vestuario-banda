import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoansRepository } from '../../core/loans/loans-repository';
import { LoanOverview, loanError } from '../../core/loans/models';
import { formatTimestamp } from '../../core/inventory/inventory';
@Component({
  selector: 'app-loan-history',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="history-card card">
    <h2>Cesiones e histórico</h2>
    @if (loading()) {
      <p role="status">Consultando cesiones…</p>
    } @else if (error()) {
      <div class="notice" role="alert">
        {{ error() }}
        <button type="button" class="text-button" (click)="load()">
          Reintentar
        </button>
      </div>
    } @else {
      @if (!rows().length) {
        <p>Todavía no hay cesiones registradas.</p>
      }
      <ul>
        @for (loan of rows(); track loan.id) {
          <li>
            <a [routerLink]="['/cesiones', loan.id]"
              ><strong>{{ loan.person_name }}</strong
              ><span
                >{{
                  loan.closed_at
                    ? 'Finalizada'
                    : loan.held_count + ' prendas pendientes'
                }}
                · {{ timestamp(loan.opened_at) }}</span
              ></a
            >
          </li>
        }
      </ul>
      @if (rows().length) {
        <a
          class="text-button"
          routerLink="/cesiones"
          [queryParams]="{
            persona: person() || null,
            prenda: garment() || null,
            estado: 'all',
          }"
          >Ver todas las cesiones ({{ count() }})</a
        >
      }
    }
  </section>`,
  styles: `
    :host {
      display: block;
      max-width: 52rem;
      margin: 1.5rem 0;
    }
    .history-card {
      padding: 1.5rem;
      border-top: 3px solid var(--color-accent);
    }
    h2 {
      font-size: 1.1rem;
      margin: 0 0 1rem;
    }
    p {
      font-size: var(--text-sm);
      color: var(--color-muted);
    }
    ul {
      list-style: none;
      padding: 0;
    }
    li {
      border-bottom: 1px solid var(--color-border);
    }
    li a {
      display: grid;
      gap: 0.4rem;
      padding: 0.9rem 0;
      text-decoration: none;
      color: var(--color-primary);
      overflow-wrap: anywhere;
    }
    span {
      font-size: var(--text-xs);
      color: var(--color-muted);
    }
  `,
})
export class LoanHistory {
  readonly person = input('');
  readonly garment = input('');
  readonly rows = signal<LoanOverview[]>([]);
  readonly count = signal(0);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly timestamp = formatTimestamp;
  private readonly repository = inject(LoansRepository);
  private controller?: AbortController;
  constructor() {
    effect(() => {
      void this.load(this.person(), this.garment());
    });
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
  }
  async load(person = this.person(), garment = this.garment()) {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.repository.list(
        { person, garment, status: 'all', q: '', page: 1 },
        controller.signal,
        6,
      );
      if (controller.signal.aborted) return;
      this.rows.set(result.rows);
      this.count.set(result.count);
    } catch (e) {
      if (!controller.signal.aborted) this.error.set(loanError(e).message);
    } finally {
      if (!controller.signal.aborted) this.loading.set(false);
    }
  }
}
