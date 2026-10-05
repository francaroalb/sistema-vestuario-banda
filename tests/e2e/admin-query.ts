import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Administrative cleanup is confined by each test to its own UUIDs and prefix.
// Never import this helper into application code.
export async function adminQuery(query: string) {
  const ref = JSON.parse(readFileSync('.local/project.json', 'utf8')).id;
  if (ref !== 'vbrtkmufrtfuanimmqyp')
    throw new Error('Proyecto distinto de Vestuario.');
  const runner = process.env['VESTUARIO_QA_SQL_RUNNER'];
  if (runner) {
    execFileSync(process.execPath, [resolve(runner)], {
      input: query,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return;
  }
  const token =
    process.env['VESTUARIO_QA_MANAGEMENT_TOKEN'] ||
    execFileSync(
      'security',
      ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
      { encoding: 'utf8', timeout: 20000 },
    ).trim();
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error('No se pudo limpiar la prueba: HTTP ' + response.status);
}
