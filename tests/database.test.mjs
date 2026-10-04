import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('RLS de administradores sobre PostgreSQL aislado', async (t) => {
  const db = new PGlite();
  const active = '11111111-1111-4111-8111-111111111111';
  const inactive = '22222222-2222-4222-8222-222222222222';
  const outsider = '33333333-3333-4333-8333-333333333333';
  try {
    // Only the Supabase Auth schema/roles are emulated; the migration and RLS run in PostgreSQL.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${active}'), ('${inactive}'), ('${outsider}');
    `);
    await db.exec(
      await readFile(
        'supabase/migrations/20261005000100_admin_access.sql',
        'utf8',
      ),
    );
    await db.exec(
      `insert into public.admin_profiles (user_id,display_name,active) values ('${active}','Activo',true), ('${inactive}','Inactivo',false);`,
    );
    async function asUser(role, id, query) {
      await db.exec(
        `begin; set local role ${role}; select set_config('request.jwt.claim.sub', '${id}', true);`,
      );
      try {
        return await db.query(query);
      } finally {
        await db.exec('rollback');
      }
    }
    await t.test('anon no puede leer perfiles', async () => {
      await assert.rejects(
        asUser('anon', '', 'select * from public.admin_profiles'),
        /permission denied/,
      );
    });
    await t.test('admin activo solo ve su propio perfil', async () => {
      const result = await asUser(
        'authenticated',
        active,
        'select user_id from public.admin_profiles',
      );
      assert.deepEqual(result.rows, [{ user_id: active }]);
    });
    await t.test('usuario sin perfil e inactivo no tienen acceso', async () => {
      for (const id of [inactive, outsider]) {
        assert.deepEqual(
          (
            await asUser(
              'authenticated',
              id,
              'select * from public.admin_profiles',
            )
          ).rows,
          [],
        );
        assert.equal(
          (
            await asUser(
              'authenticated',
              id,
              'select private.is_admin() as allowed',
            )
          ).rows[0].allowed,
          false,
        );
      }
    });
    await t.test(
      'el navegador no puede crear, editar ni borrar administradores',
      async () => {
        for (const query of [
          `insert into public.admin_profiles(user_id,display_name) values ('${outsider}','Intruso')`,
          'update public.admin_profiles set active = true',
          'delete from public.admin_profiles',
        ])
          await assert.rejects(
            asUser('authenticated', active, query),
            /permission denied/,
          );
      },
    );
    await t.test(
      'desactivar un administrador revoca su autorización con el mismo JWT',
      async () => {
        assert.equal(
          (
            await asUser(
              'authenticated',
              active,
              'select private.is_admin() as allowed',
            )
          ).rows[0].allowed,
          true,
        );
        await db.exec(
          `update public.admin_profiles set active=false where user_id='${active}';`,
        );
        assert.equal(
          (
            await asUser(
              'authenticated',
              active,
              'select private.is_admin() as allowed',
            )
          ).rows[0].allowed,
          false,
        );
      },
    );
  } finally {
    await db.close();
  }
});
