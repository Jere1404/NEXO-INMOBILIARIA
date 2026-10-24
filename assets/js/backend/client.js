// The SDK is supplied by the caller. No CDN, configuration or client is activated automatically.
export function createBackendClient(createClient, { url, publishableKey }, storage) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['','/'].includes(parsed.pathname)) throw new Error('URL de Supabase inválida.');
  if (typeof publishableKey !== 'string' || !publishableKey.startsWith('sb_publishable_')) throw new Error('Usá una clave pública publishable, nunca una clave secreta.');
  if (typeof createClient !== 'function') throw new Error('Se requiere el SDK oficial.');
  return createClient(parsed.origin, publishableKey, { auth: {
    flowType: 'pkce', autoRefreshToken: true, persistSession: Boolean(storage),
    ...(storage ? { storage } : {}), detectSessionInUrl: false,
  } });
}
