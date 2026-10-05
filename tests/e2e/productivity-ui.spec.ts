import { test, expect, Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
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
test.describe('Productividad · interfaz', () => {
  test.use({ serviceWorkers: 'block' });
  test('CSV: revisión, errores, reintento idempotente y confirmación', async ({
    page,
  }, info) => {
    await mockSupabase(page);
    let invalid = true,
      attempts = 0;
    const ids: string[] = [];
    await page.route('**/rpc/preview_import', (r) => {
      const p = r.request().postDataJSON();
      return r.fulfill({
        json: {
          kind: p.p_kind,
          rows: p.p_rows,
          errors: invalid ? [{ row: 2, message: 'Código repetido' }] : [],
        },
      });
    });
    await page.route('**/rpc/apply_import', (r) => {
      ids.push(r.request().postDataJSON().p_request);
      attempts++;
      return attempts === 1
        ? r.fulfill({ status: 500, json: { message: 'test' } })
        : r.fulfill({ json: { count: 1 } });
    });
    await page.goto('/inventario/importar');
    await enter(page);
    await page.getByLabel('Archivo CSV').setInputFiles({
      name: 'prendas.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'codigo;tipo;talla;estado;observaciones\nC01-40;Chaqueta;40;Disponible;Prueba',
      ),
    });
    await page.getByRole('button', { name: 'Revisar archivo' }).click();
    await expect(
      page.getByRole('button', { name: 'Importar 1 prenda' }),
    ).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Código repetido');
    invalid = false;
    await page.getByRole('button', { name: 'Revisar archivo' }).click();
    await expect(
      page.getByRole('cell', { name: 'C01-40', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/phase9-import-' + info.project.name + '.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Importar 1 prenda' }).click();
    await expect(page.getByRole('alert')).toContainText('No se ha podido');
    await page.getByRole('button', { name: 'Importar 1 prenda' }).click();
    await expect(page.getByRole('status')).toContainText('1 ficha creada');
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });
  test('copia: revisión de fechas y formulario invalidado al editar', async ({
    page,
  }) => {
    await mockSupabase(page);
    await page.route('**/rpc/series_detail', (r) =>
      r.fulfill({
        json: {
          series: { id: userId, name: 'Semana Santa', version: 1 },
          events: [
            { id: 'e', starts_at: '2090-04-02T16:00:00Z', cancelled: false },
          ],
          blocks: [],
          rows: [],
        },
      }),
    );
    await page.route('**/rpc/preview_series_copy', (r) => {
      const p = r.request().postDataJSON();
      return r.fulfill({
        json: {
          source: userId,
          name: p.p_name,
          first_date: p.p_first_date,
          events: [
            {
              uniform_name: 'Invierno',
              data: {
                title: 'Martes Santo',
                starts: p.p_first_date + 'T18:00',
                ends: p.p_first_date + 'T20:00',
                from: p.p_first_date + 'T16:00',
                until: p.p_first_date + 'T22:00',
              },
            },
          ],
        },
      });
    });
    await page.goto('/actuaciones/series/' + userId + '/duplicar');
    await enter(page);
    await page.getByLabel('Fecha de la primera actuación').fill('2091-04-01');
    await page.getByRole('button', { name: 'Ver nueva agenda' }).click();
    await expect(page.getByText('Martes Santo', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Crear copia de la serie' }),
    ).toBeVisible();
    await page.getByLabel('Nombre de la nueva serie').fill('Otra serie');
    await expect(
      page.getByRole('button', { name: 'Crear copia de la serie' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver nueva agenda' }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
});
