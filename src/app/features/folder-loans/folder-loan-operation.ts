import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FolderLoansRepository } from '../../core/folder-loans/folder-loans-repository';
import {
  FolderLoan,
  FolderLoanAction,
  FolderLoanPreview,
  folderLoanNotices,
} from '../../core/folder-loans/models';
import { FoldersRepository } from '../../core/folders/folders-repository';
import { LoansRepository } from '../../core/loans/loans-repository';
import { Choice } from '../../core/loans/models';
import { FolderInventory, FolderWorkState } from '../../core/music/models';
import { Json } from '../../core/config/database.types';
import { musicError } from '../../core/music/music-api';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { formatTimestamp } from '../../core/inventory/inventory';
import { madridLocal } from '../../core/events/models';
import { SignaturePad } from '../../shared/ui/signature-pad';
import { ChoicePicker } from '../loans/choice-picker';
import { FolderPicker } from './folder-picker';
import { StableRequest } from '../folders/folder-ui';
import { issueLabels } from '../maintenance/maintenance-ui';
@Component({
  selector: 'app-folder-loan-operation',
  imports: [FormsModule, RouterLink, SignaturePad, ChoicePicker, FolderPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './folder-loan-operation.html',
  styleUrls: [
    '../folders/folders.scss',
    '../repertoire/repertoire.scss',
    './folder-loans.scss',
  ],
})
export class FolderLoanOperation {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repo = inject(FolderLoansRepository);
  private readonly folders = inject(FoldersRepository);
  private readonly people = inject(LoansRepository);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly signature = viewChild(SignaturePad);
  readonly editing = !!this.route.snapshot.paramMap.get('id');
  readonly id = this.route.snapshot.paramMap.get('id') ?? crypto.randomUUID();
  action: FolderLoanAction = this.route.snapshot.data['action'] ?? 'DELIVER';
  readonly loan = signal<FolderLoan | null>(null);
  readonly folder = signal<FolderInventory | null>(null);
  readonly person = signal<Choice | null>(null);
  readonly preview = signal<FolderLoanPreview | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly conflict = signal(false);
  readonly dirty = signal(false);
  readonly signed = signal(false);
  readonly notices = folderLoanNotices;
  readonly timestamp = formatTimestamp;
  readonly labels: Record<string, string> = issueLabels;
  readonly physicalKinds = [
    'ELASTICS',
    'COVER',
    'RINGS',
    'REPLACE_FOLDER',
    'OTHER',
  ] as const;
  readonly scoreKinds = ['MISSING', 'DAMAGED', 'REPLACE', 'REPAIR'] as const;
  readonly backLink = this.editing
    ? '/cesiones/carpetas/' + this.id
    : '/cesiones/carpetas';
  start = '';
  due = '';
  notes = '';
  ack = false;
  incidentFamily = '';
  incidentKind = 'ELASTICS';
  description = '';
  blocksUse = false;
  workQuery = '';
  readonly selectedWork = signal<FolderWorkState | null>(null);
  readonly works = signal<FolderWorkState[]>([]);
  readonly worksCount = signal(0);
  readonly workPage = signal(1);
  readonly workLoading = signal(false);
  readonly workError = signal('');
  private workController?: AbortController;
  private readonly request = new StableRequest();
  constructor() {
    inject(DestroyRef).onDestroy(() => this.workController?.abort());
    void this.load();
  }
  async load(preserve = false) {
    this.loading.set(true);
    this.loadError.set('');
    this.error.set('');
    this.conflict.set(false);
    this.preview.set(null);
    this.signature()?.clear();
    this.signed.set(false);
    try {
      if (this.editing) {
        const row = await this.repo.get(this.id);
        this.loan.set(row);
        this.folder.set(await this.folders.get(row.folder_id));
        this.person.set({
          id: row.person_id,
          label: row.person_name,
          subtitle: '',
        });
        if (!preserve) {
          this.due = row.due_at ? madridLocal(row.due_at) : '';
          this.start = madridLocal(row.starts_at);
          this.notes = this.action === 'DELIVER' ? (row.notes ?? '') : '';
        }
        if (
          (this.action === 'RETURN' && row.status !== 'ACTIVE') ||
          (['CANCEL', 'DELIVER'].includes(this.action) &&
            row.status !== 'RESERVED')
        )
          throw musicError({ message: 'MUSIC_CHANGED', code: 'PT409' });
      } else {
        const f =
            this.folder()?.id ??
            this.route.snapshot.queryParamMap.get('carpeta'),
          p =
            this.person()?.id ??
            this.route.snapshot.queryParamMap.get('persona');
        if (f) this.folder.set(await this.folders.get(f));
        if (p) this.person.set(await this.people.personChoice(p));
      }
    } catch (e) {
      this.loadError.set(musicError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
  changed() {
    this.dirty.set(true);
    this.error.set('');
    this.conflict.set(false);
    this.preview.set(null);
    this.signature()?.clear();
    this.signed.set(false);
    this.ack = false;
  }
  chooseFolder(f: FolderInventory) {
    this.folder.set(f);
    this.changed();
  }
  choosePerson(p: Choice) {
    this.person.set(p);
    this.changed();
  }
  incidentChanged() {
    this.changed();
    this.selectedWork.set(null);
    this.incidentKind =
      this.incidentFamily === 'SCORE' ? 'MISSING' : 'ELASTICS';
    if (this.incidentFamily === 'SCORE') void this.findWorks(1);
  }
  async findWorks(page: number) {
    const f = this.folder();
    if (!f) return;
    this.workController?.abort();
    const c = new AbortController();
    this.workController = c;
    this.workLoading.set(true);
    this.workError.set('');
    this.workPage.set(page);
    try {
      const r = await this.repo.works(f.id, this.workQuery, page, c.signal);
      if (!c.signal.aborted) {
        this.works.set(r.rows);
        this.worksCount.set(r.count);
      }
    } catch (e) {
      if (!c.signal.aborted) this.workError.set(musicError(e).message);
    } finally {
      if (!c.signal.aborted) this.workLoading.set(false);
    }
  }
  async review() {
    const f = this.folder(),
      p = this.person();
    if (!f || !p || this.busy() || !this.connection.online()) return;
    this.error.set('');
    this.busy.set(true);
    this.signature()?.clear();
    this.signed.set(false);
    this.ack = false;
    try {
      let data: Json;
      if (this.action === 'RETURN') {
        let incident: Json = null;
        if (this.incidentFamily === 'PHYSICAL')
          incident = {
            family: 'PHYSICAL',
            kind: this.incidentKind,
            description: this.description.trim(),
            blocks_use: this.blocksUse,
          };
        if (this.incidentFamily === 'SCORE') {
          const w = this.selectedWork();
          if (!w) throw new Error('Seleccione obra');
          incident = {
            family: 'SCORE',
            kind: this.incidentKind,
            description: this.description.trim() || null,
            work_id: w.work_id,
            work_version: w.work_version,
          };
        }
        data = {
          folder_version: f.version,
          notes: this.notes.trim() || null,
          incident,
        };
      } else if (this.action === 'CANCEL')
        data = { folder_version: f.version, notes: this.notes.trim() || null };
      else
        data = {
          folder_id: f.id,
          folder_version: f.version,
          person_id: p.id,
          due_local: this.due || null,
          notes: this.notes.trim() || null,
          ...(this.action === 'RESERVE'
            ? { start_local: this.start }
            : { reserved: this.editing }),
        };
      this.preview.set(
        await this.repo.preview(
          this.action,
          this.id,
          this.loan()?.version ?? null,
          data,
        ),
      );
      this.conflict.set(false);
    } catch (e) {
      this.error.set(
        this.incidentFamily === 'SCORE' && !this.selectedWork()
          ? 'Selecciona la obra afectada.'
          : musicError(e).message,
      );
    } finally {
      this.busy.set(false);
    }
  }
  back() {
    if (this.busy()) return;
    this.preview.set(null);
    this.signature()?.clear();
    this.signed.set(false);
    this.ack = false;
  }
  async confirm() {
    const p = this.preview();
    if (
      !p ||
      p.conflicts.length ||
      this.busy() ||
      this.conflict() ||
      !this.connection.online() ||
      ((this.action === 'DELIVER' || this.action === 'RETURN') &&
        !this.signed()) ||
      (p.warnings.length && !this.ack)
    )
      return;
    const signature =
      this.action === 'DELIVER' || this.action === 'RETURN'
        ? this.signed()
        : false;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.repo.apply(
        p,
        signature,
        this.ack,
        this.request.for({ p, signature, ack: this.ack }),
      );
      this.signature()?.clear();
      this.signed.set(false);
      this.dirty.set(false);
      this.busy.set(false);
      this.feedback.success(
        this.action === 'DELIVER'
          ? 'Carpeta entregada y firma confirmada.'
          : this.action === 'RETURN'
            ? 'Devolución registrada.'
            : this.action === 'RESERVE'
              ? 'Reserva guardada. Pendiente de entrega y firma.'
              : 'Reserva cancelada.',
      );
      await this.router.navigate(['/cesiones/carpetas', result.id], {
        replaceUrl: true,
      });
    } catch (e) {
      const err = musicError(e);
      this.error.set(err.message);
      this.conflict.set(err.conflict);
    } finally {
      this.busy.set(false);
    }
  }
  canLeave() {
    return (
      !this.busy() &&
      (!this.dirty() ||
        confirm(
          'Tienes una operación sin confirmar. ¿Quieres salir y descartarla?',
        ))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.dirty() || this.busy()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
