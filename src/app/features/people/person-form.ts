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
import { PersonKind } from '../../core/config/database.types';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { PeopleRepository } from '../../core/people/people-repository';
import { PersonRow } from '../../core/config/database.types';
import {
  peopleError,
  peopleReturnUrl,
  personKinds,
} from '../../core/people/people';
import { Icon } from '../../shared/ui/icon';
const nonBlank = (control: AbstractControl) =>
  String(control.value ?? '').trim() ? null : { required: true };
@Component({
  selector: 'app-person-form',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './person-form.html',
  styleUrls: ['../inventory/inventory.scss', './people.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonForm {
  private readonly repository = inject(PeopleRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly editing = Boolean(this.route.snapshot.paramMap.get('id'));
  readonly id = this.route.snapshot.paramMap.get('id') ?? crypto.randomUUID();
  readonly returnTo = peopleReturnUrl(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = this.editing
    ? this.router.createUrlTree(['/personas', this.id], {
        queryParams: { volver: this.returnTo },
      })
    : this.router.parseUrl(this.returnTo);
  readonly kinds = personKinds;
  readonly person = signal<PersonRow | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly conflict = signal(false);
  readonly saving = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    full_name: ['', [nonBlank, Validators.maxLength(120)]],
    kind: ['BANDA' as PersonKind, Validators.required],
    instrument: ['', Validators.maxLength(80)],
    phone: ['', Validators.maxLength(40)],
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
      const person = this.editing ? await this.repository.get(this.id) : null;
      this.person.set(person);
      if (person)
        this.form.reset({
          ...person,
          instrument: person.instrument ?? '',
          phone: person.phone ?? '',
          notes: person.notes ?? '',
        });
    } catch (error) {
      this.loadError.set(peopleError(error).message);
    } finally {
      this.loading.set(false);
    }
  }
  async save(): Promise<void> {
    if (
      this.saving() ||
      this.loading() ||
      !this.connection.online() ||
      this.person()?.archived_at
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
        this.person()?.version ?? null,
        this.form.getRawValue(),
      );
      this.form.markAsPristine();
      this.feedback.success(
        this.editing
          ? row.full_name + ' actualizada.'
          : row.full_name + ' añadida a Personas.',
      );
      await this.router.navigate(['/personas', row.id], {
        queryParams: { volver: this.returnTo },
        replaceUrl: true,
      });
    } catch (error) {
      const failure = peopleError(error);
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
