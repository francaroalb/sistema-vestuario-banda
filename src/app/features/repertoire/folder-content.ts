import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, debounceTime } from 'rxjs';
import { FoldersRepository } from '../../core/folders/folders-repository';
import { RepertoireRepository } from '../../core/repertoire/repertoire-repository';
import { MaintenanceRepository } from '../../core/maintenance/maintenance-repository';
import {
  FolderInventory,
  FolderWorkState,
  PresenceState,
} from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { folderReturn, StableRequest } from '../folders/folder-ui';
import { movementLabels, presenceLabels, safePage } from './repertoire-ui';
type Operation = {
  row: FolderWorkState;
  kind: 'INCORPORATE' | 'REMOVE' | 'MISSING';
  id: string;
};
type Movement = Awaited<
  ReturnType<RepertoireRepository['movements']>
>['rows'][number];
@Component({
  selector: 'app-folder-content',
  imports: [RouterLink, ReactiveFormsModule, DatePipe],
  templateUrl: './folder-content.html',
  styleUrls: ['../folders/folders.scss', './repertoire.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderContent {
  private readonly repo = inject(RepertoireRepository);
  private readonly folders = inject(FoldersRepository);
  private readonly maintenance = inject(MaintenanceRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly folder = signal<FolderInventory | null>(null);
  readonly rows = signal<FolderWorkState[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / 24)));
  readonly labels = presenceLabels;
  readonly movementLabels = movementLabels;
  readonly form = inject(FormBuilder).nonNullable.group({ q: '', state: '' });
  readonly note = inject(FormBuilder).nonNullable.control(
    '',
    Validators.maxLength(2000),
  );
  readonly operation = signal<Operation | null>(null);
  readonly saving = signal(false);
  readonly actionError = signal('');
  readonly conflict = signal(false);
  readonly history = signal<Movement[]>([]);
  readonly historyPage = signal(1);
  readonly historyPages = signal(1);
  readonly historyLoading = signal(false);
  readonly historyError = signal('');
  readonly returnTo = folderReturn(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  private controller?: AbortController;
  private historyGeneration = 0;
  private readonly request = new StableRequest();
  private id = '';
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.controller?.abort();
      this.historyGeneration++;
    });
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed())
      .subscribe(([params, p]) => {
        const id = params.get('id') ?? '';
        if (id !== this.id) {
          this.historyGeneration++;
          this.history.set([]);
          this.historyError.set('');
          this.operation.set(null);
          this.note.reset();
        }
        this.id = id;
        const state = p.get('estado') ?? '';
        this.form.reset(
          {
            q: (p.get('q') ?? '').slice(0, 200),
            state: Object.hasOwn(presenceLabels, state) ? state : '',
          },
          { emitEvent: false },
        );
        this.page.set(safePage(p.get('pagina')));
        void this.load();
      });
    this.form.valueChanges
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => this.navigate(1));
  }
  navigate(page: number, correcting = false) {
    if (!correcting && (this.saving() || this.operation())) return;
    const f = this.form.getRawValue();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: f.q || null,
        estado: f.state || null,
        pagina: page > 1 ? page : null,
        volver: this.returnTo,
      },
      replaceUrl: true,
    });
  }
  async load() {
    this.controller?.abort();
    const c = new AbortController();
    this.controller = c;
    this.loading.set(true);
    this.error.set('');
    const f = this.form.getRawValue();
    try {
      const [folder, r] = await Promise.all([
        this.folders.get(this.id),
        this.repo.content(
          {
            folder: this.id,
            q: f.q.trim(),
            state: (f.state || undefined) as PresenceState | undefined,
            page: this.page(),
          },
          c.signal,
        ),
      ]);
      if (c.signal.aborted) return;
      this.folder.set(folder);
      this.rows.set(r.rows);
      this.total.set(r.count);
      if (this.page() > this.pages()) this.navigate(this.pages(), true);
    } catch (e) {
      if (!c.signal.aborted) this.error.set(musicError(e).message);
    } finally {
      if (!c.signal.aborted) this.loading.set(false);
    }
  }
  start(row: FolderWorkState, kind: Operation['kind']) {
    if (this.saving() || this.folder()?.archived) return;
    if (this.operation() && !this.cancel()) return;
    this.operation.set({ row, kind, id: crypto.randomUUID() });
    this.note.reset();
    this.actionError.set('');
    this.conflict.set(false);
  }
  cancel() {
    if (this.saving()) return false;
    if (this.note.dirty && !confirm('¿Descartar la nota de esta operación?'))
      return false;
    this.operation.set(null);
    this.note.reset();
    this.actionError.set('');
    this.conflict.set(false);
    return true;
  }
  async confirm() {
    const op = this.operation();
    if (
      !op ||
      this.saving() ||
      this.conflict() ||
      this.note.invalid ||
      !this.connection.online()
    )
      return;
    this.saving.set(true);
    this.actionError.set('');
    const note = this.note.value.trim() || null;
    try {
      if (op.kind === 'MISSING') {
        const data = {
          folder_id: op.row.folder_id,
          folder_version: op.row.folder_version,
          work_id: op.row.work_id,
          work_version: op.row.work_version,
          kind: 'MISSING' as const,
          description: note,
        };
        await this.maintenance.saveScore(
          op.id,
          null,
          data,
          this.request.for({ id: op.id, data }),
        );
      } else {
        const data = {
          work_id: op.row.work_id,
          work_version: op.row.work_version,
          action: op.kind,
          notes: note,
        };
        await this.repo.changePresence(
          op.row.folder_id,
          op.row.folder_version,
          data,
          this.request.for({
            folder: op.row.folder_id,
            version: op.row.folder_version,
            data,
          }),
        );
      }
      this.operation.set(null);
      this.note.reset();
      this.feedback.success(
        op.kind === 'MISSING'
          ? 'Partitura marcada como faltante.'
          : op.kind === 'INCORPORATE'
            ? 'Incorporación confirmada.'
            : 'Retirada física confirmada.',
      );
      await this.load();
      if (this.history().length) void this.loadHistory(1);
    } catch (e) {
      const err = musicError(e);
      this.actionError.set(err.message);
      this.conflict.set(err.conflict);
    } finally {
      this.saving.set(false);
    }
  }
  reload() {
    if (this.cancel()) void this.load();
  }
  async loadHistory(page = 1) {
    const g = ++this.historyGeneration;
    this.historyLoading.set(true);
    this.historyError.set('');
    try {
      const r = await this.repo.movements(this.id, page);
      if (g !== this.historyGeneration) return;
      this.history.set(r.rows);
      this.historyPage.set(page);
      this.historyPages.set(Math.max(1, Math.ceil(r.count / 24)));
    } catch (e) {
      if (g === this.historyGeneration)
        this.historyError.set(musicError(e).message);
    } finally {
      if (g === this.historyGeneration) this.historyLoading.set(false);
    }
  }
  openHistory(e: Event) {
    if ((e.target as HTMLDetailsElement).open) void this.loadHistory();
  }
  canLeave() {
    return (
      !this.saving() &&
      (!this.note.dirty ||
        confirm('Tienes una nota sin guardar. ¿Quieres salir y descartarla?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.saving() || this.note.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
