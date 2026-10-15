import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  viewChild,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FoldersRepository } from '../../core/folders/folders-repository';
import { MusicalVoice } from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { Connectivity } from '../../core/connectivity';
import { StableRequest } from './folder-ui';
@Component({
  selector: 'app-voice-picker',
  imports: [ReactiveFormsModule],
  styleUrl: './folders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<details #panel class="voice-picker" (toggle)="opened($event)">
    <summary>{{ label() || 'Seleccionar voz' }}</summary>
    <label class="field"
      >Buscar voz<input
        type="search"
        [formControl]="search"
        (input)="searchVoices()"
        placeholder="Nombre de la voz"
        maxlength="120"
    /></label>
    @if (error()) {
      <p role="alert" class="notice notice-error">{{ error() }}</p>
      <button type="button" class="text-button" (click)="load()">
        Reintentar
      </button>
    }
    @if (loading()) {
      <p role="status">Buscando voces…</p>
    }
    <div class="voice-options">
      @for (v of voices(); track v.id) {
        <button
          class="voice-option"
          type="button"
          [attr.aria-pressed]="selected() === v.id"
          (click)="choose(v)"
        >
          <strong>{{ v.name }}</strong
          ><span
            >{{ v.code }} · {{ v.instrument || 'Sin instrumento'
            }}{{ v.archived ? ' · Archivada' : '' }}</span
          >
        </button>
      }
    </div>
    @if (!loading() && !error() && !voices().length) {
      <p class="muted">No hay voces que coincidan.</p>
    }
    <div class="pager">
      <button
        type="button"
        class="text-button"
        [disabled]="page() <= 1 || loading()"
        (click)="move(-1)"
      >
        Anterior</button
      ><span>{{ page() }} / {{ pages() }}</span
      ><button
        type="button"
        class="text-button"
        [disabled]="page() >= pages() || loading()"
        (click)="move(1)"
      >
        Siguiente
      </button>
    </div>
    @if (clearable()) {
      <button type="button" class="text-button" (click)="picked.emit(null)">
        {{ clearLabel() }}
      </button>
    }
    @if (allowCreate()) {
      <button
        type="button"
        class="text-button"
        [disabled]="busy()"
        (click)="creating.set(!creating())"
      >
        {{ creating() ? 'Cerrar nueva voz' : 'Crear una voz' }}
      </button>
      @if (creating()) {
        <div class="voice-new">
          <label class="field"
            >Código de voz<input
              [formControl]="form.controls.code"
              maxlength="12"
              placeholder="CLA1" /></label
          ><label class="field"
            >Nombre de voz<input
              [formControl]="form.controls.name"
              maxlength="120"
              placeholder="Clarinete primero" /></label
          ><label class="field"
            >Instrumento (opcional)<input
              [formControl]="form.controls.instrument"
              maxlength="80"
          /></label>
          @if (createError()) {
            <p class="notice notice-error" role="alert">{{ createError() }}</p>
          }
          <button
            type="button"
            class="btn btn-secondary"
            [disabled]="busy() || !connection.online()"
            (click)="create()"
          >
            {{ busy() ? 'Guardando voz…' : 'Guardar voz y seleccionar' }}
          </button>
        </div>
      }
    }
  </details>`,
})
export class VoicePicker {
  private readonly repo = inject(FoldersRepository);
  private readonly destroy = inject(DestroyRef);
  readonly connection = inject(Connectivity);
  readonly label = input('');
  readonly selected = input('');
  readonly allowCreate = input(false);
  readonly clearable = input(false);
  readonly clearLabel = input('Todas las voces');
  readonly picked = output<MusicalVoice | null>();
  readonly saving = output<boolean>();
  readonly voices = signal<MusicalVoice[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly creating = signal(false);
  readonly busy = signal(false);
  readonly createError = signal('');
  readonly search = inject(FormBuilder).nonNullable.control('');
  readonly form = inject(FormBuilder).nonNullable.group({
    code: [
      '',
      [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9]{0,11}$/)],
    ],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    instrument: ['', Validators.maxLength(80)],
  });
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly request = new StableRequest();
  private id = crypto.randomUUID();
  constructor() {
    this.destroy.onDestroy(() => {
      this.controller?.abort();
      clearTimeout(this.timer);
    });
  }
  opened(event: Event) {
    if ((event.target as HTMLDetailsElement).open) void this.load();
  }
  searchVoices() {
    clearTimeout(this.timer);
    this.controller?.abort();
    this.timer = setTimeout(() => {
      this.page.set(1);
      void this.load();
    }, 200);
  }
  move(delta: number) {
    this.page.update((p) => p + delta);
    void this.load();
  }
  async load() {
    this.controller?.abort();
    const c = new AbortController();
    this.controller = c;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.voices(
        {
          q: this.search.value,
          archived: this.allowCreate() ? false : undefined,
          page: this.page(),
        },
        c.signal,
      );
      if (c.signal.aborted) return;
      this.voices.set(r.rows);
      this.pages.set(Math.max(1, Math.ceil(r.count / 24)));
    } catch (e) {
      if (!c.signal.aborted) this.error.set(musicError(e).message);
    } finally {
      if (!c.signal.aborted) this.loading.set(false);
    }
  }
  readonly panel = viewChild<ElementRef<HTMLDetailsElement>>('panel');
  choose(v: MusicalVoice) {
    this.picked.emit(v);
    const panel = this.panel()?.nativeElement;
    if (panel) {
      panel.open = false;
      panel.querySelector('summary')?.focus();
    }
  }
  hasDraft() {
    return this.creating() && this.form.dirty;
  }
  async create() {
    if (this.busy() || !this.connection.online()) return;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    if (this.form.invalid || !raw.name.trim()) {
      this.createError.set(
        'Indica un código de voz con letras y números y un nombre.',
      );
      return;
    }
    const data = {
      code: raw.code.trim().toUpperCase(),
      name: raw.name.trim(),
      instrument: raw.instrument.trim() || null,
      archived: false,
    };
    this.busy.set(true);
    this.saving.emit(true);
    this.createError.set('');
    try {
      const v = await this.repo.saveVoice(
        this.id,
        null,
        data,
        this.request.for({ id: this.id, data }),
      );
      this.choose(v);
      this.form.reset();
      this.creating.set(false);
      this.id = crypto.randomUUID();
      this.search.setValue('');
      this.page.set(1);
      await this.load();
    } catch (e) {
      this.createError.set(musicError(e).message);
    } finally {
      this.busy.set(false);
      this.saving.emit(false);
    }
  }
}
