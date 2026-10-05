import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GarmentType, PhysicalState } from '../../core/config/database.types';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { InventoryRepository } from '../../core/inventory/inventory-repository';
import {
  Garment,
  inventoryError,
  inventoryReturnUrl,
  states,
} from '../../core/inventory/inventory';
import { Icon } from '../../shared/ui/icon';
const nonBlank = (control: AbstractControl) =>
  String(control.value ?? '').trim() ? null : { required: true };
@Component({
  selector: 'app-garment-form',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './garment-form.html',
  styleUrl: './inventory.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GarmentForm {
  private readonly repository = inject(InventoryRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly editing = Boolean(this.route.snapshot.paramMap.get('id'));
  readonly id = this.route.snapshot.paramMap.get('id') ?? crypto.randomUUID();
  readonly returnTo = inventoryReturnUrl(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = this.editing
    ? this.router.createUrlTree(['/inventario', this.id], {
        queryParams: { volver: this.returnTo },
      })
    : this.router.parseUrl(this.returnTo);
  readonly states = states;
  readonly garment = signal<Garment | null>(null);
  readonly types = signal<GarmentType[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly conflict = signal(false);
  readonly saving = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [nonBlank, Validators.maxLength(60)]],
    garment_type_id: ['', Validators.required],
    size: ['', [nonBlank, Validators.maxLength(20)]],
    physical_state: ['DISPONIBLE' as PhysicalState, Validators.required],
    notes: ['', Validators.maxLength(2000)],
  });
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.error.set('');
    this.conflict.set(false);
    try {
      const [types, garment] = await Promise.all([
        this.repository.types(),
        this.editing ? this.repository.get(this.id) : Promise.resolve(null),
      ]);
      this.types.set(
        types.filter(
          (type) => type.active || type.id === garment?.garment_type_id,
        ),
      );
      this.garment.set(garment);
      if (garment) this.form.reset({ ...garment, notes: garment.notes ?? '' });
      else
        this.form.patchValue({
          garment_type_id: types.find((type) => type.active)?.id ?? '',
        });
    } catch (error) {
      this.loadError.set(inventoryError(error).message);
    } finally {
      this.loading.set(false);
    }
  }
  async save(): Promise<void> {
    if (
      this.saving() ||
      this.loading() ||
      !this.connection.online() ||
      this.garment()?.archived_at
    )
      return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    this.conflict.set(false);
    try {
      const row = await this.repository.save(
        this.id,
        this.garment()?.version ?? null,
        this.form.getRawValue(),
      );
      this.form.markAsPristine();
      this.feedback.success(
        this.editing
          ? row.code + ' actualizada.'
          : row.code + ' añadida al inventario.',
      );
      await this.router.navigate(['/inventario', row.id], {
        queryParams: { volver: this.returnTo },
        replaceUrl: true,
      });
    } catch (error) {
      const failure = inventoryError(error);
      this.error.set(failure.message);
      this.conflict.set(failure.conflict);
    } finally {
      this.saving.set(false);
    }
  }
  reload(): void {
    if (
      !this.form.dirty ||
      confirm(
        'Se descartarán los cambios de este formulario para cargar la versión actual. ¿Continuar?',
      )
    )
      void this.load();
  }
  canLeave(): boolean {
    return (
      !this.form.dirty ||
      confirm('Tienes cambios sin guardar. ¿Quieres salir y descartarlos?')
    );
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.form.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
