# V5B.3 — formulario administrativo y ubicaciones

## Rama y alcance

`feature/nexo-v5b3-editor-locations`, desde `main` actualizado (`c790a63`). Sin commits, push ni publicaciones durante la implementación. El catálogo público, sus filtros, fichas, imágenes y JSON se mantienen intactos.

## Investigación del diseño y del mensaje de acceso

Se revisaron `admin/propiedad.html`, las rutas relativas y los estilos de V5B.2: las reglas del editor existían al final de `admin-panel.css`. En la versión local no se reprodujo una ausencia de estilos al cargar los recursos actuales. GitHub API informó Pages construido desde `main` en la raíz; el acceso al dominio `jere1404.github.io` fue bloqueado por la red del entorno, por lo que no se inspeccionaron su respuesta CSS, cabeceras de caché ni el DOM desplegado. **No está demostrada la causa histórica del formulario sin estilos.** Una mezcla de HTML nuevo y CSS compartido antiguo es un escenario compatible; no se presenta como diagnóstico confirmado.

Se trasladó el estilo del editor a `assets/css/admin-editor.css`, cargado explícitamente, y se versionaron los enlaces CSS, el entrypoint del editor y su módulo de datos modificado. Se probó el formulario utilizando una versión anterior del CSS compartido: mantiene los estilos propios. Esto reduce el riesgo de mezclar recursos antiguos y nuevos; falta comprobar la versión publicada una vez autorizada.

El formulario ahora tiene cuatro fieldsets visibles: información principal, ubicación, características y descripción/publicación. Mantiene Manrope local, azul marino, blanco, acentos azules, foco visible, etiquetas, mensajes accesibles y controles de 48 px. Una columna en móvil y dos a partir de 768 px.

El responsable confirmó posteriormente que “Acceso no disponible” se resolvió al iniciar sesión con su cuenta administrativa: no había un problema de acceso. Se conserva la autenticación y su manejo de errores original, sin continuar esa investigación. Se verificaron lecturas anónimas de las tablas existentes de Supabase: `zones` y `amenities` respondieron HTTP 200 con cinco zonas y siete comodidades. No se realizó ninguna escritura remota.

## Modelo de ubicaciones

- `provinces(code,name)`: catálogo SQL inicial de las 23 provincias y CABA, con códigos de jurisdicción de dos dígitos. Solo lectura para los roles de aplicación.
- `localities(id,province_code,name)`: localidades persistentes; la migración agrega únicamente Corrientes Capital. El administrador puede ingresar otras desde el formulario.
- `zones`: conserva `slug` y `name`, y agrega `locality_id`. Las zonas existentes se asignan a Corrientes Capital; sus slugs no cambian.
- `properties`: no agrega columnas ni modifica registros. Provincia y localidad se derivan de la zona. `city` conserva el contrato existente y se guarda con el nombre canónico de la localidad; `approximate_location` continúa siendo un texto independiente.

Los selectores se cargan desde Supabase, filtrados por su padre y con lecturas paginadas de 500 para no truncar silenciosamente listas al límite habitual de la API. No hay listas de barrios o localidades fijas en JavaScript. Al cambiar provincia/localidad se vacían las selecciones dependientes. Un fallo de carga bloquea un guardado incoherente y ofrece reintento.

“Ingresar otra localidad…” y “Agregar barrio o zona…” muestran los campos correspondientes. “Guardar barrio o zona” crea explícitamente la ubicación reutilizable, antes de guardar la propiedad; si luego se cancela la propiedad, esa ubicación permanece disponible. El guardado de la propiedad queda deshabilitado hasta elegir una zona persistida. La interfaz no modifica nombres de localidades ya guardadas ni mueve zonas a otras localidades.

## Migración y seguridad

Archivo: `supabase/migrations/202610240003_v5b3_locations.sql`.

1. Comprueba que todas las propiedades heredadas tengan `city = 'Corrientes Capital'`. Si encuentra otra ciudad, aborta sin reasignar datos: se debe revisar el mapeo antes de instalarla.
2. Crea las dos tablas, su catálogo inicial, claves foráneas e índices únicos por nombre normalizado y padre. Mayúsculas y espacios repetidos no crean duplicados; los acentos se conservan y no se unifican variantes ortográficas distintas.
3. Agrega `zones.locality_id` con valor predeterminado para compatibilidad con las inserciones antiguas. No actualiza propiedades ni sus versiones, fotos o comodidades. Duplicados de nombres de zona dentro de Corrientes impedirían crear el índice; la transacción se revierte sin borrar datos.
4. Habilita RLS en las tablas nuevas: lectura pública de nombres geográficos, inserción de localidades solo para administradores habilitados. No otorga edición/borrado de localidades ni escritura de provincias a los clientes. Mantiene las políticas existentes de `zones` y `properties`.
5. Agrega un trigger que impide cambiar el slug o la localidad de una zona, y otro que rechaza una propiedad cuyo `city` no coincide con la localidad de su zona. Los clientes V5B.2 que guardan las zonas de Corrientes con su ciudad canónica siguen siendo compatibles; una ciudad libre incoherente será rechazada.
6. Crea `admin_create_location(text,text,text)`, SECURITY INVOKER con `search_path` vacío. Solo ejecutable por `authenticated`, con comprobación explícita de membresía y RLS. Crea localidad y zona en una transacción, o reutiliza las existentes mediante índices únicos y ON CONFLICT. No usa SQL dinámico ni claves privilegiadas.

La creación geográfica solo escribe `localities` y `zones`. El guardado de propiedades sigue usando la función V5B.2 sin modificarla; conserva autenticación, validaciones, confirmaciones y control de versión. La ciudad/zona se valida también en la base de datos, independientemente del navegador.

### Estado de instalación y pasos para otros entornos

El responsable confirmó que aplicó V5B.3 exitosamente en Supabase y verificó 12 propiedades, 12 imágenes, 23 relaciones de comodidades, 24 provincias, una localidad y cinco zonas. El agente no ejecutó migraciones ni escrituras remotas. **No repetir esta migración en ese proyecto.**

En la revisión para preparar el PR, las consultas reales del frontend con la clave pública respondieron HTTP 200: `provinces(code,name)` devolvió 24 filas; `localities(id,province_code,name)` filtradas por provincia 18 devolvió una fila; `zones(slug,name,locality_id)` filtradas por la localidad inicial devolvió cinco filas; y la zona heredada `centro` se encontró por su slug. Se validaron los nombres de columnas, filtros y ordenamientos de lectura contra la API real, sin usar una sesión administrativa ni ejecutar la RPC de creación.

Los pasos siguientes se conservan para una instalación nueva:

- Confirmar V5A y V5B.2 instaladas. Registrar conteos de propiedades, imágenes y comodidades, sus identificadores/versiones, ciudades actuales y zonas.
- Revisar el SQL nuevo y ejecutarlo completo, una sola vez, en SQL Editor cuando esté autorizado. Incluye BEGIN/COMMIT; no es repetible. No repetir migraciones anteriores ni reimportar el seed para instalar V5B.3.
- Comprobar las tablas nuevas, sus RLS/permisos, la asociación de las zonas antiguas y que los datos de propiedades/imágenes/comodidades permanecen iguales.
- La versión V5B.3 del frontend requiere esta migración. Si no está instalada, muestra un error de carga sin fabricar opciones ni hacer escrituras parciales.
- Probar con sesión administrativa real: editar un registro existente sin cambiar ubicación; crear una zona en Corrientes; crear otra localidad/provincia; reutilizar ambas; guardar y recargar la propiedad. Verificar rechazo de usuarios anónimos, sin membresía y revocados.

## Verificaciones realizadas

```bash
npm test
npm test --prefix supabase/tests
```

- 65 tests JavaScript aprobados: incluye los de catálogo/fichas/Auth, V5B.2 y cinco nuevos de ubicaciones (validación, autorización, consultas por padre, paginación, RPC y errores).
- 16 pruebas SQL locales aprobadas, incluyendo los tests contenedores. Comparación completa de propiedades, imágenes, comodidades y códigos de zona antes/después de la migración; compatibilidad del seed; creación/reutilización de ubicaciones, coherencia ciudad/zona, identificadores permanentes, RLS y administrador revocado. Un test independiente verifica aborto ante ciudades heredadas distintas, sin crear tablas ni remapear registros. Auth se emula únicamente en la base local de pruebas.
- Revisión específica de `admin_create_location`: se ejecutó como rol `authenticated` sin superusuario ni BYPASSRLS, comprobando SECURITY INVOKER y los permisos de ejecución. La creación y el conflicto contra una zona heredada funcionaron incluso retirando UPDATE/DELETE sobre `zones` en la base local de pruebas: `DO NOTHING` no necesita UPDATE ni dispara el trigger de actualización. Usuarios sin membresía y anónimos fueron rechazados incluso al pedir una ubicación ya existente. No fue necesario modificar el SQL de la migración ni ampliar permisos.
- Chromium + SDK oficial con API simulada: edición preservando código/ubicación, nueva provincia/localidad/zona y reutilización, cambio de dependencias, guardado bloqueado ante zona no persistida o fallo de carga, reintento, revocación y eliminación de datos privados del formulario. Estilos comprobados con CSS compartido antiguo; capturas inspeccionadas en escritorio/móvil; sin desbordamiento en 320, 390, 768, 1024 y 1440 px. Sin errores JavaScript; el único error HTTP del test administrativo fue un 503 inyectado para verificar recuperación.
- Navegador público con recursos locales reales: seis destacadas, buscador de inicio hacia catálogo, restablecimiento a doce resultados, filtro de tres terrenos, las doce fichas y sus imágenes; catálogo/ficha/menú móvil sin desbordamiento, errores JS ni errores de recursos.

Los runners y capturas de navegador son temporales y están fuera del repositorio. Las pruebas simuladas/locales no certifican las nuevas tablas/RLS/RPC en Supabase real. Quedan pendientes las pruebas de escritura con sesiones auténticas y la revisión visual del formulario en la URL publicada. La migración ya fue aplicada y verificada manualmente por el responsable; no debe repetirse. El acceso ya fue confirmado por el responsable al iniciar sesión.

## Archivos

`admin/propiedad.html`, `assets/css/admin-editor.css`, `assets/css/admin-panel.css`, `assets/js/admin/property-editor.js`, `assets/js/admin/location-fields.js`, `assets/js/backend/locations.js`, `assets/js/backend/property-management.js`, la nueva migración, `tests/locations.test.mjs`, tests existentes de gestión/SQL, esta guía y README.
