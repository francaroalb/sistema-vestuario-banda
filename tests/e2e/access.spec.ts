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
      '/cesiones',
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: 'Gestión de vestuario' }),
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
      page.getByRole('heading', { name: 'Gestión de vestuario' }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Gestión de vestuario' }),
    ).toBeVisible();
  });
  test('usuario autenticado sin perfil activo no accede', async ({ page }) => {
    await mockSupabase(page, 'inactive');
    await page.goto('/login');
    await enter(page);
    await expect(page.getByRole('alert')).toContainText(
      'no tiene acceso activo',
    );
    await expect(
      page.getByRole('heading', { name: 'Gestión de vestuario' }),
    ).toBeVisible();
  });
  test('el estado sin conexión impide enviar el formulario', async ({
    page,
    context,
  }) => {
    await mockSupabase(page);
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Gestión de vestuario' }),
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
      page.getByRole('heading', { name: 'Gestión de vestuario' }),
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
      page.getByRole('heading', { name: 'Gestión de vestuario' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Gestión de vestuario' }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
