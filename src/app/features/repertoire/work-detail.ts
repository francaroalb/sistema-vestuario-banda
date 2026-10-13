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
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RepertoireRepository } from '../../core/repertoire/repertoire-repository';
import {
  PresencePreview,
  PresenceState,
  RepertoireWork,
} from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { StableRequest } from '../folders/folder-ui';
import { presenceLabels, repertoireReturn } from './repertoire-ui';
type Affected = Awaited<
  ReturnType<RepertoireRepository['affected']>
>['rows'][number];
type Audit = Awaited<
  ReturnType<RepertoireRepository['workHistory']>
>['rows'][number];
@Component({
  selector: 'app-work-detail',
  imports: [RouterLink, ReactiveFormsModule, DatePipe],
  templateUrl: './work-detail.html',
  styleUrls: ['../folders/folders.scss', './repertoire.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkDetail {
  private readonly repo = inject(RepertoireRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly returnTo = repertoireReturn(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = inject(Router).parseUrl(this.returnTo);
  readonly row = signal<RepertoireWork | null>(null);
  readonly rows = signal<Affected[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly contentError = signal('');
  readonly contentLoading = signal(false);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / 24)));
  readonly state = inject(FormBuilder).nonNullable.control('PENDING_ADD');
  readonly labels = presenceLabels;
  readonly selected = signal<string[]>([]);
  readonly preview = signal<PresencePreview | null>(null);
  readonly busy = signal(false);
  readonly writing = signal(false);
  readonly actionError = signal('');
  readonly conflict = signal(false);
  readonly confirming = signal(false);
  readonly history = signal<Audit[]>([]);
  readonly historyPage = signal(1);
  readonly historyPages = signal(1);
  readonly historyError = signal('');
  readonly historyLoading = signal(false);
  private id = '';
  private generation = 0;
  private controller?: AbortController;
  private historyGeneration = 0;
  private readonly request = new StableRequest();
  private readonly batchRequest = new StableRequest();
  readonly eligible = computed(() =>
    this.rows().filter(
      (r) =>
        r.folder &&
        !r.folder.archived &&
        (r.state === 'PENDING_ADD' || r.state === 'PENDING_REMOVE'),
    ),
  );
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.historyGeneration++;
      this.controller?.abort();
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.historyGeneration++;
      this.history.set([]);
      this.historyError.set('');
      this.id = p.get('id') ?? '';
      this.page.set(1);
      void this.load();
    });
    this.state.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.page.set(1);
      void this.loadFolders();
    });
  }
  async load() {
    const g = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    this.confirming.set(false);
    this.preview.set(null);
    this.selected.set([]);
    this.actionError.set('');
    this.conflict.set(false);
    try {
      const w = await this.repo.get(this.id);
      if (g !== this.generation) return;
      this.row.set(w);
      this.state.setValue(w.active ? 'PENDING_ADD' : 'PENDING_REMOVE', {
        emitEvent: false,
      });
      this.page.set(1);
      await this.loadFolders();
    } catch (e) {
      if (g === this.generation) this.error.set(musicError(e).message);
    } finally {
      if (g === this.generation) this.loading.set(false);
    }
  }
  async loadFolders() {
    this.controller?.abort();
    const c = new AbortController();
    this.controller = c;
    this.contentLoading.set(true);
    this.contentError.set('');
    this.selected.set([]);
    this.preview.set(null);
    this.actionError.set('');
    this.conflict.set(false);
    try {
      const r = await this.repo.affected(
        this.id,
        (this.state.value || undefined) as PresenceState | undefined,
        this.page(),
        c.signal,
      );
      if (c.signal.aborted) return;
      this.rows.set(r.rows);
      this.total.set(r.count);
      if (this.page() > this.pages()) {
        this.page.set(this.pages());
        void this.loadFolders();
      }
    } catch (e) {
      if (!c.signal.aborted) this.contentError.set(musicError(e).message);
    } finally {
      if (!c.signal.aborted) this.contentLoading.set(false);
    }
  }
  move(n: number) {
    if (this.busy()) return;
    this.page.update((p) => p + n);
    void this.loadFolders();
  }
  toggle(id: string) {
    if (this.busy() || this.preview()) return;
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id],
    );
  }
  selectPage() {
    if (!this.busy() && !this.preview())
      this.selected.set(this.eligible().map((r) => r.folder_id));
  }
  async review() {
    if (
      this.busy() ||
      !this.selected().length ||
      !['PENDING_ADD', 'PENDING_REMOVE'].includes(this.state.value) ||
      !this.connection.online()
    )
      return;
    this.busy.set(true);
    this.actionError.set('');
    this.conflict.set(false);
    try {
      this.preview.set(
        await this.repo.previewPresence(
          this.state.value === 'PENDING_ADD' ? 'INCORPORATE' : 'REMOVE',
          this.id,
          this.selected(),
        ),
      );
    } catch (e) {
      this.actionError.set(musicError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
  async apply() {
    const p = this.preview();
    if (!p || this.busy() || !this.connection.online()) return;
    this.busy.set(true);
    this.writing.set(true);
    this.actionError.set('');
    try {
      const r = await this.repo.applyPresence(p, this.batchRequest.for(p));
      this.preview.set(null);
      this.feedback.success(r.count + ' carpetas actualizadas.');
      await this.loadFolders();
    } catch (e) {
      const err = musicError(e);
      this.actionError.set(err.message);
      this.conflict.set(err.conflict);
      if (err.conflict) this.preview.set(null);
    } finally {
      this.writing.set(false);
      this.busy.set(false);
    }
  }
  async changeActive() {
    const w = this.row();
    if (!w || this.busy() || !this.connection.online()) return;
    const data = {
      repertoire_code: w.repertoire_code,
      title: w.title,
      author: w.author,
      active: !w.active,
    };
    this.busy.set(true);
    this.writing.set(true);
    this.actionError.set('');
    try {
      await this.repo.saveWork(
        w.id,
        w.version,
        data,
        this.request.for({ id: w.id, version: w.version, data }),
      );
      this.feedback.success(
        data.active ? 'Obra reactivada.' : 'Obra retirada del catálogo activo.',
      );
      await this.load();
      if (this.history().length) void this.loadHistory(1);
    } catch (e) {
      const err = musicError(e);
      this.actionError.set(err.message);
      this.conflict.set(err.conflict);
    } finally {
      this.writing.set(false);
      this.busy.set(false);
    }
  }
  async loadHistory(page = 1) {
    const g = ++this.historyGeneration;
    this.historyLoading.set(true);
    this.historyError.set('');
    try {
      const r = await this.repo.workHistory(this.id, page);
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
  historyLabel(h: Audit) {
    const b = h.before_data as Partial<RepertoireWork> | null;
    const a = (h.after_data as { record?: Partial<RepertoireWork> })?.record;
    if (!b?.id) return 'Alta de obra';
    if (b.active !== a?.active)
      return a?.active ? 'Obra reactivada' : 'Obra retirada';
    return 'Título o autor actualizados';
  }
  historyDetails(h: Audit) {
    const a = (h.after_data as { record?: Partial<RepertoireWork> })?.record;
    return [a?.title, a?.author].filter(Boolean).join(' · ');
  }
  openHistory(e: Event) {
    if ((e.target as HTMLDetailsElement).open) void this.loadHistory();
  }
  canLeave() {
    return !this.busy();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.writing()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
