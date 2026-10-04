import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.SUPABASE_URL?.trim() ?? '';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
if (url || publishableKey || process.argv.includes('--required')) {
  if (!url || !publishableKey)
    throw new Error(
      'Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en .env.',
    );
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(parsed.hostname)
  )
    throw new Error('Supabase requiere HTTPS.');
  let publicKey = publishableKey.startsWith('sb_publishable_');
  if (!publicKey) {
    try {
      publicKey =
        JSON.parse(
          Buffer.from(publishableKey.split('.')[1], 'base64url').toString(),
        ).role === 'anon';
    } catch {}
  }
  if (!publicKey)
    throw new Error(
      'Utiliza exclusivamente una clave publishable o anon. Nunca una clave secreta/service_role.',
    );
}
writeFileSync(
  'public/app-config.json',
  JSON.stringify({ supabaseUrl: url, supabasePublishableKey: publishableKey }) +
    '\n',
);
console.log(
  url
    ? 'Conexión pública a Supabase configurada.'
    : 'Sin conexión configurada. El acceso permanecerá deshabilitado.',
);
