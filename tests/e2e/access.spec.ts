import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
    if (url.includes('/garment_types')) return route.fulfill({ json: [] });
    if (url.includes('/garment_inventory'))
      return route.fulfill({
        headers: {
          'content-range': '*/0',
          'access-control-expose-headers': 'content-range',
        },
        json: [],
      });
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
test.describe('Acceso y navegación con respuestas controladas', () => {
  test.use({ serviceWorkers: 'block' });
  test('todas las rutas privadas llevan al login y no desbordan en móvil', async ({
    page,
  }) => {
    await mockSupabase(page);
    for (const path of [
      '/',
      '/inicio',
      '/inventario',
      '/personas',
      '/actuaciones',
      '/actuaciones/series',
      '/actuaciones/series/00000000-0000-0000-0000-000000000001',
      '/cesiones',
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: 'Gestión de trajes' }),
      ).toBeVisible();
      expect(new URL(page.url()).pathname).toBe('/login');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
  test('valida campos, permite mostrar contraseña y traduce credenciales incorrectas', async ({
    page,
  }) => {
    await mockSupabase(page, 'invalid');
    await page.goto('/login');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
      page.getByText('Introduce un correo electrónico válido.'),
    ).toBeVisible();
    await page.getByLabel('Contraseña', { exact: true }).fill('example-only');
    await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
    await expect(
      page.getByLabel('Contraseña', { exact: true }),
    ).toHaveAttribute('type', 'text');
    await enter(page);
    await expect(page.getByRole('alert')).toContainText(
      'correo o la contraseña',
    );
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeEnabled();
  });
  test('restaura sesión, conserva destino interno, navega y cierra sesión', async ({
    page,
  }, testInfo) => {
    await mockSupabase(page);
    await page.goto('/inventario');
    await enter(page);
    await expect(
      page.getByRole('heading', { name: 'Inventario', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Inventario', exact: true }),
    ).toBeVisible();
    const nav = page.getByRole('navigation', {
      name:
        testInfo.project.name === 'mobile'
          ? 'Navegación principal móvil'
          : 'Navegación principal',
      exact: true,
    });
    for (const label of ['Personas', 'Cesiones', 'Actuaciones']) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: label, exact: true }),
      ).toBeVisible();
      await expect(
        nav.getByRole('link', { name: label, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
    await nav.getByRole('link', { name: 'Inicio', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Hola, Fran.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
  });
  test('inventario paginado, recuperación de errores y búsqueda literal', async ({
    page,
  }) => {
    await mockSupabase(page);
    let fail = true;
    const requests: string[] = [];
    await page.route('**/rest/v1/garment_inventory?*', async (route) => {
      const url = new URL(route.request().url());
      requests.push(url.searchParams.get('code') ?? '');
      if (fail)
        return route.fulfill({
          status: 400,
          json: { code: 'TEST_FAILURE', message: 'Error simulado' },
        });
      const start = Number(url.searchParams.get('offset') ?? '0');
      const total = url.searchParams.has('code') ? 1 : 25;
      const rows = Array.from(
        { length: Math.min(24, Math.max(0, total - start)) },
        (_, index) => ({
          id: `11111111-1111-4111-8111-${String(start + index + 1).padStart(12, '0')}`,
          code: 'C-' + String(start + index + 1).padStart(2, '0'),
          size: '48',
          physical_state: 'DISPONIBLE',
          archived_at: null,
          garment_types: { name: 'Chaqueta' },
        }),
      );
      return route.fulfill({
        json: rows,
        headers: {
          'content-range': `${start}-${start + rows.length - 1}/${total}`,
          'access-control-expose-headers': 'content-range',
        },
      });
    });
    await page.goto('/inventario');
    await enter(page);
    await expect(page.getByRole('alert')).toContainText(
      'Comprueba tu conexión',
    );
    fail = false;
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.getByText('25 prendas', { exact: true })).toBeVisible();
    await expect(page.locator('.garment-card')).toHaveCount(24);
    await expect(
      page.getByRole('button', { name: 'Anterior', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await expect(page.locator('.garment-card')).toHaveCount(1);
    await expect(
      page.getByRole('link', { name: 'Ver prenda C-25', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Siguiente', exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    await expect(page.locator('.garment-card')).toHaveCount(24);
    await page.getByLabel('Buscar por código', { exact: true }).fill('C%_');
    await expect(page.getByText('1 prenda', { exact: true })).toBeVisible();
    expect(requests.at(-1)).toBe('ilike.%C\\%\\_%');
    expect(new URL(page.url()).searchParams.get('pagina')).toBeNull();
    await page.goto('/inventario/no-existe');
    await expect(page.getByRole('alert')).toContainText(
      'No encontramos esta prenda',
    );
    await page.getByRole('link', { name: 'Volver al inventario' }).click();
    await expect(
      page.getByRole('heading', { name: 'Inventario', exact: true }),
    ).toBeVisible();
  });
  test('la ficha admite códigos y tallas largos sin desbordar en móvil', async ({
    page,
  }) => {
    await mockSupabase(page);
    const code = 'W'.repeat(60);
    await page.route('**/rest/v1/garment_inventory?*', (route) =>
      route.fulfill({
        json: {
          id: userId,
          code,
          size: 'W'.repeat(20),
          physical_state: 'PENDIENTE_LAVANDERIA',
          archived_at: null,
          garment_types: { name: 'Chaqueta' },
          notes: 'Nota larga '.repeat(100),
          created_at: '2026-10-05T00:00:00Z',
          updated_at: '2026-10-05T00:00:00Z',
        },
      }),
    );
    await page.goto('/inventario/' + userId);
    await enter(page);
    await expect(
      page.getByRole('heading', { name: code, exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
  test('personas: paginación, errores, búsqueda literal y última página archivada', async ({
    page,
  }) => {
    await mockSupabase(page);
    let fail = true;
    let total = 25;
    let lastSearch = '';
    await page.route('**/rest/v1/people?*', (route) => {
      const url = new URL(route.request().url());
      const start = Number(url.searchParams.get('offset') ?? '0');
      lastSearch = url.searchParams.get('full_name') ?? '';
      if (fail)
        return route.fulfill({ status: 400, json: { code: 'TEST_FAILURE' } });
      if (start >= total && start > 0)
        return route.fulfill({ status: 416, json: { code: 'PGRST103' } });
      const count = Math.min(
        Number(url.searchParams.get('limit') ?? '24'),
        Math.max(0, total - start),
      );
      return route.fulfill({
        headers: {
          'content-range': `${start}-${start + count - 1}/${total}`,
          'access-control-expose-headers': 'content-range',
        },
        json: Array.from({ length: count }, (_, i) => ({
          id: userId.slice(0, -2) + String(start + i).padStart(2, '0'),
          full_name: 'Persona ' + String(start + i + 1).padStart(2, '0'),
          kind: 'BANDA',
          instrument: 'Clarinete',
          archived_at: null,
        })),
      });
    });
    await page.goto('/personas');
    await enter(page);
    await expect(page.getByRole('alert')).toContainText(
      'Comprueba tu conexión',
    );
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('.person-card')).toHaveCount(24);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ver persona Persona 25', exact: true }),
    ).toBeVisible();
    total = 24;
    await page.reload();
    await expect(page.locator('.person-card')).toHaveCount(24);
    await expect(page).toHaveURL(/\/personas$/);
    await page.getByLabel('Buscar por nombre').fill('A%_');
    await expect(page).toHaveURL(/buscar=/);
    await expect.poll(() => lastSearch).toBe('ilike.%A\\%\\_%');
    await page.goto('/personas/no-existe');
    await expect(page.getByRole('alert')).toContainText(
      'No encontramos esta persona',
    );
    await page.getByRole('link', { name: 'Volver a Personas' }).click();
    await expect(
      page.getByRole('heading', { name: 'Personas', exact: true }),
    ).toBeVisible();
  });
  test('personas: nombres y observaciones largos caben en la ficha móvil', async ({
    page,
  }) => {
    await mockSupabase(page);
    const name = 'W'.repeat(120);
    await page.route('**/rest/v1/people?*', (route) =>
      route.fulfill({
        json: {
          id: userId,
          full_name: name,
          kind: 'REFUERZO',
          instrument: 'W'.repeat(80),
          phone: '1'.repeat(40),
          notes: 'N'.repeat(2000),
          archived_at: null,
          created_at: '2026-10-05T00:00:00Z',
          updated_at: '2026-10-05T00:00:00Z',
        },
      }),
    );
    await page.goto('/personas/' + userId);
    await enter(page);
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
  test('cesiones: listado paginado, vencidas, filtros persistentes y error recuperable', async ({
    page,
  }) => {
    await mockSupabase(page);
    let fail = true;
    const seen: URL[] = [];
    await page.route('**/rest/v1/loan_overview?*', (route) => {
      const url = new URL(route.request().url());
      seen.push(url);
      if (fail)
        return route.fulfill({ status: 400, json: { code: 'TEST_FAILURE' } });
      const offset = Number(url.searchParams.get('offset') ?? '0');
      const count = Math.min(24, 25 - offset);
      const closed = url.searchParams.get('closed_at') === 'not.is.null';
      return route.fulfill({
        headers: {
          'content-range': `${offset}-${offset + count - 1}/25`,
          'access-control-expose-headers': 'content-range',
        },
        json: Array.from({ length: count }, (_, i) => ({
          id: userId.slice(0, -2) + String(offset + i).padStart(2, '0'),
          person_id: userId,
          person_name: 'Músico ' + (offset + i + 1),
          opened_at: '2026-01-01T12:00:00Z',
          due_at: '2026-01-02T12:00:00Z',
          closed_at: closed ? '2026-01-02T12:00:00Z' : null,
          held_count: closed ? 0 : 2,
          item_count: 2,
          garment_ids: [],
        })),
      });
    });
    await page.goto('/cesiones');
    await enter(page);
    await expect(page.getByRole('alert')).toContainText(
      'Comprueba tu conexión',
    );
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('.loan-card')).toHaveCount(24);
    expect(seen.at(-1)?.searchParams.get('order')).toBe(
      'closed_at.desc.nullsfirst,opened_at.desc,id.asc',
    );
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await expect(page.locator('.loan-card')).toHaveCount(1);
    await page.getByLabel('Mostrar cesiones').selectOption('overdue');
    await expect(page.locator('.loan-card')).toHaveCount(24);
    await expect
      .poll(() => seen.at(-1)?.searchParams.get('due_at')?.startsWith('lt.'))
      .toBe(true);
    await page.getByLabel('Buscar por persona').fill('Juan');
    await expect(page).toHaveURL(/buscar=Juan/);
    await page.reload();
    await expect(page.getByLabel('Buscar por persona')).toHaveValue('Juan');
    await expect(page.getByLabel('Mostrar cesiones')).toHaveValue('overdue');
    await page.getByLabel('Mostrar cesiones').selectOption('closed');
    await expect
      .poll(() => seen.at(-1)?.searchParams.get('closed_at'))
      .toBe('not.is.null');
    await page.goto('/cesiones/no-existe');
    await expect(page.getByRole('alert')).toContainText(
      'No encontramos esta cesión',
    );
  });
  test('actuaciones: búsqueda literal, filtros persistentes, errores y página desaparecida', async ({
    page,
  }) => {
    await mockSupabase(page);
    let fail = true,
      missing = false;
    const seen: URL[] = [];
    await page.route('**/rest/v1/events?*', (route) => {
      const url = new URL(route.request().url());
      seen.push(url);
      if (fail)
        return route.fulfill({ status: 400, json: { code: 'TEST_FAILURE' } });
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (missing && offset)
        return route.fulfill({ status: 416, json: { code: 'PGRST103' } });
      const count = Math.min(24, 25 - offset);
      return route.fulfill({
        headers: {
          'content-range': `${offset}-${offset + count - 1}/25`,
          'access-control-expose-headers': 'content-range',
        },
        json: Array.from({ length: count }, (_, i) => ({
          id: userId.slice(0, -2) + String(offset + i).padStart(2, '0'),
          title: 'Actuación ' + (offset + i + 1),
          starts_at: '2090-01-10T11:00:00Z',
          ends_at: '2090-01-10T12:00:00Z',
          uniform_name: 'Invierno',
          type_ids: [userId],
          cancelled: false,
        })),
      });
    });
    await page.goto('/actuaciones');
    await enter(page);
    await expect(page.getByRole('alert')).toContainText(
      'Comprueba tu conexión',
    );
    fail = false;
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.locator('article.event-card')).toHaveCount(24);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.locator('article.event-card')).toHaveCount(1);
    missing = true;
    await page.reload();
    await expect(page.locator('article.event-card')).toHaveCount(24);
    await expect(page).toHaveURL(/page=1/);
    await page.getByLabel('Buscar actuación').fill('Semana %');
    await page.getByLabel('Mostrar', { exact: true }).selectOption('cancelled');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect
      .poll(() => seen.at(-1)?.searchParams.get('cancelled'))
      .toBe('eq.true');
    expect(seen.at(-1)?.searchParams.get('title')).toBe('ilike.%Semana \\%%');
    await page.reload();
    await expect(page.getByLabel('Buscar actuación')).toHaveValue('Semana %');
    await expect(page.getByLabel('Mostrar', { exact: true })).toHaveValue(
      'cancelled',
    );
  });
  test('usuario autenticado sin perfil activo no accede', async ({ page }) => {
    await mockSupabase(page, 'inactive');
    await page.goto('/login');
    await enter(page);
    await expect(page.getByRole('alert')).toContainText(
      'no tiene acceso activo',
    );
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
  });
  test('el estado sin conexión impide enviar el formulario', async ({
    page,
    context,
  }) => {
    await mockSupabase(page);
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
    await context.setOffline(true);
    await expect(
      page.getByText('Estás sin conexión.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeDisabled();
    await context.setOffline(false);
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeEnabled();
  });
});

test.describe('Supabase real', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Activa REAL_AUTH=1 y configura .local/admin.json para probar tu proyecto.',
  );
  test.use({ serviceWorkers: 'allow' });
  test('login real, persistencia, shell responsive, logout y PWA', async ({
    page,
  }, testInfo) => {
    const admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
    await page.screenshot({
      path: `.local/screenshots/login-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await enter(page, admin.email, admin.password);
    await expect(
      page.getByRole('heading', { name: `Hola, ${admin.display_name}.` }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: `Hola, ${admin.display_name}.` }),
    ).toBeVisible();
    await page.screenshot({
      path: `.local/screenshots/inicio-${testInfo.project.name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(async () =>
            Boolean(await navigator.serviceWorker.getRegistration()),
          ),
        { timeout: 35000 },
      )
      .toBe(true);
    const cachedRequests = await page.evaluate(async () => {
      const keys = await caches.keys();
      const urls = await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map((request) => request.url),
        ),
      );
      return urls.flat();
    });
    expect(
      cachedRequests.some(
        (url) =>
          url.includes('supabase.co') || url.endsWith('/app-config.json'),
      ),
    ).toBe(false);
    const manifest = await (
      await page.request.get('/manifest.webmanifest')
    ).json();
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons)
      expect((await page.request.get(icon.src)).ok()).toBe(true);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
