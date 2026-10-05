import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { adminQuery } from './admin-query';

test.describe('Supabase real · recomendaciones fase 7', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere proyecto independiente',
  );
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(180000);
  const prefix = 'QA-R-' + uuid().slice(0, 8).toUpperCase(),
    event = uuid(),
    uniform = uuid(),
    sid = uuid(),
    seriesEvents = [uuid(), uuid()],
    people = [uuid(), uuid(), uuid()],
    garments = [uuid(), uuid()];
  let client: ReturnType<typeof createClient>,
    admin: { email: string; password: string },
    type: string;
  async function rpc(name: string, args: Record<string, unknown>) {
    const r = await client.rpc(name, args);
    expect(r.error).toBeNull();
    return r.data;
  }
  async function eventCommand(id: string, action: string, data: unknown) {
    const r = await client
      .from('events')
      .select('version')
      .eq('id', id)
      .maybeSingle();
    return rpc('plan_event', {
      p_request_id: uuid(),
      p_action: action,
      p_id: id,
      p_expected_version: r.data?.version ?? null,
      p_data: data,
    });
  }
  async function seriesCommand(action: string, data: unknown) {
    const r = await client
      .from('event_series')
      .select('version')
      .eq('id', sid)
      .maybeSingle();
    return rpc('plan_series', {
      p_request_id: uuid(),
      p_action: action,
      p_id: sid,
      p_expected_version: r.data?.version ?? null,
      p_data: data,
    });
  }
  test.beforeAll(async () => {
    process.loadEnvFile('.env');
    admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
    client = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect((await client.auth.signInWithPassword(admin)).error).toBeNull();
    type = (
      await client
        .from('garment_types')
        .select('id')
        .eq('name', 'Chaqueta')
        .single()
    ).data!.id;
    await rpc('plan_event', {
      p_request_id: uuid(),
      p_action: 'UNIFORM',
      p_id: uniform,
      p_expected_version: null,
      p_data: { name: prefix, type_ids: [type] },
    });
    for (let i = 0; i < 3; i++)
      await rpc('save_person', {
        p_id: people[i],
        p_expected_version: null,
        p_full_name: prefix + ' Persona ' + i,
        p_kind: 'REFUERZO',
        p_instrument: 'Clarinete',
        p_phone: null,
        p_notes: null,
      });
    for (let i = 0; i < 2; i++) {
      await rpc('save_garment', {
        p_id: garments[i],
        p_expected_version: null,
        p_code: prefix + '-' + i,
        p_garment_type_id: type,
        p_size: 'QA-TALLA-' + i,
        p_physical_state: 'DISPONIBLE',
        p_notes: null,
      });
      const loan = uuid();
      await rpc('record_loan_movement', {
        p_request_id: uuid(),
        p_kind: 'ENTREGA',
        p_loan_id: loan,
        p_expected_version: null,
        p_person_id: people[i],
        p_garment_ids: [garments[i]],
        p_returns: [],
        p_due_local: null,
        p_notes: null,
        p_signature_confirmed: true,
      });
      const item = (
        await client
          .from('loan_items')
          .select('id')
          .eq('loan_id', loan)
          .single()
      ).data!;
      await rpc('record_loan_movement', {
        p_request_id: uuid(),
        p_kind: 'DEVOLUCION',
        p_loan_id: loan,
        p_expected_version: 1,
        p_person_id: null,
        p_garment_ids: [],
        p_returns: [{ item_id: item.id, state: 'DISPONIBLE' }],
        p_due_local: null,
        p_notes: null,
        p_signature_confirmed: true,
      });
    }
    for (const [i, id] of [event, ...seriesEvents].entries())
      await eventCommand(id, 'EVENT', {
        title: prefix + ' Actuación ' + i,
        uniform_id: uniform,
        starts: '2091-04-0' + (i + 2) + 'T18:00',
        ends: '2091-04-0' + (i + 2) + 'T20:00',
        from: '2091-04-0' + (i + 2) + 'T16:00',
        until: '2091-04-0' + (i + 2) + 'T22:00',
      });
    for (const person of people)
      await eventCommand(event, 'PARTICIPANT', { person_id: person });
    await seriesCommand('SERIES', { name: prefix + ' Serie' });
    for (const id of seriesEvents) {
      const e = (
        await client.from('events').select('version').eq('id', id).single()
      ).data!;
      await seriesCommand('MEMBERSHIP', {
        event_id: id,
        event_version: e.version,
        active: true,
      });
    }
    for (const person of people)
      await seriesCommand('ATTENDANCE', {
        person_id: person,
        event_ids: seriesEvents,
      });
  });
  test.afterAll(async () => {
    await adminQuery(`begin;
 create temporary table qe as select id from public.events where id in('${[event, ...seriesEvents].join("','")}') and title like '${prefix}%';
 create temporary table qp as select id from public.people where id in('${people.join("','")}') and full_name like '${prefix}%';
 create temporary table qg as select id from public.garments where id in('${garments.join("','")}') and code like '${prefix}%';
 create temporary table ql as select id from public.loans where person_id in(select id from qp);
 delete from public.audit_log where series_id='${sid}' or event_id in(select id from qe) or uniform_id='${uniform}' or person_id in(select id from qp) or garment_id in(select id from qg) or loan_id in(select id from ql);
 delete from public.planning_requests where payload->>'id' in(select id::text from qe) or payload->>'id' in('${sid}','${uniform}');
 delete from public.event_assignments where event_id in(select id from qe);
 delete from public.event_participants where event_id in(select id from qe);
 delete from public.series_blocks where series_id='${sid}';
 delete from public.events where id in(select id from qe);
 delete from public.event_series where id='${sid}' and name like '${prefix}%';
 delete from public.uniforms where id='${uniform}' and name like '${prefix}%';
 delete from public.loan_movements where loan_id in(select id from ql);
 delete from public.loan_items where loan_id in(select id from ql);
 delete from public.loans where id in(select id from ql);
 delete from public.people where id in(select id from qp);
 delete from public.garments where id in(select id from qg);commit;`);
    await client?.auth.signOut({ scope: 'local' });
  });
  test('histórico, vista previa, reintento, revisión manual y serie sin duplicar cesiones', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await page.goto('/actuaciones/' + event);
    await page
      .getByRole('button', { name: 'Asignar prenda', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Talla según histórico: QA-TALLA-0' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Elegir recomendación ' + prefix + '-0',
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Ver propuestas', exact: true })
      .click();
    await expect(
      page.getByText('2 asignaciones propuestas', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('1 necesitan revisión', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await client
          .from('event_assignments')
          .select('garment_id')
          .eq('event_id', event)
      ).data,
    ).toHaveLength(0);
    mkdirSync('.local/screenshots', { recursive: true });
    if (info.project.name === 'desktop')
      for (const width of [320, 390, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    await page.locator('app-assisted-preparation').screenshot({
      path: '.local/screenshots/fase7-' + info.project.name + '.png',
    });
    let dropped = false,
      request: unknown;
    await page.route('**/rpc/apply_assisted_plan', async (route) => {
      if (!dropped) {
        dropped = true;
        request = route.request().postDataJSON();
        await route.fetch();
        await route.abort('failed');
      } else {
        expect(route.request().postDataJSON()).toEqual(request);
        await route.continue();
      }
    });
    await page
      .getByRole('button', { name: 'Aplicar 2 propuestas', exact: true })
      .click();
    await expect(
      page.locator('app-assisted-preparation [role="alert"]'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Aplicar 2 propuestas', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Cambiar asignación', exact: true }),
    ).toHaveCount(2);
    await page.unroute('**/rpc/apply_assisted_plan');
    await page
      .getByRole('button', { name: 'Asignar prenda', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Sin histórico de vestuario' }),
    ).toBeVisible();
    await page.goto('/actuaciones/series/' + sid);
    await page
      .getByRole('button', { name: 'Ver propuestas', exact: true })
      .click();
    await expect(
      page.getByText('2 asignaciones propuestas', { exact: true }),
    ).toBeVisible();
    const plan = await rpc('preview_assisted_plan', {
      p_scope: 'series',
      p_id: sid,
    });
    const results = await Promise.all(
      [1, 2].map(() =>
        client.rpc('apply_assisted_plan', {
          p_request_id: uuid(),
          p_preview: plan,
        }),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.message).toContain(
      'RECOMMENDATION_CHANGED',
    );
    await page
      .getByRole('button', { name: 'Aplicar 2 propuestas', exact: true })
      .click();
    await expect(
      page.locator('app-assisted-preparation [role="alert"]'),
    ).toContainText('propuestas');
    await page
      .getByRole('button', { name: 'Ver propuestas', exact: true })
      .click();
    await expect(
      page.getByText('2 asignaciones conservadas', { exact: true }),
    ).toBeVisible();
    expect(
      (
        await client
          .from('event_assignments')
          .select('garment_id')
          .in('event_id', seriesEvents)
      ).data,
    ).toHaveLength(4);
    expect(
      (await client.from('loans').select('id').in('person_id', people)).data,
    ).toHaveLength(2);
    expect(errors).toEqual([]);
  });
});
