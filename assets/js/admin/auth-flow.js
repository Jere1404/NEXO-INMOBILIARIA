export function readAuthLink(url) {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.slice(1));
  if (query.has('error') || hash.has('error') || query.has('error_code') || hash.has('error_code')) return { kind:'invalid' };
  const tokens = [...query.getAll('token_hash'), ...hash.getAll('token_hash')];
  const types = [...query.getAll('type'), ...hash.getAll('type')];
  if (query.has('access_token') || query.has('refresh_token')) return { kind:'invalid' };
  if (!tokens.length && !types.length && !parsed.hash && !query.has('code')) return { kind:'none' };
  if (tokens.length !== 1 || types.length !== 1 || !/^[A-Za-z0-9_-]{16,512}$/.test(tokens[0]) || !['invite','recovery'].includes(types[0])) return { kind:'invalid' };
  return { kind:types[0], tokenHash:tokens[0] };
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
  if (link.kind !== expectedType || !link.tokenHash) throw new Error('Enlace inválido.');
  const cleared = await client.auth.signOut({scope:'local'});
  if (cleared.error) throw new Error('No se pudo preparar la sesión.');
  const result = await client.auth.verifyOtp({token_hash:link.tokenHash,type:expectedType});
  if (result.error || !result.data?.session || !result.data?.user) throw new Error('El enlace no es válido o ya venció.');
  const verified = await client.auth.getUser();
  if (verified.error || verified.data?.user?.id !== result.data.user.id) {
    await client.auth.signOut({scope:'local'}); throw new Error('No se pudo verificar la cuenta.');
  }
  return verified.data.user;
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
