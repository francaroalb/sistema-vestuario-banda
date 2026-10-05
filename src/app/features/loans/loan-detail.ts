import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoansRepository } from '../../core/loans/loans-repository';
import {
  LoanOverview,
  LoanItem,
  LoanMovement,
  loanError,
  loanReturnUrl,
  movementLabel,
} from '../../core/loans/models';
import { formatTimestamp, stateLabel } from '../../core/inventory/inventory';
import { Icon } from '../../shared/ui/icon';
@Component({
  selector: 'app-loan-detail',
  imports: [RouterLink, Icon],
  template: `
    <a class="back-link" [routerLink]="backLink"
      ><app-icon name="back" />Volver a Cesiones</a
    >
    @if (loading()) {
      <p class="loading-state" role="status">Cargando cesión…</p>
    } @else if (error()) {
      <div class="notice notice-error" role="alert">
        {{ error() }}
        <button type="button" class="text-button" (click)="load()">
          Reintentar
        </button>
      </div>
    } @else if (loan(); as item) {
      <div class="page-heading">
        <div>
          <p class="eyebrow">Cesión</p>
          <h1>{{ item.person_name }}</h1>
        </div>
        <span class="loan-badge" [class.closed]="item.closed_at">{{
          item.closed_at ? 'Finalizada' : 'Activa'
        }}</span>
      </div>
      @if (!item.closed_at) {
        <div class="detail-actions">
          <a
            class="btn btn-primary"
            [routerLink]="['/cesiones', item.id, 'devolver']"
            ><app-icon name="back" />Devolver prendas</a
          ><a
            class="btn btn-secondary"
            [routerLink]="['/cesiones', item.id, 'cambiar']"
            ><app-icon name="exchange" />Cambiar prenda</a
          >
        </div>
      }
      <div class="operation-sections">
        <section class="operation-card card">
          <a class="person-link" [routerLink]="['/personas', item.person_id]"
            >Abrir ficha de la persona</a
          >
          <dl class="loan-meta">
            <div>
              <dt>Entrega</dt>
              <dd>{{ timestamp(item.opened_at) }}</dd>
            </div>
            <div>
              <dt>Devolución prevista</dt>
              <dd>
                {{
                  item.due_at ? timestamp(item.due_at) : 'Sin fecha prevista'
                }}
              </dd>
            </div>
            <div>
              <dt>Pendientes</dt>
              <dd>{{ item.held_count }} prendas</dd>
            </div>
            @if (item.closed_at) {
              <div>
                <dt>Finalizada</dt>
                <dd>{{ timestamp(item.closed_at) }}</dd>
              </div>
            }
          </dl>
          @if (item.notes) {
            <p class="preserve-text">{{ item.notes }}</p>
          }
        </section>
        <section class="operation-card card">
          <h2>Prendas de esta cesión</h2>
          <ul class="loan-items">
            @for (line of items(); track line.id) {
              <li>
                <div>
                  <a [routerLink]="['/inventario', line.garment_id]">{{
                    line.code
                  }}</a
                  ><small>{{ line.type_name }} · Talla {{ line.size }}</small
                  ><small>Entregada: {{ timestamp(line.delivered_at) }}</small>
                  @if (line.returned_at) {
                    <small
                      >Devuelta: {{ timestamp(line.returned_at) }} ·
                      {{ stateLabel(line.returned_state!) }}</small
                    >
                  }
                </div>
                <span class="loan-badge" [class.closed]="line.returned_at">{{
                  line.returned_at ? 'Devuelta' : 'En su poder'
                }}</span>
              </li>
            }
          </ul>
        </section>
        <section class="operation-card card">
          <h2>Movimientos</h2>
          <ol class="history">
            @for (movement of movements(); track movement.id) {
              <li>
                <h3>{{ movementLabel(movement.kind) }}</h3>
                <p>
                  {{ timestamp(movement.occurred_at) }} ·
                  {{ movement.actor_name }}
                </p>
                <ul class="movement-rows">
                  @for (line of movement.details.returned; track line.id) {
                    <li>
                      Devuelve <strong>{{ line.code }}</strong> ·
                      {{ line.type_name }} · Talla {{ line.size }} ·
                      {{ stateLabel(line.returned_state!) }}
                    </li>
                  }
                  @for (line of movement.details.delivered; track line.id) {
                    <li>
                      Recibe <strong>{{ line.code }}</strong> ·
                      {{ line.type_name }} · Talla {{ line.size }}
                    </li>
                  }
                </ul>
                <p>
                  Confirmada mediante firma · {{ movement.details.person_name }}
                </p>
              </li>
            }
          </ol>
        </section>
      </div>
    }
  `,
  styleUrls: ['../inventory/inventory.scss', './loans.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(LoansRepository);
  readonly backLink = inject(Router).parseUrl(
    loanReturnUrl(this.route.snapshot.queryParamMap.get('volver')),
  );
  readonly loan = signal<LoanOverview | null>(null);
  readonly items = signal<LoanItem[]>([]);
  readonly movements = signal<LoanMovement[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly timestamp = formatTimestamp;
  readonly stateLabel = stateLabel;
  readonly movementLabel = movementLabel;
  private request = 0;
  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.load());
  }
  async load() {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.repository.detail(
        this.route.snapshot.paramMap.get('id') ?? '',
      );
      if (request !== this.request) return;
      this.loan.set(data.loan);
      this.items.set(data.items);
      this.movements.set(data.movements);
    } catch (e) {
      if (request === this.request) this.error.set(loanError(e).message);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
