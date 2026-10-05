import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Series: Semana Santa, seis actuaciones y diez refuerzos', async (t) => {
  const db = new PGlite();
  const admin = uuid(),
    outsider = uuid(),
    series = uuid(),
    uniform = uuid(),
    events = Array.from({ length: 6 }, uuid),
    people = Array.from({ length: 10 }, uuid),
    garments = Array.from({ length: 12 }, uuid);
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${admin}'),('${outsider}');`,
    );
    for (const f of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + f, 'utf8'));
    await db.query(
      'insert into public.admin_profiles(user_id,display_name) values($1,$2)',
      [admin, 'Admin'],
    );
    async function user(
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
    const erow = async (id) =>
      (await user('select * from public.events where id=$1', [id]))[0];
    const srow = async () =>
      (
        await user('select * from public.event_series where id=$1', [series])
      )[0];
    const ec = async (action, id, version, data, request = uuid()) =>
      (
        await user('select public.plan_event($1,$2,$3,$4,$5) r', [
          request,
          action,
          id,
          version,
          JSON.stringify(data),
        ])
      )[0].r;
    const sc = async (action, data, version, request = uuid(), actor = admin) =>
      (
        await user(
          'select public.plan_series($1,$2,$3,$4,$5) r',
          [
            request,
            action,
            series,
            version === undefined ? ((await srow())?.version ?? null) : version,
            JSON.stringify(data),
          ],
          actor,
        )
      )[0].r;
    const detail = async () =>
      (await user('select public.series_detail($1) r', [series]))[0].r;
    const blocks = async (p) =>
      (await detail()).blocks.filter((b) => b.person_id === p);
    const type = (
      await user("select id from public.garment_types where name='Chaqueta'")
    )[0].id;
    const shirt = (
      await user("select id from public.garment_types where name='Camisa'")
    )[0].id;
    const input = (i) => ({
      title: ['Domingo', 'Martes', 'Miércoles', 'Jueves', 'Madrugá', 'Viernes'][
        i
      ],
      uniform_id: uniform,
      starts: `2090-04-${String([2, 4, 5, 6, 7, 7][i]).padStart(2, '0')}T${i === 4 ? '00:30' : '18:00'}`,
      ends: `2090-04-${String([2, 4, 5, 6, 7, 7][i]).padStart(2, '0')}T${i === 4 ? '03:00' : '20:00'}`,
      from: `2090-04-${String([2, 4, 5, 6, 7, 7][i]).padStart(2, '0')}T${i === 4 ? '00:00' : '16:00'}`,
      until: `2090-04-${String([2, 4, 5, 6, 7, 7][i]).padStart(2, '0')}T${i === 4 ? '04:00' : '22:00'}`,
      notes: '',
    });
    await t.test('ADMIN, RLS, lista cerrada e idempotencia', async () => {
      await assert.rejects(
        sc('SERIES', { name: 'Semana Santa' }, null, uuid(), outsider),
        /ADMIN_REQUIRED/,
      );
      for (const tab of [
        'event_series',
        'series_blocks',
        'planning_occupancy',
      ]) {
        assert.deepEqual(
          await user('select * from public.' + tab, [], outsider),
          [],
        );
        assert.equal(
          (
            await user(
              "select has_table_privilege('authenticated',$1,'DELETE') allowed",
              ['public.' + tab],
            )
          )[0].allowed,
          false,
        );
        await assert.rejects(
          user('delete from public.' + tab),
          /permission denied|cannot delete from view/,
        );
        await assert.rejects(
          user('select * from public.' + tab, [], '', 'anon'),
          /permission denied/,
        );
      }
      await assert.rejects(
        sc('SERIES', { name: 'Semana Santa', signature: 'image' }, null),
        /INVALID_PLAN/,
      );
      const request = uuid(),
        r = await sc('SERIES', { name: 'Semana Santa' }, null, request);
      assert.deepEqual(
        await sc('SERIES', { name: 'Semana Santa' }, null, request),
        r,
      );
      await assert.rejects(
        sc('SERIES', { name: 'Otro' }, null, request),
        /REQUEST_ALREADY_USED/,
      );
      await assert.rejects(
        user('select public.series_detail($1)', [series], outsider),
        /ADMIN_REQUIRED/,
      );
    });
    await ec('UNIFORM', uniform, null, { name: 'Invierno', type_ids: [type] });
    for (let i = 0; i < 6; i++)
      await sc('EVENT_CREATE', { event_id: events[i], event_data: input(i) });
    for (let i = 0; i < 12; i++)
      await user(
        "select public.save_garment($1,null,$2,$3,'48','DISPONIBLE',null)",
        [garments[i], 'C-' + i, type],
      );
    const patterns = [
      [0, 1, 2, 3, 4, 5],
      [0, 1],
      [0, 2, 5],
      [0, 2, 5],
      [2, 3, 4],
      [0],
      [1, 2, 3, 4, 5],
      [0, 1, 4, 5],
      [1, 4],
      [5],
    ];
    await t.test(
      'huecos siempre exigen decisión, sin usar distancia en días',
      async () => {
        const data = {
          person_id: people[2],
          name: 'Refuerzo 2',
          instrument: 'Clarinete',
          event_ids: patterns[2].map((i) => events[i]),
        };
        await assert.rejects(sc('ATTENDANCE', data), /GAP_DECISION_REQUIRED/);
        assert.equal(
          (await user('select * from public.people where id=$1', [people[2]]))
            .length,
          0,
        );
        for (let i = 0; i < 10; i++)
          await sc('ATTENDANCE', {
            person_id: people[i],
            name: 'Refuerzo ' + i,
            instrument: 'Clarinete',
            event_ids: patterns[i].map((j) => events[j]),
            gap_choice: [3, 7].includes(i) ? 'SPLIT' : 'KEEP',
          });
        const d = await detail();
        assert.equal(d.events.length, 6);
        assert.equal(new Set(d.blocks.map((b) => b.person_id)).size, 10);
        assert.equal((await blocks(people[1])).length, 1);
        assert.equal((await blocks(people[1]))[0].gap_choice, 'CONSECUTIVE');
        assert.equal((await blocks(people[2])).length, 1);
        assert.equal((await blocks(people[3])).length, 3);
        assert.equal((await blocks(people[7])).length, 2);
        assert.equal((await user('select * from public.loans')).length, 0);
      },
    );
    const assign = async (p, g) =>
      sc('BLOCK_ASSIGN', {
        block_id: (await blocks(p))[0].id,
        type_id: type,
        garment_id: g,
      });
    await t.test(
      'reserva todo el hueco y bloquea conflictos en ambos sentidos',
      async () => {
        await assign(people[2], garments[0]);
        await assert.rejects(
          assign(people[8], garments[0]),
          /RESERVATION_OVERLAP/,
        );
        const other = uuid();
        await ec('EVENT', other, null, {
          ...input(1),
          title: 'Actuación ajena',
        });
        await ec('PARTICIPANT', other, (await erow(other)).version, {
          person_id: people[9],
        });
        await assert.rejects(
          ec('ASSIGN', other, (await erow(other)).version, {
            person_id: people[9],
            type_id: type,
            garment_id: garments[0],
          }),
          /RESERVATION_OVERLAP/,
        );
        await ec('ASSIGN', other, (await erow(other)).version, {
          person_id: people[9],
          type_id: type,
          garment_id: garments[1],
        });
        await assert.rejects(
          assign(people[2], garments[1]),
          /RESERVATION_OVERLAP/,
        );
        const r = (
          await user('select public.event_garment_choices($1,$2,$3,$4,1) r', [
            events[0],
            people[2],
            type,
            'C-1',
          ])
        )[0].r;
        assert.equal(
          r.rows.find((x) => x.id === garments[1]).blocked,
          'Reservada en ese periodo',
        );
        await assert.rejects(
          ec('ASSIGN', events[0], (await erow(events[0])).version, {
            person_id: people[2],
            type_id: type,
            garment_id: garments[2],
          }),
          /USE_SERIES/,
        );
      },
    );
    await t.test(
      'versiones obsoletas, reintentos y cambios de agenda protegidos',
      async () => {
        const v = (await srow()).version,
          request = uuid(),
          data = {
            block_id: (await blocks(people[0]))[0].id,
            type_id: type,
            garment_id: garments[3],
          };
        const r = await sc('BLOCK_ASSIGN', data, v, request);
        assert.deepEqual(await sc('BLOCK_ASSIGN', data, v, request), r);
        await assert.rejects(
          sc('SERIES', { name: 'Viejo' }, v),
          /PLAN_CHANGED/,
        );
        await assert.rejects(
          sc('MEMBERSHIP', {
            event_id: events[0],
            event_version: (await erow(events[0])).version,
            active: false,
          }),
          /SERIES_PLAN_EXISTS/,
        );
        await assert.rejects(
          ec('EVENT', events[0], (await erow(events[0])).version, {
            ...input(0),
            title: 'Cambio',
          }),
          /SERIES_PLAN_EXISTS/,
        );
        await assert.rejects(
          ec('CANCEL', events[0], (await erow(events[0])).version, {}),
          /SERIES_PLAN_EXISTS/,
        );
      },
    );
    await t.test(
      'una entrega firmada para todo el periodo, sin nuevas firmas entre actuaciones',
      async () => {
        const b = (await blocks(people[2]))[0],
          loan = uuid(),
          v = (await erow(events[0])).version,
          request = uuid();
        const data = {
          person_id: people[2],
          loan_id: loan,
          garment_ids: [garments[0]],
          signed: true,
        };
        await assert.rejects(
          ec('DELIVER', events[0], v, { ...data, signed: false }),
          /SIGNATURE_REQUIRED/,
        );
        const delivered = await ec('DELIVER', events[0], v, data, request);
        assert.deepEqual(
          await ec('DELIVER', events[0], v, data, request),
          delivered,
        );
        const l = (
          await user('select * from public.loans where id=$1', [loan])
        )[0];
        assert.equal(
          new Date(l.due_at).toISOString(),
          new Date(b.planned_until).toISOString(),
        );
        const prep = await user(
          'select * from public.event_preparation where person_id=$1 and block_id=$2',
          [people[2], b.id],
        );
        assert.equal(prep.length, 3);
        assert.ok(prep.every((r) => r.status === 'EN_SU_PODER'));
        assert.equal(prep.filter((r) => r.last_in_block).length, 1);
        assert.equal(
          (
            await user('select * from public.loan_movements where loan_id=$1', [
              loan,
            ])
          ).length,
          1,
        );
        await assert.rejects(
          sc('ATTENDANCE', { person_id: people[2], event_ids: [] }),
          /SERIES_IN_CUSTODY/,
        );
        const items = await user(
          'select * from public.loan_items where loan_id=$1',
          [loan],
        );
        await user(
          "select public.record_loan_movement($1,'DEVOLUCION',$2,$3,null,'{}',$4,null,null,true)",
          [
            uuid(),
            loan,
            l.version,
            JSON.stringify(
              items.map((i) => ({ item_id: i.id, state: 'DISPONIBLE' })),
            ),
          ],
        );
        assert.ok(
          (
            await user(
              'select * from public.event_preparation where person_id=$1 and block_id=$2',
              [people[2], b.id],
            )
          ).every((r) => r.status === 'DEVUELTA'),
        );
        assert.ok(
          (
            await user('select closed_at from public.loans where id=$1', [loan])
          )[0].closed_at,
        );
        await sc('ATTENDANCE', {
          person_id: people[2],
          event_ids: patterns[2].map((j) => events[j]),
          gap_choice: 'KEEP',
        });
        assert.ok(
          (await detail()).rows
            .filter((r) => r.person_id === people[2])
            .every((r) => r.garment_id === null),
        );
        assert.equal(
          (
            await user('select * from public.loan_movements where loan_id=$1', [
              loan,
            ])
          ).length,
          2,
        );
      },
    );
    await t.test(
      'uniformes diferentes, entrega conjunta y devolución parcial real',
      async () => {
        const b = (await blocks(people[0]))[0];
        await assign(people[1], garments[4]);
        const d = await detail();
        assert.equal(d.rows.filter((r) => r.block_id === b.id).length, 1);
        // An independent series with different required types uses the union for its physical period.
        const sid = uuid(),
          u2 = uuid(),
          e1 = uuid(),
          e2 = uuid(),
          p = uuid(),
          shirtGarment = uuid();
        await user("select public.plan_series($1,'SERIES',$2,null,$3)", [
          uuid(),
          sid,
          JSON.stringify({ name: 'Verano e invierno' }),
        ]);
        const cmd = async (action, data) => {
          const ver = (
            await user('select version from public.event_series where id=$1', [
              sid,
            ])
          )[0].version;
          return user('select public.plan_series($1,$2,$3,$4,$5)', [
            uuid(),
            action,
            sid,
            ver,
            JSON.stringify(data),
          ]);
        };
        await ec('UNIFORM', u2, null, { name: 'Verano', type_ids: [shirt] });
        await cmd('EVENT_CREATE', {
          event_id: e1,
          event_data: { ...input(0), title: 'Primera' },
        });
        await cmd('EVENT_CREATE', {
          event_id: e2,
          event_data: { ...input(1), title: 'Segunda', uniform_id: u2 },
        });
        await cmd('ATTENDANCE', {
          person_id: p,
          name: 'Mixto',
          instrument: 'Trompeta',
          event_ids: [e1, e2],
        });
        const bb = (
          await user('select * from public.series_blocks where series_id=$1', [
            sid,
          ])
        )[0];
        assert.equal(bb.type_ids.length, 2);
        await user(
          "select public.save_garment($1,null,'CAM-MIXTA',$2,'M','DISPONIBLE',null)",
          [shirtGarment, shirt],
        );
        await cmd('BLOCK_ASSIGN', {
          block_id: bb.id,
          type_id: shirt,
          garment_id: shirtGarment,
        });
        assert.equal(
          (
            await user(
              'select * from public.event_preparation where event_id=$1 and person_id=$2',
              [e1, p],
            )
          ).length,
          2,
        );
        await cmd('BLOCK_ASSIGN', {
          block_id: bb.id,
          type_id: type,
          garment_id: garments[10],
        });
        const mixedLoan = uuid();
        await ec('DELIVER', e1, (await erow(e1)).version, {
          person_id: p,
          loan_id: mixedLoan,
          garment_ids: [shirtGarment, garments[10]],
          signed: true,
        });
        const mixedItems = await user(
          'select * from public.loan_items where loan_id=$1',
          [mixedLoan],
        );
        const mixedRow = (
          await user('select * from public.loans where id=$1', [mixedLoan])
        )[0];
        await user(
          "select public.record_loan_movement($1,'DEVOLUCION',$2,$3,null,'{}',$4,null,null,true)",
          [
            uuid(),
            mixedLoan,
            mixedRow.version,
            JSON.stringify([
              {
                item_id: mixedItems.find((i) => i.garment_id === shirtGarment)
                  .id,
                state: 'DISPONIBLE',
              },
            ]),
          ],
        );
        assert.equal(
          (
            await user('select closed_at from public.loans where id=$1', [
              mixedLoan,
            ])
          )[0].closed_at,
          null,
        );
        const mixedPrep = await user(
          'select * from public.event_preparation where event_id=$1 and person_id=$2',
          [e2, p],
        );
        assert.equal(
          mixedPrep.find((r) => r.type_id === shirt).status,
          'DEVUELTA',
        );
        assert.equal(
          mixedPrep.find((r) => r.type_id === type).status,
          'EN_SU_PODER',
        );
      },
    );
    await t.test(
      'bloques divididos permiten reutilizar la prenda y liberan los huecos',
      async () => {
        const split = await blocks(people[3]);
        for (const b of split)
          await sc('BLOCK_ASSIGN', {
            block_id: b.id,
            type_id: type,
            garment_id: garments[8],
          });
        await sc('ATTENDANCE', {
          person_id: people[8],
          event_ids: [events[1]],
        });
        await assign(people[8], garments[8]);
        const occupied = await user(
          'select * from public.planning_occupancy where garment_id=$1',
          [garments[8]],
        );
        assert.equal(occupied.length, 4);
        assert.equal(new Set(occupied.map((r) => r.block_id)).size, 4);
      },
    );
    await t.test(
      'auditoría del plan y de las decisiones, sin imágenes de firma',
      async () => {
        const rows = await user(
          "select * from public.audit_log where entity_type='series' and entity_id=$1",
          [series],
        );
        assert.ok(rows.length > 15);
        assert.ok(rows.every((r) => r.actor_id === admin));
        assert.ok(rows.some((r) => r.after_data.change.gap_choice === 'SPLIT'));
        assert.ok(rows.some((r) => r.before_data.blocks.length > 0));
        await db.query(
          'update public.admin_profiles set active=false where user_id=$1',
          [admin],
        );
        assert.deepEqual(await user('select * from public.event_series'), []);
        await assert.rejects(
          sc('SERIES', { name: 'Sin permiso' }, 1),
          /ADMIN_REQUIRED/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
