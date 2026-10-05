import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { adminQuery } from './admin-query';
test.describe('Supabase real · productividad', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere Supabase independiente',
  );
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(180000);
  const prefix = 'QA-P9-' + uuid().slice(0, 8).toUpperCase(),
    sid = uuid(),
    event = uuid(),
    uniform = uuid();
  let client: ReturnType<typeof createClient>,
    admin: { email: string; password: string };
  async function rpc(name: string, args: Record<string, unknown>) {
    const r = await client.rpc(name, args);
    expect(r.error).toBeNull();
    return r.data;
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
    const type = (
      await client
        .from('garment_types')
        .select('id')
        .eq('name', 'Chaqueta')
        .single()
    ).data!.id;
    await rpc('plan_event', {
      p_request_id: uuid(),
      p_action: 'UNIFORM',
      p_id: uniform,
      p_expected_version: null,
      p_data: { name: prefix, type_ids: [type] },
    });
    await rpc('plan_series', {
      p_request_id: uuid(),
      p_action: 'SERIES',
      p_id: sid,
      p_expected_version: null,
      p_data: { name: prefix + ' Original' },
    });
    await rpc('plan_event', {
      p_request_id: uuid(),
      p_action: 'EVENT',
      p_id: event,
      p_expected_version: null,
      p_data: {
        title: prefix + ' Actuación',
        uniform_id: uniform,
        starts: '2090-04-02T18:00',
        ends: '2090-04-02T20:00',
        from: '2090-04-02T16:00',
        until: '2090-04-02T22:00',
      },
    });
    await rpc('plan_series', {
      p_request_id: uuid(),
      p_action: 'MEMBERSHIP',
      p_id: sid,
      p_expected_version: 1,
      p_data: { event_id: event, event_version: 1, active: true },
    });
  });
  test.afterAll(async () => {
    await adminQuery(`begin;
   create temporary table qs as select id from public.event_series where name like '${prefix}%';
   create temporary table qe as select id from public.events where title like '${prefix}%' and series_id in(select id from qs);
   create temporary table qp as select id from public.people where full_name like '${prefix}%';
   create temporary table qg as select id from public.garments where code like '${prefix}%';
   delete from public.audit_log where series_id in(select id from qs) or event_id in(select id from qe) or uniform_id='${uniform}' or person_id in(select id from qp) or garment_id in(select id from qg);
   delete from public.planning_requests where payload::text like '%${prefix}%' or payload->>'id' in(select id::text from qs) or payload->>'id' in(select id::text from qe) or payload->>'id'='${uniform}';
   delete from public.event_assignments where event_id in(select id from qe);
   delete from public.event_participants where event_id in(select id from qe);
   delete from public.series_blocks where series_id in(select id from qs);
   delete from public.events where id in(select id from qe);
   delete from public.event_series where id in(select id from qs);
   delete from public.uniforms where id='${uniform}' and name='${prefix}';
   delete from public.people where id in(select id from qp);
   delete from public.garments where id in(select id from qg);
   commit;`);
    await client?.auth.signOut();
  });
  test('importación confirmada, duplicados bloqueados, copia', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/inicio$/);
    await page.goto('/personas/importar');
    const file = {
      name: 'personas.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'nombre;tipo;instrumento\n' + prefix + ' Persona;Componente;Clarinete',
      ),
    };
    await page.getByLabel('Archivo CSV').setInputFiles(file);
    await page.getByRole('button', { name: 'Revisar archivo' }).click();
    await expect(
      page.getByRole('button', { name: 'Importar 1 persona' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Importar 1 persona' }).click();
    await expect(page.getByRole('status')).toContainText('1 ficha creada');
    const person = (
      await client
        .from('people')
        .select('id')
        .eq('full_name', prefix + ' Persona')
        .single()
    ).data!;
    expect(person).toBeTruthy();
    await page.getByLabel('Archivo CSV').setInputFiles(file);
    await page.getByRole('button', { name: 'Revisar archivo' }).click();
    await expect(page.getByRole('alert')).toContainText('Nombre repetido');
    await expect(
      page.getByRole('button', { name: 'Importar 1 persona' }),
    ).toBeDisabled();
    await page.getByLabel('Archivo CSV').setInputFiles([]);
    await page.goto('/inventario/importar');
    await page.getByLabel('Archivo CSV').setInputFiles({
      name: 'prendas.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('codigo;tipo;talla\n' + prefix + '-40;Chaqueta;40'),
    });
    await page.getByRole('button', { name: 'Revisar archivo' }).click();
    await page.getByRole('button', { name: 'Importar 1 prenda' }).click();
    await expect(page.getByRole('status')).toContainText('1 ficha creada');
    await page.goto('/actuaciones/series/' + sid + '/duplicar');
    await page.getByLabel('Nombre de la nueva serie').fill(prefix + ' Copia');
    await page.getByLabel('Fecha de la primera actuación').fill('2091-04-01');
    await page.getByRole('button', { name: 'Ver nueva agenda' }).click();
    await expect(
      page.getByText(prefix + ' Actuación', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Crear copia de la serie' }).click();
    await expect(page).toHaveURL(/\/actuaciones\/series\/[a-f0-9-]+$/);
    const copied = (
      await client
        .from('event_series')
        .select('id')
        .eq('name', prefix + ' Copia')
        .single()
    ).data!.id;
    const detail = await rpc('series_detail', { p_id: copied });
    expect(detail.events).toHaveLength(1);
    expect(detail.blocks).toHaveLength(0);
    expect(detail.rows).toHaveLength(0);
    expect(detail.events[0].starts_at).toContain('2091-04-01');
    expect(
      (await client.from('loans').select('id').eq('person_id', person.id)).data,
    ).toEqual([]);
  });
});
