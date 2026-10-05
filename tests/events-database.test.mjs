import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
test('Actuaciones individuales: planificación, disponibilidad y entrega', async (t) => {
  const db = new PGlite();
  const admin = uuid(),
    outsider = uuid(),
    person = uuid(),
    other = uuid(),
    uniform = uuid(),
    event = uuid(),
    second = uuid(),
    g = uuid(),
    g2 = uuid();
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
    const call = async (
      action,
      id,
      version,
      data,
      request = uuid(),
      actor = admin,
    ) =>
      (
        await user(
          'select public.plan_event($1,$2,$3,$4,$5) result',
          [request, action, id, version, JSON.stringify(data)],
          actor,
        )
      )[0].result;
    const row = async (id) =>
      (await user('select * from public.events where id=$1', [id]))[0];
    const act = async (action, data, id = event) =>
      call(action, id, (await row(id)).version, data);
    const type = (
      await user("select id from public.garment_types where name='Chaqueta'")
    )[0].id;
    const shirt = (
      await user("select id from public.garment_types where name='Camisa'")
    )[0].id;
    const input = {
      title: 'Concierto',
      uniform_id: uniform,
      starts: '2090-01-10T12:00',
      ends: '2090-01-10T13:00',
      from: '2090-01-10T11:00',
      until: '2090-01-10T14:00',
      notes: '',
    };
    const ud = { name: 'Invierno', type_ids: [type], archived: false };
    await t.test(
      'RLS, permisos y campos mínimos sin datos de firma',
      async () => {
        await assert.rejects(
          call('UNIFORM', uniform, null, ud, uuid(), outsider),
          /ADMIN_REQUIRED/,
        );
        for (const table of [
          'events',
          'uniforms',
          'event_participants',
          'event_assignments',
          'planning_requests',
        ]) {
          assert.deepEqual(
            await user('select * from public.' + table, [], outsider),
            [],
          );
          await assert.rejects(
            user('delete from public.' + table),
            /permission denied/,
          );
          await assert.rejects(
            user('select * from public.' + table, [], '', 'anon'),
            /permission denied/,
          );
        }
        await assert.rejects(
          call('UNIFORM', uniform, null, { ...ud, image: 'data:image' }),
          /INVALID_PLAN/,
        );
        await assert.rejects(
          call('UNIFORM', uniform, null, { ...ud, type_ids: [] }),
          /INVALID_PLAN/,
        );
      },
    );
    await t.test('uniforme configurable y reintento idempotente', async () => {
      const request = uuid();
      const u = await call('UNIFORM', uniform, null, ud, request);
      assert.equal(u.version, 1);
      assert.deepEqual(await call('UNIFORM', uniform, null, ud, request), u);
      await assert.rejects(
        call('UNIFORM', uniform, null, { ...ud, name: 'Otro' }, request),
        /REQUEST_ALREADY_USED/,
      );
      await call('EVENT', event, null, input);
      await call('UNIFORM', uniform, 1, { ...ud, type_ids: [type, shirt] });
      assert.deepEqual((await row(event)).type_ids, [type]);
    });
    await t.test(
      'Madrid y validación de intervalos y cambios horarios',
      async () => {
        assert.equal(
          new Date((await row(event)).starts_at).toISOString(),
          '2090-01-10T11:00:00.000Z',
        );
        for (const patch of [
          { ends: input.starts },
          { from: input.ends },
          { until: input.starts },
          { starts: '2027-03-28T02:30' },
          { starts: '2027-10-31T02:30' },
        ])
          await assert.rejects(
            call('EVENT', uuid(), null, { ...input, ...patch }),
            /INVALID_EVENT_DATE/,
          );
      },
    );
    await t.test(
      'alta rápida atómica, instrumento obligatorio y reutilización de identidad',
      async () => {
        await assert.rejects(
          act('PARTICIPANT', {
            person_id: person,
            name: 'Ana',
            instrument: '',
          }),
          /INSTRUMENT_REQUIRED/,
        );
        assert.equal((await user('select * from public.people')).length, 0);
        const version = (await row(event)).version;
        const request = uuid();
        const data = {
          person_id: person,
          name: 'Ana',
          instrument: 'Clarinete',
          active: true,
        };
        await call('PARTICIPANT', event, version, data, request);
        await call('PARTICIPANT', event, version, data, request);
        assert.equal((await user('select * from public.people')).length, 1);
        await call('EVENT', second, null, {
          ...input,
          title: 'Segundo concierto',
          from: input.until,
          starts: input.until,
          ends: '2090-01-10T15:00',
          until: '2090-01-10T16:00',
        });
        await act('PARTICIPANT', { person_id: person, active: true }, second);
        assert.equal((await user('select * from public.people')).length, 1);
        await act('PARTICIPANT', {
          person_id: other,
          name: 'Luis',
          instrument: 'Trompeta',
          active: true,
        });
      },
    );
    for (const [id, code] of [
      [g, 'C1'],
      [g2, 'C2'],
    ])
      await user('select public.save_garment($1,null,$2,$3,$4,$5,null)', [
        id,
        code,
        type,
        '48',
        'DISPONIBLE',
      ]);
    await t.test(
      'asignación futura no crea cesión ni altera estado; dos actuaciones adyacentes',
      async () => {
        await act('ASSIGN', {
          person_id: person,
          type_id: type,
          garment_id: g,
        });
        await act(
          'ASSIGN',
          { person_id: person, type_id: type, garment_id: g },
          second,
        );
        assert.equal((await user('select * from public.loans')).length, 0);
        const inventory = (
          await user('select * from public.garment_inventory where id=$1', [g])
        )[0];
        assert.equal(inventory.loan_id, null);
        assert.equal(inventory.next_assignee, 'Ana');
        assert.equal(inventory.physical_state, 'DISPONIBLE');
      },
    );
    await t.test(
      'rechaza solapamientos, cambios horarios incompatibles y versiones antiguas',
      async () => {
        await assert.rejects(
          act('ASSIGN', { person_id: other, type_id: type, garment_id: g }),
          /RESERVATION_OVERLAP/,
        );
        await assert.rejects(
          act(
            'EVENT',
            {
              ...input,
              title: 'Segundo',
              from: '2090-01-10T13:30',
              starts: '2090-01-10T14:00',
              ends: '2090-01-10T15:00',
              until: '2090-01-10T16:00',
            },
            second,
          ),
          /RESERVATION_OVERLAP/,
        );
        await assert.rejects(call('CANCEL', event, 1, {}), /PLAN_CHANGED/);
        assert.equal(
          (
            await user(
              'select * from public.event_assignments where event_id=$1 and person_id=$2',
              [event, other],
            )
          ).length,
          0,
        );
      },
    );
    await t.test(
      'buscador distingue prendas bloqueadas y disponibilidad de todo el periodo',
      async () => {
        const choices = (
          await user(
            'select public.event_garment_choices($1,$2,$3,$4,1) result',
            [event, other, type, 'C'],
          )
        )[0].result;
        assert.equal(
          choices.rows.find((r) => r.id === g).blocked,
          'Reservada en ese periodo',
        );
        assert.equal(choices.rows.find((r) => r.id === g2).blocked, null);
      },
    );
    const loan = uuid();
    let deliveryVersion,
      deliveryRequest = uuid();
    const delivery = {
      person_id: person,
      loan_id: loan,
      garment_ids: [g],
      signed: true,
    };
    await t.test(
      'entrega exige firma, comprueba plan y conserva idempotencia',
      async () => {
        await assert.rejects(
          act('DELIVER', { ...delivery, signed: false }),
          /SIGNATURE_REQUIRED/,
        );
        await assert.rejects(
          act('DELIVER', { ...delivery, garment_ids: [g2] }),
          /PLAN_CHANGED/,
        );
        deliveryVersion = (await row(event)).version;
        await call(
          'DELIVER',
          event,
          deliveryVersion,
          delivery,
          deliveryRequest,
        );
        await call(
          'DELIVER',
          event,
          deliveryVersion,
          delivery,
          deliveryRequest,
        );
        assert.equal(
          (await user('select * from public.loan_movements')).length,
          1,
        );
        const prep = (
          await user(
            'select * from public.event_preparation where event_id=$1 and person_id=$2',
            [event, person],
          )
        )[0];
        assert.equal(prep.status, 'EN_SU_PODER');
        await assert.rejects(
          act('DELIVER', { ...delivery, loan_id: uuid() }),
          /GARMENT_IN_CUSTODY/,
        );
      },
    );
    await t.test(
      'cancelación libera reservas pero no inventa devoluciones ni borra la cesión',
      async () => {
        await act('CANCEL', {});
        assert.equal(
          (
            await user(
              'select * from public.garment_reservations where event_id=$1',
              [event],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await user(
              'select * from public.loan_items where returned_at is null',
            )
          ).length,
          1,
        );
        await assert.rejects(
          act('ASSIGN', { person_id: person, type_id: type, garment_id: g2 }),
          /EVENT_CANCELLED/,
        );
      },
    );
    await t.test(
      'devolución real actualiza preparación; la reserva siguiente se conserva',
      async () => {
        const item = (
          await user('select * from public.loan_items where loan_id=$1', [loan])
        )[0];
        await user(
          "select public.record_loan_movement($1,'DEVOLUCION',$2,1,null,'{}',$3,null,null,true)",
          [
            uuid(),
            loan,
            JSON.stringify([{ item_id: item.id, state: 'DISPONIBLE' }]),
          ],
        );
        assert.equal(
          (
            await user(
              'select * from public.event_preparation where event_id=$1 and person_id=$2',
              [event, person],
            )
          )[0].status,
          'DEVUELTA',
        );
        assert.equal(
          (
            await user(
              'select * from public.garment_reservations where event_id=$1',
              [second],
            )
          ).length,
          1,
        );
      },
    );
    await t.test(
      'cambios físicos hacen visible el conflicto sin borrar la asignación',
      async () => {
        await user('select public.save_garment($1,1,$2,$3,$4,$5,null)', [
          g,
          'C1',
          type,
          '48',
          'DANADA',
        ]);
        assert.equal(
          (
            await user(
              'select * from public.event_preparation where event_id=$1 and garment_id=$2',
              [second, g],
            )
          )[0].status,
          'CONFLICTO',
        );
        assert.equal(
          (
            await user(
              'select * from public.event_assignments where event_id=$1 and garment_id=$2',
              [second, g],
            )
          ).length,
          1,
        );
      },
    );
    await t.test(
      'posesión real: misma persona reutiliza; otra sin fecha bloquea; devolución compatible avisa',
      async () => {
        const third = uuid();
        await call('EVENT', third, null, {
          ...input,
          title: 'Tercera',
          starts: '2090-01-12T12:00',
          ends: '2090-01-12T13:00',
          from: '2090-01-12T11:00',
          until: '2090-01-12T14:00',
        });
        await act('PARTICIPANT', { person_id: person, active: true }, third);
        await act('PARTICIPANT', { person_id: other, active: true }, third);
        const heldLoan = uuid();
        await user(
          "select public.record_loan_movement($1,'ENTREGA',$2,null,$3,$4,'[]',null,null,true)",
          [uuid(), heldLoan, other, [g2]],
        );
        await assert.rejects(
          act(
            'ASSIGN',
            { person_id: person, type_id: type, garment_id: g2 },
            third,
          ),
          /GARMENT_IN_CUSTODY/,
        );
        await act(
          'ASSIGN',
          { person_id: other, type_id: type, garment_id: g2 },
          third,
        );
        assert.equal(
          (
            await user(
              'select * from public.event_preparation where event_id=$1 and person_id=$2 and type_id=$3',
              [third, other, type],
            )
          )[0].status,
          'EN_SU_PODER',
        );
        const g3 = uuid(),
          scheduledLoan = uuid();
        await user('select public.save_garment($1,null,$2,$3,$4,$5,null)', [
          g3,
          'C3',
          type,
          '50',
          'DISPONIBLE',
        ]);
        await user(
          "select public.record_loan_movement($1,'ENTREGA',$2,null,$3,$4,'[]',$5,null,true)",
          [uuid(), scheduledLoan, other, [g3], '2090-01-12T10:00'],
        );
        await act(
          'ASSIGN',
          { person_id: person, type_id: type, garment_id: g3 },
          third,
        );
        assert.equal(
          (
            await user(
              'select * from public.event_preparation where event_id=$1 and garment_id=$2',
              [third, g3],
            )
          )[0].status,
          'PENDIENTE_DEVOLUCION',
        );
        const line = (
          await user('select * from public.loan_items where loan_id=$1', [
            scheduledLoan,
          ])
        )[0];
        await user(
          "select public.record_loan_movement($1,'DEVOLUCION',$2,1,null,'{}',$3,null,null,true)",
          [
            uuid(),
            scheduledLoan,
            JSON.stringify([{ item_id: line.id, state: 'DISPONIBLE' }]),
          ],
        );
        assert.equal(
          (
            await user(
              'select * from public.event_preparation where event_id=$1 and garment_id=$2',
              [third, g3],
            )
          )[0].status,
          'ASIGNADA',
        );
        const earlier = uuid();
        await call('EVENT', earlier, null, {
          ...input,
          title: 'Recogida anterior',
          starts: '2090-01-11T12:00',
          ends: '2090-01-11T13:00',
          from: '2090-01-11T11:00',
          until: '2090-01-11T14:00',
        });
        await act('PARTICIPANT', { person_id: other, active: true }, earlier);
        await act(
          'ASSIGN',
          { person_id: other, type_id: type, garment_id: g3 },
          earlier,
        );
        await assert.rejects(
          act(
            'DELIVER',
            {
              person_id: person,
              loan_id: uuid(),
              garment_ids: [g3],
              signed: true,
            },
            third,
          ),
          /RESERVATION_OVERLAP/,
        );
      },
    );
    await t.test(
      'reincorporar un participante no reactiva reservas antiguas ni borra cesiones',
      async () => {
        const isolated = uuid(),
          reserved = uuid(),
          held = uuid();
        await call('EVENT', isolated, null, {
          ...input,
          title: 'Reincorporación',
        });
        for (const personId of [person, other])
          await act(
            'PARTICIPANT',
            { person_id: personId, active: true },
            isolated,
          );
        for (const [id, code] of [
          [reserved, 'REJOIN-1'],
          [held, 'REJOIN-2'],
        ])
          await user('select public.save_garment($1,null,$2,$3,$4,$5,null)', [
            id,
            code,
            type,
            '48',
            'DISPONIBLE',
          ]);
        await act(
          'ASSIGN',
          { person_id: person, type_id: type, garment_id: reserved },
          isolated,
        );
        await act(
          'PARTICIPANT',
          { person_id: person, active: false },
          isolated,
        );
        await act(
          'ASSIGN',
          { person_id: other, type_id: type, garment_id: reserved },
          isolated,
        );
        await act('PARTICIPANT', { person_id: person, active: true }, isolated);
        const assignments = await user(
          'select * from public.event_assignments where event_id=$1',
          [isolated],
        );
        assert.equal(
          assignments.find((a) => a.person_id === person).garment_id,
          null,
        );
        assert.equal(
          assignments.find((a) => a.person_id === other).garment_id,
          reserved,
        );
        // Selecting an already active participant must not clear their current plan.
        await act('PARTICIPANT', { person_id: other, active: true }, isolated);
        assert.equal(
          (
            await user(
              'select * from public.event_assignments where event_id=$1 and person_id=$2',
              [isolated, other],
            )
          )[0].garment_id,
          reserved,
        );
        await assert.rejects(
          act(
            'ASSIGN',
            { person_id: person, type_id: type, garment_id: reserved },
            isolated,
          ),
          /RESERVATION_OVERLAP/,
        );
        // Rejoining with a garment physically held resets planning, never custody or history.
        await act(
          'ASSIGN',
          { person_id: person, type_id: type, garment_id: held },
          isolated,
        );
        const loanId = uuid();
        await act(
          'DELIVER',
          {
            person_id: person,
            loan_id: loanId,
            garment_ids: [held],
            signed: true,
          },
          isolated,
        );
        await act(
          'PARTICIPANT',
          { person_id: person, active: false },
          isolated,
        );
        const request = uuid(),
          version = (await row(isolated)).version;
        const data = { person_id: person, active: true };
        await call('PARTICIPANT', isolated, version, data, request);
        await call('PARTICIPANT', isolated, version, data, request);
        const assignment = (
          await user(
            'select * from public.event_assignments where event_id=$1 and person_id=$2',
            [isolated, person],
          )
        )[0];
        assert.equal(assignment.garment_id, null);
        assert.equal(assignment.fulfilled_item_id, null);
        const lines = await user(
          'select * from public.loan_items where loan_id=$1',
          [loanId],
        );
        assert.equal(lines.length, 1);
        assert.equal(lines[0].returned_at, null);
        assert.equal(
          (
            await user('select * from public.loan_movements where loan_id=$1', [
              loanId,
            ])
          ).length,
          1,
        );
        const audit = await user(
          "select before_data from public.audit_log where event_id=$1 and action='PARTICIPANT'",
          [isolated],
        );
        assert(
          audit.some((a) =>
            a.before_data.assignments.some(
              (old) => old.fulfilled_item_id === lines[0].id,
            ),
          ),
        );
        assert.equal(
          (
            await user(
              'select * from public.event_preparation where event_id=$1 and person_id=$2 and type_id=$3',
              [isolated, person, type],
            )
          )[0].status,
          'SIN_ASIGNAR',
        );
      },
    );
    await t.test(
      'auditoría con responsable de servidor y acceso revocado',
      async () => {
        const audit = await user(
          "select * from public.audit_log where entity_type in ('event','uniform')",
        );
        assert(audit.length > 5);
        assert(
          audit.every((r) => r.actor_id === admin && r.actor_name === 'Admin'),
        );
        await db.query(
          'update public.admin_profiles set active=false where user_id=$1',
          [admin],
        );
        assert.deepEqual(
          await user('select * from public.event_preparation'),
          [],
        );
        await assert.rejects(act('CANCEL', {}, second));
      },
    );
  } finally {
    await db.close();
  }
});
