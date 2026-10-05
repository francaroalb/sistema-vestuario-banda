import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EventsRepository } from '../../core/events/events-repository';
import { Uniform, planningError } from '../../core/events/models';
import { GarmentType } from '../../core/config/database.types';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
@Component({
  selector: 'app-uniforms',
  imports: [FormsModule, RouterLink],
  styleUrls: ['../inventory/inventory.scss', './events.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="back-link" routerLink="/actuaciones">Volver a Actuaciones</a>
    <div class="page-heading">
      <div>
        <p class="eyebrow">Tipos de prenda requeridos</p>
        <h1>Uniformes</h1>
      </div>
      <button
        class="btn btn-primary"
        [disabled]="saving()"
        (click)="edit(null)"
      >
        Nuevo uniforme
      </button>
    </div>
    @if (error()) {
      <p class="notice notice-error" role="alert">
        {{ error() }}
        <button class="text-button" (click)="reload()">Recargar</button>
      </p>
    }
    @if (loading()) {
      <p role="status">Cargando uniformes…</p>
    } @else {
      <div class="event-stack">
        @if (open()) {
          <form
            #form="ngForm"
            class="card event-card"
            (ngSubmit)="form.valid && save()"
            (input)="dirty.set(true)"
            (change)="dirty.set(true)"
          >
            <h2>{{ current ? 'Editar uniforme' : 'Nuevo uniforme' }}</h2>
            <div class="field">
              <label for="uniform-name">Nombre del uniforme</label
              ><input
                [disabled]="saving()"
                id="uniform-name"
                name="name"
                [(ngModel)]="name"
                required
                maxlength="100"
              />
            </div>
            <fieldset>
              <legend>Prendas necesarias por persona</legend>
              @for (t of types(); track t.id) {
                <label class="type-option"
                  ><input
                    [disabled]="saving()"
                    type="checkbox"
                    [checked]="selected.includes(t.id)"
                    (change)="toggle(t.id, $any($event.target).checked)"
                  />{{ t.name }}</label
                >
              }
            </fieldset>
            <label class="type-option"
              ><input
                [disabled]="saving()"
                type="checkbox"
                name="archived"
                [(ngModel)]="archived"
              />Archivar uniforme</label
            >
            <p class="event-help">
              Las actuaciones existentes conservan sus requisitos. Archivar
              impide elegirlo en actuaciones nuevas.
            </p>
            <div class="form-actions">
              <button
                class="btn btn-primary"
                [disabled]="
                  !form.valid ||
                  !selected.length ||
                  saving() ||
                  !connection.online()
                "
              >
                {{ saving() ? 'Guardando…' : 'Guardar uniforme' }}</button
              ><button
                class="btn btn-quiet"
                type="button"
                [disabled]="saving()"
                (click)="close()"
              >
                Cancelar
              </button>
            </div>
          </form>
        }
        @for (u of rows(); track u.id) {
          <article class="card event-card">
            <h2>{{ u.name }}</h2>
            <p>{{ typeNames(u) }}{{ u.archived ? ' · Archivado' : '' }}</p>
            <button
              class="btn btn-secondary"
              [disabled]="saving()"
              (click)="edit(u)"
            >
              Editar {{ u.name }}
            </button>
          </article>
        } @empty {
          <p class="empty-state card">
            Añade tu primer uniforme y elige qué tipos de prenda requiere.
          </p>
        }
      </div>
    }
    @if (!connection.online()) {
      <p class="notice" role="status">Necesitas conexión para guardar.</p>
    }
  `,
})
export class Uniforms {
  private readonly repo = inject(EventsRepository);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly rows = signal<Uniform[]>([]);
  readonly types = signal<GarmentType[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly open = signal(false);
  readonly dirty = signal(false);
  current: Uniform | null = null;
  name = '';
  selected: string[] = [];
  archived = false;
  private id: string = crypto.randomUUID();
  private request = crypto.randomUUID();
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    try {
      const r = await this.repo.catalog();
      this.rows.set(r.uniforms);
      this.types.set(r.types);
    } catch (e) {
      this.error.set(planningError(e));
    } finally {
      this.loading.set(false);
    }
  }
  typeNames(u: Uniform) {
    return u.type_ids
      .map(
        (id) => this.types().find((t) => t.id === id)?.name ?? 'Tipo no activo',
      )
      .join(' · ');
  }
  edit(u: Uniform | null) {
    if (!this.canLeave()) return;
    this.current = u;
    this.id = u?.id ?? crypto.randomUUID();
    this.request = crypto.randomUUID();
    this.name = u?.name ?? '';
    this.selected = [...(u?.type_ids ?? [])];
    this.archived = u?.archived ?? false;
    this.dirty.set(false);
    this.error.set('');
    this.open.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  toggle(id: string, on: boolean) {
    this.selected = on
      ? [...this.selected, id]
      : this.selected.filter((t) => t !== id);
    this.dirty.set(true);
  }
  close() {
    if (this.canLeave()) {
      this.open.set(false);
      this.dirty.set(false);
    }
  }
  async save() {
    if (this.saving() || !this.connection.online()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.repo.command(
        'UNIFORM',
        this.id,
        this.current?.version ?? null,
        { name: this.name, type_ids: this.selected, archived: this.archived },
        this.request,
      );
      this.dirty.set(false);
      this.open.set(false);
      this.feedback.success('Uniforme guardado.');
      await this.load();
    } catch (e) {
      this.error.set(planningError(e));
    } finally {
      this.saving.set(false);
    }
  }
  async reload() {
    if (this.canLeave()) {
      this.dirty.set(false);
      this.open.set(false);
      this.error.set('');
      await this.load();
    }
  }
  canLeave() {
    return (
      !this.saving() &&
      (!this.dirty() || confirm('Tienes cambios sin guardar. ¿Descartarlos?'))
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
