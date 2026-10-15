import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  MaterialRepository,
  HeldMaterial,
  MaterialPreview,
  MaterialResult,
  materialError,
  materialNotice,
} from '../../core/material/material-repository';
import { Choice, UUID } from '../../core/loans/models';
import { LoansRepository } from '../../core/loans/loans-repository';
import { FoldersRepository } from '../../core/folders/folders-repository';
import { FolderLoansRepository } from '../../core/folder-loans/folder-loans-repository';
import { FolderLoan } from '../../core/folder-loans/models';
import { FolderInventory } from '../../core/music/models';
import { Json, PhysicalState } from '../../core/config/database.types';
import { Connectivity } from '../../core/connectivity';
import { madridLocal } from '../../core/events/models';
import { formatTimestamp } from '../../core/inventory/inventory';
import { SignaturePad } from '../../shared/ui/signature-pad';
import { ChoicePicker } from '../loans/choice-picker';
import { FolderPicker } from '../folder-loans/folder-picker';
import { StableRequest } from '../folders/folder-ui';
type Selection = {
  domain: HeldMaterial['domain'];
  id: string;
  code: string;
  label: string;
  due: string;
  state: PhysicalState;
  loanId: string;
  reserved: boolean;
};
@Component({
  selector: 'app-material-operation',
  imports: [FormsModule, RouterLink, SignaturePad, ChoicePicker, FolderPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './material-operation.html',
  styleUrl: './material-operation.scss',
})
export class MaterialOperation {
  private readonly route = inject(ActivatedRoute);
  private readonly repo = inject(MaterialRepository);
  private readonly people = inject(LoansRepository);
  private readonly folders = inject(FoldersRepository);
  private readonly loans = inject(FolderLoansRepository);
  readonly connection = inject(Connectivity);
  readonly pad = viewChild(SignaturePad);
  readonly person = signal<Choice | null>(null);
  readonly selection = signal<Selection[]>([]);
  readonly held = signal<HeldMaterial[]>([]);
  readonly reservations = signal<FolderLoan[]>([]);
  readonly count = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly listError = signal('');
  readonly preview = signal<MaterialPreview | null>(null);
  readonly result = signal<MaterialResult | null>(null);
  readonly signed = signal(false);
  readonly dirty = signal(false);
  readonly notice = materialNotice;
  readonly timestamp = formatTimestamp;
  readonly backLink = this.route.snapshot.routeConfig?.path?.startsWith(
    'carpetas',
  )
    ? '/carpetas'
    : '/cesiones';
  action: 'DELIVER' | 'RETURN' =
    this.route.snapshot.queryParamMap.get('accion') === 'devolver'
      ? 'RETURN'
      : 'DELIVER';
  picker: '' | 'GARMENT' | 'FOLDER' = '';
  notes = '';
  ack = false;
  private readonly request = new StableRequest();
  constructor() {
    const id = this.route.snapshot.queryParamMap.get('persona');
    if (id && UUID.test(id)) void this.init(id);
  }
  async init(id: string) {
    this.busy.set(true);
    try {
      await this.choosePerson(await this.people.personChoice(id));
    } catch (e) {
      this.error.set(materialError(e));
    } finally {
      this.busy.set(false);
    }
  }
  async choosePerson(person: Choice) {
    this.person.set(person);
    await this.load(1);
  }
  changePerson() {
    if (
      this.dirty() &&
      !confirm(
        '¿Cambiar de persona y descartar la selección y las observaciones?',
      )
    )
      return;
    this.selection.set([]);
    this.person.set(null);
    this.held.set([]);
    this.reservations.set([]);
    this.notes = '';
    this.error.set('');
    this.dirty.set(false);
  }
  async changeAction(action: 'DELIVER' | 'RETURN') {
    if (action === this.action) return;
    if (
      this.selection().length &&
      !confirm('¿Cambiar de operación y descartar la selección?')
    )
      return;
    this.action = action;
    this.selection.set([]);
    this.picker = '';
    this.error.set('');
    await this.load(1);
  }
  async load(page: number) {
    const person = this.person();
    if (!person) return;
    this.loading.set(true);
    this.listError.set('');
    this.page.set(page);
    try {
      if (this.action === 'RETURN') {
        const r = await this.repo.held(person.id, page);
        this.held.set(r.rows);
        this.count.set(r.count);
      } else {
        const r = await this.loans.list({
          person: person.id,
          status: 'RESERVED',
          page,
        });
        this.reservations.set(r.rows);
        this.count.set(r.count);
      }
    } catch (e) {
      this.listError.set(materialError(e));
    } finally {
      this.loading.set(false);
    }
  }
  contains(domain: HeldMaterial['domain'], id: string) {
    return this.selection().some((s) => s.domain === domain && s.id === id);
  }
  add(row: Selection) {
    if (this.contains(row.domain, row.id)) return;
    if (this.selection().length >= 30) {
      this.error.set('Selecciona como máximo 30 elementos por operación.');
      return;
    }
    this.selection.update((v) => [...v, row]);
    this.dirty.set(true);
    this.picker = '';
    this.error.set('');
  }
  addGarment(row: Choice) {
    this.add({
      domain: 'GARMENT',
      id: row.id,
      code: row.label,
      label: row.subtitle,
      due: '',
      state: 'DISPONIBLE',
      loanId: '',
      reserved: false,
    });
  }
  addFolder(row: FolderInventory) {
    this.add({
      domain: 'FOLDER',
      id: row.id,
      code: row.code,
      label: row.voice_name,
      due: '',
      state: 'DISPONIBLE',
      loanId: crypto.randomUUID(),
      reserved: false,
    });
  }
  addReservation(row: FolderLoan) {
    this.add({
      domain: 'FOLDER',
      id: row.folder_id,
      code: row.folder_code,
      label: row.voice_name,
      due: row.due_at ? madridLocal(row.due_at) : '',
      state: 'DISPONIBLE',
      loanId: row.id,
      reserved: true,
    });
  }
  addHeld(row: HeldMaterial) {
    this.add({
      domain: row.domain,
      id: row.id,
      code: row.code,
      label: row.label,
      due: row.due_at ?? '',
      state: 'DISPONIBLE',
      loanId: row.loan_id,
      reserved: false,
    });
  }
  remove(row: Selection) {
    this.selection.update((v) => v.filter((s) => s !== row));
    this.dirty.set(true);
  }
  edit() {
    this.pad()?.clear();
    this.signed.set(false);
    this.preview.set(null);
    this.ack = false;
    this.error.set('');
  }
  async review() {
    if (
      !this.person() ||
      !this.selection().length ||
      this.busy() ||
      !this.connection.online()
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.signed.set(false);
    this.ack = false;
    try {
      const garments: Json[] = [],
        folders: Json[] = [];
      for (const row of this.selection()) {
        if (row.domain === 'GARMENT') {
          if (this.action === 'DELIVER') {
            const g = await this.repo.garment(row.id);
            garments.push({
              id: row.id,
              version: g.version,
              due_local: row.due || null,
            });
          } else {
            const h = await this.repo.heldItem(row.id, 'GARMENT');
            garments.push({ id: row.id, version: h.version, state: row.state });
          }
        } else if (this.action === 'DELIVER') {
          const f = await this.folders.get(row.id);
          const reservation = row.reserved
            ? await this.loans.get(row.loanId)
            : null;
          folders.push({
            id: row.loanId,
            version: reservation?.version ?? null,
            data: {
              folder_id: f.id,
              folder_version: f.version,
              person_id: this.person()!.id,
              due_local: row.due || null,
              notes: this.notes || null,
              reserved: row.reserved,
            },
          });
        } else {
          const h = await this.repo.heldItem(row.id, 'FOLDER');
          folders.push({
            id: row.loanId,
            version: h.version,
            data: {
              folder_version: h.asset_version,
              notes: this.notes || null,
              incident: null,
            },
          });
        }
      }
      this.preview.set(
        await this.repo.preview({
          action: this.action,
          person_id: this.person()!.id,
          notes: this.notes || null,
          garments,
          folders,
        }),
      );
    } catch (e) {
      this.error.set(materialError(e));
    } finally {
      this.busy.set(false);
    }
  }
  async apply() {
    const preview = this.preview();
    if (
      !preview ||
      !this.signed() ||
      this.busy() ||
      !this.connection.online() ||
      preview.conflicts.length ||
      (preview.warnings.length && !this.ack)
    )
      return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.repo.apply(
        preview,
        this.request.for({ preview, ack: this.ack }),
        this.ack,
      );
      this.pad()?.clear();
      this.signed.set(false);
      this.dirty.set(false);
      this.result.set(result);
    } catch (e) {
      this.error.set(materialError(e));
      if (
        ['PT409', '22023', '23505'].includes(
          (e as { code?: string }).code ?? '',
        )
      ) {
        this.pad()?.clear();
        this.signed.set(false);
        this.preview.set(null);
        this.ack = false;
      }
    } finally {
      this.busy.set(false);
    }
  }
  @HostListener('window:beforeunload', ['$event']) unload(
    event: BeforeUnloadEvent,
  ) {
    if (this.dirty() && !this.result()) event.preventDefault();
  }
  canLeave() {
    return (
      !this.busy() &&
      (!this.dirty() ||
        !!this.result() ||
        confirm(
          'Hay una operación sin confirmar. ¿Quieres salir y descartarla?',
        ))
    );
  }
}
