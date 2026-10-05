import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { adminQuery } from './admin-query';

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

test.describe('Supabase real · conflictos fase 8', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere proyecto independiente',
  );
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(180000);
  const prefix = 'QA-C-' + uuid().slice(0, 8).toUpperCase(),
    event = uuid(),
    uniform = uuid(),
    sid = uuid(),
    seriesEvents = [uuid(), uuid()],
    people = [uuid(), uuid()],
    garments = [uuid(), uuid()];
  let client: ReturnType<typeof createClient>,
    admin: { email: string; password: string },
    type: string;
  const loanId = uuid();
  let heldItem: string;
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
    for (let i = 0; i < 2; i++) {
      await rpc('save_person', {
        p_id: people[i],
        p_expected_version: null,
        p_full_name: prefix + ' Persona ' + i,
        p_kind: 'REFUERZO',
        p_instrument: 'Clarinete',
        p_phone: null,
        p_notes: null,
      });
      await rpc('save_garment', {
        p_id: garments[i],
        p_expected_version: null,
        p_code: prefix + '-' + i,
        p_garment_type_id: type,
        p_size: '48',
        p_physical_state: 'DISPONIBLE',
        p_notes: null,
      });
    }
    await rpc('record_loan_movement', {
      p_request_id: uuid(),
      p_kind: 'ENTREGA',
      p_loan_id: loanId,
      p_expected_version: null,
      p_person_id: people[0],
      p_garment_ids: [garments[0]],
      p_returns: [],
      p_due_local: '2090-01-01T12:00',
      p_notes: null,
      p_signature_confirmed: true,
    });
    heldItem = (
      await client
        .from('loan_items')
        .select('id')
        .eq('loan_id', loanId)
        .single()
    ).data!.id;
    await seriesCommand('SERIES', { name: prefix + ' Serie' });
    for (const [i, id] of seriesEvents.entries()) {
      await eventCommand(id, 'EVENT', {
        title: prefix + ' Actuación ' + i,
        uniform_id: uniform,
        starts: '2091-04-0' + (i + 2) + 'T18:00',
        ends: '2091-04-0' + (i + 2) + 'T20:00',
        from: '2091-04-0' + (i + 2) + 'T16:00',
        until: '2091-04-0' + (i + 2) + 'T22:00',
      });
      const e = (
        await client.from('events').select('version').eq('id', id).single()
      ).data!;
      await seriesCommand('MEMBERSHIP', {
        event_id: id,
        event_version: e.version,
        active: true,
      });
    }
    await seriesCommand('ATTENDANCE', {
      person_id: people[1],
      event_ids: seriesEvents,
    });
    const detail = await rpc('series_detail', { p_id: sid });
    await seriesCommand('BLOCK_ASSIGN', {
      block_id: detail.blocks[0].id,
      type_id: type,
      garment_id: garments[0],
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
 delete from public.loan_retention_decisions where loan_id in(select id from ql);
 delete from public.loan_movements where loan_id in(select id from ql);
 delete from public.loan_items where loan_id in(select id from ql);
 delete from public.loans where id in(select id from ql);
 delete from public.people where id in(select id from qp);
 delete from public.garments where id in(select id from qg);commit;`);
    await client?.auth.signOut({ scope: 'local' });
  });

  test('mantener con impacto, cancelar, reintentar, resolver serie, estado físico y devolución real', async ({
    page,
    context,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await page.goto('/conflictos');
    let card = page.locator('article').filter({ hasText: prefix + '-0' });
    await expect(card).toHaveCount(1);
    await expect(
      card.getByText('Depende de una devolución prevista', { exact: true }),
    ).toBeVisible();
    await page.goto('/cesiones/' + loanId);
    await expect(
      page.getByRole('button', { name: 'Registrar que mantiene prendas' }),
    ).toBeVisible();
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Registrar que mantiene prendas' }),
    ).toBeDisabled();
    await context.setOffline(false);
    await page
      .getByRole('button', { name: 'Registrar que mantiene prendas' })
      .click();
    await page
      .getByRole('checkbox', { name: prefix + '-0 · Talla 48', exact: true })
      .check();
    await page.getByRole('button', { name: 'Revisar impacto' }).click();
    await expect(
      page.getByText('Esta decisión afecta a 1 asignación futura.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .locator('app-retention-panel')
        .getByText(prefix + '-0 · ' + prefix + ' Persona 1', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(
      (
        await client
          .from('loan_items')
          .select('retained_at,returned_at')
          .eq('id', heldItem)
          .single()
      ).data,
    ).toEqual({ retained_at: null, returned_at: null });
    await page
      .getByRole('button', { name: 'Registrar que mantiene prendas' })
      .click();
    await page
      .getByRole('checkbox', { name: prefix + '-0 · Talla 48', exact: true })
      .check();
    await page.getByRole('button', { name: 'Revisar impacto' }).click();
    await expect(
      page.getByRole('button', { name: 'Mantener igualmente' }),
    ).toBeVisible();
    mkdirSync('.local/screenshots', { recursive: true });
    await page.locator('app-retention-panel').screenshot({
      path: '.local/screenshots/fase8-mantener-' + info.project.name + '.png',
    });
    let dropped = false,
      request: unknown;
    await page.route('**/rpc/confirm_retention', async (route) => {
      if (!dropped) {
        dropped = true;
        request = route.request().postDataJSON();
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort('failed');
      } else {
        expect(route.request().postDataJSON()).toEqual(request);
        await route.continue();
      }
    });
    await page.getByRole('button', { name: 'Mantener igualmente' }).click();
    await expect(
      page.locator('app-retention-panel [role="alert"]'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Mantener igualmente' }).click();
    await expect(
      page.getByRole('heading', { name: 'Decisiones de permanencia' }),
    ).toBeVisible();
    await page.unroute('**/rpc/confirm_retention');
    expect(
      (
        await client
          .from('loan_retention_decisions')
          .select('id')
          .eq('loan_id', loanId)
      ).data,
    ).toHaveLength(1);
    expect(
      (await client.from('loan_movements').select('id').eq('loan_id', loanId))
        .data,
    ).toHaveLength(1);
    expect(
      (await client.from('loans').select('closed_at').eq('id', loanId).single())
        .data?.closed_at,
    ).toBeNull();
    await page.goto('/inicio');
    await expect(
      page.getByRole('link', { name: /conflictos? de vestuario/ }),
    ).toBeVisible();
    await page.goto('/conflictos');
    card = page.locator('article').filter({ hasText: prefix + '-0' });
    await expect(card).toHaveCount(1);
    await expect(
      card.getByText('La persona mantiene la prenda', { exact: true }),
    ).toBeVisible();
    if (info.project.name === 'desktop')
      for (const width of [320, 390, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    await card.screenshot({
      path: '.local/screenshots/fase8-conflicto-' + info.project.name + '.png',
    });
    await card.getByRole('link', { name: 'Revisar asignación' }).click();
    await expect(page).toHaveURL(new RegExp('/actuaciones/series/' + sid));
    await page
      .getByRole('button', {
        name: 'Preparar a ' + prefix + ' Persona 1',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'Cambiar', exact: true }).click();
    await page
      .getByLabel('Buscar código para todo el periodo')
      .fill(prefix + '-1');
    await page
      .locator('.series-picker')
      .getByRole('button', { name: 'Buscar', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Asignar ' + prefix + '-1', exact: true })
      .click();
    await expect(
      page.getByText('Asignada · pendiente de entrega', { exact: true }),
    ).toBeVisible();
    await page.goto('/conflictos');
    await expect(
      page.locator('article').filter({ hasText: prefix }),
    ).toHaveCount(0);
    await page.goto('/inventario/' + garments[1] + '/editar');
    await page.getByLabel('Estado físico').selectOption('DANADA');
    await page
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp('/inventario/' + garments[1] + '(?:\\?|$)'),
    );
    await page.goto('/conflictos');
    card = page.locator('article').filter({ hasText: prefix + '-1' });
    await expect(
      card.getByText('Prenda dañada', { exact: true }),
    ).toBeVisible();
    await page.goto('/inventario/' + garments[1] + '/editar');
    await page.getByLabel('Estado físico').selectOption('DISPONIBLE');
    await page
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp('/inventario/' + garments[1] + '(?:\\?|$)'),
    );
    await page.goto('/conflictos');
    await expect(
      page.locator('article').filter({ hasText: prefix }),
    ).toHaveCount(0);
    await page.goto('/cesiones/' + loanId + '/devolver');
    await page
      .getByRole('checkbox', { name: 'Devolver ' + prefix + '-0', exact: true })
      .check();
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await sign(page, info.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar devolución' }).click();
    await expect(
      page.getByText('Finalizada', { exact: true }).first(),
    ).toBeVisible();
    expect(
      (
        await client
          .from('loan_items')
          .select('returned_at')
          .eq('id', heldItem)
          .single()
      ).data?.returned_at,
    ).toBeTruthy();
    const anonymous = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false } },
    );
    expect((await anonymous.rpc('conflict_summary')).error).toBeTruthy();
    expect(
      (await anonymous.from('wardrobe_conflicts').select('*')).error,
    ).toBeTruthy();
    expect(
      (
        await client
          .from('loan_items')
          .update({ retained_at: null })
          .eq('id', heldItem)
      ).error,
    ).toBeTruthy();
    expect(errors).toEqual([]);
  });
  test('mantener y devolver simultáneamente respetan la versión y la posesión real', async () => {
    const g = uuid(),
      l = uuid();
    garments.push(g);
    await rpc('save_garment', {
      p_id: g,
      p_expected_version: null,
      p_code: prefix + '-RACE',
      p_garment_type_id: type,
      p_size: '48',
      p_physical_state: 'DISPONIBLE',
      p_notes: null,
    });
    await rpc('record_loan_movement', {
      p_request_id: uuid(),
      p_kind: 'ENTREGA',
      p_loan_id: l,
      p_expected_version: null,
      p_person_id: people[0],
      p_garment_ids: [g],
      p_returns: [],
      p_due_local: '2090-01-01T12:00',
      p_notes: null,
      p_signature_confirmed: true,
    });
    const i = (
      await client.from('loan_items').select('id').eq('loan_id', l).single()
    ).data!;
    const preview = await rpc('preview_retention', {
      p_loan: l,
      p_items: [i.id],
    });
    const [keep, back] = await Promise.all([
      client.rpc('confirm_retention', {
        p_request: uuid(),
        p_preview: preview,
      }),
      client.rpc('record_loan_movement', {
        p_request_id: uuid(),
        p_kind: 'DEVOLUCION',
        p_loan_id: l,
        p_expected_version: 1,
        p_person_id: null,
        p_garment_ids: [],
        p_returns: [{ item_id: i.id, state: 'DISPONIBLE' }],
        p_due_local: null,
        p_notes: null,
        p_signature_confirmed: true,
      }),
    ]);
    expect([keep, back].filter((r) => !r.error)).toHaveLength(1);
    const actual = (
      await client
        .from('loan_items')
        .select('returned_at,retained_at')
        .eq('id', i.id)
        .single()
    ).data!;
    if (!keep.error) {
      expect(actual.retained_at).toBeTruthy();
      expect(actual.returned_at).toBeNull();
      expect(back.error?.message).toContain('LOAN_CHANGED');
    } else {
      expect(actual.returned_at).toBeTruthy();
      expect(actual.retained_at).toBeNull();
      expect(keep.error?.message).toMatch(
        /RETENTION_NOT_ALLOWED|ITEM_NOT_OPEN|RETENTION_CHANGED/,
      );
    }
  });
});
