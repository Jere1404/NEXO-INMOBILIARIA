# V5D.3 — Proveedor público configurable (preparación, no activación)

## Estado

Rama `feature/nexo-v5d3-data-provider`, desde origin/main `082ace9`, en worktree separado. Se mantienen fuera la instrumentación exploratoria y otros pendientes. No se cambian Edge Functions, SQL, permisos, propiedades ni fotografías. No hay llamadas remotas en las pruebas de esta etapa.

**El proveedor activo sigue siendo JSON**. Inicio, catálogo y fichas pasan por una interfaz compartida, conservando diseño, datos locales, navegación e IDs. La configuración no se puede cambiar mediante parámetros URL, localStorage ni una sesión administrativa.

## Contrato del proveedor

`assets/js/public-data-config.js`: provider, apiBaseUrl público, pageSize (12) y localityId para las opciones del selector actual de Corrientes. No contiene claves ni importa admin/config.js. La API es pública y no requiere trasladar la sesión administrativa al navegador público.

`createPublicDataProvider` permite inyección de fetch/loadJson para pruebas. Métodos:

- `featured()` → hasta seis tarjetas.
- `list({filters,page,pageSize,signal})` → properties, total, page, pageSize, totalPages, hasNext, availableTotal.
- `detail(id)` → ficha o null (404), nunca datos inventados desde una tarjeta.
- `similar(id)` → hasta tres tarjetas distintas de la actual.
- `options({scope,provincia,localidad,page,pageSize,signal})` → opciones value/label y paginación. En Supabase: provinces/localities/zones/amenities; JSON: zones/amenities derivadas de su colección.
- `allOptions(scope/context)` → solo opciones del contexto, páginas de 48 y máximo 20 páginas. Si excede ese máximo, falla de forma explícita, sin truncar silenciosamente. No descarga propiedades para construir opciones en Supabase.

JSON reutiliza el loader y sus validaciones existentes, cachea la colección únicamente en memoria y puede reintentar si falla. Sus filtros se mantienen locales porque el catálogo es el JSON completo de demostración. Supabase solo solicita la página de resultados y sus imágenes: nunca descarga todo el catálogo ni filtra/ordena una página incompleta en el navegador.

El listado de Supabase ya trae el total filtrado; no se inventa un total global. El contador conserva “de 12” en JSON y muestra el conteo filtrado sin ese sufijo en Supabase.

## Adaptador y seguridad de transporte

`public-adapter.js` valida versión, propiedades, monedas, tipos, números, IDs, paginación y duplicados. Copia únicamente campos que usan los componentes. Los metadatos de imágenes se normalizan por separado; campos extra no se propagan. Una ficha con ID diferente al solicitado es un error. Destacadas deben tener destacada=true y similares no pueden incluir la propia ficha.

`publicSearchParams` construye una URL nueva desde una lista permitida. Ignora utm_source, status, select, credenciales y otros campos desconocidos. No reutiliza location.search completo. Las comodidades se deduplican y conservan nombres/valores de V5D.1. No se cambia la validación estricta de la API.

Fetch usa GET, credentials=omit, cache=no-store, redirect=error y referrerPolicy=no-referrer; no envía Authorization, apikey, cookies ni tokens de administrador. Timeout inicial de 22 segundos, cancelación de búsquedas anteriores y descarte de respuestas fuera de orden. Un error nunca activa automáticamente el JSON ni expone el error interno del servidor.

## Estados y navegación

- Sin filtros y total=0: catálogo vacío, sin simular resultados.
- Con filtros y total=0: ausencia de coincidencias, con restablecimiento.
- Total positivo pero página vacía: aviso de página fuera de rango y navegación anterior.
- Fallo de consulta/opciones: catálogo no disponible; no se representa como cero resultados.
- Ficha 404: propiedad no encontrada; fallo de red: no se pudo cargar.
- Fallo de similares: no oculta una ficha válida.
- Sin destacadas: mensaje específico, distinto de error de conexión.

Paginación accesible mediante botones con estilos existentes; no aparece en el JSON actual de 12 registros. Al cambiar filtros/restablecer se vuelve a página 1; page se agrega a la URL solo después de la primera. Se mantiene popstate, buscador del inicio, categorías, parámetros de filtros, foco y menú. Las consultas de WhatsApp siguen usando el ID y URL existentes; el número permanece sin configurar y no se inventa un contacto.

## Ubicación y alcance visual

Se conserva el selector actual de zonas, sin nuevos controles ni cambios CSS/HTML. Para Supabase, sus opciones se consultan en el contexto de la localidad de Corrientes Capital (`localityId` documentado en V5B.3); NO se añade ese UUID como filtro implícito a los resultados. Provincias/localidades están preparadas en el proveedor para una ampliación posterior de la interfaz.

Antes de reutilizar el sitio para varias localidades hay que definir controles dependientes o búsqueda de ubicación: el selector actual no cubre zonas de otras localidades. No inferir una localidad desde el nombre de un barrio ni quitar filtros desconocidos silenciosamente para aparentar coincidencias. Esta limitación se conserva visible en el plan de activación y no se presenta como una interfaz geográfica completa.

## Imágenes

`public-images.js` y el componente compartido admiten:

- Rutas locales existentes, sin modificar los archivos originales.
- URLs HTTPS firmadas exclusivamente del origen configurado, bucket nexo-property-images y rutas de derivados v-token-ancho verificadas. Nunca originales, hosts arbitrarios, paths ascendentes ni parámetros extra.
- Token con forma JWT segura para componer srcset; no se decodifica ni registra.
- Dimensiones, textos alternativos, srcset WebP/JPEG, sizes, loading y proporción CSS existentes.
- Placeholder por imagen ausente, inválida, fallida o vencida. Los avisos de tarjetas/galería distinguen IA e imágenes ilustrativas según metadatos; el legado local mantiene su identificación IA.

No se almacenan URLs firmadas en localStorage/sessionStorage. La respuesta se reconsulta al recargar, renovar búsqueda o volver a la ficha. No se incorpora aún renovación automática en segundo plano: si una foto vence durante una sesión prolongada se muestra el aviso de recarga al renderizar o fallar su carga. Las imágenes ya descargadas pueden seguir visibles en el navegador; no se promete revocación de bytes ya entregados.

Los avisos globales HTML siguen describiendo el actual proyecto ficticio con imágenes IA. Antes de activar para fotos de otras procedencias, revisar esos avisos generales además de las etiquetas dinámicas; no se han reescrito en esta preparación para conservar el sitio actual.

## Activación y reversión (requieren autorización expresa)

1. Revisar/aprobar el código y pruebas. Mantener provider='json' mientras haya cero propiedades publicadas o falten pruebas reales de imágenes.
2. Confirmar API, CORS para el origen de Pages, contexto de localidades, textos globales y una propiedad cuya publicación haya sido autorizada por separado. Verificar lista/ficha/galería/similares con firmas reales, expiración, rendimiento y navegación móvil.
3. Solo con autorización: cambiar `provider: 'json'` por `provider: 'supabase'` en assets/js/public-data-config.js y publicar mediante el flujo de Git aprobado. No cambiar endpoint ni políticas para esta operación.
4. Reversión explícita: volver a provider='json' y publicar esa configuración. No afecta Supabase ni propiedades. Un despliegue de configuración puede requerir recarga/caché renovada del navegador.
5. Nunca usar ?provider=supabase, una sesión admin o un fallo de red como interruptor. No borrar JSON ni imágenes locales al activar.

## Pruebas

- `npm test`: pruebas existentes y nuevas de proveedor/adaptador, filtros, paginación, fuentes, URLs, errores, cancelación, timeout y opciones jerárquicas.
- `PLAYWRIGHT_MODULE=<ruta-externa> node tests/browser/admin-images.cjs`: regresión del panel y del sitio con JSON real local, sin escrituras remotas.
- `PLAYWRIGHT_MODULE=<ruta-externa> node tests/browser/public-provider.cjs`: intercepta SOLO la configuración en el navegador para simular provider=supabase; el archivo en disco permanece JSON. Intercepta toda la API y Storage, bloquea cualquier otro host y considera error que se solicite el JSON. Prueba 13 resultados simulados, paginación/historial, filtros/reset/carreras, vacíos/error/404, destacadas/ficha/similares, fotografías firmadas y anchos 320/390/768/1440.

Las pruebas simuladas no equivalen a publicar propiedades ni validan las firmas reales contra Storage. La activación real sigue pendiente.

## Revisión final previa al PR

Se restauraron los textos originales del modo JSON en el aviso de ordenamiento y en la leyenda de las tarjetas, eliminando cambios visibles innecesarios. La comparación local de capturas completas contra origin/main, con la misma URL de prueba, imágenes y fuentes cargadas, resultó idéntica en nueve casos: inicio, catálogo y ficha nexo-001 a 390, 768 y 1440 px. No equivale a una revisión en todos los navegadores.

Pasaron 113 pruebas unitarias y los dos recorridos Chromium (regresión JSON/panel e integración Supabase simulada). Se comprobó alcance exacto de 12 archivos, provider=json, base igual a origin/main, ausencia de patrones de claves privadas y ningún cambio en HTML, CSS, datos, imágenes, administración o Edge Functions. Los pendientes de activación descritos arriba continúan vigentes.
