import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('Carpetas fase 1: catálogo, presencia, incidencias y seguridad', async (t) => {
  const db = new PGlite();
  const admin = uuid(),
    other = uuid(),
    outsider = uuid(),
    inactive = uuid();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    for (const id of [admin, other, outsider, inactive])
      await db.query('insert into auth.users values($1)', [id]);
    for (const id of [admin, other, inactive])
      await db.query(
        'insert into public.admin_profiles(user_id,display_name,active) values($1,$2,$3)',
        [id, 'Admin prueba', id !== inactive],
      );
    const query = async (
      sql,
      params = [],
      actor = admin,
      role = 'authenticated',
    ) => {
      await db.exec(`begin; set local role ${role};`);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        actor,
      ]);
      try {
        const r = await db.query(sql, params);
        await db.exec('commit');
        return r.rows;
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    };
    const command = async (
      action,
      id,
      version,
      data,
      request = uuid(),
      actor = admin,
    ) =>
      (
        await query(
          'select public.music_command($1,$2,$3,$4,$5) r',
          [request, action, id, version, JSON.stringify(data)],
          actor,
        )
      )[0].r;
    const get = async (table, id) =>
      (await query(`select * from public.${table} where id=$1`, [id]))[0];
    const state = async (f, w) =>
      (
        await query(
          'select * from public.folder_work_state where folder_id=$1 and work_id=$2',
          [f, w],
        )
      )[0];
    const inventory = (id) => get('music_folder_inventory', id);
    const voiceData = {
      code: 'CLA1',
      name: 'Clarinete 1.º',
      instrument: 'Clarinete',
      archived: false,
    };
    const voice = uuid();
    const saveWork = async (id, changes = {}) => {
      const old = await get('repertoire_works', id);
      return command('WORK_SAVE', id, old?.version ?? null, {
        repertoire_code: old?.repertoire_code ?? 'PRO',
        title: old?.title ?? 'Obra ' + id,
        author: old?.author ?? null,
        active: old?.active ?? true,
        ...changes,
      });
    };
    const makeFolder = async (code, rep = 'PRO', v = voice) => {
      const id = uuid();
      return command('FOLDER_SAVE', id, null, {
        code,
        repertoire_code: rep,
        voice_id: v,
        manually_blocked: false,
        archived: false,
      });
    };
    const editFolder = async (id, changes) => {
      const f = await get('music_folders', id);
      return command('FOLDER_SAVE', id, f.version, {
        code: f.code,
        repertoire_code: f.repertoire_code,
        voice_id: f.voice_id,
        manually_blocked: f.manually_blocked,
        archived: f.archived,
        notes: f.notes,
        ...changes,
      });
    };
    const presence = async (folder, work, action, request = uuid()) =>
      command(
        'PRESENCE',
        folder,
        (await get('music_folders', folder)).version,
        {
          work_id: work,
          work_version: (await get('repertoire_works', work)).version,
          action,
        },
        request,
      );
    const issue = async (folder, work, kind, description = 'Observación') => {
      const id = uuid();
      return command('SCORE_SAVE', id, null, {
        folder_id: folder,
        folder_version: (await get('music_folders', folder)).version,
        work_id: work,
        work_version: (await get('repertoire_works', work)).version,
        kind,
        description,
      });
    };
    const physical = async (folder, kind, blocks_use) =>
      command('PHYSICAL_SAVE', uuid(), null, {
        folder_id: folder,
        folder_version: (await get('music_folders', folder)).version,
        kind,
        description: 'Incidencia física',
        blocks_use,
      });
    const resolveScore = async (id, outcome) => {
      const i = await get('folder_score_issues', id);
      return command('SCORE_RESOLVE', id, i.version, {
        folder_version: (await get('music_folders', i.folder_id)).version,
        work_version: (await get('repertoire_works', i.work_id)).version,
        outcome,
        resolution: 'Resuelto expresamente',
      });
    };
    const resolvePhysical = async (id) => {
      const i = await get('folder_physical_issues', id);
      return command('PHYSICAL_RESOLVE', id, i.version, {
        folder_version: (await get('music_folders', i.folder_id)).version,
        resolution: 'Reparada',
      });
    };
    let f1, f2, w1, w2;
    await t.test(
      'Voces configurables, código estable, permisos e idempotencia por actor y contenido',
      async () => {
        const request = uuid();
        const first = await command(
          'VOICE_SAVE',
          voice,
          null,
          voiceData,
          request,
        );
        assert.deepEqual(
          await command('VOICE_SAVE', voice, null, voiceData, request),
          first,
        );
        await assert.rejects(
          command('VOICE_SAVE', voice, null, voiceData, request, other),
          /REQUEST_ALREADY_USED/,
        );
        await assert.rejects(
          command(
            'VOICE_SAVE',
            voice,
            null,
            { ...voiceData, name: 'Otro' },
            request,
          ),
          /REQUEST_ALREADY_USED/,
        );
        await assert.rejects(
          command('VOICE_SAVE', uuid(), null, voiceData),
          /unique/,
        );
        await assert.rejects(
          command('VOICE_SAVE', voice, 1, { ...voiceData, code: 'CLA2' }),
          /MUSIC_IDENTITY_FIXED/,
        );
        assert.equal(
          (
            await command('VOICE_SAVE', voice, 1, {
              ...voiceData,
              name: 'Clarinete primero',
            })
          ).version,
          2,
        );
        await assert.rejects(
          command('VOICE_SAVE', voice, 1, voiceData),
          /MUSIC_CHANGED/,
        );
        for (const actor of [outsider, inactive])
          await assert.rejects(
            command(
              'VOICE_SAVE',
              uuid(),
              null,
              { ...voiceData, code: 'TUB' },
              uuid(),
              actor,
            ),
            /ADMIN_REQUIRED/,
          );
        assert.equal(
          (
            await query(
              "select * from public.audit_log where entity_type='music_voice'",
            )
          ).length,
          2,
        );
      },
    );
    await t.test(
      'Carpeta inicialmente completa sin filas redundantes; obra nueva pendiente; editar metadatos no cambia repertorio',
      async () => {
        w1 = uuid();
        await saveWork(w1);
        f1 = (await makeFolder('PRO-CLA1-001')).id;
        assert.equal((await state(f1, w1)).state, 'PRESENT');
        assert.equal((await state(f1, w1)).presumed, true);
        assert.equal(
          (await query('select * from public.folder_work_presence')).length,
          0,
        );
        assert.equal(
          (await query('select * from public.folder_work_movements')).length,
          0,
        );
        w2 = uuid();
        await saveWork(w2);
        assert.equal((await state(f1, w2)).state, 'PENDING_ADD');
        const revision = (
          await query(
            "select revision from public.music_repertoires where code='PRO'",
          )
        )[0].revision;
        await saveWork(w1, { title: 'Título corregido', author: 'Autor' });
        assert.equal(
          (
            await query(
              "select revision from public.music_repertoires where code='PRO'",
            )
          )[0].revision,
          revision,
        );
        assert.equal((await state(f1, w1)).state, 'PRESENT');
        f2 = (await makeFolder('PRO-CLA1-002')).id;
        assert.equal((await state(f2, w2)).state, 'PRESENT');
      },
    );
    await t.test(
      'Código físico único incluso archivado, normalización, identidad fija y voz archivada',
      async () => {
        await assert.rejects(makeFolder(' pro-cla1-001 '), /unique/);
        await assert.rejects(makeFolder('PRO-CLA2-003'), /MUSIC_INVALID_CODE/);
        await assert.rejects(makeFolder('PRO-CLA1-000'), /MUSIC_INVALID_CODE/);
        await assert.rejects(
          editFolder(f1, { voice_id: uuid() }),
          /MUSIC_VOICE_UNAVAILABLE/,
        );
        await assert.rejects(
          editFolder(f1, { code: 'PRO-CLA1-099' }),
          /MUSIC_IDENTITY_FIXED/,
        );
        await editFolder(f2, { archived: true });
        await assert.rejects(makeFolder('PRO-CLA1-002'), /unique/);
        const v = await get('musical_voices', voice);
        await command('VOICE_SAVE', voice, v.version, {
          ...voiceData,
          archived: true,
        });
        await assert.rejects(
          makeFolder('PRO-CLA1-003'),
          /MUSIC_VOICE_UNAVAILABLE/,
        );
        assert.equal((await get('music_folders', f1)).code, 'PRO-CLA1-001');
        await command('VOICE_SAVE', voice, v.version + 1, voiceData);
        await editFolder(f2, { archived: false });
      },
    );
    await t.test(
      'Partitura presente y dañada sigue utilizable; faltante es ausencia y no tarea duplicada',
      async () => {
        const damage = await issue(f1, w1, 'DAMAGED');
        assert.equal((await state(f1, w1)).state, 'PRESENT');
        assert.equal((await inventory(f1)).usable, true);
        await assert.rejects(issue(f1, w1, 'DAMAGED'), /unique/);
        await assert.rejects(issue(f1, w2, 'DAMAGED'), /MUSIC_SCORE_ABSENT/);
        const missing = await issue(f1, w1, 'MISSING');
        assert.equal((await state(f1, w1)).state, 'MISSING');
        assert.equal((await inventory(f1)).usable, true);
        assert.equal(
          (
            await query(
              "select * from public.music_maintenance_tasks where folder_id=$1 and work_id=$2 and kind='MISSING'",
              [f1, w1],
            )
          ).length,
          1,
        );
        await assert.rejects(
          resolveScore(missing.issue.id, 'UNCHANGED'),
          /MUSIC_MISSING_UNRESOLVED/,
        );
        await assert.rejects(
          resolveScore(missing.issue.id, 'ABSENT'),
          /MUSIC_MISSING_UNRESOLVED/,
        );
        await assert.rejects(
          resolveScore(damage.issue.id, 'PRESENT'),
          /MUSIC_RESOLVE_MISSING/,
        );
        await resolveScore(missing.issue.id, 'PRESENT');
        assert.equal((await state(f1, w1)).state, 'PRESENT');
        assert.equal(
          (await get('folder_score_issues', damage.issue.id)).resolved_at,
          null,
        );
        await resolveScore(damage.issue.id, 'PRESENT');
        assert.ok(
          (await get('folder_score_issues', damage.issue.id)).resolved_at,
        );
        const newIssue = await issue(f1, w1, 'DAMAGED');
        assert.notEqual(newIssue.issue.id, damage.issue.id);
        await resolveScore(newIssue.issue.id, 'UNCHANGED');
      },
    );
    await t.test(
      'Elásticos no bloqueantes, dos bloqueos independientes y bloqueo manual persistente',
      async () => {
        const elastic = await physical(f1, 'ELASTICS', false);
        assert.equal((await inventory(f1)).usable, true);
        const cover = await physical(f1, 'COVER', true),
          rings = await physical(f1, 'RINGS', true);
        assert.equal((await inventory(f1)).usable, false);
        await resolvePhysical(cover.issue.id);
        assert.equal((await inventory(f1)).usable, false);
        await editFolder(f1, { manually_blocked: true });
        await resolvePhysical(rings.issue.id);
        assert.equal((await inventory(f1)).usable, false);
        await editFolder(f1, { manually_blocked: false });
        assert.equal((await inventory(f1)).usable, true);
        assert.equal(Number((await inventory(f1)).physical_issue_count), 1);
        await resolvePhysical(elastic.issue.id);
      },
    );
    await t.test(
      'Retirada y reactivación respetan la última presencia; carpetas creadas durante la retirada',
      async () => {
        await saveWork(w1, { active: false });
        assert.equal((await state(f1, w1)).state, 'PENDING_REMOVE');
        const during = (await makeFolder('PRO-CLA1-004')).id;
        assert.equal((await state(during, w1)).state, 'ABSENT_RETIRED');
        await presence(f1, w1, 'REMOVE');
        assert.equal((await state(f1, w1)).state, 'ABSENT_RETIRED');
        await saveWork(w1, { active: true });
        assert.equal((await state(f1, w1)).state, 'PENDING_ADD');
        assert.equal((await state(f2, w1)).state, 'PRESENT');
        assert.equal((await state(during, w1)).state, 'PENDING_ADD');
        await presence(f1, w1, 'INCORPORATE');
        assert.equal((await state(f1, w1)).presumed, false);
        await saveWork(w1, { active: false });
        await saveWork(w1, { active: true });
        assert.equal((await state(f1, w1)).state, 'PRESENT');
      },
    );
    await t.test(
      'Ausencia no genera retirada y resolver obra retirada ausente no inventa presencia',
      async () => {
        const missing = await issue(f2, w1, 'MISSING');
        await saveWork(w1, { active: false });
        assert.equal((await state(f2, w1)).state, 'ABSENT_RETIRED');
        assert.equal(
          (
            await query(
              'select * from public.music_maintenance_tasks where folder_id=$1 and work_id=$2',
              [f2, w1],
            )
          ).length,
          1,
        );
        await resolveScore(missing.issue.id, 'ABSENT');
        await saveWork(w1, { active: true });
        assert.equal((await state(f2, w1)).state, 'PENDING_ADD');
      },
    );
    await t.test(
      'Operaciones individuales rechazan repertorio incorrecto y datos obsoletos sin escribir',
      async () => {
        const pmm = uuid();
        await saveWork(pmm, { repertoire_code: 'PMM' });
        await assert.rejects(
          issue(f1, pmm, 'MISSING'),
          /MUSIC_REPERTOIRE_MISMATCH/,
        );
        const f = await get('music_folders', f1),
          w = await get('repertoire_works', w2);
        await editFolder(f1, { notes: 'Cambio simultáneo' });
        await assert.rejects(
          command('PRESENCE', f1, f.version, {
            work_id: w2,
            work_version: w.version,
            action: 'INCORPORATE',
          }),
          /MUSIC_CHANGED/,
        );
        assert.equal((await state(f1, w2)).state, 'PENDING_ADD');
        await presence(f1, w2, 'INCORPORATE');
        await assert.rejects(
          presence(f1, w2, 'INCORPORATE'),
          /MUSIC_PRESENCE_CHANGED/,
        );
      },
    );
    await t.test(
      'Revisión masiva solo lectura, confirmación atómica, idempotencia y auditoría por carpeta',
      async () => {
        const w = uuid();
        await saveWork(w);
        const preview = async () =>
          (
            await query('select public.preview_music_presence($1,$2,$3) r', [
              'INCORPORATE',
              w,
              [f1, f2],
            ])
          )[0].r;
        const apply = async (p, r = uuid(), actor = admin) =>
          (
            await query(
              'select public.apply_music_presence($1,$2) r',
              [r, JSON.stringify(p)],
              actor,
            )
          )[0].r;
        let p = await preview();
        assert.equal((await state(f1, w)).state, 'PENDING_ADD');
        await editFolder(f2, { notes: 'Editada después de revisar' });
        await assert.rejects(apply(p), /MUSIC_CHANGED/);
        assert.equal((await state(f1, w)).state, 'PENDING_ADD');
        p = await preview();
        await assert.rejects(
          apply({ ...p, title: 'Manipulada' }),
          /MUSIC_CHANGED/,
        );
        const request = uuid(),
          result = await apply(p, request);
        assert.equal(result.count, 2);
        assert.deepEqual(await apply(p, request), result);
        await assert.rejects(apply(p, request, other), /REQUEST_ALREADY_USED/);
        assert.equal((await state(f1, w)).state, 'PRESENT');
        assert.equal((await state(f2, w)).state, 'PRESENT');
        const movements = await query(
          'select * from public.folder_work_movements where work_id=$1',
          [w],
        );
        assert.equal(movements.length, 2);
        assert.equal(
          (
            await query(
              "select * from public.audit_log where action='MUSIC_PRESENCE' and after_data->'record'->>'work_id'=$1",
              [w],
            )
          ).length,
          2,
        );
        await assert.rejects(
          query('select public.preview_music_presence($1,$2,$3)', [
            'REMOVE',
            w,
            [f1, f1],
          ]),
          /MUSIC_INVALID_DATA/,
        );
      },
    );
    await t.test(
      'Un fallo en la segunda escritura revierte todo el lote, incluidas auditoría y peticiones',
      async () => {
        const w = uuid();
        await saveWork(w);
        const p = (
          await query('select public.preview_music_presence($1,$2,$3) r', [
            'INCORPORATE',
            w,
            [f1, f2],
          ])
        )[0].r;
        const last = p.folders[1].id;
        const beforeRequests = (
          await query('select count(*) n from public.music_requests')
        )[0].n;
        const beforeAudit = (
          await query('select count(*) n from public.audit_log')
        )[0].n;
        await db.exec(`create function private.qa_music_fail() returns trigger language plpgsql as $$ begin
        if new.folder_id='${last}'::uuid and new.work_id='${w}'::uuid then raise exception 'QA_FORCED_FAILURE'; end if; return new; end $$;
        create trigger qa_music_failure before insert on public.folder_work_presence for each row execute function private.qa_music_fail();`);
        try {
          await assert.rejects(
            query('select public.apply_music_presence($1,$2)', [
              uuid(),
              JSON.stringify(p),
            ]),
            /QA_FORCED_FAILURE/,
          );
          assert.equal((await state(f1, w)).state, 'PENDING_ADD');
          assert.equal((await state(f2, w)).state, 'PENDING_ADD');
          assert.equal(
            (await query('select count(*) n from public.music_requests'))[0].n,
            beforeRequests,
          );
          assert.equal(
            (await query('select count(*) n from public.audit_log'))[0].n,
            beforeAudit,
          );
          assert.equal(
            (
              await query(
                'select * from public.folder_work_movements where work_id=$1',
                [w],
              )
            ).length,
            0,
          );
        } finally {
          await db.exec(
            'drop trigger qa_music_failure on public.folder_work_presence; drop function private.qa_music_fail();',
          );
        }
      },
    );
    await t.test(
      'Observaciones editables conservan historial y una petición obsoleta no resuelve el bloqueo',
      async () => {
        const r = await physical(f1, 'OTHER', true);
        const edited = await command(
          'PHYSICAL_SAVE',
          r.issue.id,
          r.issue.version,
          {
            folder_id: f1,
            folder_version: r.folder_version,
            kind: 'OTHER',
            description: 'Detalle ampliado',
            blocks_use: true,
          },
        );
        await assert.rejects(
          command('PHYSICAL_RESOLVE', r.issue.id, r.issue.version, {
            folder_version: edited.folder_version,
          }),
          /MUSIC_CHANGED/,
        );
        assert.equal((await inventory(f1)).usable, false);
        assert.equal(
          (await get('folder_physical_issues', r.issue.id)).description,
          'Detalle ampliado',
        );
        assert.ok(
          (
            await query(
              "select * from public.audit_log where entity_id=$1 and action='MUSIC_PHYSICAL_SAVE' and before_data->>'id'=$2",
              [f1, r.issue.id],
            )
          ).length,
        );
        await resolvePhysical(r.issue.id);
      },
    );
    await t.test(
      'Claves foráneas impiden presencia de otro repertorio y borrado de voces utilizadas',
      async () => {
        const pmm = uuid();
        await saveWork(pmm, { repertoire_code: 'PMM' });
        await assert.rejects(
          db.query(
            'insert into public.folder_work_presence(folder_id,work_id,repertoire_code,present,updated_by) values($1,$2,$3,true,$4)',
            [f1, pmm, 'PRO', admin],
          ),
          /foreign key/,
        );
        await assert.rejects(
          db.query('delete from public.musical_voices where id=$1', [voice]),
          /foreign key/,
        );
      },
    );
    await t.test(
      'Archivar/reactivar no reinicializa repertorio ni elimina historial',
      async () => {
        await editFolder(f1, { archived: true });
        const before = (await get('music_folders', f1)).baseline_revision;
        const w = uuid();
        await saveWork(w);
        assert.equal((await inventory(f1)).operability, 'ARCHIVED');
        await assert.rejects(
          presence(f1, w, 'INCORPORATE'),
          /MUSIC_FOLDER_ARCHIVED/,
        );
        await editFolder(f1, { archived: false });
        assert.equal(
          (await get('music_folders', f1)).baseline_revision,
          before,
        );
        assert.equal((await state(f1, w)).state, 'PENDING_ADD');
        assert.ok(
          (
            await query(
              'select * from public.folder_work_movements where folder_id=$1',
              [f1],
            )
          ).length > 0,
        );
      },
    );
    await t.test(
      'Esquemas cerrados: no firmas, arrays, booleanos de texto ni identidad mutable',
      async () => {
        await assert.rejects(
          command('VOICE_SAVE', uuid(), null, {
            ...voiceData,
            code: 'TRP1',
            image: 'base64',
          }),
          /MUSIC_INVALID_DATA/,
        );
        await assert.rejects(
          command('VOICE_SAVE', uuid(), null, {
            ...voiceData,
            code: 'TRP1',
            archived: 'false',
          }),
          /MUSIC_INVALID_DATA/,
        );
        await assert.rejects(
          command('VOICE_SAVE', uuid(), null, { ...voiceData, code: ['TRP1'] }),
          /MUSIC_INVALID_DATA/,
        );
        await assert.rejects(
          command('VOICE_SAVE', uuid(), null, {
            ...voiceData,
            code: 'TRP1',
            name: null,
          }),
          /MUSIC_INVALID_DATA/,
        );
      },
    );
    await t.test(
      'Más de cien obras y decenas de carpetas sin multiplicar las filas de presencia',
      async () => {
        const before = (
          await query('select count(*) n from public.folder_work_presence')
        )[0].n;
        await query(`select public.music_command(gen_random_uuid(),'WORK_SAVE',gen_random_uuid(),null,
        jsonb_build_object('repertoire_code','PMM','title','Obra de volumen '||n,'active',true)) from generate_series(1,120) n`);
        await query(
          `select public.music_command(gen_random_uuid(),'FOLDER_SAVE',gen_random_uuid(),null,
        jsonb_build_object('code','PMM-CLA1-'||lpad(n::text,3,'0'),'repertoire_code','PMM','voice_id',$1::text,
        'manually_blocked',false,'archived',false)) from generate_series(1,40) n`,
          [voice],
        );
        const catalog = await query(
          "select * from public.music_folder_inventory where repertoire_code='PMM'",
        );
        assert.equal(catalog.length, 40);
        assert.ok(
          catalog.every(
            (f) =>
              Number(f.present_count) >= 120 &&
              Number(f.pending_add_count) === 0 &&
              f.usable,
          ),
        );
        assert.equal(
          (await query('select count(*) n from public.folder_work_presence'))[0]
            .n,
          before,
        );
      },
    );
    await t.test(
      'RLS, escritura directa y ayudantes privados protegidos; no se crean cesiones',
      async () => {
        const tables = [
          'music_repertoires',
          'musical_voices',
          'repertoire_works',
          'repertoire_work_periods',
          'music_folders',
          'music_requests',
          'folder_work_presence',
          'folder_work_movements',
          'folder_score_issues',
          'folder_physical_issues',
        ];
        const views = [
          'folder_work_state',
          'music_folder_inventory',
          'music_maintenance_tasks',
        ];
        for (const table of [...tables, ...views]) {
          assert.equal(
            (await query(`select * from public.${table}`, [], outsider)).length,
            0,
          );
          assert.equal(
            (await query(`select * from public.${table}`, [], inactive)).length,
            0,
          );
          await assert.rejects(
            query(`select * from public.${table}`, [], '', 'anon'),
            /permission denied/,
          );
        }
        for (const table of tables) {
          await assert.rejects(
            query(`delete from public.${table}`),
            /permission denied/,
          );
          await assert.rejects(
            query(`insert into public.${table} default values`),
            /permission denied/,
          );
        }
        await assert.rejects(
          query('update public.music_folders set manually_blocked=false'),
          /permission denied/,
        );
        await assert.rejects(
          query("select private.music_fields('{}','{}')"),
          /permission denied/,
        );
        await assert.rejects(
          query(
            'select public.music_command($1,$2,$3,$4,$5)',
            [uuid(), 'VOICE_SAVE', uuid(), null, JSON.stringify(voiceData)],
            '',
            'anon',
          ),
          /permission denied/,
        );
        assert.equal((await query('select * from public.loans')).length, 0);
        assert.equal(
          (await query('select * from public.loan_movements')).length,
          0,
        );
        assert.equal(
          (
            await query(
              'select * from public.event_participants where voice_id is not null',
            )
          ).length,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
