import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RepertoireRepository } from '../../core/repertoire/repertoire-repository';
import { RepertoireWork, RepertoireCode } from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { StableRequest } from '../folders/folder-ui';
import { repertoireReturn } from './repertoire-ui';
@Component({
  selector: 'app-work-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './work-form.html',
  styleUrls: ['../folders/folders.scss', './repertoire.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkForm {
  private readonly repo = inject(RepertoireRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly editing = !!this.route.snapshot.paramMap.get('id');
  readonly id = this.route.snapshot.paramMap.get('id') ?? crypto.randomUUID();
  readonly returnTo = repertoireReturn(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = this.editing
    ? this.router.createUrlTree(['/inventario/carpetas/repertorio', this.id], {
        queryParams: { volver: this.returnTo },
      })
    : this.router.parseUrl(this.returnTo);
  readonly row = signal<RepertoireWork | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly saving = signal(false);
  readonly conflict = signal(false);
  private readonly request = new StableRequest();
  readonly form = inject(FormBuilder).nonNullable.group({
    repertoire_code: [
      this.route.snapshot.queryParamMap.get('repertorio') === 'PMM'
        ? ('PMM' as RepertoireCode)
        : ('PRO' as RepertoireCode),
      Validators.required,
    ],
    title: ['', [Validators.required, Validators.maxLength(200)]],
    author: ['', Validators.maxLength(160)],
  });
  constructor() {
    if (this.editing) void this.load();
  }
  async load() {
    this.loading.set(true);
    this.loadError.set('');
    this.error.set('');
    this.conflict.set(false);
    try {
      const w = await this.repo.get(this.id);
      this.row.set(w);
      this.form.reset({ ...w, author: w.author ?? '' });
    } catch (e) {
      this.loadError.set(musicError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
  async save() {
    if (
      this.saving() ||
      this.loading() ||
      this.loadError() ||
      !this.connection.online()
    )
      return;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    if (this.form.invalid || !raw.title.trim()) {
      this.error.set(
        'Indica el título de la obra (hasta 200 caracteres) y revisa el autor (hasta 160).',
      );
      return;
    }
    const data = {
      ...raw,
      title: raw.title.trim(),
      author: raw.author.trim() || null,
      active: this.row()?.active ?? true,
    };
    const version = this.row()?.version ?? null;
    this.saving.set(true);
    this.error.set('');
    this.conflict.set(false);
    try {
      const w = await this.repo.saveWork(
        this.id,
        version,
        data,
        this.request.for({ version, data }),
      );
      this.form.markAsPristine();
      this.saving.set(false);
      this.feedback.success(
        this.editing
          ? 'Obra actualizada.'
          : 'Obra añadida. Las carpetas existentes quedan pendientes de incorporarla.',
      );
      await this.router.navigate(['/inventario/carpetas/repertorio', w.id], {
        queryParams: { volver: this.returnTo },
        replaceUrl: true,
      });
    } catch (e) {
      const err = musicError(e);
      this.error.set(err.message);
      this.conflict.set(err.conflict);
    } finally {
      this.saving.set(false);
    }
  }
  reload() {
    if (
      !this.form.dirty ||
      confirm(
        'Se descartará el borrador para cargar la versión actual. ¿Continuar?',
      )
    )
      void this.load();
  }
  canLeave() {
    return (
      !this.saving() &&
      (!this.form.dirty ||
        confirm('Tienes cambios sin guardar. ¿Quieres salir y descartarlos?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.form.dirty || this.saving()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
