# V5A.1 — invitación, contraseña y acceso de administración

## Estado

Implementación local, sin cambios en Supabase ni despliegue. Las páginas están listas para revisión y pruebas reales posteriores, con configuración pública proporcionada por el responsable en `admin/config.js`. La conexión con el servicio real sigue pendiente de validación después de publicar los cambios autorizados. El proyecto y las tablas existentes fueron reportados por el responsable; no se verificaron ni modificaron remotamente en esta etapa.

Los cambios pendientes de V5A se conservaron al crear `feature/nexo-v5a1-auth` desde `main` actualizada. No se modifican catálogo, fichas, fotos ni datos.

## Archivos y SDK

- `admin/activar.html`: invitación y contraseña inicial.
- `admin/login.html`: login, verificación de administrador y logout. Todavía no existe el panel V5B.
- `admin/recuperar.html`: solicitud de enlace y establecimiento de nueva contraseña.
- `admin/config.js`: solo configuración pública; conservar los valores autorizados por el responsable.
- `assets/js/admin/auth-flow.js`: funciones de lectura/limpieza de enlaces y llamadas de Auth.
- `assets/js/admin/auth-page.js`: interfaz y estados de los formularios.
- `assets/js/admin/supabase-client.js`: inicializa el cliente con `sessionStorage` y reutiliza V5A.
- `assets/vendor/supabase-js.js`: SDK oficial `@supabase/supabase-js` **2.118.0**, compilado localmente, sin CDN en tiempo de ejecución.
- `package-lock.json`: versiones e integridad del SDK y dependencias. `esbuild` 0.25.12 se usa solo para construir el módulo local.
- Licencias del SDK y dependencias en `assets/vendor/`.

Para instalar y reconstruir de forma reproducible desde la raíz:

```bash
npm ci --ignore-scripts
npm run build:auth
npm test
```

En entornos sin un directorio npm escribible, agregar `--cache /tmp/nexo-npm-cache` al comando npm. No se requieren credenciales para compilar. El bundle local está incluido para que GitHub Pages pueda servirlo sin ejecutar npm. No se envían páginas ni archivos a un servicio de build.

## Configuración pública y URLs

En `admin/config.js` se usan estos campos:

- `supabaseUrl`: URL HTTPS del proyecto Supabase.
- `publishableKey`: clave pública `sb_publishable_…` del proyecto.
- `siteUrl`: raíz HTTPS del sitio, incluyendo el subdirectorio del repositorio de GitHub Pages, sin `/admin/` ni una página concreta. El generador de enlaces admite la barra final o su ausencia.

Estos valores no son claves secretas, y fueron proporcionados explícitamente por el responsable; no son secretos. Nunca poner claves secretas, `service_role`, contraseñas, tokens personales ni cadenas de conexión en el frontend. El cliente rechaza claves secretas y se mantiene deshabilitado si la configuración es incompleta.

La CSP de las páginas solo permite scripts/estilos locales y conexiones a `https://*.supabase.co`. Si se adopta un dominio personalizado de Supabase, habrá que autorizar específicamente ese dominio antes de usarlo. No agregar scripts analíticos o de terceros en páginas con enlaces de Auth. Se fija `Referrer-Policy: no-referrer` mediante meta y se solicita `noindex,nofollow`; esto no sustituye permisos de servidor. GitHub Pages no permite configurar todos los encabezados de seguridad, por ejemplo `frame-ancestors`; revisar alojamiento con encabezados configurables antes de un panel de producción sensible.

## Configuración del Dashboard de Supabase, todavía no aplicada

1. **Auth / URL Configuration**: elegir el esquema de enlaces descrito abajo. Para plantillas predeterminadas e invitaciones desde Dashboard sin redirect explícito, usar la URL completa de `admin/activar.html` como Site URL de Supabase. El `siteUrl` del frontend sigue siendo la raíz del sitio. No dejar `localhost:3000` como destino de producción.
2. Autorizar URLs exactas de `admin/activar.html`, `admin/recuperar.html` y `admin/login.html`. No usar comodines amplios. Agregar destinos localhost solo si se necesitan para una prueba controlada.
3. Mantener deshabilitados registro público y usuarios anónimos de Auth; desactivar proveedores no utilizados. El frontend no exporta `signUp`, pero ese hecho no bloquea por sí solo la API de registro. Verificar el rechazo desde la API real.
4. Configurar política de contraseña mínima de 12 caracteres en Supabase. Los formularios verifican 12–128 caracteres y coincidencia, pero el servidor debe imponer su política. No almacenar contraseñas ni registrarlas en logs.
5. Para esta etapa se conserva el correo predeterminado de Supabase, sin SMTP personalizado. Comprobar restricciones de destinatarios, entrega, expiración y límites de frecuencia. No se cambiaron esos ajustes en esta implementación.
6. Publicar los archivos de Auth solo después de revisión y autorización; los enlaces necesitan una URL accesible. No es necesario conectar el catálogo a Supabase.

### Opción recomendada ahora: plantillas predeterminadas, sin SMTP personalizado

No es necesario editar los correos ni sustituir `{{ .ConfirmationURL }}`. El enlace predeterminado pasa primero por Supabase y redirige con la sesión en el fragmento: `access_token`, `refresh_token` y `type=invite` o `type=recovery`. NEXO ahora admite ese formato y verifica la sesión con el servidor antes de habilitar contraseña.

Si las invitaciones del Dashboard no permiten un destino explícito, establecer **Site URL de Supabase** en:

```text
https://jere1404.github.io/NEXO-INMOBILIARIA/admin/activar.html
```

Conservar las Redirect URLs exactas de activación, recuperación y login. La recuperación iniciada desde NEXO envía `redirectTo` a `admin/recuperar.html`; la invitación del Dashboard sin destino explícito usa Site URL.

**No confundir esa Site URL de Supabase con `siteUrl` de `admin/config.js`:** el valor del frontend debe seguir siendo la raíz `https://jere1404.github.io/NEXO-INMOBILIARIA`, porque se usa para construir la ruta de recuperación. Poner allí `admin/activar.html` generaría una ruta incorrecta.

Mantener las plantillas predeterminadas intactas y comprobar la entrega al correo autorizado del administrador. El servicio de correo incorporado de Supabase tiene restricciones de destinatarios y frecuencia; deben verificarse en el proyecto. Esta implementación no elimina esas restricciones ni configura SMTP. Los correos emitidos antes de corregir los destinos no se reescriben: solicitar un enlace nuevo; si el usuario ya confirmó su cuenta, usar recuperación.

### Compatibilidad opcional: plantillas con token_hash

Se conserva `verifyOtp` para una futura plantilla personalizada. Si más adelante se habilita la edición de correos y se desea usar este método, configurar Site URL como raíz sin barra final y enlaces directos:

```html
<a href="{{ .SiteURL }}/admin/activar.html#token_hash={{ .TokenHash }}&amp;type=invite">Activar mi cuenta</a>
<a href="{{ .SiteURL }}/admin/recuperar.html#token_hash={{ .TokenHash }}&amp;type=recovery">Establecer nueva contraseña</a>
```

Este es un esquema alternativo; no mezclar la Site URL completa de activación con esas plantillas que agregan `/admin/…`. No se cambiaron plantillas ni ajustes del proyecto durante la implementación.

## Flujos

### Invitación

1. Se acepta `token_hash` con tipo válido o una pareja completa `access_token`/`refresh_token` en el fragmento. Las credenciales de sesión en query se rechazan: podrían exponerse a logs del servidor. Tokens duplicados, formatos mezclados, errores o tipos diferentes de `invite`/`recovery` se rechazan.
2. Se elimina query y fragmento con `history.replaceState` antes de importar/inicializar el SDK, incluso si el enlace es inválido. No se guardan ni se registran los tokens del enlace; la sesión del SDK usa solo `sessionStorage`.
3. Se cierra la sesión local previa. Para `token_hash` se usa `verifyOtp`; para el enlace predeterminado se usa `setSession`. Se exige que la sesión y el usuario existan, y se verifica de nuevo con `auth.getUser()` que el servidor confirme la misma identidad.
4. El fragmento no demuestra identidad ni permisos: ni sus campos ni el contenido del JWT se usan para autorizar. Si la verificación falla, se intenta limpiar cualquier sesión parcial y se devuelve un mensaje genérico sin tokens ni detalles del SDK.
5. Se muestra el correo confirmado por el servidor para que la persona compruebe que corresponde a su cuenta. Solo entonces se habilita la contraseña. `auth.updateUser({password})` la establece y se solicita cierre de sesión local.
6. Un operador asigna o habilita la membresía del UUID correcto por SQL privilegiado, según V5A. La activación no escribe membresías ni otorga permisos. El login sigue verificando `admin_memberships` y RLS sigue protegiendo los datos.

El cliente exclusivo de páginas Auth usa **`flowType: 'implicit'` con `detectSessionInUrl: false`**, adecuado para los enlaces predeterminados y una página estática: la aplicación consume manualmente el fragmento antes de que el SDK lo procese. Los demás clientes conservan PKCE por defecto. No se cambian los tokens recibidos a query, ni se depende de un verificador PKCE en otra pestaña. Los enlaces antiguos con `?code=` siguen requiriendo uno nuevo generado por el cliente actualizado.

### Recuperación

Sin token, la página pide correo y llama a `resetPasswordForEmail`. La respuesta visible es neutra: no confirma si existe una cuenta. El correo vuelve a la misma página con `type=recovery`; el flujo de verificación y cambio de contraseña es equivalente al anterior. No solicita la contraseña anterior ni activa permisos.

### Login y logout

Se reutiliza `createAdminAuth`: login con contraseña, identidad comprobada en servidor y membresía habilitada con rol `admin`. Una cuenta sin autorización no llega al estado de sesión autorizada y se cierra su sesión. RLS sigue siendo la autoridad, aunque alguien omita la interfaz. El botón de logout conserva el estado de error si no se puede confirmar el cierre.

No se implementan registro, invitación por parte del cliente, asignación de roles ni pantalla CRUD. MFA sigue pendiente de V5B/configuración real y debe resolverse antes de producción.

## Estados y límites

- Enlaces ausentes, duplicados, de tipo incorrecto, vencidos o usados: aviso y acceso a recuperación.
- Enlaces con `access_token`/`refresh_token` en fragmento y tipo válido: admitidos. En query, incompletos o duplicados: rechazados y limpiados. `?code=`: pedir un enlace nuevo; no se intercambia sin verificador PKCE.
- Sesión vencida durante el formulario: no se cambia contraseña y se pide un nuevo enlace.
- Al recargar tras consumir un enlace, ya no está el token en la URL; volver a solicitar recuperación si no se completó el proceso.
- Contraseña guardada pero logout no confirmado: se informa explícitamente; no se presenta el cierre como exitoso.
- La configuración vacía deja formularios deshabilitados y no contacta un proyecto real.

## Pruebas y verificación real pendiente

`npm test`: 46 tests locales, incluidos los formatos predeterminados y token_hash, errores de sesión, limpieza, autorización y regresión de filtros/fichas. Las llamadas unitarias de Auth usan dobles.

También se verificaron en Chromium las pantallas en 320, 390, 768 y 1440 px, SDK oficial local con API interceptada de prueba, invitación, recuperación, contraseña, token vencido, limpieza de URL antes de la llamada de verificación, login autorizado/no autorizado y logout. Se verificaron también ambos formatos de enlace con el SDK oficial y API simulada, recuperación sin desafío PKCE y login con/sin membresía. Ninguna llamada se envió a un proyecto real y no se enviaron correos.

Pendiente con tu proyecto, después de autorizar configuración y publicación: correo real, templates, aceptación de invitación, URL exacta GitHub Pages, expiración y reutilización de enlace, política de contraseña, recuperación, persistencia por pestaña, SDK contra API/JWT reales y acceso con/sin membresía. Configuración de MFA y cualquier política adicional no se consideran verificadas.
