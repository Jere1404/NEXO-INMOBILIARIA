# V5B.1 — panel administrativo de solo lectura

## Alcance

`admin/index.html` muestra el listado administrativo de Supabase, indicadores globales (total, publicadas y borradores), búsqueda por título/código, filtros de estado/tipo y paginación de diez registros. El acceso desde `admin/login.html` aparece únicamente en el estado de cuenta autorizada. No hay alta, edición, publicación, despublicación, borrado ni carga de fotos desde este panel.

La web pública y las fichas siguen leyendo el JSON. Las políticas y migraciones de Supabase, imágenes y datos existentes no cambian.

## Esquema usado y comprobación real

Se revisó `supabase/migrations/202610240001_v5a_schema.sql`, aplicada previamente según el responsable del proyecto. Se usan únicamente campos allí definidos:

- `properties`: `id`, `public_code`, `title`, `property_type`, `operation`, `price`, `currency`, `status`, `updated_at`.
- `admin_memberships`: `user_id`, `role`, `enabled`.

Estados: `draft`, `published`, `archived`; tipos: `casa`, `departamento`, `terreno`; operaciones: `venta`, `alquiler`. No se agregan campos ni se infiere un estado a partir del JSON público.

La conexión real se volvió a comprobar el 24 de octubre de 2026, después de habilitar el dominio del proyecto en el entorno. Se usó únicamente la clave pública configurada, sin sesión de usuario, mediante solicitudes GET/HEAD:

| Comprobación real | Resultado |
| --- | --- |
| Listado con los nueve campos anteriores, orden `updated_at DESC, id ASC` y paginación | HTTP 200, cero filas visibles, conteo exacto 0 |
| Filtros `draft`, `archived` y `published` | HTTP 200, cero filas visibles en cada caso |
| Búsqueda por título/código, combinada con estado y tipo | HTTP 200, cero filas visibles |
| Búsquedas con `%`, `_`, comillas y caracteres de la gramática PostgREST | HTTP 200, sin errores de sintaxis |
| Conteos HEAD global, publicadas y borradores | HTTP 200, conteo exacto 0 |
| Lectura anónima de `admin_memberships` | HTTP 401, código PostgreSQL `42501`: permiso denegado |
| Configuración pública de Auth (`/auth/v1/settings`) | HTTP 200 |
| OpenAPI (`/rest/v1/`) | HTTP 401: exige clave secreta; no se utilizó ninguna |

Las consultas aceptadas confirman que las columnas y la sintaxis usadas por el listado existen en la API actual. No permiten inspeccionar todos los tipos, restricciones o definiciones de políticas remotas. Esos aspectos se contrastaron con la migración y se probaron en PostgreSQL local.

**Límite de la verificación real:** cero filas visibles no demuestra que la tabla esté vacía ni confirma la existencia o estado de las 12 propiedades importadas. Es compatible con que todas estén en borrador y RLS las oculte. No hay sesión administrativa real disponible en este entorno: quedan pendientes el listado/conteo con el administrador autorizado y las pruebas remotas con un usuario autenticado sin membresía o con membresía deshabilitada. Las pruebas locales de esos casos no se presentan como acceso remoto comprobado. No proporcionar contraseñas ni tokens de sesión al agente.

**Lectura pública prevista:** la política `properties_read` de V5A permite leer propiedades `published` a visitantes y usuarios sin membresía; solo el administrador habilitado puede ver también borradores/archivadas y gestionar registros. El panel exige membresía antes de consultar propiedades. No se cambió esta política para convertir las publicaciones en datos privados. Las consultas anónimas actuales no expusieron ninguna fila, pero no bastan para certificar todas las políticas instaladas.

Si la API informa campos inexistentes o permisos insuficientes, el panel muestra un error sin fabricar datos. No hay fallback al JSON.

## Seguridad

`assets/js/backend/admin-properties.js` reutiliza `createAdminAuth`. Cada carga llama a `auth.getUser()` y consulta la membresía propia antes de cualquier consulta a `properties`. Usuario sin sesión, sin membresía, con membresía deshabilitada o con rol distinto de `admin`: acceso denegado, sin consulta de propiedades.

El HTML inicial no contiene filas ni indicadores privados y el contenido administrativo está oculto hasta completar la autorización y carga. Los valores de servidor se insertan con `textContent`, no con HTML. La CSP y el cliente siguen usando únicamente la clave pública existente, sesiones en `sessionStorage` y RLS como autoridad final.

Las llamadas a `properties` son solo SELECT (GET/HEAD), incluyendo conteos exactos. RLS no se modifica ni se omite. La comprobación visual de permisos no es una barrera de seguridad por sí sola: las políticas de V5A siguen protegiendo la API directa.

La sesión y membresía se vuelven a comprobar al buscar, paginar, actualizar, recuperar visibilidad de la pestaña, restaurar la página desde caché y cada 60 segundos con el panel activo. Los eventos de cierre de sesión limpian filas, indicadores e identidad; las respuestas pendientes se cancelan o ignoran. Un fallo de consulta/autorización también retira los datos. Si no se puede confirmar el logout, no se muestra información administrativa y se permite reintentarlo.

La revocación de membresía afecta a la siguiente consulta mediante RLS; la limpieza visual de una página ya abierta se realiza en la siguiente comprobación, sin prometer revocación de información que ya fue vista. No se requiere ni se solicita una clave `service_role`.

## Consultas, indicadores y formato

El listado se pagina en servidor (`range`) y usa orden estable `updated_at DESC, id ASC`. Los filtros se aplican mediante `eq`. La búsqueda combina `title` y `public_code` con ILIKE; se escapan los comodines `%`, `_`, las barras y las comillas de la gramática PostgREST para tratar la entrada como texto. Máximo 100 caracteres y 100 filas por petición; la interfaz usa diez.

Los indicadores consultan toda la cartera, no los resultados filtrados. Total incluye archivadas. Se actualizan al entrar, volver a la pestaña o pulsar “Actualizar”; no se repiten tres conteos por cada pulsación de búsqueda. Los resultados cero y los fallos se distinguen: un fallo no se representa con indicadores cero.

Cada precio conserva su moneda y los alquileres indican `/ mes`. No hay comparación ni conversión de ARS/USD. Las fechas usan `updated_at`, formato es-AR y horario de Argentina. Los datos faltantes muestran “No informado/a”.

El layout cambia de tabla de escritorio a filas apiladas en móvil, manteniendo etiquetas y roles de tabla. Hay foco visible, formulario con labels y fieldset, mensajes anunciados, controles deshabilitados durante carga y paginación accesible. La creación y edición quedan para etapas posteriores, sin enlaces simulados.

## Archivos

- `admin/index.html`: shell, navegación, indicadores, filtros y tabla.
- `assets/css/admin-panel.css`: estilos aislados del panel.
- `assets/js/admin/properties-page.js`: estados, render, sesión, cancelación y navegación de páginas.
- `assets/js/backend/admin-properties.js`: repositorio de solo lectura, validaciones y formato.
- `admin/login.html`: enlace real al panel para cuentas autorizadas.
- `tests/admin-properties.test.mjs`: pruebas nuevas; guía y README actualizados.

Los módulos públicos y las páginas institucionales no se modifican.

## Pruebas

```bash
npm test
npm test --prefix supabase/tests
```

Los tests nuevos cubren acceso autorizado/denegado, consultas y filtros, paginación, indicadores independientes, escape de búsqueda, errores, revalidación y formato. Se ejecutan también los tests existentes de Auth, catálogo y fichas, y RLS con PostgreSQL local.

Las pruebas de navegador usan el SDK oficial con API simulada y credenciales sintéticas solo en memoria de prueba; no se envían solicitudes al proyecto real. Se verifican búsqueda, filtros, páginas, vacío, reintento, logout, revocación, limpieza de datos y responsive. No sustituyen la prueba pendiente contra Auth/PostgREST reales.

### Revalidación de esta revisión

- `npm test`: 54 pruebas JavaScript aprobadas, cero fallos.
- `npm test --prefix supabase/tests`: 8 pruebas PostgreSQL locales aprobadas, cero fallos; incluyen RLS, restricciones e importación idempotente.
- `git diff --check`: sin errores de espacios.
- No se repitió en esta revisión la prueba visual de navegador; las consultas reales anteriores no sustituyen una prueba completa del panel con sesión administrativa.
- No se modificaron políticas, datos remotos, catálogo público ni fichas; tampoco se ejecutaron escrituras remotas.
