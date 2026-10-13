import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FolderLoansRepository } from '../../core/folder-loans/folder-loans-repository';
import { FolderLoan, folderLoanStatus } from '../../core/folder-loans/models';
import { musicError } from '../../core/music/music-api';
import { formatTimestamp } from '../../core/inventory/inventory';
import { safePage } from '../repertoire/repertoire-ui';
@Component({
  selector: 'app-folder-loan-list',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './folder-loan-list.html',
  styleUrls: [
    '../folders/folders.scss',
    '../repertoire/repertoire.scss',
    './folder-loans.scss',
  ],
})
export class FolderLoanList {
  private readonly repo = inject(FolderLoansRepository);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly rows = signal<FolderLoan[]>([]);
  readonly count = signal(0);
  readonly page = signal(1);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.count() / 24)));
  readonly loading = signal(true);
  readonly error = signal('');
  readonly labels = folderLoanStatus;
  readonly timestamp = formatTimestamp;
  q = '';
  code = '';
  status = 'open';
  person = '';
  folder = '';
  private controller?: AbortController;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.q = p.get('q') ?? '';
      this.code = p.get('codigo') ?? '';
      this.status = p.get('estado') ?? 'open';
      this.person = p.get('persona') ?? '';
      this.folder = p.get('carpeta') ?? '';
      this.page.set(safePage(p.get('pagina')));
      void this.load();
    });
  }
  navigate(page = 1) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.q || null,
        codigo: this.code || null,
        estado: this.status,
        persona: this.person || null,
        carpeta: this.folder || null,
        pagina: page > 1 ? page : null,
      },
    });
  }
  async load() {
    this.controller?.abort();
    const c = new AbortController();
    this.controller = c;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.repo.list(
        {
          q: this.q,
          code: this.code,
          status: this.status,
          person: this.person,
          folder: this.folder,
          page: this.page(),
        },
        c.signal,
      );
      if (c.signal.aborted) return;
      this.count.set(r.count);
      this.rows.set(r.rows);
      if (this.page() > this.pages()) this.navigate(this.pages());
    } catch (e) {
      if (!c.signal.aborted) this.error.set(musicError(e).message);
    } finally {
      if (!c.signal.aborted) this.loading.set(false);
    }
  }
}
