import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Carpetas fase 5: reservas y posesión real', async (t) => {
  const db = new PGlite(),
    admin = uuid(),
    other = uuid(),
    outsider = uuid(),
    person = uuid(),
    person2 = uuid(),
    voice = uuid(),
    work = uuid();
  let seq = 0;
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    for (const id of [admin, other, outsider])
      await db.query('insert into auth.users values($1)', [id]);
    for (const id of [admin, other])
      await db.query(
        'insert into public.admin_profiles(user_id,display_name) values($1,$2)',
        [id, 'QA Admin'],
      );
    const query = async (
      sql,
      params = [],
      actor = admin,
      role = 'authenticated',
    ) => {
      await db.exec(`begin;set local role ${role};`);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        actor,
      ]);
      try {
        const r = await db.query(sql, params);
        await db.exec('commit');
        return r.rows;
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    };
    // Explicit fixture identifiers; system role is used only in this isolated database.
    for (const id of [person, person2])
      await query(
        'insert into public.people(id,full_name,created_by,updated_by) values($1,$2,$3,$3)',
        [id, 'Persona QA', admin],
        admin,
        'postgres',
      );
    const music = async (action, id, version, data) =>
      (
        await query('select public.music_command($1,$2,$3,$4,$5) r', [
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
    await music('WORK_SAVE', work, null, {
      repertoire_code: 'PRO',
      title: 'Marcha QA',
      active: true,
    });
    const folder = async (id) =>
      (
        await query('select * from public.music_folder_inventory where id=$1', [
          id,
        ])
      )[0];
    const make = async () => {
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
    const date = async (days) =>
      (
        await query(
          "select to_char((now()+($1::int*interval '1 day')) at time zone 'Europe/Madrid','YYYY-MM-DD\"T\"HH24:MI') d",
          [days],
        )
      )[0].d;
    const preview = async (action, id, version, data, actor = admin) =>
      (
        await query(
          'select public.preview_folder_loan($1,$2,$3,$4) r',
          [action, id, version, JSON.stringify(data)],
          actor,
        )
      )[0].r;
    const apply = async (
      p,
      signature = true,
      ack = true,
      request = uuid(),
      actor = admin,
    ) =>
      (
        await query(
          'select public.apply_folder_loan($1,$2,$3,$4) r',
          [request, JSON.stringify(p), signature, ack],
          actor,
        )
      )[0].r;
    const plan = async (f, start = 2, end = 3, id = uuid()) =>
      preview('RESERVE', id, null, {
        folder_id: f,
        folder_version: (await folder(f)).version,
        person_id: person2,
        start_local: await date(start),
        due_local: end === null ? null : await date(end),
        notes: null,
      });
    const delivery = async (
      f,
      end = 1,
      id = uuid(),
      reserved = false,
      version = null,
    ) =>
      preview('DELIVER', id, version, {
        folder_id: f,
        folder_version: (await folder(f)).version,
        person_id: reserved ? person2 : person,
        due_local: end === null ? null : await date(end),
        notes: null,
        reserved,
      });
    const returning = async (f, id, incident = null) =>
      preview('RETURN', id, 1, {
        folder_version: (await folder(f)).version,
        notes: 'Devolución QA',
        incident,
      });
    await t.test(
      'reservar no entrega; solapes prohibidos y límites contiguos permitidos',
      async () => {
        const f = await make(),
          p = await plan(f);
        await apply(p, false);
        assert.equal((await folder(f)).holder_id, null);
        assert.equal((await folder(f)).next_assignee, 'Persona QA');
        const conflict = await plan(f, 2, 4);
        assert.deepEqual(conflict.conflicts, ['RESERVATION_OVERLAP']);
        await assert.rejects(apply(conflict), /FOLDER_UNAVAILABLE/);
        const adjacent = await plan(f, 3, 4);
        assert.deepEqual(adjacent.conflicts, []);
        await apply(adjacent, false);
        const cancel = await preview('CANCEL', p.id, 1, {
          folder_version: (await folder(f)).version,
          notes: null,
        });
        await apply(cancel, false);
        assert.equal(
          (
            await query(
              'select status from public.folder_loan_overview where id=$1',
              [p.id],
            )
          )[0].status,
          'CANCELLED',
        );
      },
    );
    await t.test(
      'firma obligatoria, posesión única, sin vencimiento automático y reintentos por actor',
      async () => {
        const f = await make(),
          p = await delivery(f),
          request = uuid();
        await assert.rejects(apply(p, false), /SIGNATURE_REQUIRED/);
        const result = await apply(p, true, true, request);
        assert.deepEqual(await apply(p, true, true, request), result);
        await assert.rejects(
          apply(p, true, true, request, other),
          /REQUEST_ALREADY_USED/,
        );
        assert.equal((await folder(f)).holder_id, person);
        const duplicate = await delivery(f);
        assert.ok(duplicate.conflicts.includes('IN_CUSTODY'));
        await assert.rejects(apply(duplicate), /FOLDER_UNAVAILABLE/);
        await db.query(
          "update public.folder_loan_items set due_at=now()-interval '1 hour',delivered_at=now()-interval '2 hour' where loan_id=$1",
          [p.id],
        );
        assert.equal((await folder(f)).holder_id, person);
        assert.equal(
          (
            await query(
              'select overdue from public.folder_loan_overview where id=$1',
              [p.id],
            )
          )[0].overdue,
          true,
        );
      },
    );
    await t.test(
      'posesión con devolución compatible avisa; sin fecha o vencida genera conflicto',
      async () => {
        const f = await make(),
          d = await delivery(f);
        await apply(d);
        const future = await plan(f);
        assert.deepEqual(future.conflicts, []);
        assert.ok(future.warnings.includes('AWAIT_RETURN'));
        await assert.rejects(
          apply(future, false, false),
          /FOLDER_ACK_REQUIRED/,
        );
        await apply(future, false, true);
        const blocked = await delivery(f, 3, future.id, true, 1);
        assert.ok(blocked.conflicts.includes('IN_CUSTODY'));
        await db.query(
          'update public.folder_loan_items set due_at=null where loan_id=$1',
          [d.id],
        );
        assert.ok((await plan(f, 4, 5)).conflicts.includes('CUSTODY_OVERLAP'));
        assert.equal(
          (
            await query(
              'select conflict from public.folder_loan_overview where id=$1',
              [future.id],
            )
          )[0].conflict,
          true,
        );
      },
    );
    await t.test(
      'entrega sin fecha con reserva futura exige aviso; devolución libera pero no cancela reserva',
      async () => {
        const f = await make(),
          p = await plan(f);
        await apply(p, false);
        const d = await delivery(f, null);
        assert.deepEqual(d.conflicts, []);
        assert.ok(d.warnings.includes('OPEN_ENDED_RESERVATIONS'));
        await assert.rejects(apply(d, true, false), /FOLDER_ACK_REQUIRED/);
        await apply(d);
        await apply(await returning(f, d.id));
        assert.equal((await folder(f)).holder_id, null);
        assert.equal((await folder(f)).next_reservation_id, p.id);
        const delivered = await delivery(f, 3, p.id, true, 1);
        await apply(delivered);
        assert.equal(
          (
            await query(
              'select status from public.folder_loan_overview where id=$1',
              [p.id],
            )
          )[0].status,
          'ACTIVE',
        );
        assert.equal(
          (
            await query(
              'select count(*)::int n from public.folder_loan_overview where id=$1',
              [p.id],
            )
          )[0].n,
          1,
        );
      },
    );
    await t.test(
      'bloqueo después de entrega permite devolver; no archivar carpeta o persona en posesión',
      async () => {
        const f = await make(),
          d = await delivery(f);
        await apply(d);
        const old = await folder(f);
        const data = {
          code: old.code,
          repertoire_code: 'PRO',
          voice_id: voice,
          manually_blocked: true,
          archived: false,
        };
        await assert.rejects(
          music('FOLDER_SAVE', f, old.version, { ...data, archived: true }),
          /FOLDER_IN_CUSTODY/,
        );
        await assert.rejects(
          query('select public.set_person_archived($1,1,true)', [person]),
          /PERSON_IN_CUSTODY/,
        );
        await music('FOLDER_SAVE', f, old.version, data);
        await apply(await returning(f, d.id));
        assert.equal((await folder(f)).usable, false);
        assert.equal((await folder(f)).holder_id, null);
      },
    );
    await t.test(
      'devolución e incidencia atómicas; daño no es ausencia; resolución no implícita',
      async () => {
        const f = await make(),
          d = await delivery(f);
        await apply(d);
        const w = (
          await query(
            'select version from public.repertoire_works where id=$1',
            [work],
          )
        )[0];
        const p = await returning(f, d.id, {
          family: 'SCORE',
          kind: 'DAMAGED',
          description: 'Dañada al volver',
          work_id: work,
          work_version: w.version,
        });
        // Simulate failure inside issue registration, after the return writes: transaction must roll back.
        await db.exec(
          "create function private.qa_fail_issue() returns trigger language plpgsql as $$begin raise exception 'QA_ISSUE_FAILURE';end$$;create trigger qa_fail before insert on public.folder_score_issues for each row execute function private.qa_fail_issue();",
        );
        await assert.rejects(apply(p), /QA_ISSUE_FAILURE/);
        assert.equal((await folder(f)).holder_id, person);
        await db.exec(
          'drop trigger qa_fail on public.folder_score_issues;drop function private.qa_fail_issue();',
        );
        const request = uuid();
        await apply(p, true, true, request);
        await apply(p, true, true, request);
        assert.equal((await folder(f)).holder_id, null);
        assert.equal((await folder(f)).present_count, 1);
        assert.equal((await folder(f)).conservation_issue_count, 1);
        assert.equal(
          (
            await query(
              'select count(*)::int n from public.folder_loan_movements where loan_id=$1',
              [d.id],
            )
          )[0].n,
          2,
        );
      },
    );
    await t.test(
      'incidencia física opcional bloquea; faltante en devolución cambia presencia',
      async () => {
        const f = await make(),
          d = await delivery(f);
        await apply(d);
        await apply(
          await returning(f, d.id, {
            family: 'PHYSICAL',
            kind: 'RINGS',
            description: 'Anillas rotas',
            blocks_use: true,
          }),
        );
        assert.equal((await folder(f)).usable, false);
        const f2 = await make(),
          d2 = await delivery(f2);
        await apply(d2);
        await apply(
          await returning(f2, d2.id, {
            family: 'SCORE',
            kind: 'MISSING',
            description: null,
            work_id: work,
            work_version: 1,
          }),
        );
        assert.equal((await folder(f2)).missing_count, 1);
        assert.equal((await folder(f2)).usable, true);
      },
    );
    await t.test(
      'una entrega directa no puede apropiarse del UUID de una reserva ajena',
      async () => {
        const f = await make(),
          r = await plan(f);
        await apply(r, false);
        const forged = await delivery(f, 1, r.id, false, null);
        await assert.rejects(apply(forged), /MUSIC_IDENTITY_FIXED/);
        assert.equal((await folder(f)).holder_id, null);
        const otherFolder = await make(),
          d = await delivery(otherFolder);
        await apply(d);
        const reused = await plan(f, 4, 5, d.id);
        await assert.rejects(apply(reused, false), /MUSIC_IDENTITY_FIXED/);
      },
    );
    await t.test(
      'versiones, esquemas cerrados, fechas de Madrid y RLS',
      async () => {
        const f = await make(),
          p = await plan(f);
        const otherPlan = await plan(f, 4, 5);
        await apply(otherPlan, false);
        await assert.rejects(apply(p, false), /MUSIC_CHANGED/);
        await assert.rejects(
          preview('RESERVE', uuid(), null, {
            ...p.data,
            folder_version: (await folder(f)).version,
            start_local: '2030-10-27T02:30',
            due_local: null,
          }),
          /FOLDER_INVALID_DATE/,
        );
        await assert.rejects(
          preview('RESERVE', uuid(), null, {
            ...p.data,
            signature_image: 'data:bad',
          }),
          /MUSIC_INVALID_DATA/,
        );
        await assert.rejects(
          preview('RESERVE', uuid(), null, p.data, outsider),
          /ADMIN_REQUIRED/,
        );
        for (const table of [
          'folder_reservations',
          'folder_loans',
          'folder_loan_items',
          'folder_loan_movements',
          'material_operations',
          'folder_loan_overview',
        ]) {
          assert.equal(
            (await query('select * from public.' + table, [], outsider)).length,
            0,
          );
          await assert.rejects(
            query('select * from public.' + table, [], '', 'anon'),
            /permission denied/,
          );
          await assert.rejects(
            query('delete from public.' + table),
            /permission denied|cannot delete/,
          );
        }
        assert.equal(
          (await query('select count(*)::int n from public.loans'))[0].n,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
