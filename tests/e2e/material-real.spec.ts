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

test.describe('Carpetas fase 6 · Supabase real', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere acceso real autorizado',
  );
  test.use({ serviceWorkers: 'block' });
  const person = uuid(),
    voice = uuid(),
    folders = [uuid(), uuid()],
    garments = [uuid(), uuid(), uuid()];
  const prefix = 'QA6-' + uuid().slice(0, 8).toUpperCase(),
    voiceCode = 'Q' + uuid().replaceAll('-', '').slice(0, 8).toUpperCase();
  const codes = folders.map((_, i) => 'PRO-' + voiceCode + '-00' + (i + 1));
  let client: SupabaseClient, admin: { email: string; password: string };
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
  const rpc = async (name: string, args: any) => {
    const r = await client.rpc(name, args);
    expect(r.error).toBeNull();
    return r.data;
  };
  const music = (action: string, id: string, data: any) =>
    rpc('music_command', {
      p_request: uuid(),
      p_action: action,
      p_id: id,
      p_expected_version: null,
      p_data: data,
    });
  test.beforeAll(async () => {
    process.loadEnvFile('.env');
    admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
    client = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect((await client.auth.signInWithPassword(admin)).error).toBeNull();
    await rpc('save_person', {
      p_id: person,
      p_expected_version: null,
      p_full_name: prefix + ' Isabel',
      p_kind: 'REFUERZO',
      p_instrument: 'Clarinete',
      p_phone: null,
      p_notes: null,
    });
    await music('VOICE_SAVE', voice, {
      code: voiceCode,
      name: prefix,
      instrument: 'Clarinete',
      archived: false,
    });
    for (let i = 0; i < folders.length; i++)
      await music('FOLDER_SAVE', folders[i], {
        code: codes[i],
        repertoire_code: 'PRO',
        voice_id: voice,
        manually_blocked: false,
        archived: false,
      });
    const types = await client
      .from('garment_types')
      .select('id')
      .eq('name', 'Chaqueta')
      .single();
    expect(types.error).toBeNull();
    for (let i = 0; i < garments.length; i++)
      await rpc('save_garment', {
        p_id: garments[i],
        p_expected_version: null,
        p_code: prefix + '-C' + i,
        p_garment_type_id: types.data.id,
        p_size: '40',
        p_physical_state: 'DISPONIBLE',
        p_notes: null,
      });
  });
  test.afterAll(async () => {
    const fs = folders.map((id) => `'${id}'`).join(','),
      gs = garments.map((id) => `'${id}'`).join(',');
    await adminQuery(`begin;
   create temporary table qa_l as select id from public.loans where person_id='${person}';
   create temporary table qa_f as select id from public.folder_loans where person_id='${person}';
   create temporary table qa_o as select id from public.material_operations where payload->'preview'->'data'->>'person_id'='${person}' or payload->'preview'->>'id' in(select id::text from qa_f);
   delete from public.audit_log where entity_id in(select id from qa_l) or entity_id in (${fs},${gs},'${person}','${voice}');
   delete from public.loan_movements where loan_id in(select id from qa_l);
   delete from public.loan_items where loan_id in(select id from qa_l);
   delete from public.loans where id in(select id from qa_l);
   delete from public.folder_loan_movements where loan_id in(select id from qa_f);
   delete from public.folder_loan_items where loan_id in(select id from qa_f);
   delete from public.folder_loans where id in(select id from qa_f);
   delete from public.material_operations where id in(select id from qa_o) or parent_operation_id in(select id from qa_o);
   delete from public.folder_work_movements where folder_id in(${fs});
   delete from public.folder_work_presence where folder_id in(${fs});
   delete from public.music_requests where payload->>'id' in(${fs},'${voice}');
   delete from public.music_folders where id in(${fs}) and voice_id='${voice}';
   delete from public.musical_voices where id='${voice}' and code='${voiceCode}';
   delete from public.garments where id in(${gs}) and code like '${prefix}%';
   delete from public.people where id='${person}' and full_name like '${prefix}%';commit;`);
    expect(
      (await client.from('people').select('id').eq('id', person)).data,
    ).toHaveLength(0);
    expect(
      (
        await client
          .from('material_operations')
          .select('id')
          .eq('payload->preview->data->>person_id', person)
      ).data,
    ).toHaveLength(0);
    await client?.auth.signOut({ scope: 'local' });
  });
  test('entrega mixta firmada y devolución parcial preservan el resto de material', async ({
    page,
  }, info) => {
    await page.goto('/carpetas/operacion?persona=' + person);
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    for (let i = 0; i < 2; i++) {
      await page
        .getByRole('button', { name: 'Añadir prendas', exact: true })
        .click();
      await page.getByLabel('Buscar prenda disponible').fill(prefix + '-C' + i);
      await page
        .getByRole('button', {
          name: 'Seleccionar ' + prefix + '-C' + i,
          exact: true,
        })
        .click();
      if (!i)
        await page
          .getByLabel('Devolución prevista · ' + prefix + '-C' + i)
          .fill(localDate(2));
    }
    await page
      .getByRole('button', { name: 'Añadir carpetas', exact: true })
      .click();
    await page.getByLabel('Buscar carpeta por código').fill(codes[0]);
    await page
      .getByRole('button', { name: 'Buscar carpetas', exact: true })
      .click();
    await page.getByRole('button', { name: new RegExp(codes[0]) }).click();
    await page
      .getByLabel('Devolución prevista · ' + codes[0])
      .fill(localDate(5));
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    const ack = page.getByRole('checkbox');
    if (await ack.count()) await ack.check();
    await sign(page, info.project.name === 'mobile');
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/material-review-' + info.project.name + '.png',
      scale: 'css',
      fullPage: false,
    });
    await page.getByRole('button', { name: 'Confirmar operación' }).click();
    await expect(
      page.getByRole('heading', { name: 'Operación confirmada' }),
    ).toBeVisible();
    const before = await client
      .from('material_held')
      .select('*')
      .eq('person_id', person);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(3);
    expect(new Set(before.data!.map((r) => r.due_at)).size).toBe(3);
    await page.goto(
      '/carpetas/operacion?persona=' + person + '&accion=devolver',
    );
    await page
      .getByRole('button', { name: new RegExp(prefix + '-C0.*Seleccionar') })
      .click();
    await page
      .getByRole('button', { name: new RegExp(codes[0] + '.*Seleccionar') })
      .click();
    await page
      .getByLabel('Estado al devolver · ' + prefix + '-C0')
      .selectOption('PENDIENTE_LAVANDERIA');
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    if (await page.getByRole('checkbox').count())
      await page.getByRole('checkbox').check();
    await sign(page, info.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar operación' }).click();
    await expect(
      page.getByRole('heading', { name: 'Operación confirmada' }),
    ).toBeVisible();
    const remaining = await client
      .from('material_held')
      .select('*')
      .eq('person_id', person);
    expect(remaining.data).toHaveLength(1);
    expect(remaining.data![0].asset_id).toBe(garments[1]);
    expect(remaining.data![0].due_at).toBeNull();
    expect(
      (
        await client
          .from('garments')
          .select('physical_state')
          .eq('id', garments[0])
          .single()
      ).data?.physical_state,
    ).toBe('PENDIENTE_LAVANDERIA');
  });
  test('dos operaciones conjuntas concurrentes solo entregan una vez', async () => {
    const f = (
      await client
        .from('music_folders')
        .select('version')
        .eq('id', folders[1])
        .single()
    ).data!;
    const make = () => ({
      action: 'DELIVER',
      person_id: person,
      notes: prefix,
      garments: [{ id: garments[2], version: 1, due_local: null }],
      folders: [
        {
          id: uuid(),
          version: null,
          data: {
            folder_id: folders[1],
            folder_version: f.version,
            person_id: person,
            due_local: null,
            notes: null,
            reserved: false,
          },
        },
      ],
    });
    const p1 = await rpc('preview_material_operation', { p_data: make() }),
      p2 = await rpc('preview_material_operation', { p_data: make() });
    const results = await Promise.all(
      [p1, p2].map((p) =>
        client.rpc('apply_material_operation', {
          p_request: uuid(),
          p_preview: p,
          p_signature: true,
          p_acknowledged: true,
        }),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error)).toHaveLength(1);
    const items = await client
      .from('material_held')
      .select('*')
      .eq('person_id', person)
      .in('asset_id', [garments[2], folders[1]]);
    expect(items.data).toHaveLength(2);
  });
});
