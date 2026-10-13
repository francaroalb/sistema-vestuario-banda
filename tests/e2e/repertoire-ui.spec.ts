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
test.describe('Carpetas fase 3 · interfaz', () => {
  test.use({ serviceWorkers: 'block' });
  test('paginación fuera de rango, búsqueda, repertorio y vuelta conservada', async ({
    page,
  }) => {
    await mockSupabase(page);
    page.setDefaultTimeout(10000);
    const queries: URL[] = [];
    await page.route('**/rest/v1/music_repertoires?**', (r) =>
      r.fulfill({
        json: [
          { code: 'PRO', name: 'Marchas de procesión', revision: 1 },
          { code: 'PMM', name: 'Pasodobles y marchas militares', revision: 0 },
        ],
      }),
    );
    await page.route('**/rest/v1/repertoire_works?**', (r) => {
      const u = new URL(r.request().url());
      queries.push(u);
      if (u.searchParams.has('id')) return r.fulfill({ json: work });
      if (Number(u.searchParams.get('offset')) > 0)
        return r.fulfill({
          status: 416,
          json: { code: 'PGRST103', message: 'Range out of bounds' },
        });
      return r.fulfill({ json: [work], headers });
    });
    await page.route('**/rest/v1/folder_work_state?**', (r) =>
      r.fulfill({ json: [], headers: { ...headers, 'content-range': '*/0' } }),
    );
    await page.goto(
      '/inventario/carpetas/repertorio?repertorio=PRO&pagina=999',
    );
    await enter(page);
    await expect(
      page.getByRole('link', { name: 'Marcha de prueba', exact: true }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/pagina=/);
    await page.getByLabel('Buscar obra', { exact: true }).fill('Marcha');
    await expect(page).toHaveURL(/q=Marcha/);
    await page.getByLabel('Repertorio', { exact: true }).selectOption('PMM');
    await page.getByLabel('Mostrar obras').selectOption('retired');
    await expect
      .poll(() => queries.at(-1)?.searchParams.get('active'))
      .toBe('eq.false');
    expect(queries.at(-1)?.searchParams.get('repertoire_code')).toBe('eq.PMM');
    expect(queries.at(-1)?.searchParams.get('title')).toBe('ilike.%Marcha%');
    await page
      .getByRole('link', { name: 'Marcha de prueba', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Marcha de prueba', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: '← Repertorio', exact: true }).click();
    await expect(page.getByLabel('Buscar obra')).toHaveValue('Marcha');
    await expect(page.getByLabel('Mostrar obras')).toHaveValue('retired');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test('edición con conflicto y sin conexión conserva el borrador y permite recargar', async ({
    page,
    context,
  }) => {
    await mockSupabase(page);
    page.setDefaultTimeout(10000);
    let changed = false;
    await page.route('**/rest/v1/repertoire_works?**', (r) =>
      r.fulfill({
        json: {
          ...work,
          version: changed ? 2 : 1,
          title: changed ? 'Título actualizado' : work.title,
        },
      }),
    );
    await page.route('**/rest/v1/rpc/music_command', (r) => {
      changed = true;
      return r.fulfill({
        status: 409,
        json: { code: 'PT409', message: 'MUSIC_CHANGED' },
      });
    });
    await page.goto('/inventario/carpetas/repertorio/' + id + '/editar');
    await enter(page);
    await page.getByLabel('Título de la obra').fill('Mi borrador');
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Guardar cambios', exact: true }),
    ).toBeDisabled();
    await context.setOffline(false);
    await page
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'Los datos han cambiado',
    );
    await expect(page.getByLabel('Título de la obra')).toHaveValue(
      'Mi borrador',
    );
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Cargar versión actual' }).click();
    await expect(page.getByLabel('Título de la obra')).toHaveValue(
      'Título actualizado',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test('carpeta archivada conserva contenido sin acciones y la historia muestra errores recuperables', async ({
    page,
  }) => {
    await mockSupabase(page);
    page.setDefaultTimeout(10000);
    let historyCalls = 0;
    await page.route('**/rest/v1/music_folder_inventory?**', (r) =>
      r.fulfill({ json: { ...folder, archived: true } }),
    );
    await page.route('**/rest/v1/folder_work_state?**', (r) =>
      r.fulfill({
        json: [
          {
            folder_id: folderId,
            work_id: id,
            title: work.title,
            author: null,
            state: 'PRESENT',
            present: true,
            presumed: true,
            work_version: 1,
            folder_version: 1,
          },
        ],
        headers,
      }),
    );
    await page.route('**/rest/v1/folder_work_movements?**', (r) => {
      historyCalls++;
      return historyCalls === 1
        ? r.fulfill({ status: 500, json: { message: 'Error de prueba' } })
        : r.fulfill({
            json: [],
            headers: { ...headers, 'content-range': '*/0' },
          });
    });
    await page.goto('/inventario/carpetas/' + folderId + '/contenido');
    await enter(page);
    await expect(
      page.getByText('Carpeta archivada.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Registrar faltante' }),
    ).toHaveCount(0);
    expect(historyCalls).toBe(0);
    await page.getByText('Historial del contenido', { exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('No se ha podido');
    await page.getByRole('button', { name: 'Reintentar historial' }).click();
    await expect(
      page.getByText(/Sin cambios físicos registrados/),
    ).toBeVisible();
    expect(historyCalls).toBe(2);
  });
  test('incorporar la última copia de una página reajusta la paginación de pendientes', async ({
    page,
  }) => {
    await mockSupabase(page);
    page.setDefaultTimeout(10000);
    let applied = false;
    await page.route('**/rest/v1/music_folder_inventory?**', (r) =>
      r.fulfill({ json: folder }),
    );
    await page.route('**/rest/v1/folder_work_state?**', (r) => {
      const offset = Number(
        new URL(r.request().url()).searchParams.get('offset'),
      );
      if (applied && offset > 0)
        return r.fulfill({
          status: 416,
          json: { code: 'PGRST103', message: 'Range out of bounds' },
        });
      return r.fulfill({
        json: [
          {
            folder_id: folderId,
            work_id: id,
            title: work.title,
            state: 'PENDING_ADD',
            present: false,
            presumed: false,
            work_version: 1,
            folder_version: 1,
          },
        ],
        headers: { ...headers, 'content-range': '0-0/' + (applied ? 24 : 25) },
      });
    });
    await page.route('**/rest/v1/rpc/music_command', (r) => {
      applied = true;
      return r.fulfill({
        json: {
          folder: { ...folder, version: 2 },
          work_id: id,
          action: 'INCORPORATE',
        },
      });
    });
    await page.goto(
      '/inventario/carpetas/' +
        folderId +
        '/contenido?estado=PENDING_ADD&pagina=2',
    );
    await enter(page);
    await page
      .getByRole('button', { name: 'Confirmar incorporación', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirmar cambio físico', exact: true })
      .click();
    await expect(page).not.toHaveURL(/pagina=/);
    await expect(page.getByText('24 obras', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Páginas de partituras' }),
    ).toHaveCount(0);
  });
});
