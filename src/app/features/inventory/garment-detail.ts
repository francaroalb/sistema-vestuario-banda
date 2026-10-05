import { PlannedUses } from '../events/planned-uses';
import { LoanHistory } from '../loans/loan-history';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import {
  Garment,
  formatTimestamp,
  inventoryError,
  inventoryReturnUrl,
} from '../../core/inventory/inventory';
import { InventoryRepository } from '../../core/inventory/inventory-repository';
import { Icon } from '../../shared/ui/icon';
import { GarmentStatus } from '../../shared/ui/garment-status';
@Component({
  selector: 'app-garment-detail',
  imports: [PlannedUses, LoanHistory, RouterLink, Icon, GarmentStatus],
  templateUrl: './garment-detail.html',
  styleUrl: './inventory.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GarmentDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(InventoryRepository);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly garment = signal<Garment | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly saving = signal(false);
  readonly conflict = signal(false);
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('archiveDialog');
  readonly timestamp = formatTimestamp;
  readonly returnTo = inventoryReturnUrl(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = inject(Router).parseUrl(this.returnTo);
  private request = 0;
  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.load());
  }
  async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.garment.set(null);
    try {
      const garment = await this.repository.get(
        this.route.snapshot.paramMap.get('id') ?? '',
      );
      if (request === this.request) this.garment.set(garment);
    } catch (error) {
      if (request === this.request)
        this.error.set(inventoryError(error).message);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  confirmArchive(): void {
    this.actionError.set('');
    this.conflict.set(false);
    this.dialog()?.nativeElement.showModal();
  }
  cancelDialog(event?: Event): void {
    if (this.saving()) event?.preventDefault();
    else this.dialog()?.nativeElement.close();
  }
  reload(): void {
    this.dialog()?.nativeElement.close();
    void this.load();
  }
  async archive(): Promise<void> {
    const garment = this.garment();
    if (!garment || this.saving() || !this.connection.online()) return;
    this.saving.set(true);
    this.actionError.set('');
    this.conflict.set(false);
    try {
      const row = await this.repository.archive(garment, !garment.archived_at);
      this.garment.set({ ...row, garment_types: garment.garment_types });
      this.dialog()?.nativeElement.close();
      this.feedback.success(
        row.code +
          (row.archived_at
            ? ' archivada. Su información se conserva.'
            : ' reactivada en el inventario.'),
      );
    } catch (error) {
      const failure = inventoryError(error);
      this.actionError.set(failure.message);
      this.conflict.set(failure.conflict);
    } finally {
      this.saving.set(false);
    }
  }
}
