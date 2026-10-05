import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Personas y continuidad del histórico en PostgreSQL', async (t) => {
  const db = new PGlite();
  const admin = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const outsider = '33333333-3333-4333-8333-333333333333';
  const person = '44444444-4444-4444-8444-444444444444';
  const homonym = '55555555-5555-4555-8555-555555555555';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
   insert into auth.users values ('${admin}'),('${second}'),('${outsider}');`);
    const files = (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files.filter((f) => f < '20261005000400'))
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    await db.exec(
      `insert into public.admin_profiles(user_id,display_name) values('${admin}','Fran'),('${second}','Manuel');`,
    );
    async function asUser(id, sql, params = [], role = 'authenticated') {
      await db.exec(
        `begin; set local role ${role}; select set_config('request.jwt.claim.sub','${id}',true);`,
      );
      try {
        const result = await db.query(sql, params);
        await db.exec('commit');
        return result.rows;
      } catch (error) {
        await db.exec('rollback');
        throw error;
      }
    }
    // Verify additive audit migration with an existing garment and historical event.
    const type = (await db.query('select id from public.garment_types limit 1'))
      .rows[0].id;
    await asUser(
      admin,
      'select public.save_garment($1,null,$2,$3,$4,$5,null)',
      [person, 'HIST-01', type, '48', 'DISPONIBLE'],
    );
    await db.exec(
      await readFile('supabase/migrations/20261005000400_people.sql', 'utf8'),
    );
    await db.exec(
      await readFile('supabase/migrations/20261005000500_loans.sql', 'utf8'),
    );
    const save = (id, version, input = {}, actor = admin) =>
      asUser(actor, 'select * from public.save_person($1,$2,$3,$4,$5,$6,$7)', [
        id,
        version,
        input.name ?? '  Juan   Ruiz  ',
        input.kind ?? 'REFUERZO',
        input.instrument ?? ' Clarinete ',
        input.phone ?? ' ',
        input.notes ?? ' Observación ',
      ]);
    const archive = (version, value) =>
      asUser(admin, 'select * from public.set_person_archived($1,$2,$3)', [
        person,
        version,
        value,
      ]);
    await t.test(
      'conserva auditoría previa y claves foráneas de prendas',
      async () => {
        const [audit] = await asUser(admin, 'select * from public.audit_log');
        assert.equal(audit.garment_id, person);
        assert.equal(audit.person_id, null);
        assert.equal(audit.after_data.code, 'HIST-01');
        await assert.rejects(
          db.exec(`delete from public.garments where id='${person}'`),
          /foreign key/,
        );
      },
    );
    await t.test(
      'anon y cuentas sin autorización no pueden leer ni escribir personas',
      async () => {
        await assert.rejects(
          asUser('', 'select * from public.people', [], 'anon'),
          /permission denied/,
        );
        assert.deepEqual(
          await asUser(outsider, 'select * from public.people'),
          [],
        );
        await assert.rejects(
          save(person, null, {}, outsider),
          /ADMIN_REQUIRED/,
        );
      },
    );
    await t.test(
      'alta normalizada y auditoría de identidad independiente',
      async () => {
        const [row] = await save(person, null);
        assert.equal(row.full_name, 'Juan Ruiz');
        assert.equal(row.instrument, 'Clarinete');
        assert.equal(row.phone, null);
        const [audit] = await asUser(
          admin,
          "select * from public.audit_log where entity_type='person'",
        );
        assert.equal(audit.actor_id, admin);
        assert.equal(audit.person_id, person);
        assert.equal(audit.garment_id, null);
        assert.equal(audit.action, 'PERSONA_CREADA');
        assert.equal(audit.before_data, null);
      },
    );
    await t.test(
      'reintento idempotente y homónimos sin fusionar personas',
      async () => {
        await save(person, null);
        assert.equal(
          (
            await asUser(
              admin,
              "select * from public.audit_log where entity_type='person'",
            )
          ).length,
          1,
        );
        const [other] = await save(homonym, null);
        assert.equal(other.full_name, 'Juan Ruiz');
        assert.notEqual(other.id, person);
        await assert.rejects(
          save(person, null, { name: 'Otro nombre' }),
          (e) => e.code === 'PT409',
        );
      },
    );
    await t.test(
      'valida nombre y longitudes; no admite tipos inventados',
      async () => {
        for (const name of ['', '  ', '\n\t', 'A'.repeat(121)])
          await assert.rejects(
            save(outsider, null, { name }),
            /INVALID_PERSON/,
          );
        for (const input of [
          { instrument: 'A'.repeat(81) },
          { phone: '1'.repeat(41) },
          { notes: 'A'.repeat(2001) },
        ])
          await assert.rejects(save(outsider, null, input), /INVALID_PERSON/);
        await assert.rejects(
          save(outsider, null, { kind: 'INVITADO' }),
          /invalid input/,
        );
      },
    );
    await t.test(
      'cambiar refuerzo a banda conserva UUID e histórico antes/después',
      async () => {
        const [row] = await save(
          person,
          1,
          { kind: 'BANDA', phone: '+34 600 000 000' },
          second,
        );
        assert.equal(row.id, person);
        assert.equal(row.version, 2);
        assert.equal(row.updated_by, second);
        const [audit] = await asUser(
          admin,
          "select * from public.audit_log where person_id=$1 and action='PERSONA_EDITADA'",
          [person],
        );
        assert.equal(audit.before_data.kind, 'REFUERZO');
        assert.equal(audit.after_data.kind, 'BANDA');
        assert.equal(audit.actor_name, 'Manuel');
        await assert.rejects(save(person, 1), (e) => e.code === 'PT409');
      },
    );
    await t.test(
      'sin cambios no añade auditoría y los campos opcionales se pueden vaciar',
      async () => {
        await save(person, 2, { kind: 'BANDA', phone: '+34 600 000 000' });
        assert.equal(
          (
            await asUser(
              admin,
              'select * from public.audit_log where person_id=$1',
              [person],
            )
          ).length,
          2,
        );
        const [row] = await save(person, 2, {
          kind: 'BANDA',
          instrument: ' ',
          notes: '',
          phone: '',
        });
        assert.equal(row.instrument, null);
        assert.equal(row.notes, null);
        assert.equal(row.phone, null);
      },
    );
    await t.test(
      'archivo conserva ficha e histórico; reactivación recupera misma persona',
      async () => {
        await assert.rejects(archive(2, true), (e) => e.code === 'PT409');
        const [row] = await archive(3, true);
        assert(row.archived_at);
        assert.equal(row.archived_by, admin);
        await assert.rejects(save(person, 4), /PERSON_ARCHIVED/);
        await archive(4, true); // no-op
        const [restored] = await archive(4, false);
        assert.equal(restored.id, person);
        assert.equal(restored.archived_at, null);
        assert.equal(restored.kind, 'BANDA');
        const events = await asUser(
          admin,
          'select action from public.audit_log where person_id=$1 order by occurred_at',
          [person],
        );
        assert.deepEqual(
          events.map((e) => e.action),
          [
            'PERSONA_CREADA',
            'PERSONA_EDITADA',
            'PERSONA_EDITADA',
            'PERSONA_ARCHIVADA',
            'PERSONA_REACTIVADA',
          ],
        );
      },
    );
    await t.test(
      'sin borrado desde navegador y sin referencias históricas huérfanas',
      async () => {
        await assert.rejects(
          asUser(admin, 'delete from public.people'),
          /permission denied/,
        );
        await assert.rejects(
          asUser(admin, "update public.people set full_name='Otra'"),
          /permission denied/,
        );
        await assert.rejects(
          asUser(admin, 'delete from public.audit_log'),
          /permission denied/,
        );
        await assert.rejects(
          db.exec(`delete from public.people where id='${person}'`),
          /foreign key/,
        );
        await assert.rejects(
          db.exec(
            `insert into public.audit_log(actor_id,actor_name,action,entity_type,entity_id,after_data) values('${admin}','Fran','PERSONA_CREADA','person','${outsider}','{}')`,
          ),
          /foreign key/,
        );
      },
    );
    await t.test(
      'revocar admin bloquea lecturas y RPC con la misma identidad',
      async () => {
        await db.exec(
          `update public.admin_profiles set active=false where user_id='${admin}'`,
        );
        assert.deepEqual(
          await asUser(admin, 'select * from public.people'),
          [],
        );
        await assert.rejects(save(person, 5), /ADMIN_REQUIRED/);
      },
    );
  } finally {
    await db.close();
  }
});
