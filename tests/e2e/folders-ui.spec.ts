import { test, expect, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test.use({ serviceWorkers: 'block' });
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
const voice = {
  id: '22222222-2222-4222-8222-222222222222',
  code: 'CLA1',
  name: 'Clarinete primero',
  instrument: 'Clarinete',
  archived: false,
  version: 1,
};
const folder = {
  id: '33333333-3333-4333-8333-333333333333',
  code: 'PRO-CLA1-001',
  repertoire_code: 'PRO',
  voice_id: voice.id,
  voice_code: 'CLA1',
  voice_name: voice.name,
  voice_archived: false,
  version: 1,
  archived: false,
  manually_blocked: false,
  usable: true,
  operability: 'USABLE',
  present_count: 12,
  missing_count: 1,
  pending_add_count: 2,
  pending_remove_count: 0,
  conservation_issue_count: 1,
  score_issue_count: 1,
  physical_issue_count: 0,
  blocking_issue_count: 0,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
test.describe('Carpetas fase 2 · interfaz', () => {
  test.use({ serviceWorkers: 'block' });
  test('respuesta perdida conserva petición, borrador offline y vuelta al listado filtrado', async ({
    page,
    context,
  }, info) => {
    page.setDefaultTimeout(12000);
    await mockSupabase(page);
    let saved = false;
    const calls: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/musical_voices?**', (r) =>
      r.fulfill({
        json: [voice],
        headers: {
          'access-control-expose-headers': 'content-range',
          'content-range': '0-0/1',
        },
      }),
    );
    await page.route('**/rest/v1/music_folder_inventory?**', (r) =>
      r.fulfill({ json: { ...folder, notes: 'Borrador conservado' } }),
    );
    await page.route('**/rest/v1/audit_log?**', (r) =>
      r.fulfill({
        json: [],
        headers: {
          'access-control-expose-headers': 'content-range',
          'content-range': '*/0',
        },
      }),
    );
    await page.route('**/rest/v1/rpc/music_command', async (r) => {
      calls.push(r.request().postDataJSON());
      if (!saved) {
        saved = true;
        await r.abort('failed');
      } else await r.fulfill({ json: { ...folder, id: calls[0]['p_id'] } });
    });
    await page.goto(
      '/inventario/carpetas/nueva?volver=%2Finventario%2Fcarpetas%3Frepertorio%3DPRO',
    );
    await enter(page);
    await page.getByLabel('Código físico').fill(folder.code);
    await page.locator('app-voice-picker summary').click();
    await page.getByRole('button', { name: /Clarinete primero/ }).click();
    await page.getByLabel('Notas (opcional)').fill('Borrador conservado');
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/folder-form-' + info.project.name + '.png',
      fullPage: true,
    });
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Crear carpeta', exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel('Notas (opcional)')).toHaveValue(
      'Borrador conservado',
    );
    await context.setOffline(false);
    await page
      .getByRole('button', { name: 'Crear carpeta', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'Comprueba la conexión',
    );
    await expect(page.getByLabel('Código físico')).toHaveValue(folder.code);
    await page
      .getByRole('button', { name: 'Crear carpeta', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: folder.code, exact: true }),
    ).toBeVisible();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    await expect(page.getByText('Utilizable', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: '← Carpetas', exact: true }),
    ).toHaveAttribute('href', '/inventario/carpetas?repertorio=PRO');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test('filtra repertorio y operatividad, pagina y mantiene las cinco secciones', async ({
    page,
  }, info) => {
    page.setDefaultTimeout(12000);
    await mockSupabase(page);
    const queries: URL[] = [];
    await page.route('**/rest/v1/music_folder_inventory?**', (r) => {
      const url = new URL(r.request().url());
      queries.push(url);
      const count = url.searchParams.has('repertoire_code') ? 1 : 25;
      return r.fulfill({
        json: [
          {
            ...folder,
            code:
              url.searchParams.get('offset') === '24'
                ? 'PRO-CLA1-025'
                : folder.code,
          },
        ],
        headers: {
          'access-control-expose-headers': 'content-range',
          'content-range': '0-0/' + count,
        },
      });
    });
    await page.goto('/inventario/carpetas');
    await enter(page);
    await expect(
      page.getByRole('heading', {
        name: 'Inventario de carpetas',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByText('PRO-CLA1-025', { exact: true })).toBeVisible();
    await page.getByLabel('Repertorio', { exact: true }).selectOption('PRO');
    await expect(page).toHaveURL(/repertorio=PRO/);
    await page.getByLabel('Estado', { exact: true }).selectOption('usable');
    await expect(page).toHaveURL(/estado=usable/);
    await expect
      .poll(() => queries.at(-1)?.searchParams.get('usable'))
      .toBe('eq.true');
    expect(queries.at(-1)?.searchParams.get('repertoire_code')).toBe('eq.PRO');
    expect(queries.at(-1)?.searchParams.get('archived')).toBe('eq.false');
    await expect(
      page.getByRole('link', { name: 'Menú general', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('1 carpeta', { exact: true })).toBeVisible();
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/folder-list-' + info.project.name + '.png',
      fullPage: true,
    });
    await expect(
      page
        .getByRole('navigation', { name: /^Navegación de carpetas/ })
        .filter({ visible: true })
        .getByRole('link'),
    ).toHaveCount(5);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});

test('Carpetas · menú propio y acceso desde el menú general', async ({
  page,
}, info) => {
  await mockSupabase(page);
  await page.goto('/carpetas');
  await enter(page);
  const menu = () =>
    page
      .getByRole('navigation', { name: /^Navegación de carpetas/ })
      .filter({ visible: true });
  await expect(menu().getByRole('link')).toHaveCount(5);
  await expect(menu().locator('[aria-current="page"]')).toHaveText('Resumen');
  const sections = page.getByRole('navigation', {
    name: 'Gestión de carpetas',
    exact: true,
  });
  await expect(sections.getByRole('link')).toHaveCount(4);
  await sections.getByRole('link', { name: /Repertorio/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Repertorio', exact: true }),
  ).toBeVisible();
  await expect(menu().locator('[aria-current="page"]')).toHaveText(
    'Repertorio',
  );
  await expect(menu().locator('[aria-current="page"]')).toHaveCount(1);
  await menu()
    .getByRole('link', { name: 'Mantenimiento', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Mantenimiento', exact: true }),
  ).toBeVisible();
  await expect(menu().locator('[aria-current="page"]')).toHaveCount(1);
  await menu().getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Carpetas musicales', exact: true }),
  ).toBeVisible();
  if (info.project.name === 'mobile')
    await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({
    path: '.local/screenshots/folder-home-' + info.project.name + '.png',
    fullPage: false,
    scale: 'css',
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Menú general', exact: true }).click();
  const general = page
    .getByRole('navigation', { name: /^Navegación principal/ })
    .filter({ visible: true });
  await expect(general.getByRole('link')).toHaveCount(6);
  for (const link of await general.getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await general.getByRole('link', { name: 'Carpetas', exact: true }).click();
  await expect(page).toHaveURL(/\/carpetas$/);
  await expect(
    page.getByRole('heading', { name: 'Carpetas musicales', exact: true }),
  ).toBeVisible();
});
