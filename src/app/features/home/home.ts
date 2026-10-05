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
  styleUrl: './home.scss',
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
