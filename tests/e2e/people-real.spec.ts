import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Database, PersonRow } from '../../src/app/core/config/database.types';

test.describe('Supabase real · personas fase 3', () => {
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
  const prefix = 'QA-P-' + Date.now().toString(36).toUpperCase();

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
  });
  test.afterAll(async () => {
    try {
      if (ownedIds.length) {
        // Delete only synthetic rows created by this test, never real people.
        const ref = JSON.parse(readFileSync('.local/project.json', 'utf8')).id;
        expect(ref).toBe('vbrtkmufrtfuanimmqyp');
        const token = execFileSync(
          'security',
          [
            'find-generic-password',
            '-s',
            'Supabase CLI',
            '-a',
            'supabase',
            '-w',
          ],
          { encoding: 'utf8' },
        ).trim();
        const ids = ownedIds
          .map((id) => {
            if (!/^[\da-f-]{36}$/.test(id)) throw new Error('Invalid test ID');
            return `'${id}'`;
          })
          .join(',');
        const query = `begin; create temporary table qa_cleanup_ids as select id from public.people where id in (${ids}) and full_name like '${prefix}%'; delete from public.audit_log where entity_id in (select id from qa_cleanup_ids); delete from public.people where id in (select id from qa_cleanup_ids); commit;`;
        const response = await fetch(
          `https://api.supabase.com/v1/projects/${ref}/database/query`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
          },
        );
        expect(response.ok).toBe(true);
      }
    } finally {
      await client?.auth.signOut({ scope: 'local' });
    }
  });

  test('alta, cambio de refuerzo a banda, filtros, archivo y edición simultánea', async ({
    page,
    context,
  }, testInfo) => {
    const name = `${prefix} ${testInfo.project.name} Juan Ruiz`;
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/inicio');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page
      .getByRole('link', { name: 'Nueva persona', exact: true })
      .click();
    await page.getByRole('button', { name: 'Añadir persona' }).click();
    await expect(
      page.getByText('Introduce el nombre', { exact: false }),
    ).toBeVisible();
    await page.getByLabel(/Nombre y apellidos/).fill('  ' + name + '  ');
    await page
      .getByLabel('Tipo de persona', { exact: true })
      .selectOption('REFUERZO');
    await page.getByLabel(/Instrumento/).fill(' Clarinete ');
    await page.getByLabel(/Teléfono/).fill('+34 600 000 000');
    await page
      .getByLabel(/Observaciones/)
      .fill('La chaqueta 48 quedaba algo justa.');
    const saved = page.waitForResponse((r) =>
      r.url().includes('/rpc/save_person'),
    );
    await page.getByRole('button', { name: 'Añadir persona' }).click();
    const response = await saved;
    expect(response.ok()).toBe(true);
    const person: PersonRow = await response.json();
    ownedIds.push(person.id);
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText('Clarinete', { exact: true })).toBeVisible();
    await expect(
      page.getByText('+34 600 000 000', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Editar persona' }).click();
    await page
      .getByLabel('Tipo de persona', { exact: true })
      .selectOption('BANDA');
    await page.getByLabel(/Instrumento/).fill('Saxofón alto');
    await page.getByLabel(/Observaciones/).fill('Ya pertenece a la Banda.');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/personas/' + person.id);
    await expect(
      page.getByText('Músico de la Banda', { exact: true }),
    ).toBeVisible();
    await page.goto(
      '/personas?buscar=' +
        encodeURIComponent(name) +
        '&tipo=BANDA&instrumento=sax',
    );
    await page
      .getByRole('link', { name: 'Ver persona ' + name, exact: true })
      .click();
    await page.getByRole('link', { name: 'Volver a Personas' }).click();
    await expect(
      page.getByLabel('Buscar por nombre', { exact: true }),
    ).toHaveValue(name);
    await expect(page.getByLabel('Instrumento', { exact: true })).toHaveValue(
      'sax',
    );
    await page
      .getByLabel('Tipo de persona', { exact: true })
      .selectOption('REFUERZO');
    await expect(page.getByText('0 personas', { exact: true })).toBeVisible();
    await page
      .getByLabel('Tipo de persona', { exact: true })
      .selectOption('BANDA');
    await page.getByLabel('Instrumento', { exact: true }).fill('Trompeta');
    await expect(page.getByText('0 personas', { exact: true })).toBeVisible();
    await page.getByLabel('Instrumento', { exact: true }).fill('sax');
    await expect(
      page.getByRole('link', { name: 'Ver persona ' + name, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.local/screenshots/fase3-personas-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'Ver persona ' + name, exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Archivar persona', exact: true })
      .click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page
      .getByRole('button', { name: 'Archivar persona', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar archivado' }).click();
    await expect(
      page.getByText('Persona archivada.', { exact: true }),
    ).toBeVisible();
    await page.goto(`/personas/${person.id}/editar`);
    await expect(
      page.getByText('Esta persona está archivada.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Guardar cambios' }),
    ).toHaveCount(0);
    await page.goto('/personas?buscar=' + encodeURIComponent(name));
    await expect(page.getByText('0 personas', { exact: true })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Filtros' }).click();
    await page.getByLabel('Mostrar personas').selectOption('archived');
    await page
      .getByRole('link', { name: 'Ver persona ' + name, exact: true })
      .click();
    await page.getByRole('button', { name: 'Reactivar persona' }).click();
    await page.getByRole('button', { name: 'Confirmar reactivación' }).click();
    await page
      .getByRole('link', { name: 'Editar persona', exact: true })
      .click();
    await expect(page.getByLabel(/Observaciones/)).toHaveValue(
      'Ya pertenece a la Banda.',
    );
    const current = await client
      .from('people')
      .select('*')
      .eq('id', person.id)
      .single();
    const changed = await client.rpc('save_person', {
      p_id: person.id,
      p_expected_version: current.data!.version,
      p_full_name: name,
      p_kind: 'BANDA',
      p_instrument: 'Saxofón alto',
      p_phone: null,
      p_notes: 'Cambio desde otra sesión.',
    });
    expect(changed.error).toBeNull();
    await page.getByLabel(/Observaciones/).fill('Mi borrador');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Otra persona ha cambiado',
    );
    await expect(page.getByLabel(/Observaciones/)).toHaveValue('Mi borrador');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Recargar ficha' }).click();
    await expect(page.getByLabel(/Observaciones/)).toHaveValue(
      'Cambio desde otra sesión.',
    );
    await expect(page.getByLabel(/Teléfono/)).toHaveValue('');
    await page.getByLabel(/Observaciones/).fill('Borrador sin conexión');
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
    await context.setOffline(false);
    await expect(
      page.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeEnabled();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByLabel(/Observaciones/)).toHaveValue(
      'Borrador sin conexión',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.local/screenshots/fase3-ficha-${testInfo.project.name}.png`,
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1280]) {
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
      .eq('person_id', person.id)
      .order('occurred_at');
    expect(audit.error).toBeNull();
    expect(audit.data!.map((row) => row.action)).toEqual([
      'PERSONA_CREADA',
      'PERSONA_EDITADA',
      'PERSONA_ARCHIVADA',
      'PERSONA_REACTIVADA',
      'PERSONA_EDITADA',
    ]);
    expect(
      audit.data!.every(
        (row) => row.actor_id === admin.id && row.garment_id === null,
      ),
    ).toBe(true);
    expect(pageErrors).toEqual([]);
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Gestión de trajes' }),
    ).toBeVisible();
  });

  test('altas idempotentes, homónimos, concurrencia y permisos reales', async () => {
    const id = randomUUID(),
      homonym = randomUUID();
    ownedIds.push(id, homonym);
    const input = {
      p_id: id,
      p_expected_version: null as number | null,
      p_full_name: prefix + ' API',
      p_kind: 'REFUERZO' as const,
      p_instrument: null,
      p_phone: null,
      p_notes: null as string | null,
    };
    const retries = await Promise.all([
      client.rpc('save_person', input),
      client.rpc('save_person', input),
    ]);
    expect(retries.every((result) => !result.error)).toBe(true);
    const events = await client
      .from('audit_log')
      .select('id')
      .eq('person_id', id);
    expect(events.data).toHaveLength(1);
    expect(
      (await client.rpc('save_person', { ...input, p_id: homonym })).error,
    ).toBeNull();
    const edits = await Promise.all([
      client.rpc('save_person', {
        ...input,
        p_expected_version: 1,
        p_notes: 'Primera',
      }),
      client.rpc('save_person', {
        ...input,
        p_expected_version: 1,
        p_notes: 'Segunda',
      }),
    ]);
    expect(edits.filter((result) => !result.error)).toHaveLength(1);
    expect(edits.find((result) => result.error)?.error?.code).toBe('PT409');
    expect(
      (await client.from('people').update({ kind: 'BANDA' }).eq('id', id))
        .error,
    ).not.toBeNull();
    expect(
      (await client.from('people').delete().eq('id', id)).error,
    ).not.toBeNull();
    expect(
      (await client.from('audit_log').delete().eq('person_id', id)).error,
    ).not.toBeNull();
    const anon = createClient<Database>(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect((await anon.from('people').select('*')).error).not.toBeNull();
    expect((await anon.rpc('save_person', input)).error).not.toBeNull();
  });
});
