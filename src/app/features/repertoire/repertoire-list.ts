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
import { RepertoireRepository } from '../../core/repertoire/repertoire-repository';
import {
  MusicRepertoire,
  RepertoireCode,
  RepertoireWork,
} from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { InventoryTabs } from '../inventory/inventory-tabs';
import { safePage } from './repertoire-ui';
@Component({
  selector: 'app-repertoire-list',
  imports: [ReactiveFormsModule, RouterLink, InventoryTabs],
  templateUrl: './repertoire-list.html',
  styleUrls: ['../folders/folders.scss', './repertoire.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepertoireList {
  private readonly repo = inject(RepertoireRepository);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly rows = signal<RepertoireWork[]>([]);
  readonly catalog = signal<MusicRepertoire[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / 24)));
  readonly form = inject(FormBuilder).nonNullable.group({
    q: '',
    repertoire: 'PRO',
    state: 'active',
  });
  private controller?: AbortController;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.form.reset(
        {
          q: (p.get('q') ?? '').slice(0, 200),
          repertoire: p.get('repertorio') === 'PMM' ? 'PMM' : 'PRO',
          state: ['retired', 'all'].includes(p.get('estado') ?? '')
            ? p.get('estado')!
            : 'active',
        },
        { emitEvent: false },
      );
      this.page.set(safePage(p.get('pagina')));
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
        repertorio: f.repertoire,
        estado: f.state === 'active' ? null : f.state,
        pagina: page > 1 ? page : null,
      },
      replaceUrl: true,
    });
  }
  async load() {
    this.controller?.abort();
    const c = new AbortController();
    this.controller = c;
    this.loading.set(true);
    this.error.set('');
    const f = this.form.getRawValue();
    try {
      const [r, catalog] = await Promise.all([
        this.repo.works(
          {
            q: f.q.trim(),
            repertoire: f.repertoire as RepertoireCode,
            active: f.state === 'all' ? undefined : f.state === 'active',
            page: this.page(),
          },
          c.signal,
        ),
        this.catalog().length
          ? Promise.resolve(this.catalog())
          : this.repo.catalog(),
      ]);
      if (c.signal.aborted) return;
      this.rows.set(r.rows);
      this.total.set(r.count);
      this.catalog.set(catalog);
      if (this.page() > this.pages()) this.navigate(this.pages());
    } catch (e) {
      if (!c.signal.aborted) this.error.set(musicError(e).message);
    } finally {
      if (!c.signal.aborted) this.loading.set(false);
    }
  }
}
