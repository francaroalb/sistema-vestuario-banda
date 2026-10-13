import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FoldersRepository } from '../../core/folders/folders-repository';
import {
  FolderInventory,
  MusicalVoice,
  RepertoireCode,
} from '../../core/music/models';
import { musicError } from '../../core/music/music-api';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { VoicePicker } from './voice-picker';
import { folderReturn, StableRequest } from './folder-ui';
@Component({
  selector: 'app-folder-form',
  imports: [ReactiveFormsModule, RouterLink, VoicePicker],
  templateUrl: './folder-form.html',
  styleUrl: './folders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderForm {
  private readonly repo = inject(FoldersRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly id = this.route.snapshot.paramMap.get('id') ?? crypto.randomUUID();
  readonly editing = !!this.route.snapshot.paramMap.get('id');
  readonly returnTo = folderReturn(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = this.editing
    ? this.router.createUrlTree(['/inventario/carpetas', this.id], {
        queryParams: { volver: this.returnTo },
      })
    : this.router.parseUrl(this.returnTo);
  readonly row = signal<FolderInventory | null>(null);
  readonly voice = signal<MusicalVoice | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly conflict = signal(false);
  readonly saving = signal(false);
  readonly voiceSaving = signal(false);
  readonly picker = viewChild(VoicePicker);
  private readonly request = new StableRequest();
  readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(60)]],
    repertoire_code: ['PRO' as RepertoireCode, Validators.required],
    voice_id: ['', Validators.required],
    notes: ['', Validators.maxLength(2000)],
    manually_blocked: false,
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
      const row = await this.repo.get(this.id);
      this.row.set(row);
      this.form.reset({ ...row, notes: row.notes ?? '' });
    } catch (e) {
      this.loadError.set(musicError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
  pick(v: MusicalVoice | null) {
    this.voice.set(v);
    this.form.controls.voice_id.setValue(v?.id ?? '');
    this.form.markAsDirty();
  }
  async save() {
    if (
      this.saving() ||
      this.voiceSaving() ||
      this.loading() ||
      this.loadError() ||
      !this.connection.online() ||
      this.row()?.archived
    )
      return;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    const code = raw.code.trim().toUpperCase();
    const voiceCode = this.row()?.voice_code ?? this.voice()?.code;
    if (
      this.form.invalid ||
      !voiceCode ||
      !new RegExp(
        '^' + raw.repertoire_code + '-' + voiceCode + '-[0-9]{1,6}$',
      ).test(code) ||
      Number(code.split('-')[2]) < 1
    ) {
      this.error.set(
        'Selecciona una voz e indica su código físico completo, por ejemplo PRO-CLA1-001. El repertorio y la voz deben coincidir con la etiqueta.',
      );
      return;
    }
    const data = {
      ...raw,
      code,
      notes: raw.notes.trim() || null,
      archived: false,
    };
    const version = this.row()?.version ?? null;
    this.saving.set(true);
    this.error.set('');
    this.conflict.set(false);
    try {
      const row = await this.repo.save(
        this.id,
        version,
        data,
        this.request.for({ version, data }),
      );
      this.form.markAsPristine();
      this.picker()?.form.markAsPristine();
      this.feedback.success(
        row.code + (this.editing ? ' actualizada.' : ' añadida al inventario.'),
      );
      this.saving.set(false);
      await this.router.navigate(['/inventario/carpetas', row.id], {
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
        'Se descartarán tus cambios para cargar la versión actual. ¿Continuar?',
      )
    )
      void this.load();
  }
  canLeave() {
    if (this.saving() || this.voiceSaving()) return false;
    return (
      !(this.form.dirty || this.picker()?.hasDraft()) ||
      confirm('Tienes cambios sin guardar. ¿Quieres salir y descartarlos?')
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (
      this.form.dirty ||
      this.picker()?.hasDraft() ||
      this.saving() ||
      this.voiceSaving()
    ) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
