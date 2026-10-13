import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { adminQuery } from './admin-query';

test.describe('Carpetas fase 2 · Supabase real', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere acceso real autorizado',
  );
  test.use({ serviceWorkers: 'block' });
  let client: SupabaseClient;
  let admin: { email: string; password: string };
  const voiceCode =
    'Q' + randomUUID().replaceAll('-', '').slice(0, 9).toUpperCase();
  const name = 'QA F2 ' + voiceCode;
  const code = 'PRO-' + voiceCode + '-001';
  let folderId = '';
  test.beforeAll(async () => {
    process.loadEnvFile('.env');
    admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
    client = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect((await client.auth.signInWithPassword(admin)).error).toBeNull();
  });
  test.afterAll(async () => {
    await adminQuery(`begin;
 delete from public.audit_log where entity_id in (select id from public.music_folders where code='${code}') or entity_id in (select id from public.musical_voices where code='${voiceCode}');
 delete from public.music_requests where payload->>'id' in (select id::text from public.music_folders where code='${code}') or payload->>'id' in (select id::text from public.musical_voices where code='${voiceCode}');
 delete from public.music_folders where code='${code}';
 delete from public.musical_voices where code='${voiceCode}';commit;`);
    await client?.auth.signOut({ scope: 'local' });
  });
  test('alta de voz y carpeta, duplicado, bloqueo, conflicto, archivo y recuperación', async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(12000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/inventario');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('link', { name: 'Carpetas', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Carpetas', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Nueva carpeta', exact: true })
      .click();
    await page.getByLabel('Código físico').fill(code);
    await page.locator('app-voice-picker summary').click();
    await page
      .getByRole('button', { name: 'Crear una voz', exact: true })
      .click();
    await page.getByLabel('Código de voz', { exact: true }).fill(voiceCode);
    await page.getByLabel('Nombre de voz').fill(name);
    await page.getByLabel('Instrumento (opcional)').fill('Clarinete');
    await page
      .getByRole('button', { name: 'Guardar voz y seleccionar' })
      .click();
    await expect(page.locator('app-voice-picker summary')).toHaveText(name);
    await page
      .getByLabel('Notas (opcional)')
      .fill('Prueba aislada de inventario musical');
    await page
      .getByRole('button', { name: 'Crear carpeta', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: code, exact: true }),
    ).toBeVisible();
    folderId = page.url().split('/').pop()!.split('?')[0];
    await expect(page.getByText('Utilizable', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Alta de carpeta', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: code, exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Editar carpeta' }).click();
    await page.getByLabel('Marcar como no utilizable').check();
    await page
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(
      page.getByText('No utilizable', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Editar carpeta' }).click();
    await page
      .getByLabel('Notas (opcional)')
      .fill('Borrador que debe conservarse');
    const row = (
      await client.from('music_folders').select('*').eq('id', folderId).single()
    ).data!;
    expect(
      (
        await client.rpc('music_command', {
          p_request: randomUUID(),
          p_action: 'FOLDER_SAVE',
          p_id: folderId,
          p_expected_version: row.version,
          p_data: {
            code: row.code,
            repertoire_code: row.repertoire_code,
            voice_id: row.voice_id,
            notes: 'Cambio de otro administrador',
            manually_blocked: true,
            archived: false,
          },
        })
      ).error,
    ).toBeNull();
    await page
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'Los datos han cambiado',
    );
    await expect(page.getByLabel('Notas (opcional)')).toHaveValue(
      'Borrador que debe conservarse',
    );
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Cargar versión actual' }).click();
    await expect(page.getByLabel('Notas (opcional)')).toHaveValue(
      'Cambio de otro administrador',
    );
    await page.getByLabel('Marcar como no utilizable').uncheck();
    await page
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(page.getByText('Utilizable', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Archivar carpeta', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar archivado' }).click();
    await expect(page.getByText('Archivada', { exact: true })).toBeVisible();
    await page.goto('/inventario/carpetas/nueva');
    await page.getByLabel('Código físico').fill(code);
    await page.locator('app-voice-picker summary').click();
    await page.getByLabel('Buscar voz').fill(name);
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page
      .getByRole('button', { name: 'Crear carpeta', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('Ya existe ese código');
    await expect(page.getByLabel('Código físico')).toHaveValue(code);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await page.getByLabel('Estado', { exact: true }).selectOption('archived');
    await page.getByLabel('Buscar código').fill(code);
    await page.getByRole('link').filter({ hasText: code }).click();
    await page
      .getByRole('button', { name: 'Reactivar carpeta', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirmar reactivación' }).click();
    await expect(page.getByText('Utilizable', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Carpeta archivada', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Carpeta reactivada', { exact: true }),
    ).toBeVisible();
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/folder-detail-' + info.project.name + '.png',
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await page.getByRole('link', { name: '← Carpetas', exact: true }).click();
    await expect(page.getByLabel('Buscar código')).toHaveValue(code);
    await expect(page.getByLabel('Estado', { exact: true })).toHaveValue(
      'archived',
    );
    await page.getByRole('link', { name: 'Vestuario', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Inventario', exact: true }),
    ).toBeVisible();
  });
});
