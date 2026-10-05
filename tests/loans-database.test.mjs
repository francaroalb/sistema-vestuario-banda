import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Cesiones, posesión única y movimientos atómicos', async (t) => {
  const db = new PGlite();
  const admin = randomUUID(),
    second = randomUUID(),
    outsider = randomUUID(),
    person = randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
   insert into auth.users values('${admin}'),('${second}'),('${outsider}');`);
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    await db.exec(
      `insert into public.admin_profiles(user_id,display_name) values('${admin}','Fran'),('${second}','Manuel');`,
    );
    async function asUser(
      sql,
      params = [],
      actor = admin,
      role = 'authenticated',
    ) {
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
    }
    await asUser('select public.save_person($1,null,$2,$3,null,null,null)', [
      person,
      'Juan Ruiz',
      'REFUERZO',
    ]);
    const type = (
      await db.query(
        "select id from public.garment_types where name='Chaqueta'",
      )
    ).rows[0].id;
    const garments = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (let i = 0; i < garments.length; i++)
      await asUser('select public.save_garment($1,null,$2,$3,$4,$5,null)', [
        garments[i],
        'C-' + i,
        type,
        '48',
        'DISPONIBLE',
      ]);
    const loan = randomUUID(),
      request = randomUUID();
    const input = {
      request,
      kind: 'ENTREGA',
      loan,
      version: null,
      person,
      garments: garments.slice(0, 2),
      returns: [],
      due: null,
      notes: 'Prueba',
      signed: true,
    };
    const move = (patch = {}, actor = admin) => {
      const p = { ...input, ...patch };
      return asUser(
        'select * from public.record_loan_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          p.request,
          p.kind,
          p.loan,
          p.version,
          p.person,
          p.garments,
          JSON.stringify(p.returns),
          p.due,
          p.notes,
          p.signed,
        ],
        actor,
      );
    };
    const items = () =>
      asUser('select * from public.loan_items where loan_id=$1 order by code', [
        loan,
      ]);
    await t.test('sin autorización ni firma no hay entrega', async () => {
      await assert.rejects(move({}, outsider), /ADMIN_REQUIRED/);
      await assert.rejects(move({ signed: false }), /SIGNATURE_REQUIRED/);
      await assert.rejects(
        asUser('select * from public.loan_overview', [], '', 'anon'),
        /permission denied/,
      );
      assert.deepEqual(
        await asUser('select * from public.loan_overview', [], outsider),
        [],
      );
    });
    await t.test(
      'valida selección vacía y duplicada; fechas pasadas e inexistentes o ambiguas Madrid',
      async () => {
        await assert.rejects(move({ garments: [] }), /INVALID_MOVEMENT/);
        await assert.rejects(
          move({ garments: [garments[0], garments[0]] }),
          /DUPLICATE_SELECTION/,
        );
        for (const due of [
          '2000-01-01T12:00',
          '2027-03-28T02:30',
          '2027-10-31T02:30',
          'invalid',
        ])
          await assert.rejects(move({ due }), /INVALID_DUE_DATE/);
        assert.equal((await asUser('select * from public.loans')).length, 0);
      },
    );
    await t.test(
      'entrega varias prendas sin fecha; movimiento y firma sin imagen',
      async () => {
        const [row] = await move();
        assert.equal(row.person_id, person);
        assert.equal(row.due_at, null);
        assert.equal(row.closed_at, null);
        const [m] = await asUser('select * from public.loan_movements');
        assert.equal(m.signature_confirmed, true);
        assert.equal(m.actor_id, admin);
        assert.equal(m.details.delivered.length, 2);
        assert.equal(m.details.delivered[0].size, '48');
        assert(!('signature' in m));
        const [summary] = await asUser(
          'select * from public.inventory_summary()',
        );
        assert.equal(Number(summary.held_count), 2);
        assert.equal(Number(summary.available_count), 2);
      },
    );
    await t.test(
      'reintento no duplica y no acepta cambiar una petición ya confirmada',
      async () => {
        await move();
        assert.equal((await items()).length, 2);
        assert.equal(
          (await asUser('select * from public.loan_movements')).length,
          1,
        );
        await assert.rejects(
          move({ notes: 'Otra nota' }),
          (e) => e.code === 'PT409',
        );
      },
    );
    await t.test(
      'evita doble posesión, borrado de movimientos y archivo con prendas pendientes',
      async () => {
        await assert.rejects(
          move({
            request: randomUUID(),
            loan: randomUUID(),
            garments: [garments[0]],
          }),
          /GARMENT_IN_CUSTODY/,
        );
        await assert.rejects(
          asUser('select public.set_garment_archived($1,1,true)', [
            garments[0],
          ]),
          /GARMENT_IN_CUSTODY/,
        );
        await assert.rejects(
          asUser('select public.set_person_archived($1,1,true)', [person]),
          /PERSON_HAS_LOANS/,
        );
        for (const table of ['loans', 'loan_items', 'loan_movements'])
          await assert.rejects(
            asUser('delete from public.' + table),
            /permission denied/,
          );
      },
    );
    let firstItem;
    await t.test(
      'devolución parcial mantiene cesión abierta y cambia estado físico',
      async () => {
        firstItem = (await items())[0];
        const [row] = await move(
          {
            request: randomUUID(),
            kind: 'DEVOLUCION',
            version: 1,
            person: null,
            garments: [],
            returns: [{ item_id: firstItem.id, state: 'PENDIENTE_LAVANDERIA' }],
            notes: null,
          },
          second,
        );
        assert.equal(row.closed_at, null);
        assert.equal(row.version, 2);
        assert.equal(
          (
            await asUser(
              'select physical_state from public.garments where id=$1',
              [firstItem.garment_id],
            )
          )[0].physical_state,
          'PENDIENTE_LAVANDERIA',
        );
        const [m] = await asUser(
          "select * from public.loan_movements where kind='DEVOLUCION'",
        );
        assert.equal(m.actor_name, 'Manuel');
        assert.equal(m.details.returned.length, 1);
      },
    );
    await t.test(
      'rechaza versiones antiguas, dobles devoluciones y líneas de otra cesión',
      async () => {
        const base = {
          request: randomUUID(),
          kind: 'DEVOLUCION',
          person: null,
          garments: [],
          notes: null,
          returns: [{ item_id: firstItem.id, state: 'DISPONIBLE' }],
        };
        await assert.rejects(move({ ...base, version: 1 }), /LOAN_CHANGED/);
        await assert.rejects(move({ ...base, version: 2 }), /ITEM_NOT_OPEN/);
        await assert.rejects(
          move({
            ...base,
            version: 2,
            returns: [{ item_id: randomUUID(), state: 'DISPONIBLE' }],
          }),
          /ITEM_NOT_OPEN/,
        );
        await assert.rejects(
          move({
            ...base,
            version: 2,
            returns: [
              {
                item_id: firstItem.id,
                state: 'DISPONIBLE',
                signature: 'data:image/png',
              },
            ],
          }),
          /INVALID_MOVEMENT/,
        );
      },
    );
    await t.test(
      'cambio fallido revierte todo; cambio válido conserva cesión e histórico',
      async () => {
        const old = (await items()).find((i) => !i.returned_at);
        const patch = {
          request: randomUUID(),
          kind: 'CAMBIO',
          person: null,
          version: 2,
          notes: null,
          garments: [firstItem.garment_id],
          returns: [{ item_id: old.id, state: 'DANADA' }],
        };
        await assert.rejects(move(patch), /GARMENT_NOT_READY/);
        assert.equal(
          (await items()).find((i) => i.id === old.id).returned_at,
          null,
        );
        const [row] = await move({ ...patch, garments: [garments[2]] });
        assert.equal(row.id, loan);
        assert.equal(row.closed_at, null);
        assert.equal(row.version, 3);
        const rows = await items();
        assert.equal(rows.length, 3);
        assert.equal(rows.filter((i) => !i.returned_at).length, 1);
        assert.equal(
          rows.find((i) => i.id === old.id).returned_state,
          'DANADA',
        );
      },
    );
    await t.test(
      'última devolución cierra cesión; histórico conserva talla y código originales',
      async () => {
        const open = (await items()).find((i) => !i.returned_at);
        await asUser('select public.save_garment($1,1,$2,$3,$4,$5,null)', [
          open.garment_id,
          'CODIGO-NUEVO',
          type,
          '50',
          'DISPONIBLE',
        ]);
        const [row] = await move({
          request: randomUUID(),
          kind: 'DEVOLUCION',
          person: null,
          version: 3,
          notes: null,
          garments: [],
          returns: [{ item_id: open.id, state: 'DISPONIBLE' }],
        });
        assert(row.closed_at);
        assert.equal((await items()).find((i) => i.id === open.id).code, 'C-2');
        assert.equal((await items()).find((i) => i.id === open.id).size, '48');
        await asUser('select public.set_person_archived($1,1,true)', [person]);
      },
    );
    await t.test(
      'entrega con fecha Madrid y revocación de administrador',
      async () => {
        await asUser('select public.set_person_archived($1,2,false)', [person]);
        const [row] = await move({
          request: randomUUID(),
          loan: randomUUID(),
          garments: [garments[3]],
          due: '2090-01-10T12:00',
        });
        assert.equal(
          new Date(row.due_at).toISOString(),
          '2090-01-10T11:00:00.000Z',
        );
        await db.exec(
          `update public.admin_profiles set active=false where user_id='${admin}'`,
        );
        assert.deepEqual(await asUser('select * from public.loan_items'), []);
        await assert.rejects(move(), /ADMIN_REQUIRED/);
      },
    );
  } finally {
    await db.close();
  }
});
