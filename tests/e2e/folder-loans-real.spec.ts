import { test, expect, Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { adminQuery } from './admin-query';

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

test.describe('Carpetas fase 5 · Supabase real', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere acceso real autorizado',
  );
  test.use({ serviceWorkers: 'block' });
  let client: SupabaseClient;
  let admin: { email: string; password: string };
  let created = false;
  const voice = uuid(),
    f1 = uuid(),
    f2 = uuid(),
    f3 = uuid(),
    initial = uuid();
  let work = '';
  const person = uuid(),
    person2 = uuid();
  const voiceCode = 'Q' + uuid().replaceAll('-', '').slice(0, 9).toUpperCase();
  const prefix = 'QA F5 ' + voiceCode;
  const code1 = 'PRO-' + voiceCode + '-001',
    code2 = 'PRO-' + voiceCode + '-002';
  const owned = [f1, f2, f3];
  async function rpc(
    action: string,
    id: string,
    version: number | null,
    data: unknown,
  ) {
    const r = await client.rpc('music_command', {
      p_request: uuid(),
      p_action: action,
      p_id: id,
      p_expected_version: version,
      p_data: data,
    });
    expect(r.error).toBeNull();
    return r.data;
  }
  async function state(folder: string, id = work) {
    const r = await client
      .from('folder_work_state')
      .select('*')
      .eq('folder_id', folder)
      .eq('work_id', id)
      .single();
    expect(r.error).toBeNull();
    return r.data;
  }
  async function folder(id: string) {
    return (
      await client
        .from('music_folder_inventory')
        .select('*')
        .eq('id', id)
        .single()
    ).data;
  }
  test.beforeAll(async () => {
    process.loadEnvFile('.env');
    admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
    client = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect((await client.auth.signInWithPassword(admin)).error).toBeNull();
    // A repertoire is shared: never introduce QA works into an existing real folder inventory.
    const existing = await client
      .from('music_folders')
      .select('id', { count: 'exact', head: true });
    expect(existing.error).toBeNull();
    test.skip(
      (existing.count ?? 0) > 0,
      'Hay carpetas reales: ejecutar este flujo en un entorno aislado.',
    );
    created = true;
    for (const [id, name] of [
      [person, prefix + ' Isabel'],
      [person2, prefix + ' Fran'],
    ]) {
      const r = await client.rpc('save_person', {
        p_id: id,
        p_expected_version: null,
        p_full_name: name,
        p_kind: 'BANDA',
        p_instrument: 'Clarinete',
        p_phone: null,
        p_notes: null,
      });
      expect(r.error).toBeNull();
    }
    await rpc('VOICE_SAVE', voice, null, {
      code: voiceCode,
      name: prefix,
      instrument: 'Clarinete',
      archived: false,
    });
    await rpc('WORK_SAVE', initial, null, {
      repertoire_code: 'PRO',
      title: prefix + ' Inicial',
      active: true,
    });
    for (const [id, code, rep] of [
      [f1, code1, 'PRO'],
      [f2, code2, 'PRO'],
      [f3, 'PMM-' + voiceCode + '-001', 'PMM'],
    ])
      await rpc('FOLDER_SAVE', id, null, {
        code,
        repertoire_code: rep,
        voice_id: voice,
        manually_blocked: false,
        archived: false,
      });
  });
  test.afterAll(async () => {
    if (created) {
      const ids = owned.map((id) => `'${id}'`).join(',');
      await adminQuery(`begin;
  create temporary table qa_issues as select id from public.folder_score_issues where folder_id in (${ids}) union all select id from public.folder_physical_issues where folder_id in (${ids});
  create temporary table qa_works as select id from public.repertoire_works where title like '${prefix}%';
  create temporary table qa_loans as select id from public.folder_loans where person_id in ('${person}','${person2}');
  create temporary table qa_reservations as select id from public.folder_reservations where person_id in ('${person}','${person2}');
  delete from public.folder_loan_movements where loan_id in (select id from qa_loans);
  delete from public.folder_loan_items where loan_id in (select id from qa_loans);
  delete from public.folder_loans where id in (select id from qa_loans);
  delete from public.folder_reservations where id in (select id from qa_reservations);
  delete from public.material_operations where payload->'preview'->>'id' in (select id::text from qa_loans union all select id::text from qa_reservations);
  delete from public.audit_log where entity_id in (${ids},'${voice}','${person}','${person2}') or entity_id in (select id from qa_works);
  delete from public.folder_work_movements where folder_id in (${ids});
  delete from public.folder_work_presence where folder_id in (${ids});
  delete from public.folder_score_issues where folder_id in (${ids});
  delete from public.folder_physical_issues where folder_id in (${ids});
  delete from public.music_requests where payload->>'id' in (select id::text from qa_issues) or payload->>'id' in (${ids},'${voice}') or payload->>'id' in (select id::text from qa_works) or payload->'data'->>'folder_id' in (${ids}) or payload->'batch'->>'work_id' in (select id::text from qa_works);
  delete from public.music_folders where id in (${ids}) and voice_id='${voice}';
  delete from public.repertoire_work_periods where work_id in (select id from qa_works);
  delete from public.repertoire_works where id in (select id from qa_works);
  delete from public.musical_voices where id='${voice}' and code='${voiceCode}';
  delete from public.people where id in ('${person}','${person2}') and full_name like '${prefix}%';commit;`);
    }
    await client?.auth.signOut({ scope: 'local' });
  });

  const localDate = (days: number) =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(Date.now() + days * 86400000))
      .replace(' ', 'T');
  async function preview(
    action: string,
    id: string,
    version: number | null,
    data: unknown,
  ) {
    const r = await client.rpc('preview_folder_loan', {
      p_action: action,
      p_id: id,
      p_version: version,
      p_data: data,
    });
    expect(r.error).toBeNull();
    return r.data;
  }
  async function apply(p: unknown) {
    return client.rpc('apply_folder_loan', {
      p_request: uuid(),
      p_preview: p,
      p_signature: true,
      p_acknowledged: true,
    });
  }
  test('reserva sin posesión, entrega firmada idempotente, devolución con incidencia e historial', async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(
      '/cesiones/carpetas/nueva?persona=' + person + '&carpeta=' + f1,
    );
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByLabel('Operación', { exact: true }).selectOption('RESERVE');
    await page
      .getByLabel('Inicio previsto (hora de Madrid)')
      .fill(localDate(2));
    await page
      .getByLabel('Devolución prevista (opcional, hora de Madrid)')
      .fill(localDate(3));
    await page
      .getByRole('button', { name: 'Revisar operación', exact: true })
      .click();
    await expect(page.getByRole('img', { name: 'Área de firma' })).toHaveCount(
      0,
    );
    await page
      .getByRole('button', { name: 'Confirmar reserva', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'Entregar y firmar' }),
    ).toBeVisible();
    const loanId = page.url().split('/').pop()!.split('?')[0];
    expect((await folder(f1)).holder_id).toBeNull();
    expect((await folder(f1)).next_reservation_id).toBe(loanId);
    await page.getByRole('link', { name: 'Entregar y firmar' }).click();
    await page
      .getByRole('button', { name: 'Revisar operación', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega', exact: true }),
    ).toBeDisabled();
    await sign(page, info.project.name === 'mobile');
    const bodies: unknown[] = [];
    let lost = false;
    await page.route('**/rest/v1/rpc/apply_folder_loan', async (route) => {
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (!lost) {
        lost = true;
        const r = await route.fetch();
        expect(r.ok()).toBe(true);
        await route.abort('failed');
      } else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Confirmar entrega', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('reintenta');
    await page
      .getByRole('button', { name: 'Confirmar entrega', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'Devolver carpeta', exact: true }),
    ).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(JSON.stringify(bodies)).not.toContain('data:image');
    await page.unroute('**/rest/v1/rpc/apply_folder_loan');
    expect((await folder(f1)).holder_id).toBe(person);
    expect((await folder(f1)).next_reservation_id).toBeNull();
    await page.goto('/inventario/carpetas/' + f1);
    await expect(
      page.getByRole('heading', { name: 'En poder de ' + prefix + ' Isabel' }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Devolver carpeta', exact: true })
      .click();
    await page
      .getByText('Añadir incidencia al devolver (opcional)', { exact: true })
      .click();
    await page.getByLabel('Incidencia', { exact: true }).selectOption('SCORE');
    await page
      .getByLabel('Tipo de incidencia', { exact: true })
      .selectOption('DAMAGED');
    await page
      .getByRole('button', { name: prefix + ' Inicial', exact: true })
      .click();
    await page
      .getByLabel('Descripción (opcional)')
      .fill('Copia deteriorada QA F5');
    await page
      .getByRole('button', { name: 'Revisar operación', exact: true })
      .click();
    await sign(page, info.project.name === 'mobile');
    await page
      .getByRole('button', { name: 'Confirmar devolución', exact: true })
      .click();
    await expect(
      page.getByText('Devolución firmada', { exact: true }),
    ).toBeVisible();
    expect((await folder(f1)).holder_id).toBeNull();
    expect((await folder(f1)).usable).toBe(true);
    expect((await state(f1, initial)).present).toBe(true);
    await page.getByRole('link', { name: 'Historial de esta persona' }).click();
    await expect(page).toHaveURL(
      new RegExp('/cesiones/carpetas\\?persona=' + person),
    );
    await expect(
      page.getByRole('heading', { name: 'Cesiones de carpetas', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Devuelta', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/folder-loans-' + info.project.name + '.png',
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
  test('dos entregas concurrentes: solo una obtiene la carpeta', async () => {
    test.setTimeout(60000);
    const ids = [uuid(), uuid()],
      f = await folder(f2);
    const reviews = await Promise.all(
      [person, person2].map((p, i) =>
        preview('DELIVER', ids[i], null, {
          folder_id: f2,
          folder_version: f.version,
          person_id: p,
          due_local: null,
          notes: 'Concurrencia QA F5',
          reserved: false,
        }),
      ),
    );
    const results = await Promise.all(reviews.map((p) => apply(p)));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error?.code === 'PT409')).toHaveLength(1);
    const held = await folder(f2);
    expect([person, person2]).toContain(held.holder_id);
    const items = await client
      .from('folder_loan_items')
      .select('id')
      .eq('folder_id', f2)
      .is('returned_at', null);
    expect(items.error).toBeNull();
    expect(items.data).toHaveLength(1);
    const r = await apply(
      await preview('RETURN', held.loan_id, 1, {
        folder_version: held.version,
        notes: null,
        incident: null,
      }),
    );
    expect(r.error).toBeNull();
    expect((await folder(f2)).holder_id).toBeNull();
  });
});
