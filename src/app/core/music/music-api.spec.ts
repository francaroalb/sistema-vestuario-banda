import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../config/supabase';
import {
  MusicApi,
  MusicError,
  musicError,
  musicPage,
  pageRange,
} from './music-api';
import { FoldersRepository } from '../folders/folders-repository';
import { RepertoireRepository } from '../repertoire/repertoire-repository';
import { MaintenanceRepository } from '../maintenance/maintenance-repository';
import { MusicInputs, PresencePreview } from './models';

describe('Servicios de carpetas', () => {
  let rpc: ReturnType<typeof vi.fn>;
  let retry: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    retry = vi
      .fn()
      .mockResolvedValue({ data: { id: 'folder', version: 1 }, error: null });
    rpc = vi.fn().mockReturnValue({ retry });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
  });
  it('conserva la petición en reintentos y no transmite campos administrativos ni firma', async () => {
    const repository = TestBed.inject(FoldersRepository);
    const data: MusicInputs['FOLDER_SAVE'] = {
      code: 'PRO-CLA1-001',
      repertoire_code: 'PRO',
      voice_id: 'voice',
      manually_blocked: false,
      archived: false,
    };
    retry.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    await expect(
      repository.save('folder', null, data, 'same-request'),
    ).rejects.toBeInstanceOf(MusicError);
    await repository.save('folder', null, data, 'same-request');
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc).toHaveBeenLastCalledWith('music_command', {
      p_request: 'same-request',
      p_action: 'FOLDER_SAVE',
      p_id: 'folder',
      p_expected_version: null,
      p_data: data,
    });
    expect(retry).toHaveBeenCalledWith(false);
  });
  it('distingue una incidencia de partitura de un bloqueo físico', async () => {
    const repository = TestBed.inject(MaintenanceRepository);
    const score: MusicInputs['SCORE_SAVE'] = {
      folder_id: 'folder',
      folder_version: 2,
      work_id: 'work',
      work_version: 1,
      kind: 'DAMAGED',
    };
    await repository.saveScore('issue', null, score, 'r1');
    expect(rpc.mock.calls[0][1].p_data).not.toHaveProperty('blocks_use');
    const physical: MusicInputs['PHYSICAL_SAVE'] = {
      folder_id: 'folder',
      folder_version: 3,
      kind: 'ELASTICS',
      description: 'Rotas',
      blocks_use: false,
    };
    await repository.savePhysical('issue2', null, physical, 'r2');
    expect(rpc.mock.calls[1][1].p_data.blocks_use).toBe(false);
    expect(rpc.mock.calls[1][1].p_data).not.toHaveProperty('work_id');
  });
  it('la revisión no aplica el lote; confirmar envía exactamente la revisión y la petición', async () => {
    const preview: PresencePreview = {
      action: 'INCORPORATE',
      work_id: 'work',
      work_version: 1,
      title: 'Obra',
      folders: [
        {
          id: 'folder',
          version: 3,
          code: 'PRO-CLA1-001',
          state: 'PENDING_ADD',
        },
      ],
    };
    rpc.mockResolvedValueOnce({ data: preview, error: null });
    const repository = TestBed.inject(RepertoireRepository);
    expect(
      await repository.previewPresence('INCORPORATE', 'work', ['folder']),
    ).toEqual(preview);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('preview_music_presence', {
      p_action: 'INCORPORATE',
      p_work: 'work',
      p_folders: ['folder'],
    });
    await repository.applyPresence(preview, 'batch-request');
    expect(rpc).toHaveBeenLastCalledWith('apply_music_presence', {
      p_request: 'batch-request',
      p_preview: preview,
    });
  });
  it('propaga un conflicto de versión sin fingir éxito', async () => {
    retry.mockResolvedValueOnce({
      data: null,
      error: { code: 'PT409', message: 'MUSIC_CHANGED' },
    });
    await expect(
      TestBed.inject(MusicApi).command(
        'PHYSICAL_RESOLVE',
        'issue',
        1,
        { folder_version: 2 },
        'request',
      ),
    ).rejects.toMatchObject({ conflict: true });
  });
  it('rechaza acceso sin configuración y no sustituye errores de consulta por un listado vacío', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: null } }],
    });
    expect(() => TestBed.inject(MusicApi).client).toThrow(
      'El acceso no está configurado',
    );
    expect(() =>
      musicPage({ data: null, count: null, error: { code: '42501' } }),
    ).toThrow();
  });
  it('mensajes distinguen ausencia, duplicidad y resolución; paginación acotada', () => {
    expect(musicError({ message: 'MUSIC_SCORE_ABSENT' }).message).toContain(
      'no consta presente',
    );
    expect(musicError({ code: '23505' }).conflict).toBe(true);
    expect(
      musicError({ message: 'MUSIC_MISSING_UNRESOLVED' }).message,
    ).toContain('recuperación');
    expect(pageRange(2)).toEqual([24, 47]);
    expect(pageRange(-1)).toEqual([0, 23]);
  });
});
