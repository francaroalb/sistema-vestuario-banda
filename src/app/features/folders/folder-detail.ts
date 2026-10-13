import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FoldersRepository } from '../../core/folders/folders-repository';
import { FolderInventory } from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import {
  folderPayload,
  folderReturn,
  folderStatus,
  StableRequest,
} from './folder-ui';
type HistoryRow = Awaited<
  ReturnType<FoldersRepository['history']>
>['rows'][number];
@Component({
  selector: 'app-folder-detail',
  imports: [RouterLink, DatePipe],
  templateUrl: './folder-detail.html',
  styleUrl: './folders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderDetail {
  private readonly repo = inject(FoldersRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly row = signal<FolderInventory | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly conflict = signal(false);
  readonly saving = signal(false);
  readonly confirming = signal(false);
  readonly history = signal<HistoryRow[]>([]);
  readonly historyError = signal('');
  readonly historyLoading = signal(false);
  readonly historyPage = signal(1);
  readonly historyPages = signal(1);
  readonly status = folderStatus;
  readonly returnTo = folderReturn(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = inject(Router).parseUrl(this.returnTo);
  private id = '';
  private generation = 0;
  private historyGeneration = 0;
  private readonly request = new StableRequest();
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.id = p.get('id') ?? '';
      this.historyPage.set(1);
      this.confirming.set(false);
      void this.load();
    });
  }
  async load() {
    const g = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    this.actionError.set('');
    this.conflict.set(false);
    try {
      const row = await this.repo.get(this.id);
      if (g !== this.generation) return;
      this.row.set(row);
      void this.loadHistory(1);
    } catch (e) {
      if (g === this.generation) this.error.set(musicError(e).message);
    } finally {
      if (g === this.generation) this.loading.set(false);
    }
  }
  async loadHistory(page: number) {
    const g = ++this.historyGeneration;
    this.historyLoading.set(true);
    this.historyError.set('');
    try {
      const r = await this.repo.history(this.id, page);
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
  historyLabel(h: HistoryRow) {
    const before = h.before_data as Record<string, unknown> | null;
    const envelope = h.after_data as Record<string, unknown> | null;
    const after = envelope?.['record'] as Record<string, unknown> | null;
    if (h.action === 'MUSIC_FOLDER_SAVE') {
      if (!before?.['id']) return 'Alta de carpeta';
      if (before['archived'] !== after?.['archived'])
        return after?.['archived'] ? 'Carpeta archivada' : 'Carpeta reactivada';
      if (before['manually_blocked'] !== after?.['manually_blocked'])
        return after?.['manually_blocked']
          ? 'Bloqueo manual activado'
          : 'Bloqueo manual retirado';
      return 'Datos de carpeta actualizados';
    }
    return (
      (
        {
          MUSIC_LOAN_RESERVE: 'Carpeta reservada, pendiente de entrega',
          MUSIC_LOAN_CANCEL: 'Reserva de carpeta cancelada',
          MUSIC_LOAN_DELIVER: 'Carpeta entregada con firma',
          MUSIC_LOAN_RETURN: 'Carpeta devuelta con firma',
          MUSIC_PRESENCE: 'Contenido actualizado',
          MUSIC_SCORE_SAVE: 'Incidencia de partitura registrada',
          MUSIC_SCORE_RESOLVE: 'Incidencia de partitura resuelta',
          MUSIC_PHYSICAL_SAVE: 'Incidencia de carpeta registrada',
          MUSIC_PHYSICAL_RESOLVE: 'Incidencia de carpeta resuelta',
        } as Record<string, string>
      )[h.action] ?? 'Cambio registrado'
    );
  }
  async archive() {
    const row = this.row();
    if (!row || this.saving() || !this.connection.online()) return;
    const data = { ...folderPayload(row), archived: !row.archived };
    this.saving.set(true);
    this.actionError.set('');
    this.conflict.set(false);
    try {
      await this.repo.save(
        row.id,
        row.version,
        data,
        this.request.for({ id: row.id, version: row.version, data }),
      );
      this.confirming.set(false);
      this.feedback.success(
        data.archived ? 'Carpeta archivada.' : 'Carpeta reactivada.',
      );
      await this.load();
    } catch (e) {
      const err = musicError(e);
      this.actionError.set(err.message);
      this.conflict.set(err.conflict);
    } finally {
      this.saving.set(false);
    }
  }
  canLeave() {
    return !this.saving();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.saving()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
