# V5D.1 — Contrato público y seguridad

## Alcance y estado

Preparado desde `origin/main` `2d7c2f0` en la rama `feature/nexo-v5d1-public-contract`, usando un worktree independiente para no incorporar pendientes de V5C.

Esta etapa implementa funciones puras y pruebas, no una API desplegable. No crea clientes Supabase, no firma URLs, no consulta datos, no añade migraciones y no conecta el frontend. El JSON continúa siendo el proveedor público. Ninguna propiedad se publica automáticamente. La autorización aquí definida NO sustituye RLS ni demuestra los permisos efectivos del proyecto remoto.

## Arquitectura y límites de confianza

GitHub Pages → futura Edge Function pública de lectura → consultas anónimas con RLS → proyección pública → firma limitada de derivados → respuesta.

El cliente de consultas públicas estará aislado de las sesiones administrativas: sin persistencia ni tokens del navegador. Consultará explícitamente `status = published` además de RLS. Se reutilizará el SDK oficial versionado del proyecto. No reutilizar el cliente administrativo.

Un cliente privilegiado separado, exclusivamente en el servidor, podrá consultar metadatos de imágenes y firmar objetos del bucket `nexo-property-images`. Cada imagen se autorizará contra la fila de una propiedad publicada obtenida por el cliente anónimo, nunca contra un identificador o estado enviado por el visitante. Volver a comprobar publicación antes de emitir enlaces; una despublicación concurrente tiene una ventana residual que debe documentarse, no existe transacción atómica entre Postgres y Storage.

No ampliar las políticas actuales para permitir al público leer originales o metadatos internos de imágenes. `nexo_image_select_guard` actualmente solo permite imágenes heredadas al público: la futura función debe resolver las gestionadas mediante su ruta privilegiada controlada. Las políticas restrictivas existentes y la lógica del panel se conservan. No se necesita una migración para definir este contrato; consultas e índices se evaluarán en la siguiente etapa. Las migraciones V5C instaladas remotamente aún son pendientes locales en el otro worktree: no se incorporan ni se vuelven a ejecutar aquí. Su versionado debe resolverse por separado.

## Operaciones propuestas y validación

El transporte futuro será GET de solo lectura; el segmento de operación se pasará a `parsePublicQuery`. No aceptar SQL, nombres de tablas, `select`, `status`, buckets, rutas, firmas ni URLs del usuario.

| Operación | Parámetros | Límite futuro de resultados |
| --- | --- | --- |
| list | filtros, page, pageSize | 12 por defecto; máximo 48 |
| detail | id | una propiedad publicada |
| featured | ninguno | seis publicadas destacadas |
| similar | id | tres publicadas distintas de la actual |
| options | provincia, localidad | consultas acotadas por nivel; definir paginación antes de implementar |

`page` comienza en 1; máximo 1000; offset `(page - 1) * pageSize`. Rechazar tamaños superiores, no truncarlos silenciosamente. La longitud total de consulta se limita a 4096 caracteres. Parámetros desconocidos y escalares repetidos producen 400. Solo `comodidad` se repite, máximo 30 valores, deduplicados; significa que deben coincidir todas.

Identificadores públicos: 3–80 caracteres minúsculos, letras, números, guion y guion bajo; primero alfanumérico. No confundir con UUID interno. Se conservan códigos `nexo-001` y futuras referencias permanentes.

Se conservan `operacion`, `tipo`, `zona`, `moneda`, `precioMin`, `precioMax`, `habitaciones`, `banos`, `superficieMin`, `superficieMax`, `comodidad`, `orden`. Se admiten `provincia` (código de dos dígitos) y `localidad` (UUID). Validar existencia y relación provincia/localidad/zona en la consulta futura; el parser solo valida sintaxis. No usar listas fijas de zonas. Habitaciones y baños son mínimos; excluyen terrenos cuando se seleccionan.

Valores: venta/alquiler; casa/departamento/terreno; ARS/USD; habitaciones 1–4; baños 1–3. Rangos no negativos, máximo doce dígitos enteros y dos decimales, sin exponentes, infinitos ni NaN. Precio exige moneda. Mínimo no puede superar máximo.

Orden: `precio-asc`, `precio-desc`, `superficie-asc`, `superficie-desc`. Sin orden explícito: `created_at DESC, id ASC`. Precio sin moneda: `currency ASC`, luego precio en el sentido elegido y `id ASC`; nunca convertir ni comparar directamente ARS/USD. Con moneda, precio e id. Superficie: area e id. Todos los filtros se aplican ANTES del conteo y la paginación. Al cambiar filtros se vuelve a página 1. Vacíos son resultados válidos, no errores. No descargar todas las filas ni filtrar solo la página recibida. La paginación offset puede cambiar bajo publicaciones concurrentes; un snapshot/cursor consistente no forma parte de V5D.1.

## Campos permitidos y respuestas versión 1

`projectPublishedProperty` construye objetos nuevos; nunca propaga filas con spread. Listado:

`id, titulo, tipo, operacion, precio, moneda, zona, ubicacion, ciudad, superficie, unidadSuperficie, habitaciones, banos, destacada, ficticia, comodidades, imagen`.

Ficha agrega `descripcion, ubicacionAproximada, fotografias`. `id` es `public_code`, no UUID. Se conserva el contrato español de las tarjetas y avisos según `ficticia`, procedencia e imagen ilustrativa. Habitación/baño no aplicable es null. Metadatos incompletos no se inventan.

Imagen pública: `src, width, height, alt, sourceKind, illustrative, webp, jpeg, expiresAt`. Variantes: solo `src, width`. No exponer UUIDs de filas, hashes, originales, intentos, errores internos, membresías, claves, ledger ni campos de limpieza. Las URLs firmadas contienen la ruta del derivado; esa ruta no es un secreto, el token sí es una capacidad temporal y no debe registrarse en logs, analítica ni almacenamiento persistente.

Listado (`listEnvelope`):

```json
{"version":1,"data":[],"pagination":{"page":1,"pageSize":12,"total":0,"totalPages":0,"hasNext":false}}
```

Ficha (`detailEnvelope`): `{ "version": 1, "data": <ficha> }`. Destacadas y similares utilizarán listas acotadas de las mismas tarjetas; la implementación del transporte y las opciones jerárquicas se completarán en V5D.2. No inventar conteos ni reducir silenciosamente el total si hay datos inválidos: tratar esa incoherencia como UNAVAILABLE y diagnosticarla sin datos privados.

Errores (`publicError`): 400 INVALID_REQUEST, 404 NOT_FOUND y 503 UNAVAILABLE, con `version` y `error: {code,message}`. No distinguir públicamente inexistente, borrador y archivada. No devolver mensajes SQL, stacks, objetos SDK ni secretos. Respuesta de red fallida nunca activa fallback automático al JSON.

## Fotografías autorizadas

`authorizePublicImage` produce un plan INTERNO; nunca devolverlo directamente ni aceptar un plan desde la petición. Exige propiedad publicada válida, UUIDs y asociación exacta; estado ready; limpieza null; dimensiones, texto alternativo y procedencia válidos. IA exige illustrative=true.

Gestionadas: exigir hash original igual al verificado, token de procesamiento, fecha procesada y prefijo exacto `properties/<property UUID>/<image UUID>/`. Admitir exclusivamente las variantes registradas `v-<processing token>-<width>.jpg|webp`, con anchuras únicas `min(480,originalWidth)`, `min(960,originalWidth)`, `min(1600,originalWidth)`; ambos formatos completos y JPEG principal correspondiente al mayor ancho. No se autoriza original, objetos arbitrarios ni fotografías de otra propiedad. La prueba de procesamiento sigue siendo responsabilidad de la finalización confiable V5C.2, no de un hash calculado por el visitante.

Heredadas: únicamente rutas locales del directorio de su código público, sin red, traversal ni referencias a otra propiedad. Permanecen intactas y sin vencimiento.

La futura firma será por lotes para las imágenes de la página actual, TTL exacto 300 segundos. `publicImageDto` valida origen HTTPS y ruta firmada exacta; si falta una variante o falla una firma, devuelve null para usar placeholder, sin enlaces originales alternativos. `issuedAt` es hora del servidor que inicia la firma; no viene del navegador. `expiresAt` sirve para renovación, no sustituye el vencimiento real de Storage. Mantener orden de position, portada primaria ready o primera ready; en ficha firmar la galería acotada al máximo administrativo actual de 20 imágenes, cargando secundarias de manera diferida.

No reutilizar una URL después de vencer. Al despublicar, dejar de emitir enlaces; los ya emitidos pueden sobrevivir hasta cinco minutos. Recomendación inicial: respuestas con URLs `Cache-Control: no-store`, sin logs del cuerpo y Referrer-Policy restrictiva; evaluar caché más adelante sin superar vencimientos ni filtrar borradores. Tokens firmados son compartibles durante su vigencia. CORS no es autenticación. Evitar listar Storage o reprocesar imágenes en visitas públicas.

## Pruebas y criterios antes de conectar

Las pruebas locales cubren consultas válidas y maliciosas, límites, campos públicos, estados no publicados, asociación entre propiedad e imagen, ausencia de originales, variantes completas, procedencia, URLs firmadas y compatibilidad heredada. Son unitarias, sin red; no prueban RLS real ni la firma SDK efectiva.

V5D.2 deberá comprobar con fixtures y posteriormente con autorización: consultas anónimas reales y aisladas, exclusión de borradores incluso con sesión administrativa en navegador, ausencia de accesos privilegiados fuera del flujo de imágenes, expiración real a cinco minutos, URLs después de despublicar, errores parciales de firma, filtros y conteo antes de paginar, SQL seguro para comodidades, y límites de opciones. Revisar índices con consultas concretas; no añadir índices redundantes de antemano.

V5D posterior integrará frontend con proveedor configurable manteniendo JSON hasta autorización expresa, URLs de fichas, WhatsApp con destino autorizado, SEO básico y pruebas móvil/teclado. No cambiar contenido público ni avisos de demostración por este contrato. Medir latencia, transferencia, invocaciones y cuotas Free en la integración real; nada de ello se presenta como verificado aquí.
