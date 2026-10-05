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

test.describe('Preparación compacta de series', () => {
  test.use({ serviceWorkers: 'block' });
  test('30 tarjetas, desplazamiento táctil, edición dentro de la ficha y preparados al final', async ({
    page,
  }, info) => {
    await mockSupabase(page);
    const sid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const events = [0, 1, 2].map((i) => ({
      id: 'e' + i,
      title: ['Ensayo', 'Concierto', 'Procesión'][i],
      starts_at: '2090-04-0' + (i + 2) + 'T18:00:00Z',
      ends_at: '2090-04-0' + (i + 2) + 'T20:00:00Z',
      planned_from: '2090-04-02T16:00:00Z',
      planned_until: '2090-04-04T22:00:00Z',
      type_ids: ['j'],
      uniform_name: 'Invierno',
      cancelled: false,
    }));
    const names = [
      'Carmen Ruiz',
      'Ana García',
      'Luis Martín',
      ...Array.from(
        { length: 27 },
        (_, i) => 'Músico ' + String(i + 4).padStart(2, '0'),
      ),
    ];
    const blocks = names.map((name, i) => ({
      id: 'b' + i,
      series_id: sid,
      person_id: 'p' + i,
      full_name: name,
      instrument: i % 2 ? 'Clarinete' : 'Trompeta',
      event_ids: events.map((e) => e.id),
      type_ids: i === 2 ? ['j', 's'] : ['j'],
      planned_from: events[0].planned_from,
      planned_until: events[0].planned_until,
      gap_choice: 'CONSECUTIVE',
    }));
    const rows: any[] = blocks.map((b, i) => ({
      block_id: b.id,
      event_id: 'e0',
      person_id: b.person_id,
      full_name: b.full_name,
      type_id: 'j',
      type_name: 'Chaqueta',
      garment_id: i === 1 ? null : 'g' + i,
      code: i === 1 ? null : 'C' + String(i + 10) + '-48',
      size: '48',
      status: i === 0 ? 'CONFLICTO' : i === 1 ? 'SIN_ASIGNAR' : 'ASIGNADA',
    }));
    rows.push({
      ...rows[2],
      type_id: 's',
      type_name: 'Camisa',
      garment_id: null,
      code: null,
      status: 'SIN_ASIGNAR',
    });
    const series = { id: sid, name: 'Semana Santa · Preparación', version: 1 };
    await page.route('**/rpc/series_detail', (r) =>
      r.fulfill({ json: { series, events, blocks, rows } }),
    );
    await page.route('**/rpc/garment_recommendation', (r) =>
      r.fulfill({
        json: {
          history: [],
          candidates: [],
          reason: 'NO_HISTORY',
          historical_size: null,
        },
      }),
    );
    await page.route('**/rpc/event_garment_choices', (r) =>
      r.fulfill({
        json: {
          rows: [
            {
              id: 'new-g',
              code: 'C50-48',
              size: '48',
              blocked: null,
              situation: 'Disponible',
            },
          ],
          count: 1,
        },
      }),
    );
    await page.route('**/rpc/plan_series', async (r) => {
      const p = r.request().postDataJSON();
      expect(p.p_action).toBe('BLOCK_ASSIGN');
      const row = rows.find(
        (x) =>
          x.block_id === p.p_data.block_id && x.type_id === p.p_data.type_id,
      );
      Object.assign(row, {
        garment_id: 'new-g',
        code: 'C50-48',
        status: 'ASIGNADA',
      });
      series.version++;
      await r.fulfill({ json: series });
    });
    await page.goto('/login');
    await enter(page);
    await expect(page).toHaveURL(/\/inicio$/);
    await page.goto('/actuaciones/series/' + sid);
    const headings = await page
      .locator('.series-options > details > summary')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const s = getComputedStyle(node);
          return [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight];
        }),
      );
    expect(headings[0]).toEqual(headings[1]);
    await page.locator('.series-agenda > summary').click();
    const agenda = page.locator('.agenda-tile');
    await expect(agenda).toHaveCount(3);
    await expect(agenda.first()).toContainText('30 participantes');
    await expect(agenda.first()).toContainText('29/30 asignadas');
    await expect(agenda.nth(1)).toContainText('29/30 asignadas');
    await expect(agenda.first()).toContainText('Pendiente de asignaciones');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Actuaciones siguientes' }).click();
    await expect
      .poll(() => page.locator('.series-events').evaluate((e) => e.scrollLeft))
      .toBeGreaterThan(0);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize(info.project.use.viewport!);
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/series-agenda-' + info.project.name + '.png',
      fullPage: true,
    });
    await page.locator('.series-agenda > summary').click();
    await expect(page.locator('.person-tile')).toHaveCount(30);
    await expect(page.locator('.participant-card')).toHaveCount(0);
    await expect(page.locator('.person-tile').nth(0)).toContainText(
      'Carmen Ruiz',
    );
    await expect(page.locator('.person-tile').nth(1)).toContainText(
      'Ana García',
    );
    await expect(page.locator('.series-assistant')).not.toHaveAttribute(
      'open',
      '',
    );
    const rail = page.locator('.participant-rail');
    if (info.project.name === 'mobile') {
      await rail.scrollIntoViewIfNeeded();
      const b = (await rail.boundingBox())!,
        cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: b.x + b.width - 25, y: b.y + 55 }],
      });
      for (let n = 1; n <= 8; n++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: b.x + b.width - 25 - n * 28, y: b.y + 55 }],
        });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await cdp.detach();
      await expect
        .poll(() => rail.evaluate((e) => e.scrollLeft))
        .toBeGreaterThan(0);
    }
    await page
      .getByRole('button', { name: 'Preparar a Ana García', exact: true })
      .click();
    await expect(page.locator('.participant-card')).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Editar participación', exact: true })
      .click();
    await expect(page.locator('article #participation-editor')).toBeVisible();
    await expect(
      page
        .locator('article')
        .getByRole('button', { name: 'Guardar participación' }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: /Concierto/ }).uncheck();
    page.once('dialog', (d) => d.dismiss());
    await page
      .getByRole('button', { name: 'Participante siguiente', exact: true })
      .click();
    await expect(page.locator('article #participation-editor')).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.locator('#participation-editor')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Asignar prenda', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Asignar C50-48', exact: true })
      .click();
    await expect(page.locator('.person-tile.selected')).toHaveClass(/ready/);
    await expect(page.locator('.participant-card')).toContainText('C50-48');
    await expect(page.locator('.person-tile').nth(1)).toContainText(
      'Luis Martín',
    );
    await expect(page.locator('.person-tile').nth(2)).toContainText(
      'Ana García',
    );
    await page.getByRole('button', { name: 'Plegar', exact: true }).click();
    await expect(page.locator('.participant-card')).toHaveCount(0);
    await page.getByRole('button', { name: /Por preparar ·/ }).click();
    await expect(page.locator('.person-tile')).toHaveCount(2);
    await page.getByLabel('Buscar participante o instrumento').fill('luis');
    await expect(page.locator('.person-tile')).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Participante siguiente', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('article h2')).toHaveText('Luis Martín');
    await page.getByLabel('Buscar participante o instrumento').fill('nadie');
    await expect(page.locator('.participant-card')).toHaveCount(0);
    await expect(
      page.getByText('No hay participantes con este filtro.'),
    ).toBeVisible();
    await page.getByLabel('Buscar participante o instrumento').fill('');
    await page.getByRole('button', { name: /Todos ·/ }).click();
    await page
      .getByRole('button', { name: 'Preparar a Ana García', exact: true })
      .click();
    mkdirSync('.local/screenshots', { recursive: true });
    if (info.project.name === 'desktop')
      for (const width of [320, 390, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    await page.screenshot({
      path: '.local/screenshots/series-compacta-' + info.project.name + '.png',
      fullPage: true,
    });
  });
});
