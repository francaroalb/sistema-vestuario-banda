import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { adminQuery } from './admin-query';

test.describe('Carpetas fase 3 · Supabase real', () => {
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
  const voiceCode = 'Q' + uuid().replaceAll('-', '').slice(0, 9).toUpperCase();
  const prefix = 'QA F3 ' + voiceCode;
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
  create temporary table qa_works as select id from public.repertoire_works where title like '${prefix}%';
  delete from public.audit_log where entity_id in (${ids},'${voice}') or entity_id in (select id from qa_works);
  delete from public.folder_work_movements where folder_id in (${ids});
  delete from public.folder_work_presence where folder_id in (${ids});
  delete from public.folder_score_issues where folder_id in (${ids});
  delete from public.folder_physical_issues where folder_id in (${ids});
  delete from public.music_requests where payload->>'id' in (${ids},'${voice}') or payload->>'id' in (select id::text from qa_works) or payload->'data'->>'folder_id' in (${ids}) or payload->'batch'->>'work_id' in (select id::text from qa_works);
  delete from public.music_folders where id in (${ids}) and voice_id='${voice}';
  delete from public.repertoire_work_periods where work_id in (select id from qa_works);
  delete from public.repertoire_works where id in (select id from qa_works);
  delete from public.musical_voices where id='${voice}' and code='${voiceCode}';commit;`);
    }
    await client?.auth.signOut({ scope: 'local' });
  });
  test('presunción inicial, catálogo, lotes con conflicto, faltante idempotente, retirada y reactivación', async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/inventario/carpetas/' + f1 + '/contenido');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Partituras de la carpeta' }),
    ).toBeVisible();
    await expect(page.getByText(/Presencia inicial presumida/)).toBeVisible();
    expect((await state(f1, initial)).present).toBe(true);
    expect((await state(f1, initial)).presumed).toBe(true);
    await page.getByRole('link', { name: 'Ver repertorio PRO' }).click();
    await page.getByRole('link', { name: 'Nueva obra', exact: true }).click();
    await page.getByLabel('Título de la obra').fill(prefix + ' Nueva');
    await page.getByLabel('Autor (opcional)').fill('Autor de prueba');
    await page.getByRole('button', { name: 'Crear obra', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: prefix + ' Nueva', exact: true }),
    ).toBeVisible();
    work = page.url().split('/').pop()!.split('?')[0];
    expect((await state(f1)).state).toBe('PENDING_ADD');
    expect((await state(f2)).state).toBe('PENDING_ADD');
    expect(
      (
        await client
          .from('folder_work_state')
          .select('folder_id')
          .eq('folder_id', f3)
          .eq('work_id', work)
      ).data,
    ).toEqual([]);
    await page.getByRole('link', { name: 'Editar obra', exact: true }).click();
    await page.getByLabel('Título de la obra').fill(prefix + ' Revisada');
    await page
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: prefix + ' Revisada', exact: true }),
    ).toBeVisible();
    expect((await state(f1)).state).toBe('PENDING_ADD');
    await page
      .getByRole('button', { name: 'Seleccionar las 2 de esta página' })
      .click();
    await page
      .getByRole('button', { name: 'Revisar selección', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Revisión de copias' }),
    ).toBeVisible();
    expect((await state(f1)).present).toBe(false);
    await page.getByRole('button', { name: 'Volver a la selección' }).click();
    expect((await state(f2)).present).toBe(false);
    await page
      .getByRole('button', { name: 'Revisar selección', exact: true })
      .click();
    const old = await folder(f2);
    await rpc('FOLDER_SAVE', f2, old.version, {
      code: old.code,
      repertoire_code: old.repertoire_code,
      voice_id: voice,
      notes: 'Cambio concurrente QA',
      manually_blocked: false,
      archived: false,
    });
    await page.getByRole('button', { name: 'Confirmar en 2 carpetas' }).click();
    await expect(page.getByRole('alert')).toContainText(/cambiado|coincide/);
    expect((await state(f1)).present).toBe(false);
    expect((await state(f2)).present).toBe(false);
    await page.getByRole('button', { name: 'Cargar versión actual' }).click();
    await page
      .getByRole('button', { name: 'Seleccionar las 2 de esta página' })
      .click();
    await page
      .getByRole('button', { name: 'Revisar selección', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar en 2 carpetas' }).click();
    await expect(
      page.getByText('No hay carpetas con este estado.', { exact: true }),
    ).toBeVisible();
    expect((await state(f1)).state).toBe('PRESENT');
    expect((await state(f2)).state).toBe('PRESENT');
    await page.goto('/inventario/carpetas/' + f1 + '/contenido');
    const card = page
      .locator('article')
      .filter({
        has: page.getByRole('heading', {
          name: prefix + ' Revisada',
          exact: true,
        }),
      });
    await card.getByRole('button', { name: 'Registrar faltante' }).click();
    await page
      .getByLabel('Nota (opcional)')
      .fill('Falta durante revisión de prueba');
    const requests: unknown[] = [];
    let lost = false;
    await page.route('**/rest/v1/rpc/music_command', async (route) => {
      const body = route.request().postDataJSON();
      if (body.p_action !== 'SCORE_SAVE') return route.continue();
      requests.push(body);
      if (!lost) {
        lost = true;
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Confirmar faltante' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Comprueba la conexión',
    );
    await page.getByRole('button', { name: 'Confirmar faltante' }).click();
    await expect(card.getByText('Faltante', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect((await folder(f1)).usable).toBe(true);
    await page.getByText('Historial del contenido', { exact: true }).click();
    await expect(
      page.getByText('Partitura faltante registrada', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Incorporación confirmada', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Falta durante revisión de prueba', { exact: true }),
    ).toBeVisible();
    await page.goto('/inventario/carpetas/repertorio/' + work);
    await page
      .getByRole('button', { name: 'Retirar obra del repertorio' })
      .click();
    await page
      .getByRole('button', { name: 'Confirmar retirada del repertorio' })
      .click();
    await expect(page.getByLabel('Estado de las copias')).toHaveValue(
      'PENDING_REMOVE',
    );
    await expect(
      page.getByRole('link', { name: code2, exact: true }),
    ).toBeVisible();
    expect((await state(f2)).state).toBe('PENDING_REMOVE');
    expect((await state(f1)).present).toBe(false);
    await page.getByRole('link', { name: code2, exact: true }).click();
    const c2 = page
      .locator('article')
      .filter({
        has: page.getByRole('heading', {
          name: prefix + ' Revisada',
          exact: true,
        }),
      });
    await c2
      .getByRole('button', { name: 'Confirmar retirada', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar cambio físico' }).click();
    await expect(
      c2.getByText('Retirada y ausente', { exact: true }),
    ).toBeVisible();
    expect((await state(f2)).present).toBe(false);
    await page.goto('/inventario/carpetas/repertorio/' + work);
    await page
      .getByRole('button', { name: 'Reactivar obra', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar reactivación' }).click();
    await expect(page.getByLabel('Estado de las copias')).toHaveValue(
      'PENDING_ADD',
    );
    expect((await state(f1)).state).toBe('MISSING');
    expect((await state(f2)).state).toBe('PENDING_ADD');
    await page.getByRole('link', { name: code2, exact: true }).click();
    await c2
      .getByRole('button', { name: 'Confirmar incorporación', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar cambio físico' }).click();
    await expect(c2.getByText('Presente', { exact: true })).toBeVisible();
    expect((await state(f2)).present).toBe(true);
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path:
        '.local/screenshots/repertoire-content-' + info.project.name + '.png',
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.goto('/inventario/carpetas/repertorio/' + work);
    await page.getByText('Historial de la obra', { exact: true }).click();
    await expect(
      page.getByText('Obra reactivada', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Título o autor actualizados', { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
