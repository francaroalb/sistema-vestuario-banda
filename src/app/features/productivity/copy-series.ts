import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ProductivityRepository,
  CopyPreview,
  productivityError,
} from '../../core/productivity/productivity-repository';
import { EventsRepository } from '../../core/events/events-repository';
import { madridLocal } from '../../core/events/models';
import { Connectivity } from '../../core/connectivity';
@Component({
  selector: 'app-copy-series',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../inventory/inventory.scss', './productivity.scss'],
  template: `
    <a class="back-link" routerLink="/actuaciones/series">Volver a Series</a>
    <div class="page-heading">
      <div>
        <p class="eyebrow">Reutilizar agenda</p>
        <h1>Duplicar serie</h1>
      </div>
    </div>
    <p>
      Se copiarán las actuaciones no canceladas con sus horarios, intervalos y
      uniformes actuales. La nueva serie empieza sin participantes, reservas ni
      entregas.
    </p>
    @if (loading()) {
      <p role="status">Consultando la serie…</p>
    }
    @if (error()) {
      <p class="notice notice-error" role="alert">
        {{ error() }}
        @if (!loaded()) {
          <button class="text-button" (click)="load()">Reintentar carga</button>
        }
      </p>
    }
    @if (loaded()) {
      <form class="card bulk-panel" (ngSubmit)="review()">
        <fieldset [disabled]="busy()">
          <div class="field">
            <label for="copy-name">Nombre de la nueva serie</label
            ><input
              id="copy-name"
              name="name"
              [(ngModel)]="name"
              (ngModelChange)="changed()"
              required
              maxlength="160"
            />
          </div>
          <div class="field">
            <label for="copy-date">Fecha de la primera actuación</label
            ><input
              id="copy-date"
              type="date"
              name="date"
              [(ngModel)]="date"
              (ngModelChange)="changed()"
              required
            />
          </div>
          <button
            class="btn btn-secondary"
            [disabled]="!name.trim() || !date || !connection.online()"
          >
            Ver nueva agenda
          </button>
        </fieldset>
      </form>
    }
    @if (preview(); as p) {
      <section class="card bulk-panel">
        <h2>{{ p.name }} · {{ p.events.length }} actuaciones</h2>
        <p>Fechas y horas de Madrid. Revisa los días antes de confirmar.</p>
        <ul class="copy-events">
          @for (e of p.events; track $index) {
            <li>
              <strong>{{ e.data.title }}</strong
              ><small
                >{{ e.data.starts.replace('T', ' · ') }} —
                {{ e.data.ends.replace('T', ' · ') }}</small
              ><small
                >{{ e.uniform_name }} · Recogida
                {{ e.data.from.replace('T', ' · ') }} · Devolución
                {{ e.data.until.replace('T', ' · ') }}</small
              >
            </li>
          }
        </ul>
        <button
          class="btn btn-primary"
          [disabled]="busy() || !connection.online()"
          (click)="apply()"
        >
          Crear copia de la serie
        </button>
      </section>
    }
  `,
})
export class CopySeries {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repo = inject(ProductivityRepository);
  private readonly events = inject(EventsRepository);
  readonly connection = inject(Connectivity);
  readonly source = this.route.snapshot.paramMap.get('id')!;
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly preview = signal<CopyPreview | null>(null);
  name = '';
  date = '';
  dirty = false;
  private request = crypto.randomUUID();
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await this.events.seriesDetail(this.source);
      this.name = (d.series.name + ' · Copia').slice(0, 160);
      this.date = d.events.find((e) => !e.cancelled)
        ? madridLocal(d.events.find((e) => !e.cancelled)!.starts_at).slice(
            0,
            10,
          )
        : '';
      this.loaded.set(true);
    } catch (e) {
      this.error.set(productivityError(e));
    } finally {
      this.loading.set(false);
    }
  }
  changed() {
    this.preview.set(null);
    this.dirty = true;
  }
  async review() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.preview.set(null);
    try {
      this.preview.set(
        await this.repo.previewCopy(this.source, this.name, this.date),
      );
      this.request = crypto.randomUUID();
      this.dirty = true;
    } catch (e) {
      this.error.set(productivityError(e));
    } finally {
      this.busy.set(false);
    }
  }
  async apply() {
    const p = this.preview();
    if (!p || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.repo.applyCopy(p, this.request);
      this.dirty = false;
      this.busy.set(false);
      await this.router.navigate(['/actuaciones/series', r.id]);
    } catch (e) {
      this.error.set(productivityError(e));
    } finally {
      this.busy.set(false);
    }
  }
  canLeave() {
    return (
      !this.busy() && (!this.dirty || confirm('¿Salir sin crear la copia?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.dirty || this.busy()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
