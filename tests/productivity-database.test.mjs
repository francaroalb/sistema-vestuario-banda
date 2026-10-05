import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Productividad: revisión, atomicidad, permisos y copias', async (t) => {
  const db = new PGlite(),
    admin = uuid(),
    outsider = uuid();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${admin}'),('${outsider}');`,
    );
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    await db.query(
      'insert into public.admin_profiles(user_id,display_name) values($1,$2)',
      [admin, 'Admin'],
    );
    const user = async (
      sql,
      params = [],
      actor = admin,
      role = 'authenticated',
    ) => {
      await db.exec(
        `begin;set local role ${role};select set_config('request.jwt.claim.sub','${actor}',true);`,
      );
      try {
        const r = await db.query(sql, params);
        await db.exec('commit');
        return r.rows;
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    };
    const preview = async (kind, rows) =>
      (
        await user('select public.preview_import($1,$2) r', [
          kind,
          JSON.stringify(rows),
        ])
      )[0].r;
    const apply = async (p, id = uuid()) =>
      (
        await user('select public.apply_import($1,$2) r', [
          id,
          JSON.stringify(p),
        ])
      )[0].r;
    const person = {
      name: 'Persona importada',
      kind: 'BANDA',
      instrument: 'Clarinete',
      phone: '',
      notes: 'Prueba',
    };
    const garment = {
      code: 'C01-40',
      type: 'Chaqueta',
      size: '40',
      state: 'DISPONIBLE',
      notes: '',
    };
    await t.test(
      'vista previa no escribe y aplicar crea registros auditados una sola vez',
      async () => {
        const p = await preview('people', [person]);
        assert.deepEqual(p.errors, []);
        assert.equal(
          (await user('select count(*) n from public.people'))[0].n,
          0,
        );
        const request = uuid(),
          r = await apply(p, request);
        assert.equal(r.count, 1);
        assert.deepEqual(await apply(p, request), r);
        assert.equal(
          (await user('select count(*) n from public.audit_log'))[0].n,
          1,
        );
        assert.equal(
          (await user('select count(*) n from public.loan_movements'))[0].n,
          0,
        );
        await assert.rejects(
          apply({ ...p, rows: [] }, request),
          /REQUEST_ALREADY_USED/,
        );
        await apply(await preview('garments', [garment]));
      },
    );
    await t.test(
      'duplicados, campos inválidos y cambios posteriores impiden escrituras parciales',
      async () => {
        assert.equal((await preview('people', [person])).errors.length, 1);
        assert.equal(
          (await preview('garments', [garment, garment])).errors.length,
          2,
        );
        const fresh = await preview('garments', [
          { ...garment, code: 'C02-40' },
        ]);
        await apply(fresh);
        await assert.rejects(apply(fresh), /IMPORT_CHANGED/);
        const invalid = await preview('garments', [
          { ...garment, code: 'C03-40' },
          { ...garment, code: 'C04-40', size: '' },
        ]);
        await assert.rejects(apply(invalid), /IMPORT_CHANGED/);
        assert.equal(
          (
            await user(
              "select count(*) n from public.garments where code='C03-40'",
            )
          )[0].n,
          0,
        );
        await assert.rejects(
          preview('people', Array(201).fill(person)),
          /INVALID_IMPORT/,
        );
      },
    );
    const type = (
      await user("select id from public.garment_types where name='Chaqueta'")
    )[0].id;
    const uniform = uuid(),
      source = uuid(),
      events = [uuid(), uuid()];
    await user("select public.plan_event($1,'UNIFORM',$2,null,$3)", [
      uuid(),
      uniform,
      JSON.stringify({ name: 'Invierno', type_ids: [type] }),
    ]);
    await user("select public.plan_series($1,'SERIES',$2,null,$3)", [
      uuid(),
      source,
      JSON.stringify({ name: 'Origen' }),
    ]);
    for (let i = 0; i < 2; i++) {
      await user("select public.plan_event($1,'EVENT',$2,null,$3)", [
        uuid(),
        events[i],
        JSON.stringify({
          title: 'Actuación ' + i,
          uniform_id: uniform,
          starts: `2090-04-0${2 + i}T18:00`,
          ends: `2090-04-0${2 + i}T20:00`,
          from: `2090-04-0${2 + i}T16:00`,
          until: `2090-04-0${2 + i}T22:00`,
        }),
      ]);
      const version = (
        await user('select version from public.event_series where id=$1', [
          source,
        ])
      )[0].version;
      await user("select public.plan_series($1,'MEMBERSHIP',$2,$3,$4)", [
        uuid(),
        source,
        version,
        JSON.stringify({ event_id: events[i], event_version: 1, active: true }),
      ]);
    }
    const copy = async (date = '2091-04-01') =>
      (
        await user('select public.preview_series_copy($1,$2,$3) r', [
          source,
          'Copia',
          date,
        ])
      )[0].r;
    const confirm = async (p, id = uuid()) =>
      (
        await user('select public.apply_series_copy($1,$2) r', [
          id,
          JSON.stringify(p),
        ])
      )[0].r;
    await t.test(
      'copia solo agenda, mantiene hora de Madrid y es idempotente',
      async () => {
        const p = await copy();
        assert.equal(p.events[0].data.starts, '2091-04-01T18:00');
        assert.equal(p.events[1].data.starts, '2091-04-02T18:00');
        const request = uuid(),
          r = await confirm(p, request);
        assert.deepEqual(await confirm(p, request), r);
        assert.equal(
          (
            await user(
              'select count(*) n from public.events where series_id=$1',
              [r.id],
            )
          )[0].n,
          2,
        );
        assert.equal(
          (
            await user(
              'select count(*) n from public.event_participants ep join public.events e on ep.event_id=e.id where e.series_id=$1',
              [r.id],
            )
          )[0].n,
          0,
        );
        assert.equal(
          (await user('select count(*) n from public.loan_movements'))[0].n,
          0,
        );
        await assert.rejects(
          confirm({ ...p, name: 'Otra' }, request),
          /REQUEST_ALREADY_USED/,
        );
      },
    );
    await t.test(
      'rechaza copia manipulada y agenda modificada tras la revisión',
      async () => {
        const p = await copy();
        await assert.rejects(
          confirm({ ...p, source_version: 999 }),
          /COPY_CHANGED/,
        );
        await db.query(
          'update public.events set version=version+1 where id=$1',
          [events[0]],
        );
        await assert.rejects(confirm(p), /COPY_CHANGED/);
      },
    );
    await t.test(
      'usuario ajeno y anónimo no importan, copian ni leen auditoría',
      async () => {
        await assert.rejects(
          user(
            'select public.preview_import($1,$2)',
            ['people', JSON.stringify([person])],
            outsider,
          ),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(
          user(
            'select public.apply_import($1,$2)',
            [
              uuid(),
              JSON.stringify({ kind: 'people', rows: [person], errors: [] }),
            ],
            outsider,
          ),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(
          user(
            'select public.preview_series_copy($1,$2,$3)',
            [source, 'Otra', '2091-04-01'],
            outsider,
          ),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(
          user(
            'select public.apply_series_copy($1,$2)',
            [uuid(), JSON.stringify(await copy())],
            outsider,
          ),
          /ADMIN_REQUIRED/,
        );
        assert.equal(
          (await user('select * from public.audit_log', [], outsider)).length,
          0,
        );
        await assert.rejects(
          user(
            'select public.preview_import($1,$2)',
            ['people', JSON.stringify([person])],
            outsider,
            'anon',
          ),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
