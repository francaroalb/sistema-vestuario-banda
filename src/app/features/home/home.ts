import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { InventoryRepository } from '../../core/inventory/inventory-repository';
import { InventorySummary } from '../../core/config/database.types';
import { inventoryError } from '../../core/inventory/inventory';
import { Icon } from '../../shared/ui/icon';
@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon],
  template: `
    <div class="home-heading">
      <h1>Hola, {{ auth.profile()?.display_name }}.</h1>
      <p>¿Qué necesitas hacer?</p>
    </div>
    <div class="quick-actions">
      <a class="quick-action add" routerLink="/cesiones/nueva"
        ><app-icon name="plus" /><span
          ><strong>Nueva cesión</strong
          ><small>Entregar prendas y firmar</small></span
        ><app-icon name="arrow"
      /></a>
      <a class="quick-action search" routerLink="/inventario"
        ><app-icon name="search" /><span
          ><strong>Buscar prenda</strong
          ><small>Consultar o actualizar su ficha</small></span
        ><app-icon name="arrow"
      /></a>
    </div>
    <div class="people-actions" aria-label="Accesos rápidos">
      <a class="btn btn-secondary" routerLink="/inventario/nueva"
        ><app-icon name="plus" />Nueva prenda</a
      >
      <a class="btn btn-secondary" routerLink="/cesiones"
        ><app-icon name="exchange" />Cesiones activas</a
      >
      <a class="btn btn-secondary" routerLink="/personas/nueva"
        ><app-icon name="plus" />Nueva persona</a
      >
      <a class="btn btn-secondary" routerLink="/personas"
        ><app-icon name="people" />Buscar persona</a
      >
    </div>
    <div class="inventory-heading">
      <h2>El inventario, de un vistazo</h2>
      <a routerLink="/inventario">Ver todo<app-icon name="arrow" /></a>
    </div>
    @if (loading()) {
      <p class="loading-state" role="status">Consultando inventario…</p>
    } @else if (error()) {
      <div class="notice notice-error" role="alert">
        {{ error() }}
        <button class="text-button" type="button" (click)="load()">
          Reintentar
        </button>
      </div>
    } @else if (summary(); as stats) {
      <div class="stats">
        <a
          class="stat held"
          routerLink="/inventario"
          [queryParams]="{ situacion: 'held' }"
          ><app-icon name="people" /><strong>{{ stats.held_count }}</strong
          ><span>Cedidas</span></a
        >
        <a class="stat total" routerLink="/inventario"
          ><app-icon name="hanger" /><strong>{{ stats.active_count }}</strong
          ><span>Prendas activas</span></a
        >
        <a
          class="stat available"
          routerLink="/inventario"
          [queryParams]="{ estado: 'DISPONIBLE', situacion: 'in_band' }"
          ><app-icon name="check" /><strong>{{ stats.available_count }}</strong
          ><span>Disponibles</span></a
        >
        <a
          class="stat laundry"
          routerLink="/inventario"
          [queryParams]="{ estado: 'PENDIENTE_LAVANDERIA' }"
          ><app-icon name="wash" /><strong>{{ stats.laundry_count }}</strong
          ><span>Lavandería</span></a
        >
        <a
          class="stat damaged"
          routerLink="/inventario"
          [queryParams]="{ estado: 'DANADA' }"
          ><app-icon name="warning" /><strong>{{ stats.damaged_count }}</strong
          ><span>Dañadas</span></a
        >
      </div>
      @if (stats.active_count === 0 && stats.archived_count === 0) {
        <p class="inventory-hint">
          Todavía no hay prendas. Pulsa <strong>Nueva prenda</strong> para
          añadir la primera.
        </p>
      }
      <a
        class="archive-link"
        routerLink="/inventario"
        [queryParams]="{ archivo: 'archived' }"
        ><app-icon name="archive" />Prendas archivadas<span>{{
          stats.archived_count
        }}</span
        ><app-icon name="arrow"
      /></a>
    }
  `,
  styles: `
    .people-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-top: 1rem;
      a {
        flex: 1;
        white-space: nowrap;
      }
    }
    .home-heading {
      margin-bottom: 1.5rem;
    }
    h1 {
      font: 700 clamp(1.4rem, 5vw, 1.8rem)/1.3 var(--font-body);
      letter-spacing: -0.03em;
      margin: 0 0 0.4rem;
    }
    .home-heading p {
      font-size: var(--text-sm);
      color: var(--color-muted);
      margin: 0;
    }
    .quick-actions {
      display: grid;
      gap: 0.8rem;
    }
    .quick-action {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      border-radius: var(--radius-lg);
      text-decoration: none;
      min-height: 6rem;
      box-shadow: 0 0.5rem 1rem rgb(68 28 20 / 8%);
      span {
        flex: 1;
      }
      strong {
        display: block;
        font-size: 1.15rem;
      }
      small {
        display: block;
        font-size: var(--text-xs);
        margin-top: 0.4rem;
        line-height: 1.5;
      }
    }
    .quick-action > app-icon:first-child {
      width: 1.75rem;
      height: 1.75rem;
    }
    .add {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .add:hover {
      background: var(--color-primary-dark);
    }
    .search {
      background: var(--color-accent-light);
      color: var(--color-primary-dark);
      border: 1px solid var(--color-accent);
    }
    .search:hover {
      background: #f0c778;
    }
    .inventory-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin: 2rem 0 1rem;
      h2 {
        font-size: var(--text-sm);
        margin: 0;
      }
      a {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--color-primary);
        font-weight: 700;
        font-size: var(--text-xs);
        min-height: 2.75rem;
        text-decoration: none;
        app-icon {
          width: 1rem;
        }
      }
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.8rem;
    }
    .stat {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: start;
      gap: 0.5rem;
      padding: 1.15rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border-strong);
      text-decoration: none;
      min-height: 8rem;
      app-icon {
        grid-column: 2;
        grid-row: 1;
        width: 1.25rem;
        height: 1.25rem;
      }
      strong {
        grid-row: 1;
        font-size: 2.2rem;
        line-height: 1.1;
      }
      span {
        grid-column: 1/-1;
        font-size: var(--text-xs);
        font-weight: 600;
        align-self: end;
      }
    }
    .total,
    .held {
      background: var(--color-primary-soft);
      color: var(--color-primary-dark);
      border-color: #d9b3ac;
    }
    .available {
      background: var(--color-success-soft);
      color: var(--color-success);
      border-color: var(--color-success-border);
    }
    .laundry {
      background: var(--color-accent-soft);
      color: var(--color-accent-dark);
      border-color: var(--color-accent-border);
    }
    .damaged {
      background: #fae7e5;
      color: #941e24;
      border-color: #e8b9b4;
    }
    .stat:hover {
      box-shadow: 0 0.3rem 1rem rgb(68 28 20 / 10%);
    }
    .inventory-hint {
      font-size: var(--text-sm);
      line-height: 1.8;
      color: var(--color-muted);
      margin: 1.25rem 0;
    }
    .archive-link {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      min-height: 3.5rem;
      border-bottom: 1px solid var(--color-border-strong);
      color: var(--color-muted);
      font-size: var(--text-xs);
      text-decoration: none;
      margin-top: 1rem;
      span {
        margin-left: auto;
        background: var(--color-border);
        border-radius: var(--radius-pill);
        padding: 0.2rem 0.6rem;
        color: var(--color-text);
        font-weight: 700;
      }
      app-icon {
        width: 1.1rem;
        height: 1.1rem;
      }
    }
    @media (min-width: 44rem) {
      .quick-actions {
        grid-template-columns: 1fr 1fr;
      }
      .stats {
        grid-template-columns: repeat(5, 1fr);
      }
      .quick-action {
        padding: 1.75rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  readonly auth = inject(AuthService);
  private readonly repository = inject(InventoryRepository);
  readonly summary = signal<InventorySummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.summary.set(await this.repository.summary());
    } catch (error) {
      this.error.set(inventoryError(error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
