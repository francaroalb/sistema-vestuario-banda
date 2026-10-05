import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LoansRepository } from '../../core/loans/loans-repository';
import { Choice, loanError } from '../../core/loans/models';
@Component({
  selector: 'app-choice-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="picker-label" [for]="id">{{
      mode() === 'person' ? 'Buscar persona' : 'Buscar prenda disponible'
    }}</label>
    <input
      [id]="id"
      type="search"
      [value]="query()"
      [attr.maxlength]="mode() === 'person' ? 120 : 60"
      [placeholder]="
        mode() === 'person' ? 'Nombre y apellidos…' : 'Código de la etiqueta…'
      "
      (input)="search($any($event.target).value)"
    />
    @if (loading()) {
      <p role="status">Buscando…</p>
    } @else if (error()) {
      <div class="notice notice-error" role="alert">
        {{ error() }}
        <button type="button" class="text-button" (click)="load()">
          Reintentar
        </button>
      </div>
    } @else {
      <ul class="choices">
        @for (row of rows(); track row.id) {
          <li>
            <button
              type="button"
              (click)="picked.emit(row)"
              [attr.aria-label]="'Seleccionar ' + row.label"
            >
              <strong>{{ row.label }}</strong
              ><span>{{ row.subtitle }}</span>
            </button>
          </li>
        }
      </ul>
      @if (!rows().length) {
        <p role="status">
          {{
            mode() === 'person'
              ? 'No hay personas activas con esta búsqueda.'
              : 'No hay prendas disponibles con esta búsqueda.'
          }}
        </p>
      }
      @if (count() > 12) {
        <div class="picker-pages">
          <button
            type="button"
            class="btn btn-quiet"
            [disabled]="page() === 1"
            (click)="page.set(page() - 1)"
          >
            Anteriores</button
          ><span>{{ page() }} / {{ pages() }}</span
          ><button
            type="button"
            class="btn btn-quiet"
            [disabled]="page() >= pages()"
            (click)="page.set(page() + 1)"
          >
            Más resultados
          </button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .picker-label {
      display: block;
      font-weight: 600;
      font-size: var(--text-sm);
      margin-bottom: 0.6rem;
    }
    input {
      width: 100%;
      min-height: 3.25rem;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      padding: 0.8rem;
      font: inherit;
      background: var(--color-surface);
    }
    p,
    .picker-pages {
      font-size: var(--text-xs);
      color: var(--color-muted);
    }
    .choices {
      list-style: none;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
      gap: 0.6rem;
      max-height: 22rem;
      overflow: auto;
    }
    li {
      min-width: 0;
    }
    li button {
      display: grid;
      gap: 0.3rem;
      width: 100%;
      text-align: left;
      cursor: pointer;
      border: 1px solid var(--color-border);
      border-left: 3px solid var(--color-primary);
      background: var(--color-surface);
      color: var(--color-text);
      border-radius: var(--radius-sm);
      padding: 0.9rem;
      font: inherit;
      overflow-wrap: anywhere;
    }
    li button:hover {
      background: var(--color-primary-soft);
    }
    span {
      font-size: var(--text-xs);
      color: var(--color-muted);
    }
    .picker-pages {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
  `,
})
export class ChoicePicker {
  readonly mode = input<'person' | 'garment'>('garment');
  readonly type = input('');
  readonly excluded = input<string[]>([]);
  readonly picked = output<Choice>();
  readonly query = signal('');
  readonly page = signal(1);
  readonly rows = signal<Choice[]>([]);
  readonly count = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly id = 'picker-' + crypto.randomUUID();
  private readonly repository = inject(LoansRepository);
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    effect(() => {
      const mode = this.mode(),
        q = this.query(),
        type = this.type(),
        excluded = this.excluded(),
        page = this.page();
      void this.load(mode, q, type, page, excluded);
    });
    inject(DestroyRef).onDestroy(() => {
      this.controller?.abort();
      clearTimeout(this.timer);
    });
  }
  pages() {
    return Math.max(1, Math.ceil(this.count() / 12));
  }
  search(value: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      this.query.set(value);
    }, 200);
  }
  async load(
    mode = this.mode(),
    q = this.query(),
    type = this.type(),
    page = this.page(),
    excluded = this.excluded(),
  ) {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.repository.choices(
        mode,
        q,
        type,
        page,
        excluded,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.rows.set(result.rows);
      this.count.set(result.count);
      if (page > this.pages()) this.page.set(this.pages());
    } catch (e) {
      if (!controller.signal.aborted) this.error.set(loanError(e).message);
    } finally {
      if (!controller.signal.aborted) this.loading.set(false);
    }
  }
}
