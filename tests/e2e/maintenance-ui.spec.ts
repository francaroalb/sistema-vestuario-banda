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

const issueId = '77777777-7777-4777-8777-777777777777';
const entry = {
  task_id: 'physical:' + issueId,
  category: 'CONSERVATION',
  kind: 'COVER',
  folder_id: folderId,
  work_id: null,
  issue_id: issueId,
  repertoire_code: 'PRO',
  title: null,
  description: 'Cubierta rota',
  blocks_use: false,
  created_at: '2026-10-13T10:00:00Z',
  resolved_at: null,
  issue_version: 1,
  folder_code: folder.code,
  voice_name: folder.voice_name,
  operability: 'USABLE',
  archived: false,
  folder_version: 1,
  work_version: null,
  work_active: null,
  family: 'PHYSICAL',
  resolution: null,
  created_by_name: 'Fran',
  resolved_by_name: null,
};
test.describe('Carpetas fase 4 · interfaz', () => {
  test.use({ serviceWorkers: 'block' });
  test('conflicto conserva observaciones y no se pierde el borrador sin conexión', async ({
    page,
    context,
  }) => {
    page.setDefaultTimeout(10000);
    await mockSupabase(page);
    await page.route('**/rest/v1/music_folder_inventory?**', (r) =>
      r.fulfill({ json: { ...folder, usable: true } }),
    );
    await page.route('**/rest/v1/music_maintenance_index?**', (r) =>
      r.fulfill({ json: entry }),
    );
    await page.route('**/rest/v1/rpc/music_command', (r) =>
      r.fulfill({
        status: 409,
        json: { code: 'PT409', message: 'MUSIC_CHANGED' },
      }),
    );
    await page.goto('/inventario/carpetas/incidencias/PHYSICAL/' + issueId);
    await enter(page);
    await page
      .getByLabel('Descripción del desperfecto')
      .fill('Cubierta rota, margen pendiente');
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Guardar incidencia', exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel('Descripción del desperfecto')).toHaveValue(
      'Cubierta rota, margen pendiente',
    );
    await context.setOffline(false);
    await page
      .getByRole('button', { name: 'Guardar incidencia', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('cambiado');
    await expect(page.getByLabel('Descripción del desperfecto')).toHaveValue(
      'Cubierta rota, margen pendiente',
    );
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Cargar versión actual' }).click();
    await expect(page.getByLabel('Descripción del desperfecto')).toHaveValue(
      'Cubierta rota, margen pendiente',
    );
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Cargar versión actual' }).click();
    await expect(page.getByLabel('Descripción del desperfecto')).toHaveValue(
      'Cubierta rota',
    );
    await expect(
      page.getByRole('button', { name: 'Guardar incidencia', exact: true }),
    ).toBeEnabled();
  });
  test('filtros conservados, contadores totales y paginación fuera de rango', async ({
    page,
  }) => {
    page.setDefaultTimeout(10000);
    await mockSupabase(page);
    const queries: URL[] = [];
    await page.route('**/rest/v1/music_maintenance_index?**', (r) => {
      const u = new URL(r.request().url());
      queries.push(u);
      if (r.request().method() === 'HEAD')
        return r.fulfill({
          headers: {
            ...headers,
            'content-range':
              u.searchParams.get('category') === 'eq.REPERTOIRE'
                ? '*/7'
                : '*/30',
          },
          body: '',
        });
      if (Number(u.searchParams.get('offset')) > 0)
        return r.fulfill({
          status: 416,
          json: { code: 'PGRST103', message: 'Range out of bounds' },
        });
      if (u.searchParams.has('issue_id')) return r.fulfill({ json: entry });
      return r.fulfill({ headers, json: [entry] });
    });
    await page.route('**/rest/v1/music_folder_inventory?**', (r) =>
      r.fulfill({ json: { ...folder, usable: true } }),
    );
    await page.goto(
      '/inventario/carpetas/mantenimiento?repertorio=PRO&pagina=999',
    );
    await enter(page);
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page).not.toHaveURL(/pagina=/);
    await expect(page.getByLabel('Contadores por categoría')).toContainText(
      '7 Repertorio',
    );
    await expect(page.getByLabel('Contadores por categoría')).toContainText(
      '30 Conservación',
    );
    await page.getByLabel('Código de carpeta').fill('CLA1');
    await page
      .getByLabel('Categoría', { exact: true })
      .selectOption('CONSERVATION');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page).toHaveURL(/codigo=CLA1/);
    await expect(page.locator('article')).toHaveCount(1);
    expect(
      queries.some(
        (u) =>
          u.searchParams.get('folder_code') === 'ilike.%CLA1%' &&
          u.searchParams.get('category') === 'eq.CONSERVATION',
      ),
    ).toBe(true);
    await page.getByRole('link', { name: 'Revisar incidencia' }).click();
    await expect(page.getByLabel('Descripción del desperfecto')).toHaveValue(
      'Cubierta rota',
    );
    await page.getByRole('link', { name: '← Mantenimiento' }).click();
    await expect(page).toHaveURL(/codigo=CLA1/);
    await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue(
      'CONSERVATION',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
