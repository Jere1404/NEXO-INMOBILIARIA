import { consumeAuthLink, verifyEmailLink, setAccountPassword, requestRecovery, validatePassword } from './auth-flow.js';

// Strip links before loading/initializing the SDK, even when configuration is absent.
let link = consumeAuthLink(window.location, window.history);
const mode = document.body.dataset.authPage;
const $ = id => document.getElementById(id);
const status = $('auth-status');
const controls = $('auth-controls');
let client;
let authConfig;
let adminAuth;
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('is-error',error);
}
function clearPasswords() { for (const input of document.querySelectorAll('input[type="password"]')) input.value = ''; }
async function finishPassword(event) {
  event.preventDefault();
  const password = $('password').value, confirmation = $('confirmation').value;
  const error = validatePassword(password,confirmation);
  if (error) { message(error,true); $('confirmation').focus(); return; }
  controls.disabled = true;
  message('Guardando contraseña…');
  try {
    const result = await setAccountPassword(client,password,confirmation);
    clearPasswords();
    $('auth-form').hidden = true;
    $('success').hidden = false;
    message(result.signedOut ? 'Contraseña guardada. Ya podés iniciar sesión.' : 'Contraseña guardada. No pudimos confirmar el cierre de sesión; cerrá esta pestaña antes de volver a ingresar.');
    $('success-title').focus();
  } catch (error) { clearPasswords(); controls.disabled = false; message(error.message,true); }
}
async function init() {
  const passwordMode = mode === 'activate' || (mode === 'recover' && link.kind !== 'none');
  if (passwordMode) {
    const expected = mode === 'activate' ? 'invite' : 'recovery';
    if (link.kind !== expected) {
      message('El enlace falta, no es válido o ya venció. Usá la recuperación de acceso o solicitá una nueva invitación.',true);
      link = null; return;
    }
  } else if (mode === 'login' && link.kind !== 'none') {
    message('Abrí el enlace desde su página de activación o recuperación correspondiente.',true);link=null;return;
  }
  try {
    const configured = await import('./supabase-client.js');
    client = configured.getAdminClient(); authConfig = configured.authConfig;
    const {createAdminAuth} = await import('../backend/auth.js');
    adminAuth = createAdminAuth(client);
  } catch {
    link = null;
    message('El acceso de administración todavía no está disponible. Volvé a intentarlo más tarde.',true);return;
  }
  if (passwordMode) {
    try {
      await verifyEmailLink(client,link,mode === 'activate' ? 'invite' : 'recovery');
      $('password-fields').hidden = false; $('password-fields').disabled = false; controls.disabled = false;
      $('auth-form').addEventListener('submit',finishPassword);
      message('Cuenta verificada. Elegí tu contraseña.');
    } catch {
      await client.auth.signOut({scope:'local'});
      message('El enlace no es válido, ya fue utilizado o venció. Solicitá uno nuevo para continuar.',true);
    } finally { link = null; }
    return;
  }
  link = null;
  if (mode === 'recover') {
    controls.disabled = false;
    $('email-fields').hidden = false; $('email-fields').disabled = false;
    message('Ingresá el correo de tu cuenta para recuperar el acceso.');
    $('auth-form').addEventListener('submit',async event => {
      event.preventDefault();controls.disabled = true;message('Solicitando enlace…');
      try { await requestRecovery(client,$('email').value.trim(),authConfig.siteUrl); message('Si existe una cuenta habilitada con ese correo, recibirás un enlace para recuperar el acceso. Revisá también el correo no deseado.'); }
      catch (error) { message(error.message,true); }
      finally { controls.disabled = false; }
    });
    return;
  }
  $('auth-form').addEventListener('submit',async event => {
    event.preventDefault();controls.disabled = true;message('Verificando acceso…');
    try {
      await adminAuth.signIn($('email').value.trim(),$('password').value);
      clearPasswords();$('auth-form').hidden = true;$('logged-in').hidden = false;
      message('Sesión iniciada. Tu cuenta está autorizada para administrar NEXO.');
    } catch {
      clearPasswords();message('No pudimos habilitar el acceso. Verificá tus credenciales y que tu cuenta tenga permiso de administrador.',true);
    } finally { controls.disabled = false; }
  });
  $('logout').addEventListener('click',async () => {
    $('logout').disabled = true;
    try { await adminAuth.signOut();$('logged-in').hidden = true;$('auth-form').hidden = false;message('Sesión cerrada.'); }
    catch { message('No pudimos cerrar la sesión. Volvé a intentarlo.',true); }
    finally { $('logout').disabled = false; }
  });
  try {
    const admin = await adminAuth.getCurrentAdmin();
    if (admin) { $('auth-form').hidden = true;$('logged-in').hidden = false;message('Tu sesión de administración está activa.'); }
    else { await client.auth.signOut({scope:'local'});message('Ingresá con tu cuenta autorizada.'); }
  } catch { message('No pudimos verificar la sesión. Intentá iniciar sesión nuevamente.',true); }
  finally { controls.disabled = false; }
}
init();
