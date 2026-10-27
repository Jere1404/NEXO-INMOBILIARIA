# V5D.2 — API pública de catálogo (implementación local)

## Estado y alcance

Rama `feature/nexo-v5d2-public-api`, continuada desde el worktree de V5D.1, conservando sus tres archivos y sus pruebas aún sin commit. No incluye otros pendientes del worktree V5C. No se ha desplegado la API ni cambiado el proveedor JSON del sitio. No requiere nueva migración SQL ni modifica la función procesadora.

## Revisión de compatibilidad

Se revisaron las tablas y RLS de V5A, relaciones provincia/localidad/zona V5B.3, el handler del procesador y las migraciones V5C disponibles localmente en el worktree anterior. El proyecto real debe tener V5C.1/V5C.2 instaladas, como fue confirmado por el propietario; no se hizo consulta remota. Los campos elegidos existen en esas migraciones: ready gestionado exige token, fecha procesada, hash verificado y variantes registradas. La API no modifica dichas restricciones ni usa las funciones privilegiadas de procesamiento.

Corrección de contrato: V5D.1 no había definido paginación para opciones. `options` ahora acepta `scope`, `page`, `pageSize`, preservando `provincia` y `localidad`. Por defecto devuelve provincias. Cada nivel tiene páginas de 12, máximo 48, no listas completas ilimitadas. `scope=localities` requiere provincia y `scope=zones` requiere localidad. Un padre inexistente o una combinación sin coincidencias produce lista vacía. Las opciones proceden de los catálogos geográficos y de comodidades ya legibles por anon; no revelan propiedades en borrador ni cantidades asociadas.

## Rutas GET

Base futura: `https://<project-ref>.supabase.co/functions/v1/nexo-public-catalog`.

| Ruta | Consulta y resultado |
| --- | --- |
| `/` o `/list` | Filtros V5D.1, page=1, pageSize=12. Envelope con total, totalPages y hasNext. |
| `/detail?id=nexo-001` | Ficha publicada, descripción, imagen principal y fotografías adicionales. |
| `/featured` | Hasta seis publicadas destacadas. `{version:1,data:[tarjetas]}`. |
| `/similar?id=nexo-001` | Hasta tres publicadas diferentes. Mismo envelope de lista simple. |
| `/options?scope=provinces` | Opciones `{value,label}`, con paginación. |
| `/options?scope=localities&provincia=18` | Localidades de una provincia. |
| `/options?scope=zones&localidad=<UUID>&provincia=18` | Zonas; provincia es opcional y si está se comprueba correspondencia. |
| `/options?scope=amenities` | Comodidades reutilizables. |

No body, SQL, rutas Storage ni selects configurables. OPTIONS solo negocia CORS; POST/PUT/DELETE producen 405. Origin presente fuera de lista produce 403; sin Origin se permite lectura, como corresponde a una API pública. CORS no evita scraping ni constituye autenticación. No se usa la sesión de quien consulta. Los errores de datos inexistentes/no publicados son indistinguibles (404); parámetros inválidos 400; indisponibilidad 503 sin detalles internos. Vacío es 200.

## Consultas y rendimiento

`public-catalog-repository.mjs` usa el SDK para PostgREST. La selección es explícita, sin `*`. El filtro status=published siempre acompaña RLS. `zones!inner` y `localities!inner` aplican filtros geográficos en servidor. Cada comodidad utiliza un alias inner independiente sobre la PK compuesta de property_amenities: se exige coincidencia de todas, sin descargar IDs ni filtrar una página en el navegador.

Rangos, habitaciones, baños, tipos, operación, moneda y orden se aplican antes de range y count exact. Los terrenos no coinciden con filtros de habitaciones/baños. Listado ordenado establemente con UUID como desempate. Precio se agrupa por moneda sin tipos de cambio. Solo listado y opciones solicitan conteos exactos.

Similares consulta hasta siete bandas disjuntas de puntuación tipo(4)+operación(2)+zona(1), con límite restante hasta tres y orden por public_code. Replica V4 sin cargar el catálogo completo ni introducir SQL nuevo. Puede implicar hasta siete viajes a PostgREST: medir antes de optimizar con una RPC específica.

Imágenes: metadatos ready y sin limpieza para UUIDs autorizados de la página, límite 20 por propiedad y máximo 961 filas de control (48*20+1). No descargar todas las imágenes del catálogo. Una incoherencia de datos produce 503; una imagen no autorizada o firma fallida utiliza null/placeholder. La portada se elige entre imágenes válidas, primaria primero y luego position/id. Ficha incluye hasta 20 fotografías; listado firma solo portada. Máximo seis variantes por imagen, firma en lotes de 100 claves.

Timeout de respuesta inicial: 20 segundos; queries DB reciben AbortSignal. La firma Storage del SDK no es cancelable con esa interfaz: una petición de firma ya en vuelo puede terminar tras el timeout, sin publicar su respuesta al visitante. El handler no crea ni modifica archivos o filas.

## Modelo de seguridad

Dos clientes nuevos por petición, sin persistencia, auto-refresh ni detección de sesión. El anónimo lleva exclusivamente la publishable key configurada: jamás headers Authorization/cookies del visitante. El privilegiado se limita a SELECT de metadatos de property_images de los UUIDs ya públicos y POST de firma de derivados. No RPC, upload, delete, list de Storage ni acceso al bucket originals.

Después de la consulta inicial se revalida publicación con el cliente anónimo antes de leer metadatos y después de firmar. El contrato valida asociación, hashes, rutas exactas, estado y variantes antes de emitir una firma. No se devuelve metadata interna. Las URLs se validan contra el origen del proyecto y la clave exacta. El vencimiento real solicitado es 300 segundos; Cache-Control no-store, Referrer-Policy no-referrer, sin logs de cuerpos ni tokens.

No existe atomicidad entre DB y Storage: despublicar inmediatamente después del último SELECT aún puede permitir la respuesta ya preparada; los enlaces emitidos pueden seguir utilizables hasta cinco minutos. Los originales permanecen privados y nunca reciben enlaces desde esta API.

La service_role es un privilegio amplio: solo se utiliza en el servidor, en un módulo reducido y probado. RLS controla consultas públicas; no protege las lecturas que haga ese cliente privilegiado, por eso se validan todos los límites explícitamente. El navegador no recibe esa clave ni el cliente. La función pública tiene verify_jwt=false deliberadamente y no importa WASM, manteniendo paquete y CPU reducidos.

## Variables y configuración (no aplicar todavía)

| Variable | Origen / uso |
| --- | --- |
| SUPABASE_URL | Variable del runtime Supabase: URL HTTPS del proyecto. |
| NEXO_SUPABASE_PUBLISHABLE_KEY | Secreto configurado del proyecto; valor público sb_publishable_. Cliente de lectura sin sesión. |
| SUPABASE_SERVICE_ROLE_KEY | Variable privilegiada del runtime, exclusivamente servidor. Nunca copiar a frontend ni docs. |
| NEXO_ALLOWED_ORIGINS | Lista de orígenes exactos separados por coma. Para Pages: `https://jere1404.github.io`, sin el subdirectorio del repositorio. Añadir loopback solo si se autoriza prueba local. Sin wildcard. |

Reutiliza nombres del procesador; no se modifica ningún secreto. Entrada SDK fijada @supabase/supabase-js@2.118.0, deno.json y lock con integridades heredadas de la resolución existente, excluyendo ImageMagick. supabase/config.toml agrega únicamente esta función. No se agrega workflow ni despliegue automático.

## Verificación local y pendientes antes del despliegue

`npm test`: contrato y API con el SDK oficial vendorizado, fetch enteramente simulado; validación, serialización real PostgREST/Storage, filtros combinados/AND, paginación, monedas, opciones, similares, seguridad y fallos. `npm test --prefix supabase/functions`: regresión del procesador. No realizar escrituras remotas para estas pruebas.

Pendientes con autorización:

1. Validar imports/lock y handler en Deno/Supabase Edge Runtime. El test SDK Node no es una prueba del runtime Deno.
2. Confirmar variables ya configuradas, esquema y permisos efectivos. No reinstalar migraciones que abortan al encontrar imágenes managed.
3. Probar las relaciones inner y los aliases múltiples contra PostgREST real (los fixtures comprueban la URL y simulan resultados, no un plan SQL real). Verificar conteos y orden con datos publicados autorizados, sin publicar automáticamente borradores.
4. Confirmar firmas reales, expiración, asociación de imágenes y comportamiento tras despublicación, sin introducir claves en navegador/logs. Los tests locales no demuestran RLS remoto.
5. Medir tiempo de respuesta, cantidad de queries, transferencia y cuotas Free; evaluar índices únicamente con planes reales. No se garantiza capacidad ilimitada. El límite por petición no reemplaza rate limiting por infraestructura si el tráfico lo exige.
6. Resolver versionado independiente de las migraciones V5C pendientes en el otro worktree. No se arrastran a este cambio.
7. Desplegar solo la nueva función cuando se autorice; el frontend seguirá en JSON hasta autorización expresa de la etapa de integración.

## Validación previa al despliegue — 2026-10-27

Se verificó el entrypoint y el SDK npm real en Deno 2.1.4, con imports cacheados y sin permiso de red para las cuatro pruebas Deno. El formato 5 del lockfile era incompatible; se regeneró como formato 4 con esa versión de Deno, conservando el mismo conjunto de paquetes y la versión fijada del SDK. No se cambió el lock ni el código de la función procesadora. `deno check --frozen` completó correctamente. Esto valida Deno local, no las cuotas ni el aislamiento exacto de Supabase Edge Runtime.

Se detectó una diferencia real respecto de los fixtures anteriores: PostgREST devuelve HTTP 416/PGRST103 para offsets fuera de rango. Listado y opciones ahora recuperan el conteo exacto mediante HEAD filtrado, sin offset. Si esa consulta falla se responde 503; jamás se inventa total=0. Se agregaron regresiones para catálogo vacío, opciones y fallo de conteo. Se permitió `content-type` en preflight para compatibilidad con clientes que lo envíen, manteniendo solo GET/OPTIONS.

Lecturas HTTPS reales usando únicamente la publishable key pública ya configurada, sin sesión ni credenciales administrativas:

- Select publicado con joins de zona/localidad y comodidades: HTTP 200, total visible 0.
- Dos aliases inner de comodidades y provincia: HTTP 200, total 0. Confirma que PostgREST acepta la sintaxis/relaciones; al no existir filas públicas visibles, no demuestra resultados positivos con datos reales.
- Select de columnas V5C de imágenes ready: HTTP 200, total visible 0; columnas reconocidas. No se infiere de esto el número total de imágenes privadas.
- Offset fuera de rango: HTTP 416/PGRST103, como se corrigió.
- Handler local con SDK conectado por GET/HEAD a Supabase: listado y página 9 devolvieron 200, total 0; opciones de provincias 200 con total 24 y 12 filas en la página; localidades de Corrientes 200 con total 1. No se usó el cliente privilegiado, no se firmaron enlaces ni se ejecutó SQL remoto.

La lectura anónima actual no devuelve propiedades publicadas: el primer despliegue puede devolver correctamente un catálogo vacío. No cambiar automáticamente ningún estado para conseguir una demostración.

Pruebas ejecutadas: aplicación/contrato/API; procesador JPEG/PNG/WebP; SQL local PGlite (V5A/V5B); navegador Chromium con tráfico Supabase simulado; Deno; herramientas locales de empaquetado. Las migraciones Storage V5C no están versionadas en este worktree y sus pruebas SQL adicionales siguen fuera de esta rama: no se incorporaron para ampliar artificialmente la cobertura. El smoke opcional del procesador WASM en Deno no es la prueba de esta API; no se regeneró ni alteró su paquete.

### Costo de similares y optimización propuesta

En peor caso: una consulta de ficha base, siete bandas, una revalidación de la ficha base, dos de candidatos, una consulta de metadatos y un lote de firma: hasta 13 llamadas de datos/Storage, frente a menos cuando la primera banda completa tres candidatos. Sin candidatos solo hay base+bandas+revalidación y no se consulta Storage. No se realiza conteo exacto en bandas ni se descarga el catálogo completo.

Se conserva este algoritmo para no introducir ahora SQL adicional sin mediciones. Si la latencia resulta excesiva, proponer una RPC SQL SECURITY INVOKER, solo SELECT, con status publicado, puntuación 4/2/1, desempate por public_code/id y LIMIT 3, manteniendo RLS. Sería una migración independiente a revisar antes de aplicarla. No paralelizar siete consultas indiscriminadamente: aumenta el trabajo incluso cuando la primera ya basta.

### Primer despliegue controlado (solo tras autorización)

1. Publicar/revisar el conjunto V5D.1+V5D.2 por separado de los pendientes V5C y confirmar que el repositorio conserve el historial de migraciones instaladas; no ejecutarlas de nuevo. Confirmar también el proveedor JSON del frontend y los workflows: no disparar despliegues de otras funciones.
2. Confirmar en Supabase que existen SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY como variables de runtime; por el procesador ya funcional deberían estar disponibles. NEXO_SUPABASE_PUBLISHABLE_KEY y NEXO_ALLOWED_ORIGINS ya deberían existir por V5C. No solicitamos ni comprobamos sus valores privados; configurar solo si una verificación autorizada demuestra que faltan. CORS de Pages requiere origen `https://jere1404.github.io`, sin path.
3. Con CLI autenticado por un mecanismo autorizado, desplegar **solo** esta función con su propio config y lock: `npx supabase@2.122.0 functions deploy nexo-public-catalog --project-ref ugrqstsuhamjjewusigh --use-api`. No necesita WASM y no reproduce el paquete grande de V5C. Confirmar el transporte/autenticación del entorno antes de ejecutar: si vuelve a fallar la autenticación de Codex, usar un workflow manual específico revisado previamente. No hay tal workflow nuevo en esta etapa.
4. Verificar estado ACTIVE y logs de arranque. Sin frontend modificado, consultar directamente GET `/list`, `/list?page=9`, `/options`, `/featured`, y `/detail?id=<código-no-publicado>`: esperar 200 con lista vacía donde corresponda y 404 indistinguible para inexistente/borrador/archivada. Probar POST=405, parámetros inválidos=400 y preflight desde el origen permitido. Ninguna llamada debe publicar propiedades o subir objetos.
5. Para probar firma y filtros con resultados positivos hace falta una propiedad que el propietario haya autorizado explícitamente a publicar. Si no existe, dejar esa prueba pendiente, sin cambiar estados por iniciativa propia. Con ella, comprobar datos/galería, derivado correcto, GET de imagen, vencimiento real después de 300s sin reutilizar caché y rechazo de originales. Despublicar para probar revocación requiere autorización separada porque sí modifica un estado; los enlaces ya emitidos tienen ventana de hasta cinco minutos.
6. Revisar logs por códigos HTTP, duración y errores de arranque; no copiar Authorization, tokens, URLs firmadas ni cuerpos completos. Medir p50/p95 de listado/ficha/similares, número de invocaciones y transferencia. Las pruebas sin filas publicadas no permiten medir el costo completo de firma ni garantizar capacidad Free.
7. Mantener JSON en todas las páginas públicas; ningún paso autoriza cambiar proveedor, desplegar frontend o ejecutar SQL.
