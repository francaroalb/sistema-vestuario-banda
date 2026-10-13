import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { adminQuery } from './admin-query';

test.describe('Carpetas fase 4 · Supabase real', () => {
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
  const prefix = 'QA F4 ' + voiceCode;
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
  create temporary table qa_issues as select id from public.folder_score_issues where folder_id in (${ids}) union all select id from public.folder_physical_issues where folder_id in (${ids});
  create temporary table qa_works as select id from public.repertoire_works where title like '${prefix}%';
  delete from public.audit_log where entity_id in (${ids},'${voice}') or entity_id in (select id from qa_works);
  delete from public.folder_work_movements where folder_id in (${ids});
  delete from public.folder_work_presence where folder_id in (${ids});
  delete from public.folder_score_issues where folder_id in (${ids});
  delete from public.folder_physical_issues where folder_id in (${ids});
  delete from public.music_requests where payload->>'id' in (select id::text from qa_issues) or payload->>'id' in (${ids},'${voice}') or payload->>'id' in (select id::text from qa_works) or payload->'data'->>'folder_id' in (${ids}) or payload->'batch'->>'work_id' in (select id::text from qa_works);
  delete from public.music_folders where id in (${ids}) and voice_id='${voice}';
  delete from public.repertoire_work_periods where work_id in (select id from qa_works);
  delete from public.repertoire_works where id in (select id from qa_works);
  delete from public.musical_voices where id='${voice}' and code='${voiceCode}';commit;`);
    }
    await client?.auth.signOut({ scope: 'local' });
  });
  test('daño presente, recuperación, sustitución, bloqueos independientes e historial', async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const center = '/inventario/carpetas/mantenimiento?carpeta=' + f1;
    await page.goto('/inventario/carpetas/' + f1 + '/contenido');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('link', { name: 'Registrar deterioro' }).click();
    await page.getByLabel('Observaciones (opcional)').fill('Copia rasgada QA');
    // Commit succeeds but response is lost: unchanged retry must not duplicate the incident.
    const bodies: unknown[] = [];
    let intercepted = false;
    await page.route('**/rest/v1/rpc/music_command', async (route) => {
      const body = route.request().postDataJSON();
      if (body.p_action === 'SCORE_SAVE') {
        bodies.push(body);
        if (!intercepted) {
          intercepted = true;
          const response = await route.fetch();
          expect(response.ok()).toBe(true);
          await route.abort('failed');
          return;
        }
      }
      await route.continue();
    });
    await page
      .getByRole('button', { name: 'Guardar incidencia', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('reintenta');
    await expect(page.getByLabel('Observaciones (opcional)')).toHaveValue(
      'Copia rasgada QA',
    );
    await page
      .getByRole('button', { name: 'Guardar incidencia', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Mantenimiento', exact: true }),
    ).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual(bodies[1]);
    await page.unroute('**/rest/v1/rpc/music_command');
    expect((await state(f1, initial)).present).toBe(true);
    expect((await folder(f1)).usable).toBe(true);
    await page.getByRole('link', { name: 'Revisar incidencia' }).click();
    await page
      .getByLabel('Observaciones (opcional)')
      .fill('Copia rasgada: margen derecho QA');
    await page
      .getByRole('button', { name: 'Guardar incidencia', exact: true })
      .click();
    await expect(page.getByLabel('Observaciones (opcional)')).toHaveValue(
      'Copia rasgada: margen derecho QA',
    );
    await page
      .getByRole('button', { name: 'Resolver incidencia', exact: true })
      .click();
    await page.getByLabel('Resultado físico').selectOption('PRESENT');
    await page
      .getByLabel('Observación de resolución (opcional)')
      .fill('Copia nueva colocada QA');
    await page
      .getByRole('button', { name: 'Confirmar resolución', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: /Incidencia resuelta/ }),
    ).toBeVisible();
    expect((await state(f1, initial)).present).toBe(true);
    await page.goto('/inventario/carpetas/' + f1 + '/contenido');
    await page
      .getByRole('button', { name: 'Registrar faltante', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirmar faltante', exact: true })
      .click();
    await expect(page.getByText('Faltante', { exact: true })).toBeVisible();
    await page.goto(center);
    await page.getByRole('link', { name: 'Revisar incidencia' }).click();
    await page
      .getByRole('button', { name: 'Resolver incidencia', exact: true })
      .click();
    await expect(page.getByLabel('Resultado físico')).toHaveValue('PRESENT');
    await expect(
      page.getByLabel('Resultado físico').locator('option'),
    ).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Confirmar resolución', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: /Incidencia resuelta/ }),
    ).toBeVisible();
    expect((await state(f1, initial)).present).toBe(true);
    // Two independent physical blockers; resolving one must retain the other.
    for (const [kind, blocking] of [
      ['ELASTICS', false],
      ['COVER', true],
      ['RINGS', true],
    ] as const) {
      await page.goto('/inventario/carpetas/' + f1);
      await page.getByRole('link', { name: 'Registrar desperfecto' }).click();
      await expect(
        page.getByLabel('Impide utilizar la carpeta'),
      ).not.toBeChecked();
      await page.getByLabel('Tipo de incidencia').selectOption(kind);
      await page
        .getByLabel('Descripción del desperfecto')
        .fill('Desperfecto QA ' + kind);
      if (blocking) await page.getByLabel('Impide utilizar la carpeta').check();
      await page
        .getByRole('button', { name: 'Guardar incidencia', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Mantenimiento', exact: true }),
      ).toBeVisible();
      expect((await folder(f1)).usable).toBe(!blocking);
    }
    const cover = page
      .locator('article')
      .filter({ hasText: 'Desperfecto QA COVER' });
    await cover.getByRole('link', { name: 'Revisar incidencia' }).click();
    await page
      .getByRole('button', { name: 'Resolver incidencia', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirmar resolución', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: /Incidencia resuelta/ }),
    ).toBeVisible();
    expect((await folder(f1)).usable).toBe(false);
    expect((await folder(f1)).blocking_issue_count).toBe(1);
    await page.goto(center);
    await page.getByText('Filtrar tareas', { exact: true }).click();
    await page.getByLabel('Estado', { exact: true }).selectOption('resolved');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.locator('article')).toHaveCount(3);
    await expect(
      page.getByText('Desperfecto QA COVER', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/maintenance-' + info.project.name + '.png',
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
});
