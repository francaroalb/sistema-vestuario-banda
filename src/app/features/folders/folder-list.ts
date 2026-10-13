import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { FoldersRepository } from '../../core/folders/folders-repository';
import {
  FolderInventory,
  MusicalVoice,
  RepertoireCode,
} from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { VoicePicker } from './voice-picker';
import { folderStatus } from './folder-ui';
@Component({
  selector: 'app-folder-list',
  imports: [ReactiveFormsModule, RouterLink, VoicePicker],
  templateUrl: './folder-list.html',
  styleUrl: './folders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderList {
  private readonly repo = inject(FoldersRepository);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly rows = signal<FolderInventory[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / 24)));
  readonly voice = signal('');
  readonly voiceLabel = signal('');
  readonly status = folderStatus;
  readonly form = inject(FormBuilder).nonNullable.group({
    q: '',
    repertoire: '',
    state: 'active',
  });
  private controller?: AbortController;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.form.reset(
        {
          q: (p.get('q') ?? '').slice(0, 60),
          repertoire: ['PRO', 'PMM'].includes(p.get('repertorio') ?? '')
            ? p.get('repertorio')!
            : '',
          state: ['all', 'archived', 'usable', 'blocked'].includes(
            p.get('estado') ?? '',
          )
            ? p.get('estado')!
            : 'active',
        },
        { emitEvent: false },
      );
      this.voice.set(
        /^[0-9a-f-]{36}$/i.test(p.get('voz') ?? '') ? p.get('voz')! : '',
      );
      this.voiceLabel.set(
        this.voice()
          ? p.get('nombreVoz') || 'Voz seleccionada'
          : 'Todas las voces',
      );
      const n = Number(p.get('pagina'));
      this.page.set(Number.isSafeInteger(n) && n > 0 ? Math.min(n, 10000) : 1);
      void this.load();
    });
    this.form.valueChanges
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => this.navigate(1));
  }
  navigate(page: number) {
    const f = this.form.getRawValue();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: f.q || null,
        repertorio: f.repertoire || null,
        estado: f.state === 'active' ? null : f.state,
        voz: this.voice() || null,
        nombreVoz: this.voice() ? this.voiceLabel() : null,
        pagina: page > 1 ? page : null,
      },
      replaceUrl: true,
    });
  }
  pick(v: MusicalVoice | null) {
    this.voice.set(v?.id ?? '');
    this.voiceLabel.set(v?.name ?? '');
    this.navigate(1);
  }
  clear() {
    this.form.reset(
      { q: '', repertoire: '', state: 'active' },
      { emitEvent: false },
    );
    this.voice.set('');
    this.voiceLabel.set('');
    this.navigate(1);
  }
  async load() {
    this.controller?.abort();
    const c = new AbortController();
    this.controller = c;
    this.loading.set(true);
    this.error.set('');
    const f = this.form.getRawValue();
    try {
      const r = await this.repo.list(
        {
          q: f.q.trim(),
          repertoire: (f.repertoire || undefined) as RepertoireCode | undefined,
          voice: this.voice() || undefined,
          archived: f.state === 'all' ? undefined : f.state === 'archived',
          usable:
            f.state === 'usable'
              ? true
              : f.state === 'blocked'
                ? false
                : undefined,
          page: this.page(),
        },
        c.signal,
      );
      if (c.signal.aborted) return;
      this.rows.set(r.rows);
      this.total.set(r.count);
      if (this.page() > this.pages()) this.navigate(this.pages());
    } catch (e) {
      if (!c.signal.aborted) this.error.set(musicError(e).message);
    } finally {
      if (!c.signal.aborted) this.loading.set(false);
    }
  }
}
