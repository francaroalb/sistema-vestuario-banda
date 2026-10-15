import { test, expect, Page } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { adminQuery } from './admin-query';
import { Database, Json } from '../../src/app/core/config/database.types';
import { SeriesDetail } from '../../src/app/core/events/models';
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

test.describe('Supabase real · series fase 6', () => {
  test.skip(
    process.env['REAL_AUTH'] !== '1',
    'Requiere proyecto independiente.',
  );
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(180000);
  let client: SupabaseClient<Database>,
    admin: { email: string; password: string },
    type: string;
  const sid = uuid(),
    uniform = uuid(),
    events = Array.from({ length: 6 }, uuid),
    people = Array.from({ length: 9 }, uuid),
    g = uuid();
  const prefix = 'QA-S-' + uuid().slice(0, 8).toUpperCase();
  const titles = [
    'Domingo de Ramos',
    'Martes Santo',
    'Miércoles Santo',
    'Jueves Santo',
    'Madrugá',
    'Viernes Santo',
  ];
  async function snapshot() {
    const r = await client.rpc('series_detail', { p_id: sid });
    expect(r.error).toBeNull();
    return r.data as unknown as SeriesDetail;
  }
  async function command(action: string, data: Json) {
    const version = (await snapshot()).series.version;
    const r = await client.rpc('plan_series', {
      p_request_id: uuid(),
      p_action: action,
      p_id: sid,
      p_expected_version: version,
      p_data: data,
    });
    expect(r.error).toBeNull();
    return r.data;
  }
  test.beforeAll(async () => {
    process.loadEnvFile('.env');
    admin = JSON.parse(readFileSync('.local/admin.json', 'utf8'));
    client = createClient<Database>(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect((await client.auth.signInWithPassword(admin)).error).toBeNull();
    type = (
      await client.from('garment_types').select('*').eq('name', 'Chaqueta')
    ).data![0].id;
    expect(
      (
        await client.rpc('plan_event', {
          p_request_id: uuid(),
          p_action: 'UNIFORM',
          p_id: uniform,
          p_expected_version: null,
          p_data: { name: prefix + ' Invierno', type_ids: [type] },
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await client.rpc('plan_series', {
          p_request_id: uuid(),
          p_action: 'SERIES',
          p_id: sid,
          p_expected_version: null,
          p_data: { name: prefix + ' Semana Santa' },
        })
      ).error,
    ).toBeNull();
    for (let i = 0; i < 5; i++)
      await command('EVENT_CREATE', {
        event_id: events[i],
        event_data: {
          title: prefix + ' ' + titles[i],
          uniform_id: uniform,
          starts: `2090-04-${String([2, 4, 5, 6, 7][i]).padStart(2, '0')}T${i === 4 ? '00:30' : '18:00'}`,
          ends: `2090-04-${String([2, 4, 5, 6, 7][i]).padStart(2, '0')}T${i === 4 ? '03:00' : '20:00'}`,
          from: `2090-04-${String([2, 4, 5, 6, 7][i]).padStart(2, '0')}T${i === 4 ? '00:00' : '16:00'}`,
          until: `2090-04-${String([2, 4, 5, 6, 7][i]).padStart(2, '0')}T${i === 4 ? '04:00' : '22:00'}`,
          notes: '',
        },
      });
    expect(
      (
        await client.rpc('save_garment', {
          p_id: g,
          p_expected_version: null,
          p_code: prefix + '-48',
          p_garment_type_id: type,
          p_size: '48',
          p_physical_state: 'DISPONIBLE',
          p_notes: null,
        })
      ).error,
    ).toBeNull();
  });
  test.afterAll(async () => {
    expect(JSON.parse(readFileSync('.local/project.json', 'utf8')).id).toBe(
      'vbrtkmufrtfuanimmqyp',
    );
    await adminQuery(`begin;
 create temporary table qs as select id from public.event_series where id='${sid}' and name like '${prefix}%';
 create temporary table qe as select id from public.events where series_id in(select id from qs) and title like '${prefix}%';
 create temporary table qp as select id from public.people where full_name like '${prefix}%';
 create temporary table qg as select id from public.garments where id='${g}' and code like '${prefix}%';
 create temporary table ql as select id from public.loans where person_id in(select id from qp);
 delete from public.audit_log where series_id in(select id from qs) or event_id in(select id from qe) or uniform_id='${uniform}' or person_id in(select id from qp) or garment_id in(select id from qg) or loan_id in(select id from ql);
 delete from public.music_planning_requests where payload->>'id' in(select id::text from qs union select id::text from qe);
 delete from public.planning_requests where payload->>'id' in(select id::text from qs union select id::text from qe) or payload->>'id'='${uniform}';
 delete from public.event_assignments where event_id in(select id from qe);
 delete from public.event_participants where event_id in(select id from qe);
 delete from public.series_blocks where series_id in(select id from qs);
 delete from public.events where id in(select id from qe);
 delete from public.event_series where id in(select id from qs);
 delete from public.uniforms where id='${uniform}' and name like '${prefix}%';
 delete from public.loan_movements where loan_id in(select id from ql);
 delete from public.loan_items where loan_id in(select id from ql);
 delete from public.loans where id in(select id from ql);
 delete from public.people where id in(select id from qp);
 delete from public.garments where id in(select id from qg);commit;`);
    await client?.auth.signOut({ scope: 'local' });
  });
  test('seis actuaciones, diez refuerzos, huecos, reserva conjunta, firma y devolución', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await page.goto('/actuaciones/series/' + sid);
    await page.locator('.series-agenda > summary').click();
    await page
      .getByRole('link', { name: 'Crear actuación para la serie' })
      .click();
    await page
      .getByLabel('Nombre de la actuación')
      .fill(prefix + ' ' + titles[5]);
    await page.getByLabel('Uniforme', { exact: true }).selectOption(uniform);
    await page.getByLabel('Inicio', { exact: true }).fill('2090-04-07T18:00');
    await page.getByLabel('Fin', { exact: true }).fill('2090-04-07T20:00');
    await page.getByLabel('Entrega prevista desde').fill('2090-04-07T16:00');
    await page
      .getByLabel('Devolución prevista', { exact: true })
      .fill('2090-04-07T22:00');
    await page.getByRole('button', { name: 'Guardar actuación' }).click();
    await expect(
      page.getByRole('heading', {
        name: prefix + ' Semana Santa',
        exact: true,
      }),
    ).toBeVisible();
    events[5] = (await snapshot()).events[5].id;
    const patterns = [
      [0, 1, 2, 3, 4, 5],
      [0, 1],
      [0, 2, 5],
      [2, 3, 4],
      [0],
      [1, 2, 3, 4, 5],
      [0, 1, 4, 5],
      [1, 4],
      [5],
    ];
    for (let i = 0; i < 9; i++)
      await command('ATTENDANCE', {
        person_id: people[i],
        name: prefix + ' Refuerzo ' + i,
        instrument: 'Clarinete',
        event_ids: patterns[i].map((j) => events[j]),
        gap_choice: [2, 6].includes(i) ? 'SPLIT' : 'KEEP',
      });
    await page.reload();
    await page
      .getByRole('button', { name: 'Añadir participante', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'No existe: crear refuerzo' })
      .click();
    await page
      .getByLabel('Nombre del refuerzo')
      .fill(prefix + ' Refuerzo huecos');
    await page.getByLabel('Instrumento', { exact: true }).fill('Trompeta');
    for (const i of [0, 2, 5])
      await page.getByRole('checkbox', { name: new RegExp(titles[i]) }).check();
    await expect(
      page.getByText('Hay actuaciones intermedias en las que no participa', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Guardar participación' }),
    ).toBeDisabled();
    mkdirSync('.local/screenshots', { recursive: true });
    await page.locator('#participation-editor').screenshot({
      path:
        '.local/screenshots/fase6-participacion-' + info.project.name + '.png',
    });
    await page
      .getByRole('radio', {
        name: 'Mantener una única cesión entre la primera y la última',
      })
      .check();
    // Lost response: retry must preserve the person and block identifiers.
    await page.route(
      '**/rpc/plan_music_participant',
      async (route) => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Guardar participación' }).click();
    await expect(page.getByRole('alert')).toContainText('reintenta');
    await page.getByRole('button', { name: 'Guardar participación' }).click();
    let d = await snapshot();
    expect(new Set(d.blocks.map((b) => b.person_id)).size).toBe(10);
    expect(d.blocks.filter((b) => b.person_id === people[2])).toHaveLength(3);
    const b = d.blocks.find(
      (b) => b.full_name === prefix + ' Refuerzo huecos',
    )!;
    expect(d.blocks.filter((x) => x.person_id === b.person_id)).toHaveLength(1);
    let card = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: prefix + ' Refuerzo huecos',
        exact: true,
      }),
    });
    await card
      .getByRole('button', { name: 'Asignar prenda', exact: true })
      .click();
    await page
      .getByLabel('Buscar código para todo el periodo')
      .fill(prefix + '-48');
    await card.getByRole('button', { name: 'Buscar', exact: true }).click();
    await card
      .getByRole('button', { name: 'Asignar ' + prefix + '-48', exact: true })
      .click();
    await expect(
      card.getByText('Asignada · pendiente de entrega', { exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize(
      info.project.name === 'mobile'
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    );
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: '.local/screenshots/fase6-serie-' + info.project.name + '.png',
      fullPage: true,
    });
    await card.screenshot({
      path: '.local/screenshots/fase6-periodo-' + info.project.name + '.png',
    });
    await card
      .getByRole('link', { name: 'Entregar prendas', exact: true })
      .click();
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await expect(
      page.getByText(/Con devolución prevista: 2090-04-07 22:00/),
    ).toBeVisible();
    await sign(page, info.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(
      page.getByRole('heading', {
        name: prefix + ' ' + titles[0],
        exact: true,
      }),
    ).toBeVisible();
    await page.goto('/actuaciones/' + events[5]);
    let section = page.locator('section').filter({
      has: page.getByRole('heading', {
        name: prefix + ' Refuerzo huecos',
        exact: true,
      }),
    });
    await expect(
      section.getByText('En su poder', { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole('link', { name: 'Entregar prendas', exact: true }),
    ).toHaveCount(0);
    await expect(
      section.getByText(/Última actuación — devolución prevista al finalizar/),
    ).toBeVisible();
    await section
      .getByRole('link', { name: 'Devolver ' + prefix + '-48', exact: true })
      .click();
    await page
      .getByRole('checkbox', {
        name: 'Devolver ' + prefix + '-48',
        exact: true,
      })
      .check();
    await page.getByRole('button', { name: 'Revisar y firmar' }).click();
    await sign(page, info.project.name === 'mobile');
    await page.getByRole('button', { name: 'Confirmar devolución' }).click();
    await expect(
      page.getByText('Finalizada', { exact: true }).first(),
    ).toBeVisible();
    await page.goto('/actuaciones/series/' + sid);
    await page
      .getByRole('button', {
        name: 'Preparar a ' + prefix + ' Refuerzo huecos',
        exact: true,
      })
      .click();
    card = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: prefix + ' Refuerzo huecos',
        exact: true,
      }),
    });
    await expect(card.getByText('Devuelta', { exact: true })).toBeVisible();
    const items = await client
      .from('loan_items')
      .select('*')
      .eq('garment_id', g);
    expect(items.data).toHaveLength(1);
    expect(items.data![0].returned_at).not.toBeNull();
    await card.getByRole('button', { name: 'Editar participación' }).click();
    await expect(
      page.getByRole('button', { name: 'Guardar participación' }),
    ).toBeDisabled();
    await page
      .getByRole('radio', {
        name: 'Dividir: devolver al terminar cada bloque y recoger de nuevo',
      })
      .check();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Guardar participación' }).click();
    await expect(
      card.getByRole('heading', { name: 'Periodo 3', exact: true }),
    ).toBeVisible();
    expect(
      (await snapshot()).blocks.filter((x) => x.person_id === b.person_id),
    ).toHaveLength(3);
    await page.goto('/actuaciones/' + events[5]);
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: 'Cancelar actuación', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'retira las participaciones de la serie',
    );
    expect(
      (await snapshot()).events.find((e) => e.id === events[5])?.cancelled,
    ).toBe(false);
    expect(errors).toEqual([]);
  });
  test('concurrencia remota, versión, reintento y permisos de series', async () => {
    const d = await snapshot();
    const block = d.blocks.find((b) => b.person_id === people[0])!;
    const other = d.blocks.find((b) => b.person_id === people[1])!;
    const args = (blockId: string) => ({
      p_request_id: uuid(),
      p_action: 'BLOCK_ASSIGN',
      p_id: sid,
      p_expected_version: d.series.version,
      p_data: { block_id: blockId, type_id: type, garment_id: g },
    });
    const first = args(block.id),
      second = args(other.id);
    const responses = await Promise.all([
      client.rpc('plan_series', first),
      client.rpc('plan_series', second),
    ]);
    expect(responses.filter((r) => !r.error)).toHaveLength(1);
    expect(responses.find((r) => r.error)?.error?.message).toBe('PLAN_CHANGED');
    const winner = responses[0].error ? second : first;
    expect((await client.rpc('plan_series', winner)).error).toBeNull();
    const anonymous = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(
      (await anonymous.rpc('series_detail', { p_id: sid })).error,
    ).not.toBeNull();
    expect(
      (await client.from('event_series').delete().eq('id', sid)).error,
    ).not.toBeNull();
    expect(
      (await client.from('event_series').select('id').eq('id', sid)).data,
    ).toHaveLength(1);
  });
});
