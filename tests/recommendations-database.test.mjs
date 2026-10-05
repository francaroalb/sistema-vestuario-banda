import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Recomendador y preparación asistida', async (t) => {
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
    const rec = async (e, p, typ = type) =>
      (
        await user('select public.garment_recommendation($1,$2,$3) r', [
          e,
          p,
          typ,
        ])
      )[0].r;
    const preview = async (e, scope = 'event') =>
      (
        await user('select public.preview_assisted_plan($1,$2) r', [scope, e])
      )[0].r;
    const apply = async (p, request = uuid()) =>
      (
        await user('select public.apply_assisted_plan($1,$2) r', [
          request,
          JSON.stringify(p),
        ])
      )[0].r;
    const p = await person(),
      no = await person(),
      tie = await person(),
      e = await event(),
      g48 = await garment('48'),
      g46 = await garment('46'),
      g50 = await garment('50'),
      g52 = await garment('52');
    await add(e, p);
    await add(e, no);
    await add(e, tie);
    await history(p, g48);
    await history(p, g48);
    await history(p, g46);
    await history(tie, g46);
    await history(tie, g48);
    await t.test(
      'histórico físico por tipo, moda, alternativas y nunca menor',
      async () => {
        const r = await rec(e, p);
        assert.equal(r.historical_size, '48');
        assert.equal(r.reason, 'SAME_SIZE');
        assert.equal(r.review, false);
        assert.equal(r.candidates[0].id, g48);
        assert.ok(r.candidates.some((c) => c.id === g50));
        assert.ok(!r.candidates.some((c) => [g46, g52].includes(c.id)));
        assert.equal(r.history.find((h) => h.size === '48').uses, 2);
        assert.equal((await rec(e, no)).reason, 'NO_HISTORY');
        assert.deepEqual((await rec(e, no)).candidates, []);
        const tied = await rec(e, tie);
        assert.equal(tied.reason, 'TIED_HISTORY');
        assert.equal(tied.historical_size, '48');
        assert.equal(tied.review, true);
        const se = await event(shirt);
        await add(se, p);
        assert.equal((await rec(se, p, shirt)).reason, 'NO_HISTORY');
      },
    );
    await t.test(
      'estados físicos, posesión ajena, siguiente mayor y tallas no comparables',
      async () => {
        await db.query(
          "update public.garments set physical_state='DANADA' where id=$1",
          [g48],
        );
        let r = await rec(e, p);
        assert.equal(r.reason, 'LARGER_SIZE');
        assert.equal(r.candidates[0].id, g50);
        assert.equal(r.review, true);
        const other = await person();
        await history(other, g50, true);
        r = await rec(e, p);
        assert.equal(r.candidates[0].id, g52);
        assert.ok(!r.candidates.some((c) => c.id === g50));
        await db.query(
          "update public.garments set physical_state='PENDIENTE_LAVANDERIA' where id=$1",
          [g52],
        );
        assert.equal((await rec(e, p)).reason, 'NO_AVAILABLE');
        await db.query(
          "update public.garments set physical_state='DISPONIBLE' where id=any($1)",
          [[g48, g52]],
        );
        const custom = await person(),
          cg = await garment('48-ES'),
          ce = await event();
        await history(custom, cg);
        await add(ce, custom);
        assert.equal((await rec(ce, custom)).candidates[0].id, cg);
        await db.query(
          'update public.garments set archived_at=now(), archived_by=auth.uid() where id=$1',
          [cg],
        );
        assert.equal((await rec(ce, custom)).reason, 'NO_AVAILABLE');
        const alpha = await person(),
          sm = await garment('M'),
          sl = await garment('L'),
          ss = await garment('S'),
          ae = await event();
        await history(alpha, sm);
        await add(ae, alpha);
        await db.query(
          "update public.garments set physical_state='DANADA' where id=$1",
          [sm],
        );
        r = await rec(ae, alpha);
        assert.equal(r.candidates[0].id, sl);
        assert.ok(!r.candidates.some((c) => c.id === ss || c.id === g48));
      },
    );
    await t.test(
      'vista previa no escribe, conserva asignaciones y aplica solo casos claros',
      async () => {
        const first = await preview(e);
        assert.equal(first.suggested, 1);
        assert.equal(first.review, 2);
        assert.equal(
          (
            await user(
              'select * from public.event_assignments where event_id=$1',
              [e],
            )
          ).length,
          0,
        );
        const movementCount = (
          await user('select count(*) n from public.loan_movements')
        )[0].n;
        const request = uuid(),
          result = await apply(first, request);
        assert.equal(result.assigned, 1);
        assert.deepEqual(await apply(first, request), result);
        assert.equal(
          (await user('select count(*) n from public.loan_movements'))[0].n,
          movementCount,
        );
        const second = await preview(e);
        assert.equal(second.preserved, 1);
        assert.equal(second.suggested, 0);
        assert.equal(second.review, 2);
        await assert.rejects(
          apply({ ...first, version: 999 }, request),
          /REQUEST_ALREADY_USED/,
        );
        await assert.rejects(apply(first), /RECOMMENDATION_CHANGED/);
      },
    );
    await t.test(
      'prenda en su poder se reutiliza sin nueva cesión y sin conflicto futuro',
      async () => {
        const owner = await person(),
          g = await garment('60'),
          ev = await event();
        await history(owner, g, true);
        await add(ev, owner);
        const r = await rec(ev, owner);
        assert.equal(r.candidates[0].own_custody, true);
        await apply(await preview(ev));
        assert.equal(
          (
            await user(
              'select * from public.event_preparation where event_id=$1',
              [ev],
            )
          )[0].status,
          'EN_SU_PODER',
        );
      },
    );
    await t.test(
      'dos personas compiten por una prenda sin proponer doble reserva',
      async () => {
        const ev = await event(),
          a = await person(),
          b = await person(),
          g = await garment('70');
        await history(a, g);
        await history(b, g);
        await add(ev, a);
        await add(ev, b);
        const plan = await preview(ev);
        assert.equal(plan.suggested, 1);
        assert.equal(plan.review, 1);
        await apply(plan);
        assert.equal(
          (
            await user(
              'select * from public.event_assignments where event_id=$1 and garment_id=$2',
              [ev, g],
            )
          ).length,
          1,
        );
      },
    );
    await t.test(
      'cambios de stock e histórico invalidan toda la propuesta sin escrituras parciales',
      async () => {
        const ev = await event(),
          a = await person(),
          g = await garment('80'),
          b = await person(),
          other = await garment('81');
        await history(a, g);
        await add(ev, a);
        await history(b, other);
        await add(ev, b);
        const plan = await preview(ev);
        assert.equal(plan.suggested, 2);
        await db.query(
          "update public.garments set physical_state='DANADA' where id=$1",
          [g],
        );
        await assert.rejects(apply(plan), /RECOMMENDATION_CHANGED/);
        assert.equal(
          (
            await user(
              'select * from public.event_assignments where event_id=$1',
              [ev],
            )
          ).length,
          0,
        );
        await db.query(
          "update public.garments set physical_state='DISPONIBLE' where id=$1",
          [g],
        );
        await history(a, g);
        await assert.rejects(apply(plan), /RECOMMENDATION_CHANGED/);
        const fresh = await preview(ev);
        fresh.lines[0].garment_id = g46;
        await assert.rejects(apply(fresh), /RECOMMENDATION_CHANGED/);
      },
    );
    await t.test(
      'serie: huecos completos, elección conjunta y propagación del bloque',
      async () => {
        const sid = uuid(),
          a = await person(),
          b = await person(),
          g = await garment('90');
        await history(a, g);
        await history(b, g);
        await user("select public.plan_series($1,'SERIES',$2,null,$3)", [
          uuid(),
          sid,
          JSON.stringify({ name: 'Semana Santa' }),
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
        const es = [await event(), await event(), await event()];
        for (let i = 0; i < 3; i++) {
          await db.query(
            "update public.events set starts_at=starts_at+($1*interval '1 day'),ends_at=ends_at+($1*interval '1 day'),planned_from=planned_from+($1*interval '1 day'),planned_until=planned_until+($1*interval '1 day') where id=$2",
            [i, es[i]],
          );
          await sc('MEMBERSHIP', {
            event_id: es[i],
            event_version: (await erow(es[i])).version,
            active: true,
          });
        }
        await sc('ATTENDANCE', {
          person_id: a,
          event_ids: [es[0], es[2]],
          gap_choice: 'KEEP',
        });
        await sc('ATTENDANCE', { person_id: b, event_ids: [es[1]] });
        const plan = await preview(sid, 'series');
        assert.equal(plan.suggested, 1);
        assert.equal(plan.review, 1);
        await apply(plan);
        const assigned = await user(
          'select * from public.event_assignments where garment_id=$1',
          [g],
        );
        assert.ok(assigned.length === 1 || assigned.length === 2);
        assert.equal(new Set(assigned.map((x) => x.person_id)).size, 1);
      },
    );
    await t.test('permisos ADMIN, anonimato y campos manipulados', async () => {
      await assert.rejects(
        user(
          'select public.garment_recommendation($1,$2,$3)',
          [e, p, type],
          outsider,
        ),
        /ADMIN_REQUIRED/,
      );
      await assert.rejects(
        user(
          'select public.preview_assisted_plan($1,$2)',
          ['event', e],
          outsider,
        ),
        /ADMIN_REQUIRED/,
      );
      await assert.rejects(
        user(
          'select public.apply_assisted_plan($1,$2)',
          [uuid(), '{}'],
          outsider,
        ),
        /ADMIN_REQUIRED/,
      );
      await assert.rejects(
        user(
          'select public.preview_assisted_plan($1,$2)',
          ['event', e],
          '',
          'anon',
        ),
        /permission denied/,
      );
      await assert.rejects(
        user("select private.size_rank('48')"),
        /permission denied/,
      );
      await db.query(
        'update public.admin_profiles set active=false where user_id=$1',
        [admin],
      );
      await assert.rejects(rec(e, p), /ADMIN_REQUIRED/);
    });
  } finally {
    await db.close();
  }
});
