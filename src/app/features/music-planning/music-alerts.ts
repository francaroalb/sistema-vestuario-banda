import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  MusicPlanning,
  MusicAlertsData,
  musicPlanLink,
} from '../../core/music-planning/music-planning';
@Component({
  selector: 'app-music-alerts',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="card">
    <div class="heading">
      <strong>Carpetas musicales</strong
      ><a class="btn btn-quiet" routerLink="/carpetas/avisos">Ver avisos</a>
    </div>
    @if (error()) {
      <p role="alert">
        No se pudieron cargar los avisos de carpetas.
        <button class="text-button" (click)="load()">Reintentar</button>
      </p>
    } @else if (data(); as d) {
      <p>
        {{ d.pending }} pendientes · {{ d.conflicts }} por revisar ·
        {{ d.warnings }} avisos
      </p>
      @if (full()) {
        @for (r of d.rows; track r.scope_id) {
          <a class="alert-row" [routerLink]="link(r.scope, r.scope_id)"
            ><strong>{{ r.title }}</strong
            ><span
              >{{ r.pending }} pendientes · {{ r.conflicts }} por revisar ·
              {{ r.warnings }} avisos</span
            ></a
          >
        } @empty {
          <p>No hay avisos de carpetas para próximas actuaciones.</p>
        }
        @if (d.count > 24) {
          <div class="heading">
            <button
              class="btn btn-quiet"
              [disabled]="page() === 1"
              (click)="move(-1)"
            >
              Anterior</button
            ><span>Página {{ page() }}</span
            ><button
              class="btn btn-quiet"
              [disabled]="page() * 24 >= d.count"
              (click)="move(1)"
            >
              Siguiente
            </button>
          </div>
        }
      }
    } @else {
      <p role="status">Cargando avisos…</p>
    }
  </section>`,
  styles: `
    .card {
      padding: 1rem;
      margin-block: 1rem;
    }
    .heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
    p {
      font-size: 0.8125rem;
      color: var(--color-muted);
      margin: 0.25rem 0;
    }
    .alert-row {
      display: grid;
      gap: 0.25rem;
      padding: 0.75rem 0;
      border-top: 1px solid var(--color-border);
      text-decoration: none;
      color: var(--color-primary-dark);
    }
    .alert-row span {
      font-size: 0.8125rem;
      color: var(--color-muted);
    }
  `,
})
export class MusicAlerts {
  readonly event = input<string | null>(null);
  readonly full = input(false);
  private readonly repo = inject(MusicPlanning);
  readonly data = signal<MusicAlertsData | null>(null);
  readonly error = signal(false);
  readonly page = signal(1);
  readonly link = musicPlanLink;
  private generation = 0;
  constructor() {
    effect(() => {
      this.event();
      void this.load();
    });
  }
  async load() {
    const g = ++this.generation;
    this.error.set(false);
    try {
      const d = await this.repo.alerts(this.event(), this.page());
      if (g === this.generation) this.data.set(d);
    } catch {
      if (g === this.generation) this.error.set(true);
    }
  }
  move(delta: number) {
    this.page.update((p) => p + delta);
    void this.load();
  }
}
@Component({
  selector: 'app-music-alert-page',
  imports: [MusicAlerts, RouterLink],
  template: `<a class="back-link" routerLink="/carpetas">← Carpetas</a>
    <h1>Avisos de actuaciones</h1>
    <app-music-alerts [full]="true" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MusicAlertPage {}
