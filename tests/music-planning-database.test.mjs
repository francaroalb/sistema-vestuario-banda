import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Carpetas fases 7 y 8: planificación y recomendación', async (t) => {
  const db = new PGlite(),
    admin = uuid(),
    outsider = uuid(),
    person = uuid(),
    other = uuid(),
    voice = uuid(),
    voice2 = uuid(),
    series = uuid(),
    uniform = uuid(),
    events = [uuid(), uuid(), uuid()];
  let seq = 0;
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const f of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + f, 'utf8'));
    for (const id of [admin, outsider])
      await db.query('insert into auth.users values($1)', [id]);
    await db.query(
      "insert into public.admin_profiles(user_id,display_name) values($1,'QA')",
      [admin],
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
    for (const id of [person, other])
      await q(
        "insert into public.people(id,full_name,kind,created_by,updated_by) values($1,'QA Persona','REFUERZO',$2,$2)",
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
      code: 'QA1',
      name: 'Voz primera',
      archived: false,
    });
    await music('VOICE_SAVE', voice2, null, {
      code: 'QA2',
      name: 'Voz segunda',
      archived: false,
    });
    const folder = async (v = voice, blocked = false) => {
      const id = uuid();
      await music('FOLDER_SAVE', id, null, {
        code: 'PRO-' + (v === voice ? 'QA1' : 'QA2') + '-' + ++seq,
        repertoire_code: 'PRO',
        voice_id: v,
        manually_blocked: blocked,
        archived: false,
      });
      return id;
    };
    await q(
      "insert into public.uniforms(id,name,type_ids,updated_by) values($1,'QA',array[(select id from public.garment_types limit 1)],$2)",
      [uniform, admin],
      admin,
      'postgres',
    );
    await q(
      "insert into public.event_series(id,name,updated_by) values($1,'QA Serie',$2)",
      [series, admin],
      admin,
      'postgres',
    );
    for (let i = 0; i < 3; i++)
      await q(
        "insert into public.events(id,title,starts_at,ends_at,planned_from,planned_until,uniform_id,uniform_name,type_ids,updated_by,series_id) values($1,$2,date_trunc('minute',now())+($3::int*interval '1 day'),date_trunc('minute',now())+($3::int*interval '1 day')+interval '2 hours',now()+($3::int*interval '1 day')-interval '12 hours',now()+($3::int*interval '1 day')+interval '12 hours',$4,'QA',array[(select id from public.garment_types limit 1)],$5,$6)",
        [events[i], 'QA Evento ' + i, i + 2, uniform, admin, series],
        admin,
        'postgres',
      );
    for (const id of [events[0], events[2]])
      await q(
        'insert into public.event_participants(event_id,person_id) values($1,$2)',
        [id, person],
        admin,
        'postgres',
      );
    const cmd = async (
      action,
      data,
      req = uuid(),
      scope = 'series',
      id = series,
    ) =>
      (
        await q('select public.music_planning_command($1,$2,$3,$4,$5) r', [
          req,
          action,
          scope,
          id,
          JSON.stringify(data),
        ])
      )[0].r;
    const detail = async (page = 1) =>
      (
        await q("select public.music_planning_detail('series',$1,$2,null) r", [
          series,
          page,
        ])
      )[0].r;
    const recommend = async (key) =>
      (await q("select public.recommend_music_folders($1,1,'') r", [key]))[0].r;
    const config = async (id, reps) => {
      const d = await detail();
      await cmd('EVENT', {
        event_id: id,
        version: d.events.find((e) => e.id === id).version,
        repertoires: reps,
      });
    };
    const setVoice = async (id, v) => {
      const d = await detail(),
        m = d.participations.find(
          (p) => p.event_id === id && p.person_id === person,
        );
      await cmd('VOICE', {
        person_id: person,
        rows: [
          { event_id: id, version: m.version, voice_id: v, required: true },
        ],
      });
    };
    const assign = async (need, folder, ack = true) => {
      const rec = await recommend(need.need_key),
        f = rec.rows.find((f) => f.id === folder);
      assert.ok(f);
      return cmd('ASSIGN', {
        need: rec.need,
        folder_id: f.id,
        folder_version: f.version,
        ack,
      });
    };
    let best, damaged, assigned;
    await t.test(
      'necesidades por repertorio, voz pendiente y periodos independientes de chaqueta',
      async () => {
        for (const id of events) await config(id, ['PRO']);
        const d = await detail();
        assert.equal(d.needs.length, 1);
        assert.equal(d.needs[0].status, 'VOICE_PENDING');
        assert.equal(
          new Date(d.needs[0].planned_from).getTime(),
          new Date(d.events[0].starts_at).getTime(),
        );
        await setVoice(events[0], voice);
        await setVoice(events[2], voice);
        const n = (await detail()).needs[0];
        assert.equal(n.status, 'GAP_PENDING');
        assert.equal(n.has_gap, true);
      },
    );
    await t.test(
      'continuidad y división son decisiones explícitas e independientes del vestuario',
      async () => {
        await cmd('GAP', {
          person_id: person,
          choice: 'SPLIT',
          previous: null,
        });
        assert.equal((await detail()).needs.length, 2);
        await cmd('GAP', {
          person_id: person,
          choice: 'KEEP',
          previous: 'SPLIT',
        });
        const d = await detail();
        assert.equal(d.needs.length, 1);
        assert.equal(d.needs[0].status, 'UNASSIGNED');
        assert.equal((await q('select * from public.series_blocks')).length, 0);
      },
    );
    await t.test(
      'recomienda solo voz exacta y operativas; prioriza sin incidencias y no reserva al leer',
      async () => {
        best = await folder();
        damaged = await folder();
        await folder(voice2);
        await folder(voice, true);
        await music('PHYSICAL_SAVE', uuid(), null, {
          folder_id: damaged,
          folder_version: 1,
          kind: 'ELASTICS',
          description: 'Revisar elástico',
          blocks_use: false,
        });
        const r = await recommend((await detail()).needs[0].need_key);
        assert.deepEqual(
          r.rows.map((f) => f.id),
          [best, damaged],
        );
        assert.equal(r.rows[1].warnings[0], 'MAINTENANCE_PENDING');
        assert.equal(
          (await q('select * from public.folder_reservations')).length,
          0,
        );
      },
    );
    await t.test(
      'asignar reserva, pero no entrega ni firma; cambios de voz señalan la reserva anterior',
      async () => {
        assigned = await assign((await detail()).needs[0], best);
        assert.ok(assigned.reservation_id);
        assert.equal((await q('select * from public.folder_loans')).length, 0);
        assert.equal((await detail()).needs[0].status, 'ASSIGNED');
        await setVoice(events[2], voice2);
        const d = await detail();
        assert.equal(d.needs.length, 2);
        assert.equal(d.stale.length, 1);
        assert.equal(
          (
            await q(
              'select cancelled_at from public.folder_reservations where id=$1',
              [assigned.reservation_id],
            )
          )[0].cancelled_at,
          null,
        );
        await cmd('RELEASE', { id: assigned.id, version: assigned.version });
        assert.ok(
          (
            await q(
              'select cancelled_at from public.folder_reservations where id=$1',
              [assigned.reservation_id],
            )
          )[0].cancelled_at,
        );
      },
    );
    await t.test(
      'versiones obsoletas y doble asignación se rechazan sin efectos parciales',
      async () => {
        const n = (await detail()).needs.find((n) => n.voice_id === voice),
          rec = await recommend(n.need_key),
          f = rec.rows[0];
        const d = {
            need: rec.need,
            folder_id: f.id,
            folder_version: f.version,
            ack: true,
          },
          request = uuid();
        const a = await cmd('ASSIGN', d, request);
        assert.deepEqual(await cmd('ASSIGN', d, request), a);
        await assert.rejects(cmd('ASSIGN', d), /MUSIC_CHANGED/);
        await assert.rejects(
          cmd('EVENT', {
            event_id: events[0],
            version: 0,
            repertoires: ['PMM'],
          }),
          /MUSIC_CHANGED/,
        );
      },
    );
    await t.test(
      'reutilizar carpeta en poder propio no crea otra entrega y quitar plan no devuelve',
      async () => {
        const f = await folder(voice2),
          loan = uuid();
        const p = (
          await q("select public.preview_folder_loan('DELIVER',$1,null,$2) r", [
            loan,
            JSON.stringify({
              folder_id: f,
              folder_version: 1,
              person_id: person,
              due_local: null,
              notes: null,
              reserved: false,
            }),
          ])
        )[0].r;
        await q('select public.apply_folder_loan($1,$2,true,true)', [
          uuid(),
          JSON.stringify(p),
        ]);
        const a = await assign(
          (await detail()).needs.find((n) => n.voice_id === voice2),
          f,
        );
        assert.equal(a.owned_loan_id, loan);
        assert.equal(a.reservation_id, null);
        assert.equal(
          (await detail()).needs.find((n) => n.voice_id === voice2).status,
          'HELD',
        );
        await cmd('RELEASE', { id: a.id, version: a.version });
        assert.equal(
          (
            await q('select closed_at from public.folder_loans where id=$1', [
              loan,
            ])
          )[0].closed_at,
          null,
        );
      },
    );
    await t.test(
      'avisos en actuaciones e inicio y propuesta de última voz sin imponerla',
      async () => {
        const a = (await q('select public.music_planning_alerts(null,1) r'))[0]
          .r;
        assert.ok(a.pending > 0);
        assert.equal(a.rows[0].scope_id, series);
        const v = (
          await q('select public.music_voice_suggestion($1) r', [person])
        )[0].r;
        assert.equal(v.id, voice2);
        await assert.rejects(
          q(
            "select public.music_planning_detail('series',$1,1,null)",
            [series],
            outsider,
          ),
          /ADMIN_REQUIRED/,
        );
        await assert.rejects(
          q(
            'select public.music_voice_suggestion($1)',
            [person],
            outsider,
            'anon',
          ),
          /permission denied/,
        );
      },
    );

    await t.test(
      'avisos por devolución compatible, exclusión por cesión abierta y aceptación de incidencias',
      async () => {
        const n = (await detail()).needs.find((n) => n.voice_id === voice2),
          f = await folder(voice2),
          blocked = await folder(voice2);
        const deliver = async (id, due) => {
          const p = (
            await q(
              "select public.preview_folder_loan('DELIVER',$1,null,$2) r",
              [
                uuid(),
                JSON.stringify({
                  folder_id: id,
                  folder_version: 1,
                  person_id: other,
                  due_local: due,
                  notes: null,
                  reserved: false,
                }),
              ],
            )
          )[0].r;
          await q('select public.apply_folder_loan($1,$2,true,true)', [
            uuid(),
            JSON.stringify(p),
          ]);
        };
        const due = (
          await q(
            "select to_char(now()+interval '1 day','YYYY-MM-DD')||'T12:00' d",
          )
        )[0].d;
        await deliver(f, due);
        await deliver(blocked, null);
        const rec = await recommend(n.need_key);
        assert.ok(
          rec.rows.find((r) => r.id === f).warnings.includes('AWAIT_RETURN'),
        );
        assert.ok(!rec.rows.some((r) => r.id === blocked));
        await assert.rejects(assign(n, f, false), /FOLDER_ACK_REQUIRED/);
        const a = await assign(n, f);
        assert.equal(
          (await detail()).needs.find((r) => r.need_key === n.need_key).status,
          'AWAIT_RETURN',
        );
        assert.ok(
          (await q('select public.music_planning_alerts(null,1) r'))[0].r
            .warnings > 0,
        );
        await cmd('RELEASE', { id: a.id, version: a.version });
      },
    );
    await t.test(
      'periodos editables de carpeta no modifican vestuario y detectan cambios posteriores de horario',
      async () => {
        const d = await detail(),
          e = d.events[0],
          before = (
            await q(
              'select planned_from,planned_until from public.events where id=$1',
              [e.id],
            )
          )[0];
        const local = (
          await q(
            "select to_char(starts_at at time zone 'Europe/Madrid','YYYY-MM-DD\"T\"HH24:MI') f,to_char(ends_at at time zone 'Europe/Madrid','YYYY-MM-DD\"T\"HH24:MI') u from public.events where id=$1",
            [e.id],
          )
        )[0];
        await cmd('WINDOW', {
          event_id: e.id,
          version: e.version,
          from_local: local.f,
          until_local: local.u,
        });
        assert.deepEqual(
          (
            await q(
              'select planned_from,planned_until from public.events where id=$1',
              [e.id],
            )
          )[0],
          before,
        );
        await q(
          "update public.events set starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour' where id=$1",
          [e.id],
          admin,
          'postgres',
        );
        assert.equal(
          (await detail()).needs.find((n) => n.voice_id === voice).status,
          'CONFLICT',
        );
        assert.equal(
          (
            await recommend(
              (await detail()).needs.find((n) => n.voice_id === voice).need_key,
            )
          ).rows.length,
          0,
        );
        await q(
          "update public.events set starts_at=starts_at-interval '1 hour',ends_at=ends_at-interval '1 hour' where id=$1",
          [e.id],
          admin,
          'postgres',
        );
      },
    );
    await t.test(
      'alta de refuerzo con voz en serie es atómica e idempotente; retirar no devuelve carpetas',
      async () => {
        const fresh = uuid(),
          request = uuid(),
          version = (
            await q('select version from public.event_series where id=$1', [
              series,
            ])
          )[0].version;
        const data = {
          person_id: fresh,
          name: 'QA María García',
          instrument: 'Clarinete',
          event_ids: [events[1]],
          gap_choice: null,
        };
        const args = [
          request,
          'series',
          series,
          version,
          JSON.stringify(data),
          voice,
          true,
        ];
        const call = () =>
          q(
            'select public.plan_music_participant($1,$2,$3,$4,$5,$6,$7) r',
            args,
          );
        const r = await call();
        assert.deepEqual(await call(), r);
        const m = (
          await q(
            'select * from public.music_participations where person_id=$1',
            [fresh],
          )
        )[0];
        assert.equal(m.voice_id, voice);
        assert.equal(m.required, true);
        const invalid = uuid();
        await assert.rejects(
          q('select public.plan_music_participant($1,$2,$3,$4,$5,$6,$7)', [
            uuid(),
            'series',
            series,
            r[0].r.version,
            JSON.stringify({ ...data, person_id: invalid }),
            uuid(),
            true,
          ]),
          /MUSIC_VOICE_UNAVAILABLE/,
        );
        assert.equal(
          (await q('select * from public.people where id=$1', [invalid]))
            .length,
          0,
        );
      },
    );
    await t.test(
      'cesión propia planificada impide reserva solapada para otra persona incluso fuera del recomendador',
      async () => {
        const n = (await detail()).needs.find((n) => n.voice_id === voice2),
          rec = await recommend(n.need_key),
          owned = rec.rows.find((f) => f.holder_id === person);
        assert.ok(owned);
        const a = await assign(n, owned.id);
        await assert.rejects(
          q(
            "insert into public.folder_reservations(id,folder_id,person_id,person_name,starts_at,due_at,created_by,updated_by) values($1,$2,$3,'QA',$4,$5,$6,$6)",
            [uuid(), owned.id, other, n.planned_from, n.planned_until, admin],
            admin,
            'postgres',
          ),
          /FOLDER_UNAVAILABLE/,
        );
        await cmd('RELEASE', { id: a.id, version: a.version });
      },
    );
    await t.test(
      'un repertorio completo tiene prioridad sobre uno pendiente incluso con incidencia leve',
      async () => {
        const complete = await folder(voice2),
          incomplete = await folder(voice2),
          work = uuid();
        await music('WORK_SAVE', work, null, {
          repertoire_code: 'PRO',
          title: 'Marcha de prueba',
          active: true,
        });
        const version = async () =>
          (
            await q('select version from public.music_folders where id=$1', [
              complete,
            ])
          )[0].version;
        await music('PRESENCE', complete, await version(), {
          work_id: work,
          work_version: 1,
          action: 'INCORPORATE',
        });
        await music('PHYSICAL_SAVE', uuid(), null, {
          folder_id: complete,
          folder_version: await version(),
          kind: 'ELASTICS',
          description: 'Revisión leve',
          blocks_use: false,
        });
        const rec = await recommend(
          (await detail()).needs.find((n) => n.voice_id === voice2).need_key,
        );
        assert.equal(rec.rows[0].id, complete);
        assert.ok(rec.rows[0].warnings.includes('MAINTENANCE_PENDING'));
        assert.ok(
          rec.rows
            .find((f) => f.id === incomplete)
            .warnings.includes('REPERTOIRE_PENDING'),
        );
      },
    );
    await t.test(
      'una serie sin actuaciones permite liberar sus reservas antiguas',
      async () => {
        await q(
          'update public.events set series_id=null where series_id=$1',
          [series],
          admin,
          'postgres',
        );
        const d = await detail();
        assert.ok(d.stale.length > 0);
        for (const a of d.stale)
          await cmd('RELEASE', { id: a.id, version: a.version });
        assert.equal((await detail()).stale.length, 0);
      },
    );
  } finally {
    await db.close();
  }
});
