import { test, expect, Page } from '@playwright/test';
const userId = '11111111-1111-4111-8111-111111111111';
const user = {
  id: userId,
  email: 'prueba@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const token =
  [
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: userId,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
  ]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.') + '.test-signature';
async function mockSupabase(
  page: Page,
  mode: 'active' | 'inactive' | 'invalid' | 'network' = 'active',
) {
  await page.route('**/app-config.json', (route) =>
    route.fulfill({
      json: {
        supabaseUrl: 'https://vestuario-test.supabase.co',
        supabasePublishableKey: 'sb_publishable_test_only',
      },
    }),
  );
  await page.route('https://vestuario-test.supabase.co/**', (route) => {
    const url = route.request().url();
    if (mode === 'network') return route.abort('failed');
    if (url.includes('/token')) {
      if (mode === 'invalid')
        return route.fulfill({
          status: 400,
          headers: {
            'x-supabase-api-version': '2024-01-01',
            'access-control-expose-headers': 'x-supabase-api-version',
          },
          json: {
            code: 'invalid_credentials',
            error_code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          },
        });
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: 'test-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        },
      });
    }
    if (url.includes('/user')) return route.fulfill({ json: user });
    if (url.includes('/logout')) return route.fulfill({ status: 204 });
    if (url.includes('/admin_profiles'))
      return route.fulfill({
        json:
          mode === 'inactive'
            ? null
            : {
                user_id: userId,
                display_name: 'Fran',
                role: 'ADMIN',
                active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
      });
    if (url.includes('/loan_overview'))
      return route.fulfill({
        headers: {
          'content-range': '*/0',
          'access-control-expose-headers': 'content-range',
        },
        json: [],
      });
    if (url.includes('/people'))
      return route.fulfill({
        headers: {
          'content-range': '*/0',
          'access-control-expose-headers': 'content-range',
        },
        json: [],
      });
    if (url.includes('/events?')) return route.fulfill({ json: [] });
    if (url.includes('/garment_types')) return route.fulfill({ json: [] });
    if (url.includes('/garment_inventory'))
      return route.fulfill({
        headers: {
          'content-range': '*/0',
          'access-control-expose-headers': 'content-range',
        },
        json: [],
      });
    if (url.includes('/conflict_summary'))
      return route.fulfill({ json: { conflicts: 0, pending: 0 } });
    if (url.includes('/inventory_summary'))
      return route.fulfill({
        json: {
          held_count: 0,
          active_count: 0,
          available_count: 0,
          laundry_count: 0,
          damaged_count: 0,
          archived_count: 0,
        },
      });
    return route.fulfill({ status: 404 });
  });
}
async function enter(
  page: Page,
  email = 'prueba@example.test',
  password = 'test-password-only',
) {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
const id = '55555555-5555-4555-8555-555555555555';
const folderId = '66666666-6666-4666-8666-666666666666';
const work = {
  id,
  title: 'Marcha de prueba',
  author: 'Autor',
  repertoire_code: 'PRO',
  active: true,
  version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const folder = {
  id: folderId,
  code: 'PRO-CLA1-001',
  voice_name: 'Clarinete primero',
  repertoire_code: 'PRO',
  archived: false,
  version: 1,
};
const headers = {
  'content-range': '0-0/1',
  'access-control-expose-headers': 'content-range',
};

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

const loanId = '77777777-7777-4777-8777-777777777777';
const loan = {
  id: loanId,
  person_id: userId,
  person_name: 'Isabel Mora',
  folder_id: folderId,
  folder_code: folder.code,
  voice_name: folder.voice_name,
  repertoire_code: 'PRO',
  starts_at: '2026-10-13T10:00:00Z',
  due_at: null,
  delivered_at: '2026-10-13T10:00:00Z',
  returned_at: null,
  cancelled_at: null,
  notes: null,
  version: 1,
  created_at: '2026-10-13T10:00:00Z',
  folder_version: 1,
  usable: true,
  status: 'ACTIVE',
  overdue: false,
  conflict: false,
  awaiting_return: false,
};
test.describe('Carpetas fase 5 · interfaz', () => {
  test.use({ serviceWorkers: 'block' });
  test('devolución offline, firma, conflicto y revisión renovada conservan el borrador', async ({
    page,
    context,
  }, info) => {
    await mockSupabase(page);
    page.setDefaultTimeout(10000);
    await page.route('**/rest/v1/folder_loan_overview?**', (r) =>
      r.fulfill({ json: loan }),
    );
    await page.route('**/rest/v1/music_folder_inventory?**', (r) =>
      r.fulfill({
        json: {
          ...folder,
          usable: true,
          holder_name: 'Isabel Mora',
          holder_id: userId,
          loan_id: loanId,
        },
      }),
    );
    await page.route('**/rest/v1/rpc/preview_folder_loan', (r) => {
      const b = r.request().postDataJSON();
      return r.fulfill({
        json: {
          action: b.p_action,
          id: b.p_id,
          version: b.p_version,
          data: b.p_data,
          folder_code: folder.code,
          voice_name: folder.voice_name,
          person_name: 'Isabel Mora',
          person_version: 1,
          warnings: [],
          conflicts: [],
          reservations: [],
          custody: { person_name: 'Isabel Mora', due_at: null },
        },
      });
    });
    await page.route('**/rest/v1/rpc/apply_folder_loan', (r) =>
      r.fulfill({
        status: 409,
        json: { code: 'PT409', message: 'MUSIC_CHANGED' },
      }),
    );
    await page.goto('/cesiones/carpetas/' + loanId + '/devolver');
    await enter(page);
    await page
      .getByLabel('Observaciones (opcional)')
      .fill('Nota que debe conservarse');
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Revisar operación', exact: true }),
    ).toBeDisabled();
    await context.setOffline(false);
    await page
      .getByRole('button', { name: 'Revisar operación', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Confirmar devolución', exact: true }),
    ).toBeDisabled();
    await sign(page, info.project.name === 'mobile');
    await page
      .getByRole('button', { name: 'Confirmar devolución', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('cambiado');
    await page
      .getByRole('button', { name: 'Cargar versión actual y revisar' })
      .click();
    await expect(page.getByLabel('Observaciones (opcional)')).toHaveValue(
      'Nota que debe conservarse',
    );
    await page
      .getByRole('button', { name: 'Revisar operación', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Confirmar devolución', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText('Dibuja la firma antes de confirmar.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Volver a editar' }).click();
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('link', { name: '← Volver a la cesión' }).click();
    await expect(page.getByLabel('Observaciones (opcional)')).toHaveValue(
      'Nota que debe conservarse',
    );
  });
  test('listado paginado, filtros, conflictos y navegación entre vestuario y carpetas', async ({
    page,
  }) => {
    await mockSupabase(page);
    page.setDefaultTimeout(10000);
    const queries: URL[] = [];
    await page.route('**/rest/v1/folder_loan_overview?**', (r) => {
      const u = new URL(r.request().url());
      queries.push(u);
      if (Number(u.searchParams.get('offset')) > 0)
        return r.fulfill({
          status: 416,
          json: { code: 'PGRST103', message: 'Range out of bounds' },
        });
      if (u.searchParams.has('id'))
        return r.fulfill({ json: { ...loan, conflict: true } });
      return r.fulfill({ headers, json: [{ ...loan, conflict: true }] });
    });
    await page.route('**/rest/v1/folder_loan_movements?**', (r) =>
      r.fulfill({ headers: { ...headers, 'content-range': '*/0' }, json: [] }),
    );
    await page.goto('/cesiones/carpetas?pagina=999');
    await enter(page);
    await expect(
      page.getByText('Conflicto de disponibilidad', { exact: true }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/pagina=/);
    await page.getByLabel('Mostrar', { exact: true }).selectOption('conflict');
    await page.getByLabel('Código de carpeta').fill('CLA1');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page).toHaveURL(/estado=conflict/);
    await expect(
      page.getByRole('link').filter({ hasText: 'Isabel Mora' }),
    ).toHaveCount(1);
    expect(
      queries.some(
        (q) =>
          q.searchParams.get('conflict') === 'eq.true' &&
          q.searchParams.get('folder_code') === 'ilike.%CLA1%',
      ),
    ).toBe(true);
    await page.getByRole('link').filter({ hasText: 'Isabel Mora' }).click();
    await expect(
      page.getByRole('link', { name: 'Devolver carpeta', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: '← Cesiones de carpetas' }).click();
    await expect(page.getByLabel('Código de carpeta')).toHaveValue('CLA1');
    await page
      .getByRole('navigation', { name: 'Tipo de cesiones' })
      .getByRole('link', { name: 'Vestuario' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Cesiones', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Tipo de cesiones' })
      .getByRole('link', { name: 'Carpetas' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Cesiones de carpetas', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
