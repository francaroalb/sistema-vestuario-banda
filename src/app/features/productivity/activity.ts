import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Database, Json } from '../../core/config/database.types';
import {
  ProductivityRepository,
  productivityError,
} from '../../core/productivity/productivity-repository';
import { formatTimestamp } from '../../core/inventory/inventory';
type Audit = Database['public']['Tables']['audit_log']['Row'];
@Component({
  selector: 'app-activity',
  imports: [RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../inventory/inventory.scss', './productivity.scss'],
  template: `
    <a class="back-link" routerLink="/inicio">Volver al inicio</a>
    <div class="page-heading">
      <h1>Actividad reciente</h1>
      <button class="btn btn-secondary" [disabled]="loading()" (click)="load()">
        Actualizar
      </button>
    </div>
    <div class="field">
      <label for="activity-kind">Mostrar actividad de</label
      ><select
        id="activity-kind"
        [(ngModel)]="kind"
        (ngModelChange)="page = 1; load()"
      >
        <option value="">Todo</option>
        <option value="garment">Prendas</option>
        <option value="person">Personas</option>
        <option value="loan">Cesiones</option>
        <option value="event">Actuaciones</option>
        <option value="series">Series</option>
        <option value="uniform">Uniformes</option>
      </select>
    </div>
    @if (error()) {
      <p class="notice notice-error" role="alert">
        {{ error() }}
        <button class="text-button" (click)="load()">Reintentar</button>
      </p>
    }
    @if (loading()) {
      <p role="status">Consultando actividad…</p>
    } @else {
      <p>{{ count() }} registros</p>
      @for (row of rows(); track row.id) {
        <article class="card bulk-panel">
          <div class="bulk-actions">
            <strong>{{ action(row.action) }}</strong
            ><small>{{ time(row.occurred_at) }} · {{ row.actor_name }}</small>
          </div>
          <a [routerLink]="link(row)">{{ label(row) }}</a>
        </article>
      } @empty {
        <p class="notice">No hay actividad en este filtro.</p>
      }
      @if (count() > 24 || page > 1) {
        <nav class="bulk-actions" aria-label="Páginas de actividad">
          <button
            class="btn btn-secondary"
            [disabled]="page === 1"
            (click)="page = page - 1; load()"
          >
            Anterior</button
          ><span>Página {{ page }}</span
          ><button
            class="btn btn-secondary"
            [disabled]="page * 24 >= count()"
            (click)="page = page + 1; load()"
          >
            Siguiente
          </button>
        </nav>
      }
    }
  `,
})
export class Activity {
  private readonly repo = inject(ProductivityRepository);
  readonly rows = signal<Audit[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  kind = '';
  page = 1;
  readonly time = formatTimestamp;
  private generation = 0;
  constructor() {
    void this.load();
  }
  async load() {
    const g = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.activity(this.kind, this.page);
      if (g !== this.generation) return;
      this.rows.set(r.rows);
      this.count.set(r.count);
      if (!r.rows.length && this.page > 1) {
        this.page = 1;
        await this.load();
      }
    } catch (e) {
      if (g === this.generation) {
        this.error.set(productivityError(e));
        this.rows.set([]);
      }
    } finally {
      if (g === this.generation) this.loading.set(false);
    }
  }
  action(a: string) {
    return (
      (
        {
          PRENDA_CREADA: 'Prenda creada',
          PRENDA_EDITADA: 'Prenda editada',
          PRENDA_ARCHIVADA: 'Prenda archivada',
          PRENDA_REACTIVADA: 'Prenda reactivada',
          PERSONA_CREADA: 'Persona creada',
          PERSONA_EDITADA: 'Persona editada',
          PERSONA_ARCHIVADA: 'Persona archivada',
          PERSONA_REACTIVADA: 'Persona reactivada',
          CESION_ABIERTA: 'Cesión abierta',
          DEVOLUCION_REGISTRADA: 'Devolución registrada',
          CAMBIO_REGISTRADO: 'Cambio de prendas',
          PRENDAS_MANTENIDAS: 'Prendas mantenidas',
          UNIFORM: 'Uniforme guardado',
          EVENT: 'Actuación guardada',
          CANCEL: 'Actuación cancelada',
          PARTICIPANT: 'Participación actualizada',
          ASSIGN: 'Asignación actualizada',
          DELIVER: 'Entrega registrada',
          SERIES: 'Serie guardada',
          MEMBERSHIP: 'Agenda de serie actualizada',
          ATTENDANCE: 'Participación en serie actualizada',
          BLOCK_ASSIGN: 'Asignación de periodo actualizada',
          EVENT_CREATE: 'Actuación creada en serie',
        } as Record<string, string>
      )[a] ?? 'Registro actualizado'
    );
  }
  label(r: Audit) {
    const data = r.after_data as Record<string, Json>;
    const record = (data['record'] ?? data) as Record<string, Json>;
    return String(
      record['code'] ??
        record['full_name'] ??
        record['person_name'] ??
        record['title'] ??
        record['name'] ??
        'Abrir ficha',
    );
  }
  link(r: Audit) {
    const routes: Record<string, string> = {
      garment: '/inventario',
      person: '/personas',
      loan: '/cesiones',
      event: '/actuaciones',
      series: '/actuaciones/series',
    };
    return r.entity_type === 'uniform'
      ? ['/actuaciones/uniformes']
      : [routes[r.entity_type] ?? '/inicio', r.entity_id];
  }
}
