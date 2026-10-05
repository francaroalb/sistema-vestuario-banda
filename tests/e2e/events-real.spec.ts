import { test, expect, Page } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { adminQuery } from './admin-query';
import { randomUUID as uuid } from 'node:crypto';
import { Database, Json } from '../../src/app/core/config/database.types';
import { BandEvent } from '../../src/app/core/events/models';
async function sign(page: Page, touch: boolean) {
  const canvas = page.getByRole('img', { name: 'Área de firma' });
  await canvas.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  await expect(canvas).toBeInViewport({ ratio: 1 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const box = (await canvas.boundingBox())!;
  const points = Array.from({ length: 12 }, (_, i) => ({
    x: box.x + 25 + i * 10,
    y: box.y + 50 + (i % 3) * 15,
  }));
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [points[0]],
    });
    for (const point of points.slice(1))
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point],
      });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const point of points.slice(1))
      await page.mouse.move(point.x, point.y);
    await page.mouse.up();
  }
  await expect(
    page.getByText('Firma preparada.', { exact: true }),
  ).toBeVisible();
}

test.describe('Supabase real · actuaciones fase 5', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere proyecto independiente.',
  );
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(120000);
  let client: SupabaseClient<Database>,
    admin: { email: string; password: string; id: string },
    type: string,
    shirt: string;
  const prefix = 'QA-E-' + Date.now().toString(36).toUpperCase();
  const people: string[] = [],
    garments: string[] = [],
    events: string[] = [],
    uniforms: string[] = [],
    loans: string[] = [];
  test.beforeAll(async () => {
    if (existsSync('.env')) process.loadEnvFile('.env');
    admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
    client = createClient<Database>(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(
      (
        await client.auth.signInWithPassword({
          email: admin.email,
          password: admin.password,
        })
      ).error,
    ).toBeNull();
    const r = await client.from('garment_types').select('*');
    expect(r.error).toBeNull();
    type = r.data!.find((t) => t.name === 'Chaqueta')!.id;
    shirt = r.data!.find((t) => t.name === 'Camisa')!.id;
  });
  test.afterAll(async () => {
    const ref = JSON.parse(readFileSync('.local/project.json', 'utf8')).id;
    expect(ref).toBe('vbrtkmufrtfuanimmqyp');
    const ids = (values: string[]) =>
      values.length
        ? values
            .map((id) => {
              if (!/^[\da-f-]{36}$/.test(id)) throw Error('Invalid ID');
              return `'${id}'`;
            })
            .join(',')
        : "'00000000-0000-0000-0000-000000000000'";
    const query = `begin;
  create temporary table qe as select id from public.events where id in (${ids(events)}) and title like '${prefix}%';
  create temporary table qu as select id from public.uniforms where id in (${ids(uniforms)}) and name like '${prefix}%';
  create temporary table qp as select id from public.people where id in (${ids(people)}) and full_name like '${prefix}%';
  create temporary table qg as select id from public.garments where id in (${ids(garments)}) and code like '${prefix}%';
  create temporary table ql as select id from public.loans where id in (${ids(loans)}) and person_id in(select id from qp);
  delete from public.audit_log where event_id in(select id from qe) or uniform_id in(select id from qu) or loan_id in(select id from ql) or person_id in(select id from qp) or garment_id in(select id from qg);
  delete from public.planning_requests where payload->>'id' in(select id::text from qe union select id::text from qu);
  delete from public.event_assignments where event_id in(select id from qe);
  delete from public.event_participants where event_id in(select id from qe);
  delete from public.events where id in(select id from qe);
  delete from public.uniforms where id in(select id from qu);
  delete from public.loan_movements where loan_id in(select id from ql);
  delete from public.loan_items where loan_id in(select id from ql);
  delete from public.loans where id in(select id from ql);
  delete from public.people where id in(select id from qp);
  delete from public.garments where id in(select id from qg);commit;`;
    await adminQuery(query);
    await client?.auth.signOut({ scope: 'local' });
  });
  async function person(label: string) {
    const id = uuid();
    people.push(id);
    const name = prefix + ' ' + label;
    expect(
      (
        await client.rpc('save_person', {
          p_id: id,
          p_expected_version: null,
          p_full_name: name,
          p_kind: 'REFUERZO',
          p_instrument: 'Clarinete',
          p_phone: null,
          p_notes: null,
        })
      ).error,
    ).toBeNull();
    return { id, name };
  }
  async function garment(label: string) {
    const id = uuid();
    garments.push(id);
    const code = prefix + '-' + label;
    expect(
      (
        await client.rpc('save_garment', {
          p_id: id,
          p_expected_version: null,
          p_code: code,
          p_garment_type_id: type,
          p_size: '48',
          p_physical_state: 'DISPONIBLE',
          p_notes: null,
        })
      ).error,
    ).toBeNull();
    return { id, code };
  }
  async function plan(
    action: string,
    id: string,
    version: number | null,
    data: Json,
  ) {
    const r = await client.rpc('plan_event', {
      p_request_id: uuid(),
      p_action: action,
      p_id: id,
      p_expected_version: version,
      p_data: data,
    });
    expect(r.error).toBeNull();
    return r.data as unknown as BandEvent;
  }
  test('uniforme, actuación, refuerzo, reserva, firma y devolución en navegador', async ({
    page,
    context,
  }, info) => {
    const p = await person('Existente ' + info.project.name),
      g = await garment('PREPARAR');
    const title = prefix + ' Concierto ' + info.project.name;
    const uName = prefix + ' Uniforme';
    const name = prefix + ' Refuerzo rápido';
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const payloads: any[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/rpc/plan_event')) {
        const b = req.postDataJSON();
        payloads.push(b);
        if (b.p_action === 'UNIFORM' && !uniforms.includes(b.p_id))
          uniforms.push(b.p_id);
        if (b.p_action === 'EVENT' && !events.includes(b.p_id))
          events.push(b.p_id);
        if (
          b.p_action === 'PARTICIPANT' &&
          b.p_data.name &&
          !people.includes(b.p_data.person_id)
        )
          people.push(b.p_data.person_id);
        if (b.p_action === 'DELIVER' && !loans.includes(b.p_data.loan_id))
          loans.push(b.p_data.loan_id);
      }
    });
    await page.goto('/actuaciones/uniformes');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page
      .getByRole('button', { name: 'Nuevo uniforme', exact: true })
      .click();
    await page.getByLabel('Nombre del uniforme').fill(uName);
    await page.getByRole('checkbox', { name: 'Chaqueta', exact: true }).check();
    await page.getByRole('button', { name: 'Guardar uniforme' }).click();
    await expect(
      page.getByRole('heading', { name: uName, exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Volver a Actuaciones' }).click();
    await page
      .getByRole('link', { name: 'Nueva actuación', exact: true })
      .click();
    await page.getByLabel('Nombre de la actuación').fill(title);
    await page
      .getByLabel('Uniforme', { exact: true })
      .selectOption({ label: uName });
    await page.getByLabel('Inicio', { exact: true }).fill('2090-01-10T12:00');
    await page.getByLabel('Fin', { exact: true }).fill('2090-01-10T14:00');
    await page.getByLabel('Entrega prevista desde').fill('2090-01-10T10:00');
    await page
      .getByLabel('Devolución prevista', { exact: true })
      .fill('2090-01-10T16:00');
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Guardar actuación' }),
    ).toBeDisabled();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Guardar actuación' }).click();
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    const event = events.at(-1)!;
    await page
      .getByRole('button', { name: 'Añadir participante', exact: true })
      .click();
    await page.getByLabel('Buscar persona', { exact: true }).fill(p.name);
    await page
      .getByRole('button', { name: 'Seleccionar ' + p.name, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: p.name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Añadir participante', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'No existe: crear refuerzo' })
      .click();
    await page.getByLabel('Nombre y apellidos').fill(name);
    await expect(
      page.getByRole('button', { name: 'Crear y añadir' }),
    ).toBeDisabled();
    await page.getByLabel('Instrumento', { exact: true }).fill('Saxofón');
    await page.getByRole('button', { name: 'Crear y añadir' }).click();
    let section = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(section).toBeVisible();
    await section
      .getByRole('button', { name: 'Asignar prenda', exact: true })
      .click();
    await page.getByLabel('Buscar por código').fill(g.code);
    await page
      .locator('.event-picker')
      .getByRole('button', { name: 'Buscar', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Elegir ' + g.code, exact: true })
      .click();
    await expect(
      section.getByText('Asignada · pendiente de entrega', { exact: true }),
    ).toBeVisible();
    expect(
      (await client.from('loan_items').select('*').eq('garment_id', g.id)).data,
    ).toHaveLength(0);
    await page.goto('/inventario?buscar=' + g.code);
    const card = page.getByRole('link', {
      name: 'Ver prenda ' + g.code,
      exact: true,
    });
    await expect(card).toContainText('Reserva prevista para ' + name);
    await expect(card.getByText('Cedida', { exact: true })).toHaveCount(0);
    await page.goto('/actuaciones/' + event);
    section = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(
      section.getByText('Asignada · pendiente de entrega', { exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize(
      info.project.name === 'mobile'
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
    );
    await page.screenshot({
      path:
        '.local/screenshots/fase5-preparacion-' + info.project.name + '.png',
      fullPage: true,
    });
    await section
      .getByRole('link', { name: 'Entregar prendas', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Cambiar persona', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(g.code, { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Quitar ' + g.code, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Revisar y firmar' }),
    ).toBeDisabled();
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: 'Recuperar prendas asignadas', exact: true })
      .click();
    await expect(page.getByText(g.code, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeDisabled();
    await sign(page, info.project.name === 'mobile');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page
      .getByRole('link', { name: 'Volver a la actuación', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeVisible();

    await page.route(
      '**/rpc/plan_event',
      async (route) => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(page.getByRole('alert')).toContainText('reintenta');
    await page.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    section = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(
      section.getByText('En su poder', { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole('link', { name: 'Entregar prendas', exact: true }),
    ).toHaveCount(0);
    expect(
      (await client.from('loan_items').select('*').eq('garment_id', g.id)).data,
    ).toHaveLength(1);
    await section
      .getByRole('link', { name: 'Devolver ' + g.code, exact: true })
      .click();
    await page
      .getByRole('checkbox', { name: 'Devolver ' + g.code, exact: true })
      .check();
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await sign(page, info.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar devolución' }).click();
    await expect(
      page.getByText('Finalizada', { exact: true }).first(),
    ).toBeVisible();
    await page.goto('/actuaciones/' + event);
    await expect(page.getByText('Devuelta', { exact: true })).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page
      .getByRole('button', { name: 'Cancelar actuación', exact: true })
      .click();
    await expect(
      page.getByText(/Actuación cancelada\. Las reservas/),
    ).toBeVisible();
    expect(
      (
        await client
          .from('garment_reservations')
          .select('*')
          .eq('event_id', event)
      ).data,
    ).toHaveLength(0);
    expect(payloads.filter((p) => p.p_action === 'DELIVER')).toHaveLength(2);
    expect(
      payloads.filter((p) => p.p_action === 'DELIVER')[0].p_request_id,
    ).toBe(payloads.filter((p) => p.p_action === 'DELIVER')[1].p_request_id);
    expect(JSON.stringify(payloads)).not.toMatch(
      /data:image|base64|strokes|coordinates/,
    );
    expect(errors).toEqual([]);
  });
  test('dos reservas simultáneas compiten sin sobrescribir y los permisos remotos se mantienen', async () => {
    const p = await person('Concurrencia'),
      g = await garment('RACE'),
      u = uuid();
    uniforms.push(u);
    await plan('UNIFORM', u, null, {
      name: prefix + ' Race',
      type_ids: [type, shirt],
      archived: false,
    });
    const ids = [uuid(), uuid()];
    events.push(...ids);
    const rows: BandEvent[] = [];
    for (const id of ids) {
      let e = await plan('EVENT', id, null, {
        title: prefix + ' Race',
        uniform_id: u,
        starts: '2090-01-11T12:00',
        ends: '2090-01-11T13:00',
        from: '2090-01-11T11:00',
        until: '2090-01-11T14:00',
        notes: '',
      });
      e = await plan('PARTICIPANT', id, e.version, {
        person_id: p.id,
        active: true,
      });
      rows.push(e);
    }
    const results = await Promise.all(
      rows.map((e) =>
        client.rpc('plan_event', {
          p_request_id: uuid(),
          p_action: 'ASSIGN',
          p_id: e.id,
          p_expected_version: e.version,
          p_data: { person_id: p.id, type_id: type, garment_id: g.id },
        }),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.message).toBe(
      'RESERVATION_OVERLAP',
    );
    const win = results.find((r) => r.data)!.data as unknown as BandEvent;
    expect(
      (
        await client.rpc('plan_event', {
          p_request_id: uuid(),
          p_action: 'CANCEL',
          p_id: win.id,
          p_expected_version: 1,
          p_data: {},
        })
      ).error?.message,
    ).toBe('PLAN_CHANGED');
    expect(
      (await client.from('events').delete().eq('id', win.id)).error,
    ).not.toBeNull();
    const anon = createClient<Database>(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(
      (await anon.from('event_preparation').select('*')).error,
    ).not.toBeNull();
  });
});
