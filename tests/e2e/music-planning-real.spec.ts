import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { adminQuery } from './admin-query';

test.describe('Carpetas fases 7 y 8 · Supabase real', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere acceso real autorizado',
  );
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(120000);
  const people = [uuid(), uuid()],
    voice = uuid(),
    folder = uuid(),
    series = uuid(),
    event = uuid(),
    uniform = uuid();
  const prefix = 'QA78-' + uuid().slice(0, 8),
    voiceCode = 'Q' + uuid().replaceAll('-', '').slice(0, 8).toUpperCase(),
    code = 'PRO-' + voiceCode + '-001';
  let client: SupabaseClient, admin: { email: string; password: string };
  const rpc = async (name: string, args: any) => {
    const r = await client.rpc(name, args);
    expect(r.error).toBeNull();
    return r.data;
  };
  const command = (action: string, data: any) =>
    rpc('music_planning_command', {
      p_request: uuid(),
      p_action: action,
      p_scope: 'series',
      p_id: series,
      p_data: data,
    });
  const detail = () =>
    rpc('music_planning_detail', {
      p_scope: 'series',
      p_id: series,
      p_page: 1,
      p_person: null,
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
    const actor = (await client.auth.getUser()).data.user!.id;
    for (let i = 0; i < people.length; i++)
      await rpc('save_person', {
        p_id: people[i],
        p_expected_version: null,
        p_full_name: prefix + (i ? ' Pilar' : ' Isabel'),
        p_kind: 'REFUERZO',
        p_instrument: 'Clarinete',
        p_phone: null,
        p_notes: null,
      });
    await rpc('music_command', {
      p_request: uuid(),
      p_action: 'VOICE_SAVE',
      p_id: voice,
      p_expected_version: null,
      p_data: {
        code: voiceCode,
        name: prefix + ' Voz',
        instrument: 'Clarinete',
        archived: false,
      },
    });
    await rpc('music_command', {
      p_request: uuid(),
      p_action: 'FOLDER_SAVE',
      p_id: folder,
      p_expected_version: null,
      p_data: {
        code,
        repertoire_code: 'PRO',
        voice_id: voice,
        manually_blocked: false,
        archived: false,
      },
    });
    await adminQuery(`begin;
  insert into public.uniforms(id,name,type_ids,updated_by) values('${uniform}','${prefix}',array[(select id from public.garment_types limit 1)],'${actor}');
  insert into public.event_series(id,name,updated_by) values('${series}','${prefix} Serie','${actor}');
  insert into public.events(id,title,starts_at,ends_at,planned_from,planned_until,uniform_id,uniform_name,type_ids,updated_by,series_id) values('${event}','${prefix} Actuación',now()+interval '20 days',now()+interval '20 days 2 hours',now()+interval '19 days',now()+interval '21 days','${uniform}','${prefix}',array[(select id from public.garment_types limit 1)],'${actor}','${series}');commit;`);
    for (const person of people) {
      const s = await client
        .from('event_series')
        .select('version')
        .eq('id', series)
        .single();
      expect(s.error).toBeNull();
      await rpc('plan_music_participant', {
        p_request: uuid(),
        p_scope: 'series',
        p_id: series,
        p_version: s.data!.version,
        p_data: { person_id: person, event_ids: [event], gap_choice: null },
        p_voice: voice,
        p_apply_voice: true,
      });
    }
    await command('EVENT', {
      event_id: event,
      version: 0,
      repertoires: ['PRO'],
    });
  });
  test.afterAll(async () => {
    const ps = people.map((id) => `'${id}'`).join(',');
    await adminQuery(`begin;
  create temporary table qa_r as select id from public.folder_reservations where folder_id='${folder}';
  delete from public.music_plan_assignments where scope_id='${series}';
  delete from public.music_planning_requests where payload->>'id'='${series}';
  delete from public.material_operations where payload->'preview'->>'id' in(select id::text from qa_r);
  delete from public.folder_reservations where id in(select id from qa_r);
  delete from public.audit_log where entity_id in(${ps},'${voice}','${folder}','${series}','${event}','${uniform}');
  delete from public.planning_requests where payload->>'id' in('${series}','${event}');
  delete from public.event_assignments where event_id='${event}';
  delete from public.event_participants where event_id='${event}';
  delete from public.series_blocks where series_id='${series}';
  delete from public.events where id='${event}';
  delete from public.event_series where id='${series}';
  delete from public.uniforms where id='${uniform}';
  delete from public.folder_work_movements where folder_id='${folder}';
  delete from public.folder_work_presence where folder_id='${folder}';
  delete from public.music_requests where payload->>'id' in('${voice}','${folder}');
  delete from public.music_folders where id='${folder}' and code='${code}';
  delete from public.musical_voices where id='${voice}' and code='${voiceCode}';
  delete from public.people where id in(${ps}) and full_name like '${prefix}%';commit;`);
    expect(
      (
        await client
          .from('music_plan_assignments')
          .select('id')
          .eq('scope_id', series)
      ).data,
    ).toHaveLength(0);
    expect(
      (await client.from('people').select('id').in('id', people)).data,
    ).toHaveLength(0);
    await client?.auth.signOut({ scope: 'local' });
  });
  test('preparación, reserva sin entrega y concurrencia; cambios de voz no cancelan en silencio', async ({
    page,
  }) => {
    await page.goto('/actuaciones/series/' + series + '/carpetas');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: prefix + ' Serie' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: new RegExp(prefix + ' Isabel') })
      .click();
    await page
      .getByRole('button', { name: 'Ver carpetas recomendadas' })
      .click();
    await page.getByRole('button', { name: new RegExp(code) }).click();
    const ack = page.getByRole('checkbox', {
      name: 'He revisado los avisos y las fechas.',
    });
    if (await ack.count()) await ack.check();
    await page.getByRole('button', { name: 'Reservar carpeta' }).click();
    await expect(
      page.getByRole('link', { name: 'Entregar y firmar' }),
    ).toBeVisible();
    expect(
      (await client.from('folder_loans').select('id').in('person_id', people))
        .data,
    ).toHaveLength(0);
    let d = await detail();
    const assigned = d.needs.find((n: any) => n.assignment_id);
    expect(assigned.status).toBe('ASSIGNED');
    await command('RELEASE', {
      id: assigned.assignment_id,
      version: assigned.assignment_version,
    });
    d = await detail();
    const recs = await Promise.all(
      d.needs.map((n: any) =>
        rpc('recommend_music_folders', {
          p_key: n.need_key,
          p_page: 1,
          p_q: code,
        }),
      ),
    );
    const results = await Promise.all(
      recs.map((rec: any) =>
        client.rpc('music_planning_command', {
          p_request: uuid(),
          p_action: 'ASSIGN',
          p_scope: 'series',
          p_id: series,
          p_data: {
            need: rec.need,
            folder_id: folder,
            folder_version: rec.rows[0].version,
            ack: true,
          },
        }),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error)).toHaveLength(1);
    d = await detail();
    const winner = d.needs.find((n: any) => n.assignment_id),
      part = d.participations.find(
        (p: any) => p.person_id === winner.person_id,
      );
    await command('VOICE', {
      person_id: part.person_id,
      rows: [
        {
          event_id: event,
          version: part.version,
          voice_id: null,
          required: true,
        },
      ],
    });
    const changed = await detail();
    expect(changed.stale).toHaveLength(1);
    expect(
      changed.needs.find((n: any) => n.person_id === part.person_id).status,
    ).toBe('VOICE_PENDING');
    expect(
      (
        await client
          .from('folder_reservations')
          .select('cancelled_at')
          .eq('id', winner.reservation_id)
          .single()
      ).data!.cancelled_at,
    ).toBeNull();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Asignaciones afectadas por cambios' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
