import { MusicAlerts } from '../music-planning/music-alerts';
import { EventsRepository } from '../../core/events/events-repository';
import { BandEvent } from '../../core/events/models';
import { madridDayRange } from '../../core/events/today';
import { ConflictsRepository } from '../../core/conflicts/conflicts-repository';
import { ConflictSummary } from '../../core/conflicts/models';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
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
  imports: [MusicAlerts, RouterLink, Icon],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly eventsRepo = inject(EventsRepository);
  readonly todayEvents = signal<BandEvent[]>([]);
  readonly todayError = signal(false);
  readonly todayLoading = signal(true);
  private todayRequest = 0;
  private todayDay = '';
  readonly hour = (date: string) =>
    new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  async loadToday() {
    const request = ++this.todayRequest;
    this.todayDay = madridDayRange().day;
    this.todayError.set(false);
    this.todayLoading.set(true);
    try {
      const events = await this.eventsRepo.today();
      if (request === this.todayRequest) this.todayEvents.set(events);
    } catch {
      if (request === this.todayRequest) {
        this.todayEvents.set([]);
        this.todayError.set(true);
      }
    } finally {
      if (request === this.todayRequest) this.todayLoading.set(false);
    }
  }
  @HostListener('window:focus') refreshToday() {
    void this.loadToday();
  }
  private readonly conflictsRepo = inject(ConflictsRepository);
  readonly conflicts = signal<ConflictSummary | null>(null);
  readonly conflictsError = signal(false);
  async loadConflicts() {
    this.conflictsError.set(false);
    try {
      this.conflicts.set(await this.conflictsRepo.summary());
    } catch {
      this.conflictsError.set(true);
    }
  }
  readonly auth = inject(AuthService);
  private readonly repository = inject(InventoryRepository);
  readonly summary = signal<InventorySummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  constructor() {
    void this.loadToday();
    const timer = setInterval(() => {
      if (madridDayRange().day !== this.todayDay) void this.loadToday();
    }, 60000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.todayRequest++;
    });
    void this.load();
    void this.loadConflicts();
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
