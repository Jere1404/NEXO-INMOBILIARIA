const validHash = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,512}$/.test(value);
const validAccessToken = value => typeof value === 'string' && value.length <= 32768 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
const validRefreshToken = value => typeof value === 'string' && /^[A-Za-z0-9._~-]{8,4096}$/.test(value);
export function readAuthLink(url) {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.slice(1));
  if (['error','error_code','error_description','code'].some(key => query.has(key) || hash.has(key))) return { kind:'invalid' };
  // Bearer credentials are accepted only in the fragment, never in server-visible query strings.
  if (query.has('access_token') || query.has('refresh_token')) return { kind:'invalid' };
  const tokens = [...query.getAll('token_hash'), ...hash.getAll('token_hash')];
  const types = [...query.getAll('type'), ...hash.getAll('type')];
  const access = hash.getAll('access_token');
  const refresh = hash.getAll('refresh_token');
  if (!tokens.length && !types.length && !access.length && !refresh.length && !parsed.hash) return { kind:'none' };
  if (types.length !== 1 || !['invite','recovery'].includes(types[0])) return { kind:'invalid' };
  if (tokens.length) {
    if (tokens.length !== 1 || access.length || refresh.length || !validHash(tokens[0])) return { kind:'invalid' };
    return { kind:types[0], tokenHash:tokens[0] };
  }
  if (access.length !== 1 || refresh.length !== 1 || !validAccessToken(access[0]) || !validRefreshToken(refresh[0])) return { kind:'invalid' };
  return { kind:types[0], accessToken:access[0], refreshToken:refresh[0] };
}
export function consumeAuthLink(location, history) {
  const link = readAuthLink(location.href);
  // Do not persist, log, interpolate into HTML or forward email-link credentials.
  history.replaceState(null, '', location.pathname);
  return link;
}
export function recoveryRedirect(siteUrl) {
  const url = new URL(siteUrl);
  const local = ['localhost','127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('Configuración de URL inválida.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return new URL('admin/recuperar.html',url).href;
}
export function validatePassword(password, confirmation) {
  if (typeof password !== 'string' || password.length < 12) return 'Usá una contraseña de al menos 12 caracteres.';
  if (password.length > 128) return 'Usá una contraseña de hasta 128 caracteres.';
  if (password !== confirmation) return 'Las contraseñas no coinciden.';
  return '';
}
export async function verifyEmailLink(client, link, expectedType) {
  const hashPresent = link != null && Object.hasOwn(link, 'tokenHash');
  const hasHash = validHash(link?.tokenHash);
  const hasSession = validAccessToken(link?.accessToken) && validRefreshToken(link?.refreshToken);
  if (!['invite','recovery'].includes(expectedType) || link?.kind !== expectedType
    || (!hasHash && !hasSession) || (hashPresent && (!hasHash || link.accessToken || link.refreshToken))) throw new Error('Enlace inválido.');
  try {
    const cleared = await client.auth.signOut({scope:'local'});
    if (cleared.error) throw new Error();
    const result = hasHash
      ? await client.auth.verifyOtp({token_hash:link.tokenHash,type:expectedType})
      : await client.auth.setSession({access_token:link.accessToken,refresh_token:link.refreshToken});
    if (result.error || !result.data?.session || !result.data?.user?.id) throw new Error();
    // The type hint and JWT payload in the URL never grant identity or admin privileges.
    const verified = await client.auth.getUser();
    if (verified.error || !verified.data?.user?.id || verified.data.user.id !== result.data.user.id) throw new Error();
    return verified.data.user;
  } catch {
    // Fail closed even if the SDK persisted a partial session before reporting an error.
    try { await client.auth.signOut({scope:'local'}); } catch { /* Do not expose SDK/token errors. */ }
    throw new Error('El enlace o la sesión no son válidos, o ya vencieron. Solicitá un enlace nuevo.');
  }
}
export async function setAccountPassword(client, password, confirmation) {
  const message = validatePassword(password, confirmation);
  if (message) throw new Error(message);
  const identity = await client.auth.getUser();
  if (identity.error || !identity.data?.user) throw new Error('La sesión venció. Solicitá un enlace nuevo.');
  const result = await client.auth.updateUser({password});
  if (result.error) throw new Error('No pudimos guardar la contraseña. Revisá los requisitos o solicitá un enlace nuevo.');
  const logout = await client.auth.signOut({scope:'local'});
  return { signedOut: !logout.error };
}
export async function requestRecovery(client, email, siteUrl) {
  const result = await client.auth.resetPasswordForEmail(email,{redirectTo:recoveryRedirect(siteUrl)});
  if (result.error) throw new Error('No pudimos solicitar el enlace. Esperá un momento e intentá nuevamente.');
}
