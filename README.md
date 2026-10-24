# NEXO Inmobiliaria

**Tu próximo hogar comienza acá.**

Proyecto de portfolio y demostración comercial para una inmobiliaria ficticia de Corrientes Capital, Argentina. La futura web ayudará a encontrar propiedades de forma sencilla mediante el recorrido **Buscar → Explorar → Conocer → Contactar**.

## Estado actual

**V4: fichas individuales implementadas, pendientes de revisión.** Una plantilla carga cada propiedad por ID, conserva las imágenes existentes, muestra la descripción y características del JSON y recomienda hasta tres similares. Las tarjetas de inicio y catálogo incluyen enlaces a las fichas. WhatsApp queda preparado sin número configurado: el botón está deshabilitado y el mensaje se puede revisar. No se inventan ambientes ni características. Ver [documentación de V4](docs/FICHAS-PROPIEDADES.md).

El alcance, la identidad visual, la navegación, la estructura de archivos propuesta y los criterios de finalización están en [docs/PLAN-MAESTRO.md](docs/PLAN-MAESTRO.md).

## Tecnologías previstas

- HTML5, CSS3, JavaScript vanilla y JSON.
- Publicación futura en GitHub Pages.
- Sin frameworks complejos, backend ni base de datos en la versión 1.0.

No se requieren dependencias de aplicación ni credenciales. Para revisar el sitio con un servidor estático, desde la raíz del repositorio:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Abrir el servidor en un navegador local. Detenerlo con `Ctrl+C`. En GitHub Pages, servir la raíz del repositorio; todos los recursos y enlaces usan rutas relativas, compatibles con su subdirectorio. La publicación todavía no forma parte de esta entrega.

El buscador usa GET hacia `propiedades.html`, con `operacion=venta|alquiler`, `tipo=casa|departamento|terreno` y `zona=` (todas), `centro`, `camba-cua`, `costanera`, `camba-punta` o `molina-punta`. Ejemplo: `propiedades.html?operacion=venta&tipo=casa&zona=centro`. Los parámetros se aplican automáticamente y se reflejan en los controles del catálogo. El buscador no requiere JavaScript. JavaScript mejora el menú móvil y carga las tarjetas del inicio y del catálogo desde JSON; si se desactiva o falla la carga, se muestra un aviso y los enlaces por categoría siguen disponibles.

Manrope se sirve localmente con licencia OFL. El hero usa un fondo CSS provisional: falta seleccionar una fotografía autorizada y optimizada. Véase [docs/RECURSOS.md](docs/RECURSOS.md).

## Alcance previsto

Inicio con buscador, catálogo de 12 propiedades ficticias, filtros, fichas individuales, consultas por WhatsApp, propiedades similares y páginas Nosotros, Servicios y Contacto. Diseño responsive y accesible, con identidad moderna, elegante, minimalista y profesional.

Los inmuebles y sus datos serán ficticios y se identificarán como demostración, aunque sus zonas pertenezcan a Corrientes Capital.

## Flujo de trabajo

El desarrollo de esta etapa se realiza exclusivamente en `feature/nexo-v4-fichas`. No se realizan commits, push, Pull Requests ni merges automáticos. El siguiente paso requiere aprobación explícita del responsable del proyecto.

## Datos del catálogo

`data/propiedades.json` contiene exactamente 12 registros ficticios: cuatro casas, cinco departamentos y tres terrenos. Los seis identificadores iniciales y sus datos previos se conservan. Solo esos seis registros tienen `destacada: true`.

Cada registro usa `id`, `titulo`, `tipo`, `operacion`, `zona` (valor de URL), `ubicacion` (nombre visible de la zona), `ciudad`, `precio`, `moneda` (`ARS` o `USD`), `superficie`, `unidadSuperficie`, `habitaciones`, `banos`, `comodidades`, `descripcion`, `ubicacionAproximada`, `destacada`, `ficticia`, `imagen` y `fotografias`.

- Los tipos son `casa`, `departamento` y `terreno`; operaciones y zonas mantienen los valores del buscador.
- `comodidades` usa identificadores estables: `patio`, `jardin`, `cochera`, `parrilla`, `balcon`, `ascensor` y `acceso-vehicular`.
- Habitaciones y baños son `null` en terrenos. Los alquileres se expresan por mes y la superficie total en m².
- `ubicacionAproximada` es una referencia barrial textual, sin direcciones exactas, coordenadas de viviendas ni mapas.
- No hay fotografías autorizadas: `imagen` con metadatos pendientes y `fotografias: []`. No se atribuyen licencias supuestas. El catálogo muestra placeholders identificados como “Fotografía pendiente”.

`assets/js/property-cards.js` comparte carga, validación básica y representación de tarjetas entre `home.js` y `propiedades.js`, mediante módulos nativos. Las tarjetas enlazan a la plantilla individual. WhatsApp está preparado sin destino configurado; no se envían consultas.

`assets/js/catalog-filters.js` separa el análisis de parámetros, validación, filtrado, ordenamiento y serialización de la interfaz en `propiedades.js`. La lógica no modifica el JSON original.

## Búsqueda y monedas — Etapa 3B

Los filtros se combinan con **AND**; todas las comodidades marcadas deben estar presentes. Los límites de precio y superficie son inclusivos. Los mínimos de habitaciones y baños excluyen terrenos y registros sin ese dato. Zonas y comodidades se obtienen de los datos cargados.

Para precios se debe elegir `ARS` o `USD` antes de aplicar un rango. Los rangos invertidos se rechazan; el formulario conserva los resultados anteriores e informa el error. Los alquileres se expresan por mes. Sin filtro de moneda, el orden por precio agrupa primero ARS y luego USD y ordena dentro de cada grupo; nunca convierte ni compara ambas monedas como equivalentes. El orden por superficie funciona sobre todos los resultados, en m². Las tarjetas mantienen visible la moneda y la periodicidad del alquiler.

Además de `operacion`, `tipo` y `zona`, se admiten `moneda`, `precioMin`, `precioMax`, `habitaciones`, `banos`, `superficieMin`, `superficieMax`, `comodidad` (repetido por cada selección) y `orden` (`precio-asc`, `precio-desc`, `superficie-asc`, `superficie-desc`). Un parámetro simple repetido usa su primer valor. Valores desconocidos o negativos de URL se ignoran con aviso; los rangos contradictorios o precios sin moneda requieren corrección antes de mostrar resultados.

Al aplicar o restablecer filtros se actualizan tarjetas, contador y URL. Atrás/adelante restaura la búsqueda. Cambiar el orden también aplica las preferencias actuales. Restablecer elimina filtros, orden y parámetros de búsqueda. En celulares el formulario se abre desde “Filtros de búsqueda” y se cierra al aplicar; en escritorio se abre inicialmente junto a los resultados. Los controles permanecen deshabilitados hasta cargar datos válidos. Los avisos de carga, error y cantidad de resultados son accesibles.

## Verificaciones

Desde la raíz del repositorio, sin instalar dependencias:

```bash
node --test tests/catalog-filters.test.mjs
```

La suite cubre filtros individuales y combinados, límites inclusivos, terrenos, comodidades múltiples, errores de rangos, URL, monedas, ordenamiento y datos incompletos. La revisión con Chromium cubrió búsqueda desde inicio/categorías, controles, restablecimiento, historial, responsive y errores de carga. No sustituye una revisión en dispositivos físicos o navegadores adicionales.

La carga necesita HTTP: abrir el HTML mediante `file://` puede impedir módulos y JSON. Con JavaScript desactivado se presenta un aviso; si falla la petición, el JSON es inválido o los datos básicos no son válidos, se muestra un error sin anunciar un contador exitoso. Todos los enlaces y recursos usan rutas relativas compatibles con GitHub Pages.

## Imágenes de propiedades — V3A

Soporte responsive preparado sin fotografías nuevas. Ver [contrato de imágenes](docs/IMAGENES-PROPIEDADES.md) y [estructura de recursos](assets/images/propiedades/README.md). Las doce tarjetas usan respaldos 4:3 hasta incorporar fotos autorizadas; las seis destacadas comparten ese soporte. `imagen: null` sigue siendo compatible. Pruebas: `node --test tests/*.test.mjs`.

## V3B — recursos incorporados, pendientes de revisión

Las doce imágenes de propiedades aportadas por el usuario están asociadas a sus identificadores; las seis destacadas utilizan las mismas referencias. Se sirven versiones WebP/JPEG optimizadas, sin cargar los PNG originales. Son ilustraciones generadas con IA de inmuebles ficticios. Las versiones corregidas de nexo-007, nexo-008, nexo-011 y nexo-012 ya se incorporaron y sus derivados se regeneraron sin carteles; los recortes y metadatos se detallan en `docs/RECURSOS.md`.

## V5A — backend preparado, todavía sin conectar

Se prepararon migraciones PostgreSQL/RLS, importación idempotente de las doce propiedades como borradores, módulos inactivos de autenticación y acceso a datos, y pruebas de seguridad. La web pública continúa usando el JSON y las fotografías locales; no requiere claves ni tiene conexión activa con Supabase.

Ver [configuración y pruebas de Supabase V5A](docs/SUPABASE-V5A.md). Tests de aplicación: `node --test tests/*.test.mjs`. Pruebas SQL locales: `npm ci --prefix supabase/tests` y `npm test --prefix supabase/tests`. No se creó un proyecto remoto ni se aplicaron migraciones o cambios de autenticación reales.

## V5A.1 — páginas de acceso preparadas

Páginas `admin/activar.html`, `admin/login.html` y `admin/recuperar.html`, con SDK oficial fijado y servido localmente. La configuración pública de `admin/config.js` fue proporcionada por el responsable. No hay registro público ni alta automática de administradores; la verificación del correo y la sesión reales sigue pendiente. Ver [configuración y flujos de Auth](docs/SUPABASE-AUTH-V5A1.md).

Build local: `npm ci --ignore-scripts` y `npm run build:auth`. Pruebas: `npm test`. La publicación y los cambios de configuración de Supabase requieren autorización separada. Los cambios pendientes de V5A se conservaron, sin commits ni operaciones remotas de base de datos.

## Compatibilidad con correos predeterminados de Supabase

Auth admite sesiones en el fragmento de los enlaces predeterminados de invitación y recuperación, además de `token_hash`. Las páginas de Auth usan implicit con consumo manual de URL y verificación del usuario en servidor; los otros clientes mantienen PKCE. La configuración pública proporcionada se conserva. Ver `docs/SUPABASE-AUTH-V5A1.md` para distinguir la Site URL de Supabase del `siteUrl` del frontend. No se modificaron el proyecto Supabase ni sus plantillas; las pruebas reales tras publicar siguen pendientes.

## V5B.1 — listado administrativo, pendiente de revisión

`admin/index.html` incorpora un panel de solo lectura: requiere sesión y membresía habilitada, consulta Supabase, muestra indicadores y listado con búsqueda, filtros y paginación. El login ofrece acceso al panel para cuentas autorizadas. No hay escrituras de propiedades ni cambios en el catálogo público. Ver [implementación y validación pendiente del proyecto real](docs/ADMIN-PROPIEDADES-V5B1.md).

## V5B.2 — gestión de propiedades, pendiente de revisión

El panel permite crear borradores, editar datos y comodidades, publicar, despublicar y archivar sin eliminar registros. El guardado transaccional utiliza la migración adicional de V5B.2, ya aplicada y verificada manualmente en Supabase por el responsable; no se ejecuta automáticamente ni debe repetirse en ese proyecto. Conserva RLS y detecta conflictos de versión. El catálogo público sigue usando su JSON y no se implementa carga de imágenes. Ver [implementación, instalación y pruebas de V5B.2](docs/ADMIN-PROPIEDADES-V5B2.md).

## V5B.3 — formulario y ubicaciones, pendiente de revisión

El editor organiza la información en secciones con estilos propios versionados y permite elegir provincia/localidad/zona, además de guardar nuevas localidades y zonas reutilizables mediante Supabase. La migración independiente `202610240003_v5b3_locations.sql` ya fue aplicada y verificada manualmente en Supabase por el responsable; no debe repetirse en ese proyecto y conserva las propiedades existentes. No cambia la autenticación ni el catálogo público. Ver [diagnóstico, migración y pruebas de V5B.3](docs/ADMIN-UBICACIONES-V5B3.md).
