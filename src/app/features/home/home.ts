import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { InventoryRepository } from '../../core/inventory/inventory-repository';
import { InventorySummary } from '../../core/config/database.types';
import { inventoryError } from '../../core/inventory/inventory';
import { Icon } from '../../shared/ui/icon';
@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  readonly auth = inject(AuthService);
  private readonly repository = inject(InventoryRepository);
  readonly summary = signal<InventorySummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.summary.set(await this.repository.summary());
    } catch (error) {
      this.error.set(inventoryError(error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
