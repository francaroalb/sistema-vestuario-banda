import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { PhysicalState } from '../../core/config/database.types';
import {
  formatTimestamp,
  stateLabel,
  states,
} from '../../core/inventory/inventory';
import {
  Choice,
  LoanCommand,
  LoanItem,
  LoanOverview,
  MovementKind,
  loanError,
  movementLabel,
} from '../../core/loans/models';
import { LoansRepository } from '../../core/loans/loans-repository';
import { SignaturePad } from '../../shared/ui/signature-pad';
import { Icon } from '../../shared/ui/icon';
import { ChoicePicker } from './choice-picker';
@Component({
  selector: 'app-loan-operation',
  imports: [FormsModule, RouterLink, Icon, ChoicePicker, SignaturePad],
  templateUrl: './loan-operation.html',
  styleUrls: ['../inventory/inventory.scss', './loans.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanOperation {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repository = inject(LoansRepository);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly signature = viewChild(SignaturePad);
  readonly kind = (this.route.snapshot.data['kind'] ??
    'ENTREGA') as MovementKind;
  readonly title =
    this.kind === 'ENTREGA'
      ? 'Nueva cesión'
      : this.kind === 'CAMBIO'
        ? 'Cambiar prenda'
        : 'Devolver prendas';
  readonly loanId =
    this.route.snapshot.paramMap.get('id') ?? crypto.randomUUID();
  private readonly requestId = crypto.randomUUID();
  readonly loan = signal<LoanOverview | null>(null);
  readonly items = signal<LoanItem[]>([]);
  readonly person = signal<Choice | null>(null);
  readonly garments = signal<Choice[]>([]);
  readonly returns = signal<Record<string, PhysicalState>>({});
  readonly due = signal('');
  readonly notes = signal('');
  readonly dirty = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly review = signal(false);
  readonly signed = signal(false);
  readonly saving = signal(false);
  readonly completed = signal(false);
  readonly conflict = signal(false);
  readonly states = states;
  readonly stateLabel = stateLabel;
  readonly timestamp = formatTimestamp;
  readonly movementLabel = movementLabel;
  readonly backLink =
    this.kind === 'ENTREGA' ? '/cesiones' : '/cesiones/' + this.loanId;
  readonly selectedIds = computed(() => this.garments().map((g) => g.id));
  readonly selectedReturns = computed(() =>
    this.items().filter((i) => Object.hasOwn(this.returns(), i.id)),
  );
  readonly replacementType = computed(
    () => this.selectedReturns()[0]?.garment_type_id ?? '',
  );
  readonly canReview = computed(() =>
    this.kind === 'ENTREGA'
      ? Boolean(this.person() && this.garments().length)
      : Boolean(
          this.selectedReturns().length &&
          (this.kind !== 'CAMBIO' || this.garments().length === 1),
        ),
  );
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.loadError.set('');
    this.error.set('');
    this.conflict.set(false);
    try {
      if (this.kind === 'ENTREGA') {
        const person = this.route.snapshot.queryParamMap.get('persona');
        if (person) this.person.set(await this.repository.personChoice(person));
      } else {
        const data = await this.repository.detail(this.loanId);
        this.loan.set(data.loan);
        this.items.set(data.items.filter((i) => !i.returned_at));
        this.person.set({
          id: data.loan.person_id,
          label: data.loan.person_name,
          subtitle: '',
        });
        if (data.loan.closed_at) throw new Error('closed');
      }
    } catch (e) {
      this.loadError.set(
        this.loan()?.closed_at
          ? 'Esta cesión ya está finalizada. Consulta su ficha.'
          : loanError(e).message,
      );
    } finally {
      this.loading.set(false);
    }
  }
  pickPerson(person: Choice) {
    this.person.set(person);
    this.dirty.set(true);
  }
  pickGarment(garment: Choice) {
    if (this.kind === 'CAMBIO') this.garments.set([garment]);
    else if (
      this.garments().length < 30 &&
      !this.selectedIds().includes(garment.id)
    )
      this.garments.update((rows) => [...rows, garment]);
    this.dirty.set(true);
  }
  removeGarment(id: string) {
    this.garments.update((rows) => rows.filter((g) => g.id !== id));
    this.dirty.set(true);
  }
  toggle(item: LoanItem, checked: boolean) {
    const rows = this.kind === 'CAMBIO' ? {} : { ...this.returns() };
    if (checked) rows[item.id] = 'DISPONIBLE';
    else delete rows[item.id];
    this.returns.set(rows);
    if (this.kind === 'CAMBIO') this.garments.set([]);
    this.dirty.set(true);
  }
  changeState(id: string, state: PhysicalState) {
    this.returns.update((rows) => ({ ...rows, [id]: state }));
    this.dirty.set(true);
  }
  prepare() {
    if (!this.canReview() || !this.connection.online()) return;
    this.error.set('');
    this.signed.set(false);
    this.review.set(true);
  }
  edit() {
    if (this.saving()) return;
    this.signature()?.clear();
    this.review.set(false);
    this.signed.set(false);
  }
  async confirm() {
    if (!this.signed() || this.saving() || !this.connection.online()) return;
    this.saving.set(true);
    this.error.set('');
    this.conflict.set(false);
    const command: LoanCommand = {
      p_request_id: this.requestId,
      p_kind: this.kind,
      p_loan_id: this.loanId,
      p_expected_version: this.loan()?.version ?? null,
      p_person_id: this.kind === 'ENTREGA' ? this.person()!.id : null,
      p_garment_ids: this.selectedIds(),
      p_returns: this.selectedReturns().map((item) => ({
        item_id: item.id,
        state: this.returns()[item.id],
      })),
      p_due_local: this.kind === 'ENTREGA' ? this.due() || null : null,
      p_notes: this.kind === 'ENTREGA' ? this.notes().trim() || null : null,
      p_signature_confirmed: true,
    };
    try {
      await this.repository.record(command);
      this.completed.set(true);
      this.dirty.set(false);
      this.signature()?.clear();
      this.feedback.success(this.movementLabel(this.kind) + ' registrada.');
      await this.router.navigate(['/cesiones', this.loanId], {
        replaceUrl: true,
      });
    } catch (e) {
      const failure = loanError(e);
      this.error.set(failure.message);
      this.conflict.set(failure.conflict);
    } finally {
      this.saving.set(false);
    }
  }
  async reload() {
    if (
      !this.dirty() ||
      confirm(
        'Se descartarán la selección y la firma para cargar la cesión actual. ¿Continuar?',
      )
    ) {
      this.edit();
      this.returns.set({});
      this.garments.set([]);
      this.dirty.set(false);
      await this.load();
    }
  }
  canLeave() {
    if (this.completed()) return true;
    if (this.saving()) return false;
    return (
      !this.dirty() ||
      confirm(
        'Tienes una operación sin confirmar. ¿Quieres salir y descartarla?',
      )
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    event: BeforeUnloadEvent,
  ) {
    if (this.dirty() && !this.completed()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
