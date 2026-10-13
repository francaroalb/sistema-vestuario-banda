import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FolderLoansRepository } from '../../core/folder-loans/folder-loans-repository';
import {
  FolderLoan,
  FolderLoanMovement,
  folderLoanStatus,
} from '../../core/folder-loans/models';
import { musicError } from '../../core/music/music-api';
import { formatTimestamp } from '../../core/inventory/inventory';
@Component({
  selector: 'app-folder-loan-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './folder-loan-detail.html',
  styleUrls: [
    '../folders/folders.scss',
    '../repertoire/repertoire.scss',
    './folder-loans.scss',
  ],
})
export class FolderLoanDetail {
  private readonly repo = inject(FolderLoansRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly backLink = this.router.parseUrl(
    this.safeReturn(this.route.snapshot.queryParamMap.get('volver')),
  );
  readonly row = signal<FolderLoan | null>(null);
  readonly movements = signal<FolderLoanMovement[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly labels = folderLoanStatus;
  readonly timestamp = formatTimestamp;
  readonly historyPage = signal(1);
  readonly historyPages = signal(1);
  readonly historyError = signal('');
  constructor() {
    void this.load();
  }
  safeReturn(v: string | null) {
    return v && /^\/cesiones\/carpetas(?:\?[^#]*)?$/.test(v)
      ? v
      : '/cesiones/carpetas';
  }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.row.set(await this.repo.get(this.id));
      await this.loadHistory(1);
    } catch (e) {
      this.error.set(musicError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
  async loadHistory(page: number) {
    this.historyError.set('');
    try {
      const r = await this.repo.movements(this.id, page);
      this.movements.set(r.rows);
      this.historyPage.set(page);
      this.historyPages.set(Math.max(1, Math.ceil(r.count / 24)));
    } catch (e) {
      this.historyError.set(musicError(e).message);
    }
  }
}
