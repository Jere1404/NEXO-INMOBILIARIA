# V5B.2 — gestión administrativa de propiedades

## Alcance e interfaz

Rama: `feature/nexo-v5b2-property-management`, creada desde `main` actualizado (`72e921d`).

- `admin/index.html`: conserva búsqueda, indicadores y paginación; incorpora “Nueva propiedad” y “Editar” por fila.
- `admin/propiedad.html`: formulario único de creación/edición, con estado y código permanente visibles. Las nuevas propiedades siempre se crean como borradores; después pueden publicarse, despublicarse, archivarse y recuperarse como borradores. Archivar no elimina datos.
- Campos existentes: título, descripción, tipo, operación, precio/moneda, zona, ciudad, ubicación aproximada, superficie en m², habitaciones/baños opcionales, comodidades, destacada y demostración.
- Las zonas/comodidades se obtienen de sus tablas; no se crean nuevas desde el formulario. No se infieren características ni se inventan fotografías.
- Se confirma publicar, despublicar, archivar y guardar cambios sobre una propiedad publicada. Se advierte al salir o recargar con cambios sin guardar. Convertir a terreno exige confirmar el vaciado de habitaciones/baños.
- Estados de guardado, éxito, error y conflicto anunciados; etiquetas, foco visible, controles táctiles y diseño móvil/escritorio.

Publicar cambia la visibilidad mediante RLS en la API de Supabase. **No actualiza todavía el catálogo público ni las fichas**, que continúan leyendo el JSON. Este alcance se explica también en la interfaz.

## Guardado, seguridad y concurrencia

`assets/js/backend/property-management.js` concentra validación y acceso por SDK oficial. Antes de leer datos privados o escribir, comprueba `auth.getUser()` y una membresía `admin` habilitada mediante el módulo Auth existente. No asigna permisos, no utiliza claves secretas y no hay eliminación permanente.

La nueva función `public.admin_save_property(p_id uuid, p_version bigint, p_data jsonb, p_amenities text[])`:

1. Es `SECURITY INVOKER`, con `search_path` vacío: no eleva privilegios ni omite RLS. No se modifica ninguna política existente.
2. Solo concede ejecución a `authenticated`, con comprobación explícita de membresía habilitada. Un usuario autenticado sin permisos sigue siendo rechazado por función y RLS.
3. Acepta únicamente los campos editables existentes, valida las referencias de comodidades y conserva identificadores/código/fecha original.
4. Para editar, bloquea la fila y compara `version` con la que abrió el formulario. Una versión antigua produce SQLSTATE `40001`, sin sobrescribir datos. El trigger existente incrementa la versión.
5. Guarda propiedad y relaciones de comodidades en una única transacción. Un error revierte el guardado completo.
6. Solo escribe `properties` y `property_amenities`. No escribe imágenes, zonas, comodidades maestras ni membresías.

Los límites de texto, valores positivos, decimales, enumeraciones, referencias y habitaciones se validan en JS/HTML; la base conserva sus restricciones NOT NULL, CHECK, FK y UNIQUE. Los valores de estado siguen siendo `draft`, `published`, `archived`.

Cada nueva ficha recibe un código UUID con prefijo `nexo-`, permanente y generado una vez por formulario. El botón queda deshabilitado durante el guardado. El UNIQUE de código impide que un reintento tras una respuesta perdida cree un duplicado. No se reintentan escrituras automáticamente. Una respuesta no confirmada pide revisar el listado antes de reintentar. Un conflicto conserva el formulario y exige recargar explícitamente; la recarga advierte antes de descartar cambios.

El editor oculta la información al pasar a segundo plano y revalida al volver, periódicamente y ante eventos de Auth, conservando los campos si se mantiene la autorización. Si no puede verificar el acceso, retira los datos privados. Logout y revocación descartan los datos; nunca se guardan formularios en almacenamiento persistente. Las respuestas de cargas antiguas se ignoran. La confirmación del navegador al cerrar una pestaña depende del soporte del navegador y no garantiza recuperación tras un cierre forzado.

## Configuración de Supabase

El responsable confirmó que aplicó la migración en Supabase y verificó `SECURITY INVOKER`, ejecución denegada a `anon` y permiso de ejecución para `authenticated`, sujeto a membresía y RLS. También confirmó que permanecen las 12 propiedades, 12 imágenes y 23 relaciones de comodidades. Esta comprobación fue realizada manualmente por el responsable; el agente no ejecutó la migración ni escrituras remotas.

**No volver a ejecutar la migración en ese proyecto.** Utiliza `CREATE FUNCTION` y no es repetible. Para una instalación nueva, el orden es:

1. La migración V5A `supabase/migrations/202610240001_v5a_schema.sql` debe estar aplicada (ya existente). **No volver a ejecutarla** ni reimportar los datos para instalar V5B.2.
2. Revisar y ejecutar una sola vez `supabase/migrations/202610240002_v5b2_property_management.sql` en SQL Editor, o mediante el flujo habitual de migraciones. Es compatible con SQL Editor y está envuelta en `BEGIN/COMMIT`.
3. Confirmar que existe `public.admin_save_property(uuid,bigint,jsonb,text[])`, es invoker y no concede ejecución a `anon`. No requiere nuevas claves ni modificaciones de RLS.
4. Con la versión del frontend aprobada disponible, iniciar sesión normalmente como administrador y probar creación/edición/estados sobre una propiedad de prueba. No proporcionar contraseñas ni tokens al agente.

Si la función no está instalada, la interfaz informa que falta aplicar la migración. No sustituye el guardado por escrituras parciales desde el navegador.

## Pruebas y límites de verificación

```bash
npm test
npm test --prefix supabase/tests
```

Resultado de esta implementación:

- 60 tests JavaScript aprobados: los 54 existentes y 6 nuevos sobre validación, acceso, carga, creación, edición, estados y errores/conflictos.
- 11 pruebas PostgreSQL locales aprobadas, incluyendo el contenedor de la suite: migración V5A + nueva migración, RLS, creación, edición, publicación/despublicación/archivo/restauración, código duplicado, versión obsoleta, rollback, restricciones, rechazo de anónimos, usuarios sin membresía y administrador revocado. Se emula Auth solo en PostgreSQL local; no se simula una identidad contra el servicio real.
- Chromium con SDK oficial y API simulada: creación/edición, confirmación y cancelación de publicación, estados, conflicto y recarga, conversión a terreno, revocación, logout; anchos 320, 390, 768, 1024 y 1440 px sin desbordamiento; sin errores JavaScript. Se inspeccionaron capturas de escritorio y móvil. El runner y capturas temporales están fuera del repositorio; estas comprobaciones no son una auditoría completa de accesibilidad.
- Supabase real, solo GET con clave pública: aceptó selección de todos los campos utilizados (incluidos `version`, flags y ubicación), zonas, comodidades y relaciones. Las propiedades y relaciones devolvieron cero filas anónimas; zonas/comodidades fueron legibles. No se inspeccionaron definiciones remotas de políticas mediante credenciales privilegiadas.

**Pendiente real:** comprobar el flujo del frontend y la función mediante una sesión administrativa auténtica; persistencia y recarga, permisos denegados con usuarios reales, edición simultánea y prueba visual con los datos reales. Las pruebas simuladas/locales no se presentan como escrituras reales aprobadas. No se alteraron las 12 propiedades existentes.

## Archivos

- `admin/propiedad.html`, `assets/js/admin/property-editor.js`: formulario y coordinación de sesión/guardado.
- `assets/js/backend/property-management.js`: validaciones y repositorio de escritura.
- `admin/index.html`, `assets/js/admin/properties-page.js`, `assets/css/admin-panel.css`: acceso a gestión y estilos.
- `supabase/migrations/202610240002_v5b2_property_management.sql`: función de guardado atómico, sin políticas nuevas.
- `tests/property-management.test.mjs`, `supabase/tests/security.test.mjs`: cobertura JS/SQL.
- Esta guía y `README.md`.

No incluye carga de imágenes (V5C), sincronización del catálogo público, nuevas entidades ni borrado permanente.
