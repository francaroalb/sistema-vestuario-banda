import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Conflictos y permanencia de prendas', async (t) => {
  const db = new PGlite(),
    admin = uuid(),
    outsider = uuid();
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
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
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
    const type = (
        await user("select id from public.garment_types where name='Chaqueta'")
      )[0].id,
      shirt = (
        await user("select id from public.garment_types where name='Camisa'")
      )[0].id;
    async function person() {
      const p = uuid();
      await user(
        "select public.save_person($1,null,$2,'REFUERZO','Clarinete',null,null)",
        [p, 'Persona ' + p],
      );
      return p;
    }
    async function garment(size, typ = type) {
      const g = uuid();
      await user(
        "select public.save_garment($1,null,$2,$3,$4,'DISPONIBLE',null)",
        [g, 'G-' + g, typ, size],
      );
      return g;
    }
    async function history(p, g, keep = false) {
      const l = uuid();
      await user(
        "select public.record_loan_movement($1,'ENTREGA',$2,null,$3,$4,'[]',null,null,true)",
        [uuid(), l, p, [g]],
      );
      if (!keep) {
        const i = (
          await user('select id from public.loan_items where loan_id=$1', [l])
        )[0];
        await user(
          "select public.record_loan_movement($1,'DEVOLUCION',$2,1,null,'{}',$3,null,null,true)",
          [uuid(), l, JSON.stringify([{ item_id: i.id, state: 'DISPONIBLE' }])],
        );
      }
      return l;
    }
    async function event(typ = type) {
      const e = uuid(),
        u = uuid();
      await user("select public.plan_event($1,'UNIFORM',$2,null,$3)", [
        uuid(),
        u,
        JSON.stringify({ name: 'Uniforme', type_ids: [typ] }),
      ]);
      await user("select public.plan_event($1,'EVENT',$2,null,$3)", [
        uuid(),
        e,
        JSON.stringify({
          title: 'Actuación',
          uniform_id: u,
          starts: '2090-04-02T18:00',
          ends: '2090-04-02T20:00',
          from: '2090-04-02T16:00',
          until: '2090-04-02T22:00',
        }),
      ]);
      return e;
    }
    const erow = async (e) =>
      (await user('select * from public.events where id=$1', [e]))[0];
    const cmd = async (e, action, data) =>
      user('select public.plan_event($1,$2,$3,$4,$5)', [
        uuid(),
        action,
        e,
        (await erow(e)).version,
        JSON.stringify(data),
      ]);
    const add = (e, p) => cmd(e, 'PARTICIPANT', { person_id: p });

    const give = async (p, gs, due = '2089-01-01T12:00') => {
      const l = uuid();
      await user(
        "select public.record_loan_movement($1,'ENTREGA',$2,null,$3,$4,'[]',$5,null,true)",
        [uuid(), l, p, gs, due],
      );
      return l;
    };
    const loan = async (l) =>
      (await user('select * from public.loans where id=$1', [l]))[0];
    const item = async (l, g) =>
      (
        await user(
          'select * from public.loan_items where loan_id=$1 and garment_id=$2',
          [l, g],
        )
      )[0];
    const preview = async (l, ids) =>
      (await user('select public.preview_retention($1,$2) r', [l, ids]))[0].r;
    const keep = async (p, id = uuid()) =>
      (
        await user('select public.confirm_retention($1,$2) r', [
          id,
          JSON.stringify(p),
        ])
      )[0].r;
    const issues = async (e) =>
      user('select * from public.wardrobe_conflicts where event_id=$1', [e]);
    const assign = (e, p, g, typ = type) =>
      cmd(e, 'ASSIGN', { person_id: p, type_id: typ, garment_id: g });
    const back = async (l, id, state = 'DISPONIBLE') =>
      user(
        "select public.record_loan_movement($1,'DEVOLUCION',$2,$3,null,'{}',$4,null,null,true)",
        [
          uuid(),
          l,
          (await loan(l)).version,
          JSON.stringify([{ item_id: id, state }]),
        ],
      );
    const owner = await person(),
      recipient = await person(),
      g = await garment('48'),
      other = await garment('48', shirt),
      e = await event(),
      l = await give(owner, [g, other]);
    await add(e, recipient);
    await assign(e, recipient, g);
    const i = await item(l, g),
      otherItem = await item(l, other);
    await t.test(
      'devolución compatible: aviso, vista previa sin escrituras y cancelación implícita',
      async () => {
        const rows = await issues(e);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].critical, false);
        assert.deepEqual(rows[0].reasons, ['PENDING_RETURN']);
        const p = await preview(l, [i.id]);
        assert.equal(p.impacts.length, 1);
        assert.equal(p.impacts[0].person_id, recipient);
        assert.equal(p.impacts[0].event_id, e);
        assert.equal((await item(l, g)).retained_at, null);
        assert.equal((await loan(l)).version, 1);
        await assert.rejects(preview(l, []), /INVALID_SELECTION/);
        await assert.rejects(preview(l, [i.id, i.id]), /INVALID_SELECTION/);
      },
    );
    let kept;
    await t.test(
      'mantener pese al impacto: cesión abierta, reserva conservada, auditoría e idempotencia',
      async () => {
        const p = await preview(l, [i.id]),
          request = uuid();
        kept = p;
        const result = await keep(p, request);
        assert.deepEqual(await keep(p, request), result);
        assert.ok((await item(l, g)).retained_at);
        assert.equal((await item(l, g)).returned_at, null);
        assert.equal((await item(l, other)).retained_at, null);
        assert.equal((await loan(l)).closed_at, null);
        assert.equal((await loan(l)).version, 2);
        assert.equal(
          (
            await user('select * from public.loan_movements where loan_id=$1', [
              l,
            ])
          ).length,
          1,
        );
        assert.equal(
          (
            await user(
              'select * from public.loan_retention_decisions where loan_id=$1',
              [l],
            )
          ).length,
          1,
        );
        assert.equal(
          (
            await user(
              "select * from public.audit_log where loan_id=$1 and action='PRENDAS_MANTENIDAS'",
              [l],
            )
          ).length,
          1,
        );
        const rows = await issues(e);
        assert.equal(rows[0].critical, true);
        assert.deepEqual(rows[0].reasons, ['RETAINED']);
        assert.equal(
          (
            await user(
              'select status from public.event_preparation where event_id=$1',
              [e],
            )
          )[0].status,
          'CONFLICTO',
        );
        const plan = (
          await user("select public.preview_assisted_plan('event',$1) r", [e])
        )[0].r;
        assert.equal(plan.preserved, 1);
        assert.equal(plan.existing_review, 1);
        await assert.rejects(
          keep({ ...p, version: 999 }, request),
          /REQUEST_ALREADY_USED/,
        );
      },
    );
    await t.test(
      'nuevas reservas no confían en una fecha prevista invalidada',
      async () => {
        await assign(e, recipient, null);
        await assert.rejects(assign(e, recipient, g), /GARMENT_IN_CUSTODY/);
        const choices = (
          await user("select public.event_garment_choices($1,$2,$3,'',1) r", [
            e,
            recipient,
            type,
          ])
        )[0].r;
        assert.ok(
          JSON.stringify(choices).includes('Cedida sin devolución compatible'),
        );
        await back(l, i.id);
        assert.equal((await loan(l)).closed_at, null);
        assert.equal((await item(l, other)).returned_at, null);
        await assign(e, recipient, g);
        assert.equal((await issues(e)).length, 0);
      },
    );
    await t.test(
      'estado físico cambia sin bloquear la realidad; reparar, sustituir y cancelar resuelven',
      async () => {
        await db.query(
          "update public.garments set physical_state='DANADA' where id=$1",
          [g],
        );
        assert.deepEqual((await issues(e))[0].reasons, ['DAMAGED']);
        await db.query(
          "update public.garments set physical_state='PENDIENTE_LAVANDERIA' where id=$1",
          [g],
        );
        assert.deepEqual((await issues(e))[0].reasons, ['LAUNDRY']);
        const replacement = await garment('48');
        await assign(e, recipient, replacement);
        assert.equal((await issues(e)).length, 0);
        await db.query(
          'update public.garments set archived_at=now(),archived_by=auth.uid() where id=$1',
          [replacement],
        );
        assert.deepEqual((await issues(e))[0].reasons, ['ARCHIVED']);
        await cmd(e, 'CANCEL', {});
        assert.equal((await issues(e)).length, 0);
      },
    );
    await t.test(
      'cambios posteriores a la vista previa obligan a revisar; devolución y lavado siguen siendo reales',
      async () => {
        const ev = await event(shirt);
        await add(ev, recipient);
        const old = await preview(l, [otherItem.id]);
        assert.equal(old.impacts.length, 0);
        await assign(ev, recipient, other, shirt);
        await assert.rejects(keep(old), /RETENTION_CHANGED/);
        assert.equal((await item(l, other)).retained_at, null);
        const fresh = await preview(l, [otherItem.id]);
        await keep(fresh);
        assert.equal((await issues(ev))[0].critical, true);
        await back(l, otherItem.id, 'PENDIENTE_LAVANDERIA');
        assert.deepEqual((await issues(ev))[0].reasons, ['LAUNDRY']);
        assert.ok((await loan(l)).closed_at);
        await db.query(
          "update public.garments set physical_state='DISPONIBLE' where id=$1",
          [other],
        );
        assert.equal((await issues(ev)).length, 0);
      },
    );
    await t.test(
      'sin impacto, posesión propia, sin fecha y cesión vencida',
      async () => {
        const a = await person(),
          g2 = await garment('60'),
          l2 = await give(a, [g2]),
          it = await item(l2, g2),
          ev = await event();
        await add(ev, a);
        await assign(ev, a, g2);
        const p = await preview(l2, [it.id]);
        assert.equal(p.impacts.length, 0);
        await keep(p);
        assert.equal((await issues(ev)).length, 0);
        await back(l2, it.id);
        const noDate = await give(a, [g2], null);
        await assert.rejects(
          preview(noDate, [(await item(noDate, g2)).id]),
          /RETENTION_NOT_ALLOWED/,
        );
        const g3 = await garment('70'),
          l3 = await give(a, [g3]),
          ev3 = await event();
        await add(ev3, recipient);
        await assign(ev3, recipient, g3);
        await db.query(
          "update public.loans set opened_at=now()-interval '3 days',due_at=now()-interval '1 day' where id=$1",
          [l3],
        );
        assert.deepEqual((await issues(ev3))[0].reasons, ['IN_CUSTODY']);
        await keep(await preview(l3, [(await item(l3, g3)).id]));
        assert.deepEqual((await issues(ev3))[0].reasons, ['RETAINED']);
      },
    );
    await t.test(
      'serie: una incidencia por bloque y resolución conjunta',
      async () => {
        const sid = uuid(),
          a = await person(),
          b = await person(),
          sg = await garment('80'),
          sl = await give(a, [sg]);
        await user("select public.plan_series($1,'SERIES',$2,null,$3)", [
          uuid(),
          sid,
          JSON.stringify({ name: 'Serie conflicto' }),
        ]);
        const sc = async (action, data) => {
          const v = (
            await user('select version from public.event_series where id=$1', [
              sid,
            ])
          )[0].version;
          return user('select public.plan_series($1,$2,$3,$4,$5)', [
            uuid(),
            action,
            sid,
            v,
            JSON.stringify(data),
          ]);
        };
        const es = [await event(), await event()];
        await db.query(
          "update public.events set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day',planned_from=planned_from+interval '1 day',planned_until=planned_until+interval '1 day' where id=$1",
          [es[1]],
        );
        for (const ev of es)
          await sc('MEMBERSHIP', {
            event_id: ev,
            event_version: (await erow(ev)).version,
            active: true,
          });
        await sc('ATTENDANCE', { person_id: b, event_ids: es });
        const block = (
          await user('select id from public.series_blocks where series_id=$1', [
            sid,
          ])
        )[0].id;
        await sc('BLOCK_ASSIGN', {
          block_id: block,
          type_id: type,
          garment_id: sg,
        });
        assert.equal(
          (
            await user(
              'select * from public.wardrobe_conflicts where series_id=$1',
              [sid],
            )
          ).length,
          1,
        );
        const p = await preview(sl, [(await item(sl, sg)).id]);
        assert.equal(p.impacts.length, 1);
        await keep(p);
        await sc('BLOCK_ASSIGN', {
          block_id: block,
          type_id: type,
          garment_id: null,
        });
        await assert.rejects(
          sc('BLOCK_ASSIGN', {
            block_id: block,
            type_id: type,
            garment_id: sg,
          }),
          /GARMENT_IN_CUSTODY/,
        );
        assert.equal(
          (
            await user(
              'select * from public.wardrobe_conflicts where series_id=$1',
              [sid],
            )
          ).length,
          0,
        );
      },
    );
    await t.test(
      'RLS, anonimato, manipulación y revocación de administrador',
      async () => {
        assert.deepEqual(
          await user('select * from public.wardrobe_conflicts', [], outsider),
          [],
        );
        assert.deepEqual(
          await user(
            'select * from public.loan_retention_decisions',
            [],
            outsider,
          ),
          [],
        );
        await assert.rejects(
          user('select public.conflict_summary()', [], outsider),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(
          user('select public.preview_retention($1,$2)', [l, [i.id]], outsider),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(
          user(
            'select public.confirm_retention($1,$2)',
            [uuid(), JSON.stringify(kept)],
            outsider,
          ),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(
          user('select * from public.wardrobe_conflicts', [], '', 'anon'),
          /permission denied/,
        );
        await assert.rejects(
          user('update public.loan_items set retained_at=now() where id=$1', [
            i.id,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          user('delete from public.loan_retention_decisions'),
          /permission denied/,
        );
        const a = await person(),
          gg = await garment('90'),
          ll = await give(a, [gg]),
          pp = await preview(ll, [(await item(ll, gg)).id]);
        pp.impacts = [{ person_id: uuid() }];
        await assert.rejects(keep(pp), /RETENTION_CHANGED/);
        await db.query(
          'update public.admin_profiles set active=false where user_id=$1',
          [admin],
        );
        await assert.rejects(keep(kept), /ADMIN_REQUIRED/);
      },
    );
  } finally {
    await db.close();
  }
});
