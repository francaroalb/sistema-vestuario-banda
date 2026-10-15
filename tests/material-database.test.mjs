import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Carpetas fase 6: operaciones conjuntas atómicas', async (t) => {
  const db = new PGlite(),
    admin = uuid(),
    outsider = uuid(),
    other = uuid(),
    person = uuid(),
    person2 = uuid(),
    voice = uuid();
  let seq = 0;
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    for (const id of [admin, outsider, other])
      await db.query('insert into auth.users values($1)', [id]);
    for (const id of [admin, other])
      await db.query(
        "insert into public.admin_profiles(user_id,display_name) values($1,'QA')",
        [id],
      );
    const q = async (sql, args = [], actor = admin, role = 'authenticated') => {
      await db.exec(`begin;set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        actor,
      ]);
      try {
        const r = await db.query(sql, args);
        await db.exec('commit');
        return r.rows;
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    };
    for (const id of [person, person2])
      await q(
        "insert into public.people(id,full_name,created_by,updated_by) values($1,'QA Persona',$2,$2)",
        [id, admin],
        admin,
        'postgres',
      );
    const music = async (action, id, version, data) =>
      (
        await q('select public.music_command($1,$2,$3,$4,$5) r', [
          uuid(),
          action,
          id,
          version,
          JSON.stringify(data),
        ])
      )[0].r;
    await music('VOICE_SAVE', voice, null, {
      code: 'CLA1',
      name: 'Clarinete primero',
      archived: false,
    });
    const folder = async () => {
      const id = uuid();
      await music('FOLDER_SAVE', id, null, {
        code: 'PRO-CLA1-' + ++seq,
        repertoire_code: 'PRO',
        voice_id: voice,
        manually_blocked: false,
        archived: false,
      });
      return id;
    };
    const garment = async () => {
      const id = uuid();
      await q(
        "insert into public.garments(id,code,garment_type_id,size,created_by,updated_by) values($1,$2,(select id from public.garment_types where name='Chaqueta'),'40',$3,$3)",
        [id, 'QA-' + ++seq, admin],
        admin,
        'postgres',
      );
      return id;
    };
    const date = async (days) =>
      (
        await db.query(
          `select to_char((now()+($1::int*interval '1 day')) at time zone 'Europe/Madrid','YYYY-MM-DD"T"HH24:MI') d`,
          [days],
        )
      ).rows[0].d;
    const folderLine = async (id, due = null) => ({
      id: uuid(),
      version: null,
      data: {
        folder_id: id,
        folder_version: (
          await db.query(
            'select version from public.music_folders where id=$1',
            [id],
          )
        ).rows[0].version,
        person_id: person,
        due_local: due,
        notes: null,
        reserved: false,
      },
    });
    const data = (garments = [], folders = [], action = 'DELIVER') => ({
      action,
      person_id: person,
      notes: 'Operación QA',
      garments,
      folders,
    });
    const preview = async (d, actor = admin) =>
      (
        await q(
          'select public.preview_material_operation($1) r',
          [JSON.stringify(d)],
          actor,
        )
      )[0].r;
    const apply = async (
      p,
      request = uuid(),
      signature = true,
      ack = true,
      actor = admin,
    ) =>
      (
        await q(
          'select public.apply_material_operation($1,$2,$3,$4) r',
          [request, JSON.stringify(p), signature, ack],
          actor,
        )
      )[0].r;
    const held = async () =>
      await q(
        'select * from public.material_held where person_id=$1 order by code',
        [person],
      );
    const returns = (rows) =>
      data(
        rows
          .filter((r) => r.domain === 'GARMENT')
          .map((r) => ({ id: r.id, version: r.version, state: 'DISPONIBLE' })),
        rows
          .filter((r) => r.domain === 'FOLDER')
          .map((r) => ({
            id: r.loan_id,
            version: r.version,
            data: {
              folder_version: r.asset_version,
              notes: null,
              incident: null,
            },
          })),
        'RETURN',
      );
    let mixed, mixedResult, folderId, garmentId, secondGarment;
    await t.test(
      'entrega mixta: una confirmación, movimientos especializados y fechas distintas',
      async () => {
        garmentId = await garment();
        secondGarment = await garment();
        folderId = await folder();
        mixed = await preview(
          data(
            [
              { id: garmentId, version: 1, due_local: await date(2) },
              { id: secondGarment, version: 1, due_local: null },
            ],
            [await folderLine(folderId, await date(5))],
          ),
        );
        mixedResult = await apply(mixed);
        const rows = await held();
        assert.equal(rows.length, 3);
        assert.equal(new Set(rows.map((r) => r.due_at)).size, 3);
        assert.equal(
          (
            await q(
              'select * from public.loan_movements where material_operation_id=$1',
              [mixedResult.id],
            )
          ).length,
          2,
        );
        assert.equal(
          (
            await q(
              'select * from public.material_operations where parent_operation_id=$1',
              [mixedResult.id],
            )
          ).length,
          1,
        );
      },
    );
    await t.test(
      'firma obligatoria y reintentos idempotentes ligados al actor',
      async () => {
        assert.deepEqual(await apply(mixed, mixedResult.id), mixedResult);
        await assert.rejects(apply(mixed, uuid(), false), /SIGNATURE_REQUIRED/);
        await assert.rejects(
          apply(mixed, mixedResult.id, true, false),
          /REQUEST_ALREADY_USED/,
        );
        await assert.rejects(
          apply(mixed, mixedResult.id, true, true, other),
          /REQUEST_ALREADY_USED/,
        );
        assert.equal((await held()).length, 3);
      },
    );
    await t.test(
      'devolución parcial mixta deja el resto en su poder y mantiene las fechas',
      async () => {
        const before = await held(),
          remaining = before.find((r) => r.asset_id === secondGarment);
        const selected = before.filter((r) => r.asset_id !== secondGarment);
        const p = await preview(returns(selected));
        await apply(p);
        assert.deepEqual(await held(), [remaining]);
      },
    );
    await t.test('solo carpetas y solo prendas siguen admitidas', async () => {
      const id = await folder();
      await apply(await preview(data([], [await folderLine(id)])));
      const g = await garment();
      await apply(
        await preview(data([{ id: g, version: 1, due_local: null }])),
      );
      assert.equal((await held()).length, 3);
    });
    await t.test(
      'agrupa devoluciones de dos prendas de una cesión antigua sin conflictos de versión',
      async () => {
        const a = await garment(),
          b = await garment(),
          c = await garment(),
          loan = uuid();
        await q(
          "select public.record_loan_movement($1,'ENTREGA',$2,null,$3,$4,'[]',null,null,true)",
          [uuid(), loan, person, [a, b, c]],
        );
        const rows = (await held()).filter((r) => r.loan_id === loan);
        await apply(await preview(returns(rows.slice(0, 2))));
        assert.equal(
          (await held()).filter((r) => r.loan_id === loan).length,
          1,
        );
        assert.equal(
          (
            await q('select version,closed_at from public.loans where id=$1', [
              loan,
            ])
          )[0].version,
          2,
        );
      },
    );
    await t.test(
      'rechaza material ajeno, selección duplicada, vacía y datos de firma',
      async () => {
        const rows = await held(),
          d = returns([rows[0]]);
        d.person_id = person2;
        await assert.rejects(preview(d), /ITEM_NOT_OPEN|MUSIC_INVALID_DATA/);
        const g = await garment(),
          line = { id: g, version: 1, due_local: null };
        await assert.rejects(preview(data([line, line])), /MUSIC_INVALID_DATA/);
        await assert.rejects(preview(data()), /MUSIC_INVALID_DATA/);
        await assert.rejects(
          preview({ ...data([line]), signature_image: 'data:image' }),
          /MUSIC_INVALID_DATA/,
        );
      },
    );
    await t.test(
      'un cambio desde la revisión invalida toda la entrega',
      async () => {
        const g = await garment(),
          f = await folder();
        const p = await preview(
          data([{ id: g, version: 1, due_local: null }], [await folderLine(f)]),
        );
        await q(
          'update public.music_folders set version=version+1 where id=$1',
          [f],
          admin,
          'postgres',
        );
        await assert.rejects(apply(p), /MUSIC_CHANGED/);
        assert.equal(
          (await q('select * from public.loan_items where garment_id=$1', [g]))
            .length,
          0,
        );
      },
    );
    await t.test(
      'fallo al escribir carpeta revierte prendas, cabecera y auditoría',
      async () => {
        const g = await garment(),
          f = await folder(),
          request = uuid();
        const p = await preview(
          data([{ id: g, version: 1, due_local: null }], [await folderLine(f)]),
        );
        await db.exec(
          `create function public.qa_fail() returns trigger language plpgsql as $$begin raise exception 'QA_FAILURE';end$$;create trigger qa_fail before insert on public.folder_loan_items for each row execute function public.qa_fail();`,
        );
        await assert.rejects(apply(p, request), /QA_FAILURE/);
        assert.equal(
          (await q('select * from public.loan_items where garment_id=$1', [g]))
            .length,
          0,
        );
        assert.equal(
          (
            await q('select * from public.material_operations where id=$1', [
              request,
            ])
          ).length,
          0,
        );
        await db.exec(
          'drop trigger qa_fail on public.folder_loan_items;drop function public.qa_fail()',
        );
        await apply(p, request);
        assert.equal(
          (await q('select * from public.loan_items where garment_id=$1', [g]))
            .length,
          1,
        );
      },
    );
    await t.test(
      'fallo en devolución de carpeta revierte también la devolución de prenda',
      async () => {
        const rows = await held(),
          g = rows.find((r) => r.domain === 'GARMENT'),
          f = rows.find((r) => r.domain === 'FOLDER');
        const p = await preview(returns([g, f]));
        await db.exec(
          `create function public.qa_fail() returns trigger language plpgsql as $$begin raise exception 'QA_FAILURE';end$$;create trigger qa_fail before update on public.folder_loan_items for each row execute function public.qa_fail();`,
        );
        await assert.rejects(apply(p), /QA_FAILURE/);
        assert.equal(
          (await held()).filter((r) => r.id === g.id || r.id === f.id).length,
          2,
        );
        await db.exec(
          'drop trigger qa_fail on public.folder_loan_items;drop function public.qa_fail()',
        );
      },
    );
    await t.test('cumple una reserva de carpeta sin duplicarla', async () => {
      const f = await folder(),
        id = uuid(),
        d = {
          folder_id: f,
          folder_version: 1,
          person_id: person,
          start_local: await date(1),
          due_local: await date(3),
          notes: null,
        };
      const p = (
        await q("select public.preview_folder_loan('RESERVE',$1,null,$2) r", [
          id,
          JSON.stringify(d),
        ])
      )[0].r;
      await q('select public.apply_folder_loan($1,$2,false,true)', [
        uuid(),
        JSON.stringify(p),
      ]);
      const line = await folderLine(f, await date(3));
      line.id = id;
      line.version = 1;
      line.data.reserved = true;
      await apply(await preview(data([], [line])));
      assert.ok(
        (
          await q(
            'select fulfilled_at from public.folder_reservations where id=$1',
            [id],
          )
        )[0].fulfilled_at,
      );
    });

    await t.test(
      'los avisos requieren aceptación sin bloquear el uso de una carpeta',
      async () => {
        const f = await folder();
        await music('PHYSICAL_SAVE', uuid(), null, {
          folder_id: f,
          folder_version: 1,
          kind: 'ELASTICS',
          description: 'Revisar elástico',
          blocks_use: false,
        });
        const p = await preview(data([], [await folderLine(f)]));
        assert.ok(p.warnings.length > 0);
        assert.equal(p.conflicts.length, 0);
        await assert.rejects(
          apply(p, uuid(), true, false),
          /FOLDER_ACK_REQUIRED/,
        );
        await apply(p);
      },
    );
    await t.test(
      'limita la operación a 30 elementos antes de consultar el material',
      async () => {
        await assert.rejects(
          preview(
            data(
              Array.from({ length: 31 }, () => ({
                id: uuid(),
                version: 1,
                due_local: null,
              })),
            ),
          ),
          /MUSIC_INVALID_DATA/,
        );
      },
    );
    await t.test(
      'RLS y RPC: anónimo y usuario sin perfil no pueden operar',
      async () => {
        const g = await garment(),
          d = data([{ id: g, version: 1, due_local: null }]);
        await assert.rejects(preview(d, outsider), /ADMIN_REQUIRED/);
        await assert.rejects(
          q(
            'select public.preview_material_operation($1)',
            [JSON.stringify(d)],
            outsider,
            'anon',
          ),
          /permission denied/,
        );
        assert.equal(
          (await q('select * from public.material_held', [], outsider)).length,
          0,
        );
        await assert.rejects(
          q('update public.material_operations set signature_confirmed=true'),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
