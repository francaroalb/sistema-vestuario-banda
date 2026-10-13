import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MaintenanceRepository } from '../../core/maintenance/maintenance-repository';
import { FoldersRepository } from '../../core/folders/folders-repository';
import { RepertoireRepository } from '../../core/repertoire/repertoire-repository';
import {
  FolderInventory,
  MaintenanceEntry,
  PhysicalIssueKind,
  RepertoireWork,
  ScoreIssueKind,
} from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { StableRequest } from '../folders/folder-ui';
import {
  issueLabels,
  maintenanceReturn,
  maintenanceRoot,
} from './maintenance-ui';
@Component({
  selector: 'app-issue-form',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './issue-form.html',
  styleUrls: ['../folders/folders.scss', '../repertoire/repertoire.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueForm {
  private readonly repo = inject(MaintenanceRepository);
  private readonly folders = inject(FoldersRepository);
  private readonly repertoire = inject(RepertoireRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly editing = !!this.route.snapshot.paramMap.get('id');
  readonly id = this.route.snapshot.paramMap.get('id') ?? crypto.randomUUID();
  readonly family = this.route.snapshot.paramMap.get('family') ?? '';
  readonly returnTo = maintenanceReturn(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = this.router.parseUrl(this.returnTo);
  readonly labels = issueLabels;
  readonly kinds =
    this.family === 'SCORE'
      ? (['MISSING', 'DAMAGED', 'REPLACE', 'REPAIR'] as const)
      : (['ELASTICS', 'COVER', 'RINGS', 'REPLACE_FOLDER', 'OTHER'] as const);
  readonly row = signal<MaintenanceEntry | null>(null);
  readonly folder = signal<FolderInventory | null>(null);
  readonly work = signal<RepertoireWork | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly saving = signal(false);
  readonly conflict = signal(false);
  readonly resolving = signal(false);
  private readonly request = new StableRequest();
  readonly form = inject(FormBuilder).nonNullable.group({
    kind: [
      this.family === 'SCORE' ? 'DAMAGED' : 'ELASTICS',
      Validators.required,
    ],
    description: ['', Validators.maxLength(2000)],
    blocks_use: false,
  });
  readonly resolutionForm = inject(FormBuilder).nonNullable.group({
    outcome: [
      'UNCHANGED' as 'PRESENT' | 'ABSENT' | 'UNCHANGED',
      Validators.required,
    ],
    resolution: ['', Validators.maxLength(2000)],
  });
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.loadError.set('');
    this.error.set('');
    this.conflict.set(false);
    this.resolving.set(false);
    try {
      if (!['SCORE', 'PHYSICAL'].includes(this.family))
        throw new Error('Invalid family');
      const row = this.editing
        ? await this.repo.entry(this.id, this.family)
        : null;
      const folderId =
        row?.folder_id ??
        this.route.snapshot.queryParamMap.get('carpeta') ??
        '';
      const workId =
        row?.work_id ?? this.route.snapshot.queryParamMap.get('obra');
      const [folder, work] = await Promise.all([
        this.folders.get(folderId),
        this.family === 'SCORE'
          ? this.repertoire.get(workId ?? '')
          : Promise.resolve(null),
      ]);
      this.folder.set(folder);
      this.work.set(work);
      this.row.set(row);
      this.form.reset({
        kind: row?.kind ?? (work ? 'DAMAGED' : 'ELASTICS'),
        description: row?.description ?? '',
        blocks_use: row?.blocks_use ?? false,
      });
      this.resolutionForm.reset({
        outcome: row?.kind === 'MISSING' ? 'PRESENT' : 'UNCHANGED',
        resolution: '',
      });
    } catch (e) {
      this.loadError.set(musicError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
  reload() {
    if (
      !this.dirty() ||
      confirm(
        'Se descartará el borrador para cargar la versión actual. ¿Continuar?',
      )
    )
      void this.load();
  }
  dirty() {
    return this.form.dirty || this.resolutionForm.dirty;
  }
  startResolve() {
    if (this.form.dirty) {
      this.error.set(
        'Guarda primero los cambios de la incidencia o vuelve a cargarla.',
      );
      return;
    }
    this.error.set('');
    this.resolving.set(true);
  }
  async save() {
    const f = this.folder();
    const w = this.work();
    const raw = this.form.getRawValue();
    if (
      !f ||
      this.saving() ||
      this.conflict() ||
      !this.connection.online() ||
      this.row()?.resolved_at ||
      (!this.editing && f.archived)
    )
      return;
    if (
      this.form.invalid ||
      (this.family === 'PHYSICAL' && !raw.description.trim())
    ) {
      this.error.set(
        'Describe el desperfecto de la carpeta y revisa la longitud de las observaciones (máximo 2000 caracteres).',
      );
      return;
    }
    const version = this.row()?.issue_version ?? null;
    this.saving.set(true);
    this.error.set('');
    try {
      if (this.family === 'SCORE' && w) {
        const data = {
          folder_id: f.id,
          folder_version: f.version,
          work_id: w.id,
          work_version: w.version,
          kind: raw.kind as ScoreIssueKind,
          description: raw.description.trim() || null,
        };
        await this.repo.saveScore(
          this.id,
          version,
          data,
          this.request.for({ action: 'save', id: this.id, version, data }),
        );
      } else {
        const data = {
          folder_id: f.id,
          folder_version: f.version,
          kind: raw.kind as PhysicalIssueKind,
          description: raw.description.trim(),
          blocks_use: raw.blocks_use,
        };
        await this.repo.savePhysical(
          this.id,
          version,
          data,
          this.request.for({ action: 'save', id: this.id, version, data }),
        );
      }
      this.form.markAsPristine();
      this.saving.set(false);
      this.feedback.success('Incidencia guardada.');
      if (this.editing) await this.load();
      else await this.router.navigateByUrl(this.backLink, { replaceUrl: true });
    } catch (e) {
      const err = musicError(e);
      this.error.set(err.message);
      this.conflict.set(err.conflict);
    } finally {
      this.saving.set(false);
    }
  }
  async resolve() {
    const f = this.folder(),
      row = this.row(),
      w = this.work();
    if (
      !f ||
      !row?.issue_version ||
      row.resolved_at ||
      this.saving() ||
      this.conflict() ||
      !this.connection.online() ||
      this.resolutionForm.invalid
    )
      return;
    const raw = this.resolutionForm.getRawValue();
    this.saving.set(true);
    this.error.set('');
    try {
      if (this.family === 'SCORE' && w) {
        const data = {
          folder_version: f.version,
          work_version: w.version,
          outcome: raw.outcome,
          resolution: raw.resolution.trim() || null,
        };
        await this.repo.resolveScore(
          this.id,
          row.issue_version,
          data,
          this.request.for({
            action: 'resolve',
            id: this.id,
            version: row.issue_version,
            data,
          }),
        );
      } else {
        const data = {
          folder_version: f.version,
          resolution: raw.resolution.trim() || null,
        };
        await this.repo.resolvePhysical(
          this.id,
          row.issue_version,
          data,
          this.request.for({
            action: 'resolve',
            id: this.id,
            version: row.issue_version,
            data,
          }),
        );
      }
      this.resolutionForm.markAsPristine();
      this.feedback.success(
        'Incidencia resuelta. Se conserva en el historial.',
      );
      await this.load();
    } catch (e) {
      const err = musicError(e);
      this.error.set(err.message);
      this.conflict.set(err.conflict);
    } finally {
      this.saving.set(false);
    }
  }
  canLeave() {
    return (
      !this.saving() &&
      (!this.dirty() ||
        confirm('Tienes cambios sin guardar. ¿Quieres salir y descartarlos?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.dirty() || this.saving()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
