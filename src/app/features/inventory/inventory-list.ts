import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Icon,
    GarmentStatus,
    NgTemplateOutlet,
  ],
  templateUrl: './inventory-list.html',
  styleUrls: ['./inventory.scss', './inventory-list.scss'],
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
    location: '',
  });
  readonly advanced = signal(false);
  readonly selectedType = signal('');
  readonly allTypes = signal(false);
  readonly browsing = signal(true);
  typeLabel(name: string) {
    return (
      (
        {
          Chaqueta: 'Chaquetas',
          Camisa: 'Camisas',
          Pantalón: 'Pantalones',
        } as Record<string, string>
      )[name] ?? name
    );
  }
  toggleType(id: string) {
    this.allTypes.set(false);
    this.form.controls.type.setValue(this.selectedType() === id ? '' : id, {
      emitEvent: false,
    });
    this.navigate(1);
  }
  showAll() {
    this.allTypes.set(true);
    this.form.controls.type.setValue('', { emitEvent: false });
    this.navigate(1);
  }
  private controller?: AbortController;
  private filters: InventoryFilters = {
    q: '',
    type: '',
    size: '',
    state: '',
    archive: 'active',
    location: '',
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
        location:
          params.get('situacion') === 'held'
            ? 'held'
            : params.get('situacion') === 'in_band'
              ? 'in_band'
              : '',
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
      this.selectedType.set(this.filters.type);
      this.allTypes.set(params.get('vista') === 'todas');
      this.browsing.set(
        !this.filters.type &&
          !this.filters.q &&
          !this.filters.size &&
          !this.filters.state &&
          !this.filters.location &&
          this.filters.archive === 'active' &&
          !this.allTypes() &&
          this.filters.page === 1,
      );
      this.advanced.set(
        Boolean(
          this.filters.location ||
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
    this.error.set('');
    if (this.browsing()) {
      this.garments.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
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
        vista: this.allTypes() ? 'todas' : null,
        buscar: filters.q.trim() || null,
        tipo: filters.type || null,
        situacion: filters.location || null,
        talla: filters.size.trim() || null,
        estado: filters.state || null,
        archivo: filters.archive === 'active' ? null : filters.archive,
        pagina: page > 1 ? page : null,
      },
    });
  }
  clear(): void {
    this.allTypes.set(false);
    this.form.reset({
      q: '',
      type: '',
      size: '',
      state: '',
      archive: 'active',
      location: '',
    });
  }
}
