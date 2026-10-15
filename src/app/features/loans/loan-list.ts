import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoansRepository } from '../../core/loans/loans-repository';
import {
  LoanFilters,
  LoanOverview,
  UUID,
  loanError,
} from '../../core/loans/models';
import { formatTimestamp } from '../../core/inventory/inventory';
import { Icon } from '../../shared/ui/icon';
@Component({
  selector: 'app-loan-list',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <p>
      <a class="btn btn-secondary" routerLink="/cesiones/material"
        >Entrega y devolución conjunta</a
      >
    </p>
    <div class="page-heading">
      <div>
        <p class="eyebrow">Entregas y devoluciones</p>
        <h1>Cesiones</h1>
      </div>
      <a class="btn btn-primary" routerLink="/cesiones/nueva"
        ><app-icon name="plus" />Nueva cesión</a
      >
    </div>
    <form class="search-panel card loan-search" (ngSubmit)="navigate(1)">
      <div class="field">
        <label for="loan-search">Buscar por persona</label
        ><input
          id="loan-search"
          type="search"
          name="query"
          maxlength="120"
          [(ngModel)]="query"
          (ngModelChange)="search()"
          placeholder="Nombre en el momento de la entrega…"
        />
      </div>
      <div class="field notes-field">
        <label for="loan-status">Mostrar cesiones</label
        ><select
          id="loan-status"
          name="status"
          [(ngModel)]="status"
          (ngModelChange)="navigate(1)"
        >
          <option value="active">Activas</option>
          <option value="overdue">Devolución vencida</option>
          <option value="closed">Finalizadas</option>
          <option value="all">Todas</option>
        </select>
      </div>
    </form>
    @if (person || garment) {
      <p class="list-context">
        Mostrando el histórico de la
        {{ person ? 'persona' : 'prenda' }} seleccionada.
        <a routerLink="/cesiones" [queryParams]="{ estado: 'all' }"
          >Ver todas las cesiones</a
        >
      </p>
    }
    @if (loading()) {
      <p class="loading-state" role="status">Cargando cesiones…</p>
    } @else if (error()) {
      <div class="notice notice-error" role="alert">
        {{ error() }}
        <button class="text-button" type="button" (click)="load()">
          Reintentar
        </button>
      </div>
    } @else {
      <div class="results-heading">
        <p role="status">
          {{ count() }} {{ count() === 1 ? 'cesión' : 'cesiones' }}
        </p>
      </div>
      <ul class="inventory-grid">
        @for (loan of rows(); track loan.id) {
          <li>
            <a
              class="garment-card loan-card card"
              [routerLink]="['/cesiones', loan.id]"
              [queryParams]="{ volver: router.url }"
              [attr.aria-label]="'Ver cesión de ' + loan.person_name"
            >
              <div class="loan-card-heading">
                <h2>{{ loan.person_name }}</h2>
                <span
                  class="loan-badge"
                  [class.closed]="loan.closed_at"
                  [class.overdue]="overdue(loan)"
                  >{{
                    loan.closed_at
                      ? 'Finalizada'
                      : overdue(loan)
                        ? 'Devolución vencida'
                        : 'Activa'
                  }}</span
                >
              </div>
              <p>
                {{ loan.held_count }}
                {{
                  loan.held_count === 1
                    ? 'prenda pendiente'
                    : 'prendas pendientes'
                }}
              </p>
              <p>Entrega: {{ timestamp(loan.opened_at) }}</p>
              <p>
                {{
                  loan.due_at
                    ? 'Prevista: ' + timestamp(loan.due_at)
                    : 'Sin devolución prevista'
                }}
              </p></a
            >
          </li>
        }
      </ul>
      @if (!rows().length) {
        <section class="empty-state card">
          <app-icon name="exchange" />
          <h2>No hay cesiones en esta vista</h2>
          <p>
            Cambia la búsqueda o el filtro. Crea una cesión cuando entregues
            físicamente las prendas.
          </p>
        </section>
      }
      @if (pages() > 1) {
        <nav class="pagination" aria-label="Páginas de cesiones">
          <button
            class="btn btn-secondary"
            [disabled]="page() <= 1"
            (click)="navigate(page() - 1)"
          >
            Anterior</button
          ><span>Página {{ page() }} de {{ pages() }}</span
          ><button
            class="btn btn-secondary"
            [disabled]="page() >= pages()"
            (click)="navigate(page() + 1)"
          >
            Siguiente
          </button>
        </nav>
      }
    }
  `,
  styleUrls: ['../inventory/inventory.scss', './loans.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanList {
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(LoansRepository);
  readonly rows = signal<LoanOverview[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly count = signal(0);
  readonly page = signal(1);
  readonly timestamp = formatTimestamp;
  query = '';
  status: LoanFilters['status'] = 'active';
  person = '';
  garment = '';
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.query = (params.get('buscar') ?? '').slice(0, 120);
      const status = params.get('estado');
      this.status =
        status === 'all' || status === 'closed' || status === 'overdue'
          ? status
          : 'active';
      this.person = UUID.test(params.get('persona') ?? '')
        ? params.get('persona')!
        : '';
      this.garment = UUID.test(params.get('prenda') ?? '')
        ? params.get('prenda')!
        : '';
      const page = Number(params.get('pagina'));
      this.page.set(
        Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1,
      );
      void this.load();
    });
    inject(DestroyRef).onDestroy(() => {
      this.controller?.abort();
      clearTimeout(this.timer);
    });
  }
  pages() {
    return Math.max(1, Math.ceil(this.count() / 24));
  }
  overdue(loan: LoanOverview) {
    return (
      !loan.closed_at &&
      Boolean(loan.due_at && Date.parse(loan.due_at) < Date.now())
    );
  }
  search() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.navigate(1), 200);
  }
  navigate(page: number) {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        buscar: this.query.trim() || null,
        estado: this.status === 'active' ? null : this.status,
        persona: this.person || null,
        prenda: this.garment || null,
        pagina: page > 1 ? page : null,
      },
    });
  }
  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.repository.list(
        {
          q: this.query,
          status: this.status,
          person: this.person,
          garment: this.garment,
          page: this.page(),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.rows.set(result.rows);
      this.count.set(result.count);
      if (this.page() > this.pages()) this.navigate(this.pages());
    } catch (e) {
      if (!controller.signal.aborted) this.error.set(loanError(e).message);
    } finally {
      if (!controller.signal.aborted) this.loading.set(false);
    }
  }
}
