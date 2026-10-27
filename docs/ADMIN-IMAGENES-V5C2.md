# V5C.2 — interfaz administrativa de fotografías

## Estado y alcance

El responsable confirmó el despliegue de `nexo-property-image`, la prueba anónima `401 AUTH_REQUIRED` y la administrativa `400 INVALID_REQUEST`. Las migraciones necesarias y los dos buckets privados ya están instalados. Esta revisión solo prepara el frontend local; no aplica SQL, despliega funciones ni escribe datos o archivos en Supabase.

La interfaz todavía requiere publicación separada. No está comprobada la primera carga real ni el consumo del procesador en Supabase Free. El catálogo público conserva sus doce propiedades JSON y sus fotografías existentes; este panel opera sobre los datos administrativos de Supabase y no sincroniza el catálogo público.

## Archivos del próximo PR de interfaz

Archivos de ejecución:

- `admin/propiedad.html`.
- `assets/css/admin-editor.css`.
- `assets/js/admin/property-editor.js`.
- `assets/js/admin/image-panel.js`.
- `assets/js/backend/image-uploads.js`.
- `assets/js/image-validation.js` (generado).

Build, documentación y pruebas:

- `package.json`: agrega únicamente `build:images`; sin nuevas dependencias.
- `scripts/build-image-validator.mjs`.
- `tests/image-uploads.test.mjs`.
- `tests/browser/admin-images.cjs`.
- `docs/ADMIN-IMAGENES-V5C2.md`.
- `README.md`.

Total: doce archivos. No incluir las migraciones, checks/pruebas SQL, documentación pendiente de V5C.1, `supabase/.temp`, dependencias instaladas, WASM ni cambios del backend/workflow ya publicados. No modificar `admin/config.js`, el SDK, el cliente de autenticación o los datos de propiedades.

El build del validador utiliza el módulo compartido del backend ya versionado, pero publica solamente `inspectImage` y `sha256` como JavaScript del navegador. No carga WASM ni credenciales del servidor. `npm run build:images` regenera el archivo y permite comprobar que coincide con la fuente compartida.

## Uso y conexión con el backend

1. Abrir el editor con la sesión administrativa existente. El panel utiliza el mismo cliente y almacenamiento de sesión, sin otro inicio de sesión ni registro público. Comprueba identidad y membresía habilitada antes de mostrar información y antes de operaciones de imágenes.
2. Elegir una propiedad ya guardada. Para una nueva, guardar primero el borrador. Si hay cambios de sus datos sin guardar, la carga queda bloqueada; durante una carga se bloquean los campos de la propiedad.
3. Seleccionar JPEG, PNG o WebP estáticos, completar una descripción alternativa por archivo y la procedencia del lote. IA obliga a identificar las imágenes como ilustrativas. Límites: 10 MiB por archivo, 12.582.912 píxeles, 8192 por lado y hasta veinte archivos por lote. El servidor limita a veinte imágenes por propiedad, incluidas las reservas pendientes/heredadas.
4. El navegador verifica tipo, tamaño, cabeceras, dimensiones y SHA-256. Invoca `reserve` con los nombres actuales del contrato: `propertyId`, `requestId`, `extension`, `bytes`, `sha256`, `alt`, `sourceKind`, `illustrative`.
5. La reserva vincula propiedad, UUID de imagen y original. El navegador sube al bucket privado `nexo-property-originals`, ruta `properties/{property_uuid}/{image_uuid}/original.{extension}`, mediante la sesión del administrador y `upsert:false`. Rechaza respuestas con una asociación inesperada.
6. Invoca `process` con `propertyId` e `imageId`. Solo considera terminada una respuesta `ready` que corresponda exactamente a esa imagen y propiedad. Nunca finaliza mediante escrituras directas del navegador.
7. El backend existente verifica y procesa el original, sube derivados privados a `nexo-property-images` y finaliza mediante RPC exclusivas del servidor. El frontend refresca `property_images`, firma el JPEG por cinco minutos y muestra su vista previa. Los recursos heredados usan sus rutas locales y no se modifican.

`propertyId` es el UUID interno de Supabase, no el código público `nexo-001`. El cliente no recibe ni necesita `service_role`. RLS y el backend siguen siendo la autoridad; los controles visuales no sustituyen la seguridad del servidor.

## Reintentos y mensajes

La descripción y procedencia quedan fijadas al iniciar una reserva: una respuesta perdida podría haber confirmado la reserva en servidor. Se conservan UUID, hash y metadatos para reintentar el mismo lote sin presentar un payload diferente. Los campos quedan bloqueados hasta seleccionar otro lote. Cambiar de selección no elimina imágenes ya guardadas.

Un reintento de subida no sobrescribe originales: un conflicto de archivo existente se deriva al procesador para que verifique su hash. El botón de una fila `Reintentar procesamiento` no vuelve a reservar ni subir el original. Si el original no llegó, conservar el lote de archivos y reintentar su subida; no iniciar nuevas reservas repetidamente.

Se presentan mensajes para formato/tamaño inválido, contenido inconsistente, rechazo de almacenamiento, procesamiento fallido, procesador ocupado, respuesta inesperada, errores de conexión y límite de reintentos. Las filas conservan la explicación de `processing_error` mediante un mapa de códigos conocido; no se insertan mensajes del servidor como HTML.

Si falla la consulta de galería, su error no se reemplaza por un mensaje de carga exitosa. Si la imagen está `ready` pero falla la firma o descarga de la vista previa, se indica que está guardada y se ofrece actualizar fotografías. Ese fallo no invita a volver a subir el archivo. Si la cuenta pierde autorización o cierra sesión, se ocultan la galería y los formularios y se limpia la selección local.

El SDK espera hasta 90 segundos por invocación. Un timeout no demuestra que el servidor se haya detenido: actualizar el estado antes de reintentar. La cola de archivos vive en memoria de la pestaña, no sobrevive a una recarga. Las URLs firmadas ya emitidas conservan su vencimiento; cerrar sesión o revocar una membresía no las invalida instantáneamente.

La eliminación, el orden y el cambio manual de portada no forman parte de esta interfaz. No borrar filas u objetos manualmente para limpiar una prueba sin revisar primero el contrato de limpieza del backend.

## Publicación y primera prueba futura

Publicar solo los doce archivos revisados, previa autorización. Usar el mismo origen del panel que ya superó la prueba administrativa; no hace falta cambiar secretos ni políticas. Una prueba contra el backend real desde localhost necesitaría un origen autorizado y su propia sesión; no se habilita automáticamente.

Confirmar en el listado la propiedad ficticia adicional de prueba creada desde V5B.3, su UUID, estado borrador y fotografías existentes. No usar los identificadores sintéticos de los tests. Para la primera carga, proponer el JPEG ilustrativo existente `assets/images/propiedades/nexo-001/principal-960.jpg` (960×720, 198.439 bytes), indicando procedencia IA e imagen ilustrativa. Se esperan un original y cuatro derivados JPEG/WebP de 480 y 960, sin alterar las doce fotografías heredadas.

Esa carga añade datos y archivos reales, por lo que requiere autorización separada. En Supabase, revisar `ready`, hashes, variantes, rutas privadas y los logs/métricas de la invocación. Las pruebas de acceso 401/400 no inicializaron el WASM ni prueban los límites Free. Verificar CPU, memoria y duración según los indicadores disponibles; la duración HTTP no equivale a CPU. Los metadatos se eliminan de los derivados; el original privado se conserva intacto.

## Pruebas locales reproducibles

```bash
npm run build:images
npm test
npm test --prefix supabase/functions
```

Prueba opcional de navegador, sin añadir dependencias al proyecto:

```bash
npm install --prefix /tmp/nexo-browser --no-audit --no-fund playwright@1.56.1
PLAYWRIGHT_MODULE=/tmp/nexo-browser/node_modules/playwright node tests/browser/admin-images.cjs
```

Requiere Chromium instalado; `CHROMIUM_PATH` permite indicar su ruta. `SCREENSHOT_DIR` puede apuntar a una carpeta temporal existente para guardar capturas. El test inicia un servidor HTTP de solo lectura en loopback, conserva el subdirectorio de GitHub Pages, intercepta todas las peticiones Supabase con fixtures y bloquea cualquier otro destino remoto. Las operaciones simuladas no llegan a Supabase.

Cubre validación, reintentos inmutables y sin sobrescritura, errores de listado/firma/descarga, procesamiento, vista previa, cambios sin guardar, propiedad nueva, sesión/revocación, teclado, distribución a 320/390/768/1024/1440 y regresión del buscador, seis destacadas y doce fichas públicas. No sustituye la prueba del backend desplegado, Safari/Firefox o dispositivos físicos.

## Resultado de esta revisión local

75 pruebas de aplicación y 18 del procesador/endpoint aprobadas. El test Chromium pasó con API Supabase simulada, incluyendo recursos heredados, archivos inválidos, original duplicado sin sobrescritura, reintentos con metadatos estables, fallo de galería no ocultado por un mensaje de éxito, errores de firma/descarga, cierre de sesión y revocación. La distribución y el foco se comprobaron a 320, 390, 768, 1024 y 1440 píxeles. También pasó el recorrido público de seis destacadas, búsqueda, restablecimiento y doce fichas con imágenes.

Se probó una copia aislada de los doce archivos propuestos sobre la revisión versionada: build reproducible, ambas suites y navegador aprobados sin depender de los SQL, pruebas SQL o documentación de V5C.1 que siguen pendientes localmente. No se ejecutó SQL ni se hicieron escrituras remotas. La prueba real de carga en Supabase, Safari/Firefox, dispositivos físicos y los recursos del plan Free siguen pendientes.
