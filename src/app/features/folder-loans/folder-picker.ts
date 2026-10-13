import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FoldersRepository } from '../../core/folders/folders-repository';
import { FolderInventory } from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
@Component({
  selector: 'app-folder-picker',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<form class="toolbar" (ngSubmit)="load(1)">
      <div class="field">
        <label for="folder-pick-query">Buscar carpeta por código</label
        ><input
          id="folder-pick-query"
          name="q"
          [(ngModel)]="query"
          maxlength="60"
        />
      </div>
      <button class="btn btn-secondary">Buscar carpetas</button>
    </form>
    @if (loading()) {
      <p role="status">Buscando carpetas…</p>
    } @else if (error()) {
      <p role="alert">
        {{ error() }}
        <button class="text-button" (click)="load(page())">Reintentar</button>
      </p>
    } @else {
      <div class="picker-results">
        @for (f of rows(); track f.id) {
          <button
            class="btn btn-secondary folder-choice"
            type="button"
            (click)="selected.emit(f)"
          >
            <strong>{{ f.code }} · {{ f.voice_name }}</strong
            ><small
              >{{
                f.holder_name ? 'En poder de ' + f.holder_name : 'En la Banda'
              }}{{
                f.next_assignee ? ' · Reserva: ' + f.next_assignee : ''
              }}</small
            >
          </button>
        } @empty {
          <p>No hay carpetas utilizables con esa búsqueda.</p>
        }
      </div>
      @if (count() > 24) {
        <nav class="pager" aria-label="Buscar carpetas">
          <button
            class="text-button"
            [disabled]="page() <= 1"
            (click)="load(page() - 1)"
          >
            Anteriores</button
          ><span>Página {{ page() }}</span
          ><button
            class="text-button"
            [disabled]="page() * 24 >= count()"
            (click)="load(page() + 1)"
          >
            Más carpetas
          </button>
        </nav>
      }
    }
    <p class="muted small">
      La disponibilidad para tus fechas se comprueba al revisar la operación.
    </p>`,
  styleUrls: [
    '../folders/folders.scss',
    '../repertoire/repertoire.scss',
    './folder-loans.scss',
  ],
})
export class FolderPicker {
  private readonly repo = inject(FoldersRepository);
  readonly selected = output<FolderInventory>();
  query = '';
  readonly rows = signal<FolderInventory[]>([]);
  readonly count = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  private controller?: AbortController;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
    void this.load(1);
  }
  async load(page: number) {
    this.controller?.abort();
    const c = new AbortController();
    this.controller = c;
    this.loading.set(true);
    this.error.set('');
    this.page.set(page);
    try {
      const r = await this.repo.list(
        { q: this.query, usable: true, archived: false, page },
        c.signal,
      );
      if (!c.signal.aborted) {
        this.rows.set(r.rows);
        this.count.set(r.count);
      }
    } catch (e) {
      if (!c.signal.aborted) this.error.set(musicError(e).message);
    } finally {
      if (!c.signal.aborted) this.loading.set(false);
    }
  }
}
