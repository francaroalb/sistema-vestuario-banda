import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { adminQuery } from './admin-query';
import { randomUUID } from 'node:crypto';
import { Database, GarmentRow } from '../../src/app/core/config/database.types';

test.describe('Supabase real · inventario fase 2', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere la conexión real y credenciales locales.',
  );
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(120000);
  let client: SupabaseClient<Database>;
  let admin: {
    email: string;
    password: string;
    display_name: string;
    id: string;
  };
  const ownedIds: string[] = [];
  let typeId: string;
  const prefix = 'QA-' + Date.now().toString(36).toUpperCase();

  test.beforeAll(async () => {
    if (existsSync('.env')) process.loadEnvFile('.env');
    admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
    client = createClient<Database>(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await client.auth.signInWithPassword({
      email: admin.email,
      password: admin.password,
    });
    expect(error).toBeNull();
    const types = await client
      .from('garment_types')
      .select('*')
      .eq('name', 'Chaqueta')
      .single();
    expect(types.error).toBeNull();
    typeId = types.data!.id;
  });
  test.afterAll(async () => {
    try {
      if (ownedIds.length) {
        // Delete only synthetic rows created by this test, never production inventory.
        const ref = JSON.parse(readFileSync('.local/project.json', 'utf8')).id;
        expect(ref).toBe('vbrtkmufrtfuanimmqyp');
        const ids = ownedIds
          .map((id) => {
            if (!/^[\da-f-]{36}$/.test(id)) throw new Error('Invalid test ID');
            return `'${id}'`;
          })
          .join(',');
        const query = `begin; create temporary table qa_cleanup_ids as select id from public.garments where id in (${ids}) and code like '${prefix}%'; delete from public.audit_log where entity_id in (select id from qa_cleanup_ids); delete from public.garments where id in (select id from qa_cleanup_ids); commit;`;
        await adminQuery(query);
      }
    } finally {
      await client?.auth.signOut({ scope: 'local' });
    }
  });

  test('alta, detalle, edición, filtros, archivado, reactivación y errores desde la interfaz', async ({
    page,
    context,
  }, testInfo) => {
    const code = `${prefix}-${testInfo.project.name.toUpperCase()}-48`;
    await page.goto('/inicio');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `Hola, ${admin.display_name}.` }),
    ).toBeVisible();
    await expect(
      page.getByText('Un espacio para cuidar', { exact: false }),
    ).toHaveCount(0);
    await expect(page.locator('.stat.total')).toBeVisible();
    await page.screenshot({
      path: `.local/screenshots/fase2-inicio-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.getByRole('link', { name: /Nueva prenda/ }).click();
    await page
      .getByRole('button', { name: 'Añadir prenda', exact: true })
      .click();
    await expect(
      page.getByText('Introduce el código de la prenda', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('Introduce una talla', { exact: false }),
    ).toBeVisible();
    await page.getByLabel(/Código de la prenda/).fill(code.toLowerCase());
    await page.getByLabel(/Tipo de prenda/).selectOption({ label: 'Chaqueta' });
    await page.getByLabel('Talla', { exact: false }).fill('48');
    await page
      .getByLabel(/Observaciones/)
      .fill('Prueba temporal de inventario.');
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes('/rpc/save_garment'),
    );
    await page
      .getByRole('button', { name: 'Añadir prenda', exact: true })
      .click();
    const createdResponse = await saveResponse;
    expect(createdResponse.ok()).toBe(true);
    const created: GarmentRow = await createdResponse.json();
    ownedIds.push(created.id);
    await expect(
      page.getByRole('heading', { name: code, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Prueba temporal de inventario.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Editar prenda', exact: true })
      .click();
    await page
      .getByLabel('Estado físico', { exact: true })
      .selectOption('DANADA');
    await page.getByLabel(/Observaciones/).fill('Le falta un botón.');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(
      page.getByRole('heading', { name: code, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Dañada', { exact: true })).toBeVisible();

    await page.goto(`/inventario?buscar=${code}&estado=DANADA&talla=48`);
    await expect(
      page.getByRole('link', { name: 'Ver prenda ' + code, exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Ver prenda ' + code, exact: true })
      .click();
    await page.getByRole('link', { name: 'Volver al inventario' }).click();
    await expect(page.getByLabel('Estado físico', { exact: true })).toHaveValue(
      'DANADA',
    );
    await expect(page.getByLabel('Talla', { exact: true })).toHaveValue('48');
    await page
      .getByLabel('Tipo de prenda', { exact: true })
      .selectOption({ label: 'Camisa' });
    await expect(page.getByText('0 prendas', { exact: true })).toBeVisible();
    await page
      .getByLabel('Tipo de prenda', { exact: true })
      .selectOption({ label: 'Chaqueta' });
    await expect(
      page.getByRole('link', { name: 'Ver prenda ' + code, exact: true }),
    ).toBeVisible();
    await page.getByLabel('Talla', { exact: true }).fill('46');
    await expect(page.getByText('0 prendas', { exact: true })).toBeVisible();
    await page.getByLabel('Talla', { exact: true }).fill('48');
    await page
      .getByRole('link', { name: 'Ver prenda ' + code, exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Archivar prenda', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page
      .getByRole('button', { name: 'Archivar prenda', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar archivado' }).click();
    await expect(
      page.getByText('Prenda archivada.', { exact: true }),
    ).toBeVisible();
    await page.goto('/inventario?buscar=' + code);
    await expect(page.getByText('0 prendas', { exact: true })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Filtros' }).click();
    await page.getByLabel('Mostrar prendas').selectOption('archived');
    await page
      .getByRole('link', { name: 'Ver prenda ' + code, exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Reactivar prenda', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar reactivación' }).click();
    await expect(
      page.getByRole('link', { name: 'Editar prenda', exact: true }),
    ).toBeVisible();

    await page.goto('/inventario/nueva');
    await page.getByLabel(/Código de la prenda/).fill(code.toLowerCase());
    await page.getByLabel('Talla', { exact: false }).fill('48');
    await page
      .getByRole('button', { name: 'Añadir prenda', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('Ya existe una prenda');
    await expect(page.getByLabel(/Código de la prenda/)).toHaveValue(
      code.toLowerCase(),
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();

    await page.goto(`/inventario/${created.id}/editar`);
    await expect(page.getByLabel(/Observaciones/)).toHaveValue(
      'Le falta un botón.',
    );
    const current = await client
      .from('garments')
      .select('*')
      .eq('id', created.id)
      .single();
    await page.getByLabel(/Observaciones/).fill('Mi cambio pendiente');
    const changed = await client.rpc('save_garment', {
      p_id: created.id,
      p_expected_version: current.data!.version,
      p_code: code,
      p_garment_type_id: typeId,
      p_size: '48',
      p_physical_state: 'PENDIENTE_LAVANDERIA',
      p_notes: 'Cambio realizado desde otra sesión.',
    });
    expect(changed.error).toBeNull();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Otra persona ha cambiado',
    );
    await expect(page.getByLabel(/Observaciones/)).toHaveValue(
      'Mi cambio pendiente',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Recargar ficha' }).click();
    await expect(page.getByLabel(/Observaciones/)).toHaveValue(
      'Cambio realizado desde otra sesión.',
    );
    await page
      .getByLabel(/Observaciones/)
      .fill('Borrador durante la desconexión');
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
    await context.setOffline(false);
    await expect(
      page.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeEnabled();
    await expect(page.getByLabel(/Observaciones/)).toHaveValue(
      'Borrador durante la desconexión',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: code, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.local/screenshots/fase2-ficha-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.goto('/inventario?buscar=' + code);
    await expect(
      page.getByRole('link', { name: 'Ver prenda ' + code, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.local/screenshots/fase2-inventario-${testInfo.project.name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const audit = await client
      .from('audit_log')
      .select('*')
      .eq('entity_id', created.id)
      .order('occurred_at');
    expect(audit.error).toBeNull();
    expect(audit.data!.map((row) => row.action)).toEqual([
      'PRENDA_CREADA',
      'PRENDA_EDITADA',
      'PRENDA_ARCHIVADA',
      'PRENDA_REACTIVADA',
      'PRENDA_EDITADA',
    ]);
    expect(audit.data!.every((row) => row.actor_id === admin.id)).toBe(true);
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
  });

  test('RPC concurrentes, código archivado único y permisos remotos', async () => {
    const id = randomUUID();
    ownedIds.push(id);
    const input = {
      p_id: id,
      p_expected_version: null as number | null,
      p_code: prefix + '-RPC',
      p_garment_type_id: typeId,
      p_size: 'M',
      p_physical_state: 'DISPONIBLE' as const,
      p_notes: null as string | null,
    };
    const created = await client
      .rpc('save_garment', input)
      .single<GarmentRow>();
    expect(created.error).toBeNull();
    const results = await Promise.all([
      client.rpc('save_garment', {
        ...input,
        p_expected_version: 1,
        p_notes: 'Primera edición',
      }),
      client.rpc('save_garment', {
        ...input,
        p_expected_version: 1,
        p_notes: 'Segunda edición',
      }),
    ]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.find((result) => result.error)?.error?.code).toBe('PT409');
    expect(
      (await client.from('garments').update({ version: 999 }).eq('id', id))
        .error,
    ).not.toBeNull();
    expect(
      (await client.from('garments').delete().eq('id', id)).error,
    ).not.toBeNull();
    expect(
      (await client.from('audit_log').delete().eq('entity_id', id)).error,
    ).not.toBeNull();
    const archived = await client.rpc('set_garment_archived', {
      p_id: id,
      p_expected_version: 2,
      p_archived: true,
    });
    expect(archived.error).toBeNull();
    const duplicate = await client.rpc('save_garment', {
      ...input,
      p_id: randomUUID(),
      p_code: input.p_code.toLowerCase(),
    });
    expect(duplicate.error?.code).toBe('23505');
    const anonymous = createClient<Database>(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect((await anonymous.from('garments').select('*')).error).not.toBeNull();
    expect(
      (await anonymous.rpc('save_garment', { ...input, p_id: randomUUID() }))
        .error,
    ).not.toBeNull();
  });
});
