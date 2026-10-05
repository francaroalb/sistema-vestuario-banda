import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Integridad y autorización del inventario en PostgreSQL', async (t) => {
  const db = new PGlite();
  const admin = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const outsider = '33333333-3333-4333-8333-333333333333';
  const garment = '44444444-4444-4444-8444-444444444444';
  const other = '55555555-5555-4555-8555-555555555555';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${admin}'), ('${second}'), ('${outsider}');`);
    for (const file of [
      '20261005000100_admin_access.sql',
      '20261005000200_inventory.sql',
      '20261005000300_inventory_conflict_response.sql',
    ]) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    }
    await db.exec(
      `insert into public.admin_profiles (user_id,display_name) values ('${admin}','Fran'),('${second}','Manuel');`,
    );
    const type = (
      await db.query(
        "select id from public.garment_types where name='Chaqueta'",
      )
    ).rows[0].id;
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
    const save = (
      id,
      version,
      code = ' c-05-48 ',
      state = 'DISPONIBLE',
      actor = admin,
      size = ' 48 ',
      notes = ' Botón revisado ',
    ) =>
      asUser(actor, 'select * from public.save_garment($1,$2,$3,$4,$5,$6,$7)', [
        id,
        version,
        code,
        type,
        size,
        state,
        notes,
      ]);

    await t.test(
      'anon y usuarios sin perfil no pueden leer ni escribir inventario',
      async () => {
        await assert.rejects(
          asUser('', 'select * from public.garments', [], 'anon'),
          /permission denied/,
        );
        await assert.rejects(
          asUser('', 'select public.inventory_summary()', [], 'anon'),
          /permission denied/,
        );
        assert.deepEqual(
          await asUser(outsider, 'select * from public.garment_types'),
          [],
        );
        await assert.rejects(
          save(garment, null, 'C-05-48', 'DISPONIBLE', outsider),
          /ADMIN_REQUIRED/,
        );
      },
    );
    await t.test(
      'alta individual normaliza código y talla; actor y hora salen del servidor',
      async () => {
        const [row] = await save(garment, null);
        assert.equal(row.code, 'C-05-48');
        assert.equal(row.size, '48');
        assert.equal(row.notes, 'Botón revisado');
        assert.equal(row.version, 1);
        assert.equal(row.created_by, admin);
        assert(row.created_at);
        const [audit] = await asUser(admin, 'select * from public.audit_log');
        assert.equal(audit.actor_name, 'Fran');
        assert.equal(audit.action, 'PRENDA_CREADA');
        assert.equal(audit.before_data, null);
        assert.equal(audit.after_data.code, 'C-05-48');
      },
    );
    await t.test(
      'reintento de alta no duplica prenda ni auditoría',
      async () => {
        await save(garment, null);
        assert.equal(
          (await asUser(admin, 'select * from public.audit_log')).length,
          1,
        );
        await assert.rejects(save(garment, null, 'OTRO'), /GARMENT_CHANGED/);
      },
    );
    await t.test(
      'código único incluso con distinta capitalización o espacios',
      async () => {
        await assert.rejects(
          save(other, null, 'c-05-48'),
          /garments_code_unique/,
        );
        assert.equal(
          (await asUser(admin, 'select * from public.garments')).length,
          1,
        );
        assert.equal(
          (await asUser(admin, 'select * from public.audit_log')).length,
          1,
        );
      },
    );
    await t.test(
      'rechaza vacíos, longitudes excesivas, tipos inexistentes y estados ajenos',
      async () => {
        for (const code of ['', '   ', 'A'.repeat(61)])
          await assert.rejects(save(other, null, code), /INVALID_GARMENT/);
        await assert.rejects(
          save(other, null, 'OTRO', 'DISPONIBLE', admin, ' '),
          /INVALID_GARMENT/,
        );
        await assert.rejects(
          save(other, null, 'OTRO', 'DISPONIBLE', admin, 'S'.repeat(21)),
          /INVALID_GARMENT/,
        );
        await assert.rejects(
          save(other, null, 'OTRO', 'DISPONIBLE', admin, 'S', 'a'.repeat(2001)),
          /INVALID_GARMENT/,
        );
        await assert.rejects(
          save(other, null, 'OTRO', 'CEDIDA'),
          /invalid input value/,
        );
        await assert.rejects(
          asUser(
            admin,
            'select * from public.save_garment($1,null,$2,$3,$4,$5,null)',
            [other, 'OTRO', outsider, 'M', 'DISPONIBLE'],
          ),
          /INVALID_GARMENT_TYPE/,
        );
      },
    );
    await t.test(
      'edición y cambio físico conservan antes/después y nuevo responsable',
      async () => {
        const [row] = await save(
          garment,
          1,
          'C-05-48',
          'PENDIENTE_LAVANDERIA',
          second,
        );
        assert.equal(row.version, 2);
        assert.equal(row.created_by, admin);
        assert.equal(row.updated_by, second);
        const [audit] = await asUser(
          admin,
          "select * from public.audit_log where action='PRENDA_EDITADA'",
        );
        assert.equal(audit.actor_name, 'Manuel');
        assert.equal(audit.before_data.physical_state, 'DISPONIBLE');
        assert.equal(audit.after_data.physical_state, 'PENDIENTE_LAVANDERIA');
        await assert.rejects(
          save(garment, 1, 'C-05-48', 'DANADA'),
          /GARMENT_CHANGED/,
        );
        const [current] = await asUser(admin, 'select * from public.garments');
        assert.equal(current.physical_state, 'PENDIENTE_LAVANDERIA');
      },
    );
    await t.test('sin cambios no crea ruido de auditoría', async () => {
      const [row] = await save(garment, 2, 'C-05-48', 'PENDIENTE_LAVANDERIA');
      assert.equal(row.version, 2);
      assert.equal(
        (await asUser(admin, 'select * from public.audit_log')).length,
        2,
      );
    });
    await t.test(
      'archivar conserva datos y código; reactivar recupera la misma prenda',
      async () => {
        const [archived] = await asUser(
          admin,
          'select * from public.set_garment_archived($1,2,true)',
          [garment],
        );
        assert(archived.archived_at);
        assert.equal(archived.archived_by, admin);
        assert.equal(archived.version, 3);
        await assert.rejects(save(garment, 3), /GARMENT_ARCHIVED/);
        await assert.rejects(save(other, null), /garments_code_unique/);
        const [summary] = await asUser(
          admin,
          'select * from public.inventory_summary()',
        );
        assert.equal(Number(summary.active_count), 0);
        assert.equal(Number(summary.archived_count), 1);
        await assert.rejects(
          asUser(
            admin,
            'select * from public.set_garment_archived($1,2,false)',
            [garment],
          ),
          /GARMENT_CHANGED/,
        );
        const [restored] = await asUser(
          admin,
          'select * from public.set_garment_archived($1,3,false)',
          [garment],
        );
        assert.equal(restored.id, garment);
        assert.equal(restored.archived_at, null);
        assert.equal(restored.version, 4);
        assert.equal(
          (await asUser(admin, 'select * from public.audit_log')).length,
          4,
        );
      },
    );
    await t.test(
      'RLS impide acceso al desactivar un admin con sesión aún válida',
      async () => {
        await db.exec(
          `update public.admin_profiles set active=false where user_id='${second}'`,
        );
        for (const table of ['garments', 'audit_log', 'garment_types'])
          assert.deepEqual(
            await asUser(second, 'select * from public.' + table),
            [],
          );
        await assert.rejects(
          save(other, null, 'OTRO', 'DISPONIBLE', second),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(
          asUser(
            second,
            'select * from public.set_garment_archived($1,4,true)',
            [garment],
          ),
          /ADMIN_REQUIRED/,
        );
      },
    );
    await t.test(
      'escrituras directas y borrado de histórico denegados incluso a ADMIN',
      async () => {
        for (const sql of [
          'update public.garments set version=99',
          'delete from public.garments',
          'delete from public.audit_log',
          "update public.audit_log set actor_name='Falso'",
          "insert into public.garment_types(name) values ('Intruso')",
        ]) {
          await assert.rejects(asUser(admin, sql), /permission denied/);
        }
      },
    );
    await t.test(
      'resumen separa los tres estados físicos y archivadas',
      async () => {
        await save(other, null, 'LIBRE-M', 'DANADA', admin, 'm');
        const [summary] = await asUser(
          admin,
          'select * from public.inventory_summary()',
        );
        assert.equal(Number(summary.active_count), 2);
        assert.equal(Number(summary.laundry_count), 1);
        assert.equal(Number(summary.damaged_count), 1);
        assert.equal(Number(summary.available_count), 0);
      },
    );
  } finally {
    await db.close();
  }
});
