# V5A.1 — invitación, contraseña y acceso de administración

## Estado

Implementación local, sin cambios en Supabase ni despliegue. Las páginas están listas para revisión y pruebas reales posteriores, pero la configuración pública está deliberadamente vacía. El proyecto y las tablas existentes fueron reportados por el responsable; no se verificaron ni modificaron remotamente en esta etapa.

Los cambios pendientes de V5A se conservaron al crear `feature/nexo-v5a1-auth` desde `main` actualizada. No se modifican catálogo, fichas, fotos ni datos.

## Archivos y SDK

- `admin/activar.html`: invitación y contraseña inicial.
- `admin/login.html`: login, verificación de administrador y logout. Todavía no existe el panel V5B.
- `admin/recuperar.html`: solicitud de enlace y establecimiento de nueva contraseña.
- `admin/config.js`: solo configuración pública, inicialmente vacía.
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

## Configuración pendiente, solo con autorización

En `admin/config.js` completar posteriormente:

- `supabaseUrl`: URL HTTPS del proyecto Supabase.
- `publishableKey`: clave pública `sb_publishable_…` del proyecto.
- `siteUrl`: raíz HTTPS del sitio, incluyendo el subdirectorio del repositorio de GitHub Pages, sin `/admin/` ni una página concreta. El generador de enlaces admite la barra final o su ausencia.

Estos valores no son claves secretas, pero no se incluyeron valores reales. Nunca poner claves secretas, `service_role`, contraseñas, tokens personales ni cadenas de conexión en el frontend. El cliente rechaza claves secretas y se mantiene deshabilitado si la configuración es incompleta.

La CSP de las páginas solo permite scripts/estilos locales y conexiones a `https://*.supabase.co`. Si se adopta un dominio personalizado de Supabase, habrá que autorizar específicamente ese dominio antes de usarlo. No agregar scripts analíticos o de terceros en páginas con enlaces de Auth. Se fija `Referrer-Policy: no-referrer` mediante meta y se solicita `noindex,nofollow`; esto no sustituye permisos de servidor. GitHub Pages no permite configurar todos los encabezados de seguridad, por ejemplo `frame-ancestors`; revisar alojamiento con encabezados configurables antes de un panel de producción sensible.

## Configuración del Dashboard de Supabase, todavía no aplicada

1. **Auth / URL Configuration**: establecer Site URL en la raíz HTTPS definitiva del sitio, incluido su subdirectorio y preferiblemente sin barra final. No dejar `localhost:3000` como destino de producción.
2. Autorizar URLs exactas de `admin/activar.html`, `admin/recuperar.html` y `admin/login.html`. No usar comodines amplios. Agregar destinos localhost solo si se necesitan para una prueba controlada.
3. Mantener deshabilitados registro público y usuarios anónimos de Auth; desactivar proveedores no utilizados. El frontend no exporta `signUp`, pero ese hecho no bloquea por sí solo la API de registro. Verificar el rechazo desde la API real.
4. Configurar política de contraseña mínima de 12 caracteres en Supabase. Los formularios verifican 12–128 caracteres y coincidencia, pero el servidor debe imponer su política. No almacenar contraseñas ni registrarlas en logs.
5. Configurar SMTP y comprobar entrega de correos, expiración y límites de frecuencia del proyecto. No se cambiaron estos ajustes en esta implementación.
6. Publicar los archivos de Auth solo después de revisión y autorización; los enlaces necesitan una URL accesible. No es necesario conectar el catálogo a Supabase.

### Plantilla de invitación

En **Email Templates / Invite user**, usar un enlace directo al HTML estático. Ejemplo para Site URL sin barra final:

```html
<a href="{{ .SiteURL }}/admin/activar.html#token_hash={{ .TokenHash }}&amp;type=invite">Activar mi cuenta</a>
```

### Plantilla de recuperación

En **Email Templates / Reset password**:

```html
<a href="{{ .SiteURL }}/admin/recuperar.html#token_hash={{ .TokenHash }}&amp;type=recovery">Establecer nueva contraseña</a>
```

No usar el enlace antiguo a `localhost`, ni copiar tokens de correos a tickets, chat o documentación. Las invitaciones emitidas antes de cambiar las plantillas no se reescriben: solicitar una nueva cuando la URL esté disponible. Si la cuenta ya confirmó el correo, usar recuperación en vez de eliminarla para reinvitarla.

La solicitud de recuperación usa un `redirectTo` fijo generado desde `siteUrl`; las plantillas anteriores usan `SiteURL` directamente, así que ambas configuraciones deben apuntar al mismo sitio. Nunca se toma un destino de redirección del usuario o de la URL entrante.

## Flujos

### Invitación

1. Se lee `token_hash` y `type=invite` desde el fragmento; también se admite query por compatibilidad, aunque se recomienda el fragmento porque no se envía al servidor estático.
2. Se elimina inmediatamente query y fragmento con `history.replaceState`, antes de importar/inicializar el SDK. No se guardan ni se imprimen los tokens del enlace. El SDK usa sus tokens de sesión únicamente en `sessionStorage`.
3. Se cierra cualquier sesión local anterior, se ejecuta `verifyOtp({token_hash,type:'invite'})` y se verifica la identidad con `auth.getUser()`.
4. Solo entonces se habilita el formulario. `auth.updateUser({password})` establece la contraseña y se solicita cierre de sesión local.
5. El responsable asigna o habilita la membresía por SQL privilegiado, según V5A, y la persona inicia sesión normalmente. La activación no escribe `admin_memberships` ni verifica que una cuenta sin rol tenga permisos administrativos.

Las invitaciones del Dashboard no se tratan como un callback PKCE de navegador: no se presupone un verificador local. La verificación explícita de `token_hash` permite utilizar el correo en otra pestaña o dispositivo. Se conserva la configuración PKCE del SDK para futuros flujos que la requieran, sin intercambiar códigos desconocidos automáticamente.

### Recuperación

Sin token, la página pide correo y llama a `resetPasswordForEmail`. La respuesta visible es neutra: no confirma si existe una cuenta. El correo vuelve a la misma página con `type=recovery`; el flujo de verificación y cambio de contraseña es equivalente al anterior. No solicita la contraseña anterior ni activa permisos.

### Login y logout

Se reutiliza `createAdminAuth`: login con contraseña, identidad comprobada en servidor y membresía habilitada con rol `admin`. Una cuenta sin autorización no llega al estado de sesión autorizada y se cierra su sesión. RLS sigue siendo la autoridad, aunque alguien omita la interfaz. El botón de logout conserva el estado de error si no se puede confirmar el cierre.

No se implementan registro, invitación por parte del cliente, asignación de roles ni pantalla CRUD. MFA sigue pendiente de V5B/configuración real y debe resolverse antes de producción.

## Estados y límites

- Enlaces ausentes, duplicados, de tipo incorrecto, vencidos o usados: aviso y acceso a recuperación.
- Enlaces antiguos con `access_token`, `refresh_token` o `code`: se limpian, pero no se aceptan; pedir un enlace con la plantilla nueva.
- Sesión vencida durante el formulario: no se cambia contraseña y se pide un nuevo enlace.
- Al recargar tras consumir un enlace, ya no está el token en la URL; volver a solicitar recuperación si no se completó el proceso.
- Contraseña guardada pero logout no confirmado: se informa explícitamente; no se presenta el cierre como exitoso.
- La configuración vacía deja formularios deshabilitados y no contacta un proyecto real.

## Pruebas y verificación real pendiente

`npm test`: 40 tests locales (incluidos V4, filtros, V5A y nueve nuevos de los flujos de Auth). Las llamadas unitarias de Auth usan dobles.

También se verificaron en Chromium las pantallas en 320, 390, 768 y 1440 px, SDK oficial local con API interceptada de prueba, invitación, recuperación, contraseña, token vencido, limpieza de URL antes de la llamada de verificación, login autorizado/no autorizado y logout. Ninguna llamada se envió a un proyecto real y no se enviaron correos.

Pendiente con tu proyecto, después de autorizar configuración y publicación: correo real, templates, aceptación de invitación, URL exacta GitHub Pages, expiración y reutilización de enlace, política de contraseña, recuperación, persistencia por pestaña, SDK contra API/JWT reales y acceso con/sin membresía. Configuración de MFA y cualquier política adicional no se consideran verificadas.
