import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { GarmentType, PhysicalState } from '../../core/config/database.types';
import { InventoryRepository } from '../../core/inventory/inventory-repository';
import {
  Garment,
  InventoryFilters,
  inventoryError,
  PAGE_SIZE,
  states,
} from '../../core/inventory/inventory';
import { Icon } from '../../shared/ui/icon';
import { GarmentStatus } from '../../shared/ui/garment-status';
@Component({
  selector: 'app-inventory-list',
  imports: [ReactiveFormsModule, RouterLink, Icon, GarmentStatus],
  templateUrl: './inventory-list.html',
  styleUrl: './inventory.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryList {
  private readonly repository = inject(InventoryRepository);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly states = states;
  readonly types = signal<GarmentType[]>([]);
  readonly garments = signal<Garment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly typeError = signal('');
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pages = computed(() =>
    Math.max(1, Math.ceil(this.total() / PAGE_SIZE)),
  );
  readonly form = inject(FormBuilder).nonNullable.group({
    q: '',
    type: '',
    size: '',
    state: '',
    archive: 'active',
  });
  readonly advanced = signal(false);
  private controller?: AbortController;
  private filters: InventoryFilters = {
    q: '',
    type: '',
    size: '',
    state: '',
    archive: 'active',
    page: 1,
  };

  constructor() {
    void this.loadTypes();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const state = params.get('estado') ?? '';
      const type = params.get('tipo') ?? '';
      const archive = params.get('archivo');
      const page = Number(params.get('pagina'));
      this.filters = {
        q: (params.get('buscar') ?? '').slice(0, 60),
        size: (params.get('talla') ?? '').slice(0, 20),
        type: /^[0-9a-f-]{36}$/i.test(type) ? type : '',
        state: states.some((item) => item.value === state)
          ? (state as PhysicalState)
          : '',
        archive:
          archive === 'archived' || archive === 'all' ? archive : 'active',
        page:
          Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1,
      };
      this.page.set(this.filters.page);
      this.advanced.set(
        Boolean(
          this.filters.type ||
          this.filters.state ||
          this.filters.size ||
          this.filters.archive !== 'active',
        ),
      );
      this.form.patchValue(this.filters, { emitEvent: false });
      void this.load();
    });
    this.form.valueChanges
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => this.navigate(1));
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
  }
  async loadTypes(): Promise<void> {
    this.typeError.set('');
    try {
      this.types.set(await this.repository.types());
    } catch {
      this.typeError.set('No se han podido cargar los tipos de prenda.');
    }
  }
  async load(): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.repository.list(
        this.filters,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.garments.set(result.rows);
      this.total.set(result.count);
      if (this.page() > this.pages()) this.navigate(this.pages());
    } catch (error) {
      if (!controller.signal.aborted) {
        this.error.set(inventoryError(error).message);
        this.garments.set([]);
      }
    } finally {
      if (!controller.signal.aborted) this.loading.set(false);
    }
  }
  navigate(page: number): void {
    const filters = this.form.getRawValue();
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        buscar: filters.q.trim() || null,
        tipo: filters.type || null,
        talla: filters.size.trim() || null,
        estado: filters.state || null,
        archivo: filters.archive === 'active' ? null : filters.archive,
        pagina: page > 1 ? page : null,
      },
    });
  }
  clear(): void {
    this.form.reset({
      q: '',
      type: '',
      size: '',
      state: '',
      archive: 'active',
    });
  }
}
