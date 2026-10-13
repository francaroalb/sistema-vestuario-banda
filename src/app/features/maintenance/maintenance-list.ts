import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MaintenanceRepository } from '../../core/maintenance/maintenance-repository';
import { MaintenanceEntry } from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { safePage } from '../repertoire/repertoire-ui';
import { issueLabels } from './maintenance-ui';
@Component({
  selector: 'app-maintenance-list',
  imports: [RouterLink, ReactiveFormsModule, DatePipe],
  templateUrl: './maintenance-list.html',
  styleUrls: [
    '../folders/folders.scss',
    '../repertoire/repertoire.scss',
    './maintenance.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceList {
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly repo = inject(MaintenanceRepository);
  readonly labels = issueLabels;
  readonly kinds = Object.entries(issueLabels);
  readonly rows = signal<MaintenanceEntry[]>([]);
  readonly count = signal(0);
  readonly repertoire = signal(0);
  readonly conservation = signal(0);
  readonly page = signal(1);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.count() / 24)));
  readonly loading = signal(true);
  readonly error = signal('');
  readonly filtersOpen = signal(false);
  readonly folder = signal('');
  readonly work = signal('');
  private controller?: AbortController;
  readonly form = inject(FormBuilder).nonNullable.group({
    code: '',
    title: '',
    repertoire: '',
    category: '',
    kind: '',
    state: 'open',
    operability: '',
  });
  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.folder.set(p.get('carpeta') ?? '');
      this.work.set(p.get('obra') ?? '');
      this.form.reset({
        code: p.get('codigo') ?? '',
        title: p.get('titulo') ?? '',
        repertoire: p.get('repertorio') ?? '',
        category: p.get('categoria') ?? '',
        kind: p.get('tipo') ?? '',
        state: p.get('estado') ?? 'open',
        operability: p.get('uso') ?? '',
      });
      this.filtersOpen.set(
        [
          'codigo',
          'titulo',
          'repertorio',
          'categoria',
          'tipo',
          'estado',
          'uso',
        ].some((key) => !!p.get(key)),
      );
      this.page.set(safePage(p.get('pagina')));
      void this.load();
    });
  }
  navigate(page = 1) {
    const f = this.form.getRawValue();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        carpeta: this.folder() || null,
        obra: this.work() || null,
        codigo: f.code || null,
        titulo: f.title || null,
        repertorio: f.repertoire || null,
        categoria: f.category || null,
        tipo: f.kind || null,
        estado: f.state === 'open' ? null : f.state,
        uso: f.operability || null,
        pagina: page > 1 ? page : null,
      },
    });
  }
  async load() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.index(
        {
          ...this.form.getRawValue(),
          folder: this.folder(),
          work: this.work(),
          page: this.page(),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.count.set(r.count);
      this.repertoire.set(r.repertoire);
      this.conservation.set(r.conservation);
      if (this.page() > this.pages()) {
        this.navigate(this.pages());
        return;
      }
      this.rows.set(r.rows);
    } catch (e) {
      if (!controller.signal.aborted) this.error.set(musicError(e).message);
    } finally {
      if (!controller.signal.aborted) this.loading.set(false);
    }
  }
}
