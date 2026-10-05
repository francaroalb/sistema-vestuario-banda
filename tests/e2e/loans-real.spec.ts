import { test, expect, Page } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Database } from '../../src/app/core/config/database.types';
import { LoanCommand, LoanRow } from '../../src/app/core/loans/models';

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

test.describe('Supabase real · cesiones fase 4', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere credenciales locales del proyecto independiente.',
  );
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(120000);
  let client: SupabaseClient<Database>;
  let admin: { email: string; password: string; id: string };
  let type: string, shirtType: string;
  const prefix = 'QA-L-' + Date.now().toString(36).toUpperCase();
  const people: string[] = [],
    garments: string[] = [],
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
    const types = await client.from('garment_types').select('*');
    expect(types.error).toBeNull();
    type = types.data!.find((t) => t.name === 'Chaqueta')!.id;
    shirtType = types.data!.find((t) => t.name === 'Camisa')!.id;
  });
  test.afterAll(async () => {
    try {
      if (people.length || garments.length) {
        const ref = JSON.parse(readFileSync('.local/project.json', 'utf8')).id;
        expect(ref).toBe('vbrtkmufrtfuanimmqyp');
        const token = execFileSync(
          'security',
          [
            'find-generic-password',
            '-s',
            'Supabase CLI',
            '-a',
            'supabase',
            '-w',
          ],
          { encoding: 'utf8' },
        ).trim();
        const sqlIds = (ids: string[]) =>
          ids.length
            ? ids
                .map((id) => {
                  if (!/^[\da-f-]{36}$/.test(id)) throw Error('Invalid ID');
                  return `'${id}'`;
                })
                .join(',')
            : "'00000000-0000-0000-0000-000000000000'";
        const query = `begin;
    create temporary table qa_p as select id from public.people where id in (${sqlIds(people)}) and full_name like '${prefix}%';
    create temporary table qa_g as select id from public.garments where id in (${sqlIds(garments)}) and code like '${prefix}%';
    create temporary table qa_l as select id from public.loans where id in (${sqlIds(loans)}) and person_id in (select id from qa_p);
    delete from public.audit_log where loan_id in(select id from qa_l);
    delete from public.loan_movements where loan_id in(select id from qa_l);
    delete from public.loan_items where loan_id in(select id from qa_l);
    delete from public.loans where id in(select id from qa_l);
    delete from public.audit_log where person_id in(select id from qa_p) or garment_id in(select id from qa_g);
    delete from public.people where id in(select id from qa_p);
    delete from public.garments where id in(select id from qa_g);commit;`;
        const response = await fetch(
          `https://api.supabase.com/v1/projects/${ref}/database/query`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
          },
        );
        expect(response.ok).toBe(true);
      }
    } finally {
      await client?.auth.signOut({ scope: 'local' });
    }
  });
  async function person(label: string) {
    const id = randomUUID();
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
  async function garment(label: string, garmentType = type) {
    const id = randomUUID();
    garments.push(id);
    const code = prefix + '-' + label;
    expect(
      (
        await client.rpc('save_garment', {
          p_id: id,
          p_expected_version: null,
          p_code: code,
          p_garment_type_id: garmentType,
          p_size: '48',
          p_physical_state: 'DISPONIBLE',
          p_notes: null,
        })
      ).error,
    ).toBeNull();
    return { id, code };
  }
  const command = (personId: string, garmentIds: string[]): LoanCommand => {
    const id = randomUUID();
    loans.push(id);
    return {
      p_request_id: randomUUID(),
      p_kind: 'ENTREGA',
      p_loan_id: id,
      p_expected_version: null,
      p_person_id: personId,
      p_garment_ids: garmentIds,
      p_returns: [],
      p_due_local: null,
      p_notes: null,
      p_signature_confirmed: true,
    };
  };
  test('entrega firmada, reintento, devolución parcial, cambio y cierre desde móvil y escritorio', async ({
    page,
    context,
  }, testInfo) => {
    const p = await person('Músico ' + testInfo.project.name),
      a = await garment('A'),
      b = await garment('B', shirtType),
      c = await garment('C');
    const requests: Record<string, unknown>[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (req) => {
      if (req.url().includes('/rpc/record_loan_movement')) {
        const data = req.postDataJSON();
        requests.push(data);
        if (!loans.includes(data.p_loan_id)) loans.push(data.p_loan_id);
      }
    });
    await page.goto('/cesiones/nueva');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Revisar y firmar' }),
    ).toBeDisabled();
    await page.getByLabel('Buscar persona', { exact: true }).fill(p.name);
    await page
      .getByRole('button', { name: 'Seleccionar ' + p.name, exact: true })
      .click();
    await page
      .getByLabel('Buscar prenda disponible', { exact: true })
      .fill(a.code);
    await page
      .getByRole('button', { name: 'Seleccionar ' + a.code, exact: true })
      .click();
    await page
      .getByLabel('Buscar prenda disponible', { exact: true })
      .fill(b.code);
    await page
      .getByRole('button', { name: 'Seleccionar ' + b.code, exact: true })
      .click();
    await page.getByLabel(/Devolución prevista/).fill('2090-01-10T12:00');
    await page.getByLabel(/Observaciones/).fill('Cesión de prueba presencial.');
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeDisabled();
    await page.getByRole('img', { name: 'Área de firma' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeDisabled();
    await sign(page, testInfo.project.name === 'mobile');
    await page.getByRole('button', { name: 'Volver a la selección' }).click();
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeDisabled();
    await sign(page, testInfo.project.name === 'mobile');
    await page.getByRole('button', { name: 'Limpiar firma' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeDisabled();
    await sign(page, testInfo.project.name === 'mobile');
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeDisabled();
    await context.setOffline(false);
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeEnabled();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: `.local/screenshots/fase4-firma-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toBeEnabled();
    // Server commits, response is lost. Retrying must keep the same operation UUID.
    await page.route(
      '**/rpc/record_loan_movement',
      async (route) => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(page.getByRole('alert')).toContainText('Puedes reintentar');
    await page.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(
      page.getByRole('heading', { name: p.name, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/cesiones\/[a-f0-9-]{36}(?:\?|$)/);
    const loanId = new URL(page.url()).pathname.split('/').at(-1)!;
    const stored = await client
      .from('loans')
      .select('*')
      .eq('id', loanId)
      .single();
    expect(new Date(stored.data!.due_at!).toISOString()).toBe(
      '2090-01-10T11:00:00.000Z',
    );
    const first = await client
      .from('loan_movements')
      .select('*')
      .eq('loan_id', loanId);
    expect(first.data).toHaveLength(1);
    expect(requests[0]['p_request_id']).toBe(requests[1]['p_request_id']);
    await page.goto('/inventario/' + a.id);
    await expect(
      page.getByText('En poder de ' + p.name, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Archivar prenda', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar archivado' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Registra su devolución',
    );
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('link', { name: 'Abrir cesión', exact: true }).click();
    await page
      .getByRole('link', { name: 'Devolver prendas', exact: true })
      .click();
    await page
      .getByRole('checkbox', { name: 'Devolver ' + b.code, exact: true })
      .check();
    await page
      .getByLabel('Estado al devolver ' + b.code, { exact: true })
      .selectOption('PENDIENTE_LAVANDERIA');
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await sign(page, testInfo.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar devolución' }).click();
    await expect(page).toHaveURL(
      new RegExp('/cesiones/' + loanId + '(?:\\?|$)'),
    );
    await expect(
      page.getByRole('heading', { name: p.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Activa', { exact: true })).toBeVisible();
    expect(
      (
        await client
          .from('loan_items')
          .select('*')
          .eq('loan_id', loanId)
          .is('returned_at', null)
      ).data,
    ).toHaveLength(1);
    await page
      .getByRole('link', { name: 'Cambiar prenda', exact: true })
      .click();
    await page
      .getByRole('radio', { name: 'Devolver ' + a.code, exact: true })
      .check();
    await page
      .getByLabel('Estado al devolver ' + a.code, { exact: true })
      .selectOption('DANADA');
    await page
      .getByLabel('Buscar prenda disponible', { exact: true })
      .fill(c.code);
    await page
      .getByRole('button', { name: 'Seleccionar ' + c.code, exact: true })
      .click();
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await sign(page, testInfo.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(page).toHaveURL(
      new RegExp('/cesiones/' + loanId + '(?:\\?|$)'),
    );
    await expect(
      page.getByRole('heading', { name: p.name, exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/cesiones/' + loanId);
    await page
      .getByRole('link', { name: 'Devolver prendas', exact: true })
      .click();
    await page
      .getByRole('checkbox', { name: 'Devolver ' + c.code, exact: true })
      .check();
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await sign(page, testInfo.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar devolución' }).click();
    await expect(page).toHaveURL(
      new RegExp('/cesiones/' + loanId + '(?:\\?|$)'),
    );
    await expect(
      page.getByText('Finalizada', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Devolver prendas', exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `.local/screenshots/fase4-cesion-${testInfo.project.name}.png`,
      fullPage: true,
    });
    const viewport = page.viewportSize()!;
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize(viewport);
    const movements = await client
      .from('loan_movements')
      .select('*')
      .eq('loan_id', loanId)
      .order('occurred_at');
    expect(movements.data!.map((m) => m.kind)).toEqual([
      'ENTREGA',
      'DEVOLUCION',
      'CAMBIO',
      'DEVOLUCION',
    ]);
    expect(
      movements.data!.every(
        (m) => m.signature_confirmed && m.actor_id === admin.id,
      ),
    ).toBe(true);
    const keys = [
      'p_request_id',
      'p_kind',
      'p_loan_id',
      'p_expected_version',
      'p_person_id',
      'p_garment_ids',
      'p_returns',
      'p_due_local',
      'p_notes',
      'p_signature_confirmed',
    ].sort();
    for (const req of requests) {
      expect(Object.keys(req).sort()).toEqual(keys);
      expect(JSON.stringify(req)).not.toMatch(
        /data:image|base64|strokes|coordinates/,
      );
    }
    await page.goto('/personas/' + p.id);
    await expect(
      page.getByRole('heading', { name: 'Cesiones e histórico' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Ver todas las cesiones/ }),
    ).toBeVisible();
    await page.getByRole('link', { name: /Ver todas las cesiones/ }).click();
    await expect(page.getByText('1 cesión', { exact: true })).toBeVisible();
    await page.getByLabel('Mostrar cesiones').selectOption('active');
    await expect(page.getByText('0 cesiones', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
  test('competencia por una prenda, devolución obsoleta y permisos remotos', async () => {
    const p = await person('Uno'),
      q = await person('Dos'),
      g = await garment('RACE');
    const a = command(p.id, [g.id]),
      b = command(q.id, [g.id]);
    const result = await Promise.all([
      client.rpc('record_loan_movement', a).single<LoanRow>(),
      client.rpc('record_loan_movement', b).single<LoanRow>(),
    ]);
    expect(result.filter((r) => !r.error)).toHaveLength(1);
    expect(result.find((r) => r.error)?.error?.message).toBe(
      'GARMENT_IN_CUSTODY',
    );
    const loan = result.find((r) => r.data)?.data!;
    const lines = await client
      .from('loan_items')
      .select('*')
      .eq('loan_id', loan.id);
    const item = lines.data![0];
    const ret: LoanCommand = {
      ...a,
      p_request_id: randomUUID(),
      p_kind: 'DEVOLUCION',
      p_loan_id: loan.id,
      p_expected_version: 1,
      p_person_id: null,
      p_garment_ids: [],
      p_returns: [{ item_id: item.id, state: 'DISPONIBLE' }],
    };
    expect(
      (
        await client.rpc('record_loan_movement', {
          ...ret,
          p_signature_confirmed: false,
        })
      ).error?.message,
    ).toBe('SIGNATURE_REQUIRED');
    const returns = await Promise.all([
      client.rpc('record_loan_movement', ret),
      client.rpc('record_loan_movement', {
        ...ret,
        p_request_id: randomUUID(),
      }),
    ]);
    expect(returns.filter((r) => !r.error)).toHaveLength(1);
    expect(returns.find((r) => r.error)?.error?.code).toBe('PT409');
    for (const table of ['loans', 'loan_items', 'loan_movements'] as const)
      expect(
        (await client.from(table).delete().eq('id', loan.id)).error,
      ).not.toBeNull();
    const anon = createClient<Database>(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect((await anon.from('loan_overview').select('*')).error).not.toBeNull();
    expect((await anon.rpc('record_loan_movement', a)).error).not.toBeNull();
  });
});
