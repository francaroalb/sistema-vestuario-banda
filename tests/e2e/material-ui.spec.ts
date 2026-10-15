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

const garmentId = '55555555-5555-4555-8555-555555555555',
  folderId = '66666666-6666-4666-8666-666666666666',
  itemId = '77777777-7777-4777-8777-777777777777',
  loanId = '88888888-8888-4888-8888-888888888888';
const garment = {
  id: garmentId,
  code: 'C01-40',
  version: 1,
  size: '40',
  type_name: 'Chaqueta',
  physical_state: 'DISPONIBLE',
  archived_at: null,
  loan_id: null,
};
const folder = {
  id: folderId,
  code: 'PRO-CLA1-001',
  voice_name: 'Clarinete primero',
  version: 1,
  usable: true,
};
const headers = {
  'content-range': '0-0/1',
  'access-control-expose-headers': 'content-range',
};
async function fixture(page: Page) {
  await mockSupabase(page);
  await page.route('**/rest/v1/people?**', (r) =>
    r.fulfill({
      json: {
        id: userId,
        full_name: 'Isabel Mora',
        instrument: 'Clarinete',
        archived_at: null,
      },
    }),
  );
  await page.route('**/rest/v1/garment_inventory?**', (r) =>
    r.fulfill({
      headers,
      json: new URL(r.request().url()).searchParams.has('id')
        ? garment
        : [garment],
    }),
  );
  await page.route('**/rest/v1/music_folder_inventory?**', (r) =>
    r.fulfill({
      headers,
      json: new URL(r.request().url()).searchParams.has('id')
        ? folder
        : [folder],
    }),
  );
  await page.route('**/rest/v1/folder_loan_overview?**', (r) =>
    r.fulfill({ headers: { ...headers, 'content-range': '*/0' }, json: [] }),
  );
  await page.route('**/rest/v1/rpc/preview_material_operation', (r) => {
    const d = r.request().postDataJSON().p_data;
    return r.fulfill({
      json: {
        data: d,
        person_name: 'Isabel Mora',
        person_version: 1,
        garments: d.garments.map((g: any) => ({
          ...g,
          code: garment.code,
          label: 'Chaqueta',
        })),
        folders: d.folders.map((f: any) => ({
          ...f,
          action: d.action,
          folder_code: folder.code,
          voice_name: folder.voice_name,
          warnings: [],
          conflicts: [],
        })),
        warnings: [],
        conflicts: [],
      },
    });
  });
}
test.describe('Carpetas fase 6 · interfaz', () => {
  test.use({ serviceWorkers: 'block' });
  test('entrega mixta, fechas independientes, offline y reintento tras respuesta perdida', async ({
    page,
    context,
  }, info) => {
    await fixture(page);
    const requests: any[] = [];
    await page.route('**/rest/v1/rpc/apply_material_operation', (r) => {
      const b = r.request().postDataJSON();
      requests.push(b);
      if (requests.length === 1) return r.abort('failed');
      return r.fulfill({
        json: {
          id: b.p_request,
          action: 'DELIVER',
          loans: [
            { domain: 'GARMENT', loan_id: loanId },
            { domain: 'FOLDER', loan_id: itemId },
          ],
        },
      });
    });
    await page.goto('/carpetas/operacion?persona=' + userId);
    await enter(page);
    await page
      .getByRole('button', { name: 'Añadir prendas', exact: true })
      .click();
    await page.getByRole('button', { name: 'Seleccionar C01-40' }).click();
    await page
      .getByLabel('Devolución prevista · C01-40')
      .fill('2027-01-20T12:00');
    await page
      .getByRole('button', { name: 'Añadir carpetas', exact: true })
      .click();
    await page.getByRole('button', { name: /PRO-CLA1-001/ }).click();
    await page
      .getByLabel('Devolución prevista · PRO-CLA1-001')
      .fill('2027-01-25T12:00');
    await page
      .getByLabel('Observaciones de la operación')
      .fill('Conservar fechas independientes');
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Revisar y firmar' }),
    ).toBeDisabled();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar operación' }),
    ).toBeDisabled();
    await expect(page.getByText('Devolución: 2027-01-20 12:00')).toBeVisible();
    await expect(page.getByText('Devolución: 2027-01-25 12:00')).toBeVisible();
    await sign(page, info.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar operación' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Comprueba la conexión',
    );
    await page.getByRole('button', { name: 'Confirmar operación' }).click();
    await expect(
      page.getByRole('heading', { name: 'Operación confirmada' }),
    ).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect(requests[0].p_signature).toBe(true);
    expect(JSON.stringify(requests[0])).not.toContain('data:image');
    expect(requests[0].p_preview.data.garments).toHaveLength(1);
    expect(requests[0].p_preview.data.folders).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test('devolución parcial conserva selección y observaciones tras conflicto, y exige nueva firma', async ({
    page,
  }, info) => {
    await fixture(page);
    const rows = [
      {
        domain: 'GARMENT',
        id: itemId,
        asset_id: garmentId,
        code: 'C01-40',
        label: 'Chaqueta',
        loan_id: loanId,
        person_id: userId,
        version: 1,
        asset_version: 1,
        due_at: null,
      },
      {
        domain: 'FOLDER',
        id: loanId,
        asset_id: folderId,
        code: folder.code,
        label: folder.voice_name,
        loan_id: loanId,
        person_id: userId,
        version: 1,
        asset_version: 1,
        due_at: null,
      },
    ];
    await page.route('**/rest/v1/material_held?**', (r) =>
      r.fulfill({
        headers: { ...headers, 'content-range': '0-1/2' },
        json: new URL(r.request().url()).searchParams.has('id')
          ? rows[0]
          : rows,
      }),
    );
    let calls = 0;
    await page.route('**/rest/v1/rpc/apply_material_operation', (r) => {
      calls++;
      return calls === 1
        ? r.fulfill({
            status: 409,
            json: { code: 'PT409', message: 'MUSIC_CHANGED' },
          })
        : r.fulfill({
            json: {
              id: loanId,
              action: 'RETURN',
              loans: [{ domain: 'GARMENT', loan_id: loanId }],
            },
          });
    });
    await page.goto(
      '/cesiones/material?persona=' + userId + '&accion=devolver',
    );
    await enter(page);
    await page.getByRole('button', { name: /C01-40.*Seleccionar/ }).click();
    await page
      .getByLabel('Estado al devolver · C01-40')
      .selectOption('PENDIENTE_LAVANDERIA');
    await page
      .getByLabel('Observaciones de la operación')
      .fill('Solo vuelve la chaqueta');
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await sign(page, info.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar operación' }).click();
    await expect(page.getByRole('alert')).toContainText('han cambiado');
    await expect(page.getByLabel('Observaciones de la operación')).toHaveValue(
      'Solo vuelve la chaqueta',
    );
    await expect(page.getByLabel('Estado al devolver · C01-40')).toHaveValue(
      'PENDIENTE_LAVANDERIA',
    );
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar operación' }),
    ).toBeDisabled();
    await sign(page, info.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar operación' }).click();
    await expect(
      page.getByRole('heading', { name: 'Operación confirmada' }),
    ).toBeVisible();
  });
  test('protege observaciones y selección al cambiar de persona o salir', async ({
    page,
  }) => {
    await fixture(page);
    await page.goto('/carpetas/operacion?persona=' + userId);
    await enter(page);
    await page
      .getByLabel('Observaciones de la operación')
      .fill('No perder esta nota');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Cambiar persona' }).click();
    await expect(page.getByLabel('Observaciones de la operación')).toHaveValue(
      'No perder esta nota',
    );
    await page
      .getByRole('button', { name: 'Añadir prendas', exact: true })
      .click();
    await page.getByRole('button', { name: 'Seleccionar C01-40' }).click();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Menú general', exact: true }).click();
    await expect(page).toHaveURL(/carpetas\/operacion/);
    await expect(
      page.getByRole('heading', { name: '1 elemento seleccionado' }),
    ).toBeVisible();
  });
});
