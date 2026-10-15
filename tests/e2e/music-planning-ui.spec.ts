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

test.describe('Carpetas fases 7 y 8 · preparación', () => {
  test.use({ serviceWorkers: 'block' });
  test('tarjetas compactas y reserva explícita sin entrega; avisos requieren aceptación', async ({
    page,
  }, info) => {
    await mockSupabase(page);
    const person = '22222222-2222-4222-8222-222222222222',
      id = '33333333-3333-4333-8333-333333333333';
    const need: any = {
      need_key: 'qa-need',
      person_id: person,
      full_name: 'Isabel Mora',
      voice_id: 'voice',
      voice_name: 'Clarinete 1',
      repertoire_code: 'PRO',
      event_ids: [id],
      planned_from: '2027-04-01T10:00:00Z',
      planned_until: '2027-04-01T18:00:00Z',
      has_gap: false,
      choice: null,
      assignment_id: null,
      status: 'UNASSIGNED',
      maintenance_count: 0,
    };
    const plan = {
      title: 'Martes Santo',
      series_id: null,
      events: [
        {
          id,
          title: 'Martes Santo',
          starts_at: need.planned_from,
          planned_from: need.planned_from,
          planned_until: need.planned_until,
          cancelled: false,
          repertoires: ['PRO'],
          version: 1,
        },
      ],
      people: [
        {
          id: person,
          full_name: 'Isabel Mora',
          instrument: 'Clarinete',
          kind: 'REFUERZO',
        },
      ],
      count: 1,
      participations: [
        {
          event_id: id,
          person_id: person,
          voice_id: 'voice',
          voice_name: 'Clarinete 1',
          required: true,
          version: 1,
        },
      ],
      needs: [need],
      stale: [],
      choices: [],
    };
    let writes: any[] = [];
    await page.route('**/rest/v1/rpc/music_planning_detail', (r) =>
      r.fulfill({ json: plan }),
    );
    await page.route('**/rest/v1/rpc/music_voice_suggestion', (r) =>
      r.fulfill({ json: { id: 'voice', name: 'Clarinete 1' } }),
    );
    await page.route('**/rest/v1/rpc/recommend_music_folders', (r) =>
      r.fulfill({
        json: {
          need,
          count: 1,
          rows: [
            {
              id: 'folder',
              code: 'PRO-CL1-001',
              version: 1,
              holder_id: null,
              holder_name: null,
              missing_count: 0,
              pending_add_count: 0,
              pending_remove_count: 0,
              physical_issue_count: 1,
              score_issue_count: 0,
              warnings: ['MAINTENANCE_PENDING'],
            },
          ],
        },
      }),
    );
    await page.route('**/rest/v1/rpc/music_planning_command', (r) => {
      writes.push(r.request().postDataJSON());
      Object.assign(need, {
        assignment_id: 'assignment',
        assignment_version: 1,
        reservation_id: 'reservation',
        folder_code: 'PRO-CL1-001',
        status: 'ASSIGNED',
      });
      return r.fulfill({ json: {} });
    });
    await page.goto('/actuaciones/' + id + '/carpetas');
    await enter(page);
    await expect(
      page.getByRole('heading', { name: 'Martes Santo' }),
    ).toBeVisible();
    const toggle = page.getByRole('button', { name: /Isabel Mora/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByRole('button', { name: 'Ver carpetas recomendadas' }),
    ).toHaveCount(0);
    await toggle.click();
    await page
      .getByRole('button', { name: 'Ver carpetas recomendadas' })
      .click();
    await page.getByRole('button', { name: /PRO-CL1-001/ }).click();
    expect(writes).toHaveLength(0);
    await expect(
      page.getByRole('button', { name: 'Reservar carpeta' }),
    ).toBeDisabled();
    await page
      .getByRole('checkbox', { name: 'He revisado los avisos y las fechas.' })
      .check();
    await page.getByRole('button', { name: 'Reservar carpeta' }).click();
    await expect(
      page.getByRole('link', { name: 'Entregar y firmar' }),
    ).toHaveAttribute('href', '/cesiones/carpetas/reservation/entregar');
    expect(writes).toHaveLength(1);
    expect(writes[0].p_action).toBe('ASSIGN');
    expect(writes[0].p_data.ack).toBe(true);
    await expect(page.getByText('En su poder', { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path:
        '.local/screenshots/music-preparation-' + info.project.name + '.png',
      scale: 'css',
    });
  });
});
