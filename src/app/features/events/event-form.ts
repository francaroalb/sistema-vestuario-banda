import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EventsRepository } from '../../core/events/events-repository';
import {
  EventSeries,
  BandEvent,
  Uniform,
  madridLocal,
  planningError,
} from '../../core/events/models';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
@Component({
  selector: 'app-event-form',
  imports: [FormsModule, RouterLink],
  styleUrls: ['../inventory/inventory.scss', './events.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="back-link" [routerLink]="back">Volver a Actuaciones</a>
    <div class="page-heading">
      <h1>{{ editing ? 'Editar actuación' : 'Nueva actuación' }}</h1>
    </div>
    @if (loading()) {
      <p role="status">Cargando…</p>
    } @else if (loadError()) {
      <p class="notice notice-error" role="alert">
        {{ loadError() }}
        <button class="text-button" (click)="load()">Reintentar</button>
      </p>
    } @else {
      <form
        #form="ngForm"
        class="card event-card"
        (ngSubmit)="form.valid && save()"
        (input)="dirty.set(true)"
        (change)="dirty.set(true)"
      >
        <div class="field">
          <label for="event-title">Nombre de la actuación</label
          ><input
            [disabled]="saving()"
            id="event-title"
            name="title"
            [(ngModel)]="title"
            required
            maxlength="160"
          />
        </div>
        <div class="field">
          <label for="event-uniform">Uniforme</label
          ><select
            [disabled]="saving()"
            id="event-uniform"
            name="uniform"
            [(ngModel)]="uniform"
            required
          >
            <option value="">Selecciona un uniforme</option>
            @for (u of uniforms(); track u.id) {
              <option [value]="u.id">
                {{ u.name }}{{ u.archived ? ' (archivado)' : '' }}
              </option>
            }</select
          ><small
            >Los tipos requeridos se conservan en esta actuación aunque después
            edites el uniforme.</small
          >
        </div>
        @if (!uniforms().length) {
          <p class="notice">
            Primero crea un uniforme con sus tipos de prenda.
            <a routerLink="/actuaciones/uniformes">Configurar uniformes</a>
          </p>
        }
        <h2>Horario · Madrid</h2>
        <div class="event-times">
          <div class="field">
            <label for="event-start">Inicio</label
            ><input
              [disabled]="saving()"
              id="event-start"
              type="datetime-local"
              name="starts"
              [(ngModel)]="starts"
              (ngModelChange)="syncFrom()"
              required
            />
          </div>
          <div class="field">
            <label for="event-end">Fin</label
            ><input
              [disabled]="saving()"
              id="event-end"
              type="datetime-local"
              name="ends"
              [(ngModel)]="ends"
              (ngModelChange)="syncUntil()"
              required
            />
          </div>
        </div>
        <h2>Periodo previsto de la prenda</h2>
        <p class="event-help">
          Incluye la recogida previa y el tiempo hasta la devolución. Este
          periodo reserva las prendas; no registra una entrega real.
        </p>
        <div class="event-times">
          <div class="field">
            <label for="event-from">Entrega prevista desde</label
            ><input
              [disabled]="saving()"
              id="event-from"
              type="datetime-local"
              name="from"
              [(ngModel)]="from"
              (ngModelChange)="customFrom = true"
              required
            />
          </div>
          <div class="field">
            <label for="event-until">Devolución prevista</label
            ><input
              [disabled]="saving()"
              id="event-until"
              type="datetime-local"
              name="until"
              [(ngModel)]="until"
              (ngModelChange)="customUntil = true"
              required
            />
          </div>
        </div>
        <div class="field">
          <label for="event-notes"
            >Observaciones <span class="optional">opcional</span></label
          ><textarea
            [disabled]="saving()"
            id="event-notes"
            name="notes"
            [(ngModel)]="notes"
            maxlength="2000"
            rows="3"
          ></textarea>
        </div>
        @if (error()) {
          <p class="notice notice-error" role="alert">
            {{ error() }}
            <button class="text-button" type="button" (click)="reload()">
              Recargar datos
            </button>
          </p>
        }
        @if (!connection.online()) {
          <p class="notice" role="status">
            Sin conexión. Conservamos el borrador mientras siga abierta esta
            página.
          </p>
        }
        <div class="form-actions">
          <button
            class="btn btn-primary"
            [disabled]="!form.valid || saving() || !connection.online()"
          >
            {{ saving() ? 'Guardando…' : 'Guardar actuación' }}</button
          ><a class="btn btn-quiet" [routerLink]="back">Cancelar</a>
        </div>
      </form>
    }
  `,
})
export class EventForm {
  private readonly repo = inject(EventsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly editing = !!this.route.snapshot.paramMap.get('id');
  readonly id = this.route.snapshot.paramMap.get('id') ?? crypto.randomUUID();
  readonly seriesId = this.route.snapshot.queryParamMap.get('serie');
  private series: EventSeries | null = null;
  readonly back = this.seriesId
    ? '/actuaciones/series/' + this.seriesId
    : this.editing
      ? '/actuaciones/' + this.id
      : '/actuaciones';
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly uniforms = signal<Uniform[]>([]);
  private current: BandEvent | null = null;
  private request = crypto.randomUUID();
  private completed = false;
  title = '';
  uniform = '';
  starts = '';
  ends = '';
  from = '';
  until = '';
  notes = '';
  customFrom = false;
  customUntil = false;
  constructor() {
    void this.load();
  }
  syncFrom() {
    if (!this.customFrom) this.from = this.starts;
  }
  syncUntil() {
    if (!this.customUntil) this.until = this.ends;
  }
  async load() {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [catalog, e] = await Promise.all([
        this.repo.catalog(),
        this.editing ? this.repo.get(this.id) : Promise.resolve(null),
      ]);
      if (this.seriesId && !this.editing)
        this.series = (await this.repo.seriesDetail(this.seriesId)).series;
      this.current = e;
      this.uniforms.set(
        catalog.uniforms.filter((u) => !u.archived || u.id === e?.uniform_id),
      );
      if (e) {
        this.title = e.title;
        this.uniform = e.uniform_id;
        this.starts = madridLocal(e.starts_at);
        this.ends = madridLocal(e.ends_at);
        this.from = madridLocal(e.planned_from);
        this.until = madridLocal(e.planned_until);
        this.notes = e.notes ?? '';
        this.customFrom = true;
        this.customUntil = true;
      }
      this.dirty.set(false);
    } catch (e) {
      this.loadError.set(planningError(e));
    } finally {
      this.loading.set(false);
    }
  }
  async save() {
    if (this.saving() || !this.connection.online()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const data = {
        title: this.title,
        uniform_id: this.uniform,
        starts: this.starts,
        ends: this.ends,
        from: this.from,
        until: this.until,
        notes: this.notes,
      };
      if (this.seriesId && this.series && !this.editing) {
        await this.repo.seriesCommand(
          'EVENT_CREATE',
          this.seriesId,
          this.series.version,
          { event_id: this.id, event_data: data },
          this.request,
        );
      } else {
        await this.repo.command(
          'EVENT',
          this.id,
          this.current?.version ?? null,
          data,
          this.request,
        );
      }
      this.dirty.set(false);
      this.feedback.success('Actuación guardada.');
      this.completed = true;
      await this.router.navigate(
        this.seriesId
          ? ['/actuaciones/series', this.seriesId]
          : ['/actuaciones', this.id],
      );
    } catch (e) {
      this.error.set(planningError(e));
    } finally {
      this.saving.set(false);
    }
  }
  async reload() {
    if (
      !this.dirty() ||
      confirm('Se descartará el borrador. ¿Recargar la actuación?')
    ) {
      this.request = crypto.randomUUID();
      this.error.set('');
      await this.load();
    }
  }
  canLeave() {
    if (this.completed) return true;
    return (
      !this.saving() &&
      (!this.dirty() ||
        confirm('Tienes cambios sin guardar. ¿Salir y descartarlos?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    event: BeforeUnloadEvent,
  ) {
    if (this.dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
