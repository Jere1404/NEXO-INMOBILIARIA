# V5D.4 — Validación aislada del frontend con Supabase

## Base y aislamiento

Rama `feature/nexo-v5d4-visual-validation`, desde origin/main `8a08a55` (PR #17). `assets/js/public-data-config.js` permanece intacto con provider=json. No se modifica código productivo, HTML, CSS, datos, RLS, funciones ni publicaciones.

Se conserva la prueba simulada de V5D.3 y se amplía. El nuevo `tests/browser/public-provider-live.cjs` crea un contexto Chromium nuevo y sirve los archivos públicos locales mediante interceptación de requests. Solo la respuesta de configuración de ese contexto usa provider=supabase; no se escribe el archivo.

El origen que ve la página de prueba es el de GitHub Pages, pero sus archivos provienen del worktree local. No es un despliegue ni usa la sesión del navegador habitual. La interceptación bloquea administración, archivos backend, JSON de propiedades y todos los métodos salvo GET. Nunca introducir credenciales administrativas en esta ventana.

Las consultas reales se transportan desde Node mediante HTTPS protegido del entorno, con Origin de Pages y sin Authorization, apikey, cookies ni encabezados de sesión del navegador. Las respuestas conservan el Access-Control-Allow-Origin real; no se sustituye para ocultar fallos CORS. Las imágenes solo pueden proceder del bucket firmado de derivados del proyecto configurado; no se permite acceder a originales. No se imprimen URLs firmadas ni cuerpos.

Este puente valida el frontend y la API real conservando las reglas de origen, pero NO es una prueba de la conexión TLS directa de Safari/Chrome de un usuario final. Los demás recorridos son completamente simulados y bloquean cualquier tráfico externo.

## Ejecución local

Requiere Node 24, Playwright 1.56.1 y Chromium. Instalar herramientas fuera del repositorio, sin añadir dependencias de producción:

```sh
npm install --prefix /tmp/nexo-browser --no-audit --no-fund playwright@1.56.1
```

Usar un Chromium instalado (el script detecta /usr/bin/chromium) o definir CHROMIUM_PATH. Si se usan los binarios de Playwright, instalarlos previamente con su CLI y configurar el entorno correspondiente. En equipos que no tengan /tmp o Chromium, adaptar únicamente las rutas de las herramientas, no la configuración de la web.

Pruebas unitarias y navegador simulado:

```sh
npm test
PLAYWRIGHT_MODULE=/tmp/nexo-browser/node_modules/playwright node tests/browser/public-provider.cjs
PLAYWRIGHT_MODULE=/tmp/nexo-browser/node_modules/playwright node tests/browser/admin-images.cjs
```

Lectura real, sin crear ni publicar datos:

```sh
NODE_USE_ENV_PROXY=1 PLAYWRIGHT_MODULE=/tmp/nexo-browser/node_modules/playwright node tests/browser/public-provider-live.cjs
```

Para abrir una ventana aislada, en un equipo con escritorio, añadir NEXO_PREVIEW_HEADED=1. Al acabar las comprobaciones automáticas se abre el inicio y se mantiene la ventana hasta Ctrl+C. Aunque la barra de direcciones muestre Pages, la configuración Supabase pertenece únicamente a ese contexto interceptado. Cerrarlo elimina la vista de prueba; el navegador normal y el sitio siguen en JSON.

## Resultados de esta etapa

- Las pruebas unitarias existentes de V5D.3 se vuelven a ejecutar.
- JSON/panel: 12 propiedades, seis destacadas, fichas, imágenes locales, buscador/reset, autenticación/revocación y responsive sin cambios productivos.
- Supabase simulado: 13 resultados, páginas/historial, filtros/reset, solicitudes superpuestas, opciones, destacadas, ficha/similares y 404; anchos 320/390/768/1440.
- Casos añadidos: cookie/sesión administrativa ficticia no enviadas a la API; tampoco Authorization/apikey/referrer/utm_source; imágenes WebP y JPEG solo, locales, metadatos expirados, fallo HTTP de fotografía y vencimiento simulado tras cargar; estados de carga y conexión fallida; fallo de similares sin ocultar ficha; menú/teclado; mensaje WhatsApp con ID/URL y botón inactivo mientras no exista número autorizado.
- La expiración se simula adelantando el reloj del navegador y disparando el error de carga. Comprueba el placeholder y el mensaje, no la validez criptográfica ni el TTL real de Storage.
- La prueba de lectura real pasó con catálogo vacío: cinco GET (featured, dos options, list y detail inexistente), cero imágenes, cero requests bloqueados y archivo de configuración sin cambios. El contexto cargó los archivos públicos locales, mostró vacíos/404, verificó ausencia de overflow a 390/768/1440 y no accedió al JSON.

La propiedad de prueba archivada se conserva como informó el propietario. La prueba live de esta etapa NO publica ni modifica ninguna propiedad y no atribuye el anterior ensayo integral del backend a la nueva prueba visual.

## Procedimiento de prueba con una propiedad publicada (ejecutado)

Necesita autorización separada del propietario para publicar temporalmente una propiedad ficticia o usar una ya pública. No lo hace el script.

1. Anotar estado inicial, código público y fuente del sitio (JSON). El usuario autorizado publica manualmente la propiedad elegida, solo cuando se autorice ese paso; no cambiar RLS ni buckets.
2. Repetir el comando live con `NEXO_PREVIEW_PUBLIC_CODE=<codigo-publico>`. Nunca usar el UUID administrativo ni enviar credenciales. La prueba exigirá ficha visible e imagen descargada desde Storage. Para revisión manual agregar también NEXO_PREVIEW_HEADED=1.
3. Revisar en la ventana aislada: tarjetas, filtros conocidos, paginación si existen más de 12 publicadas, orden por moneda, ficha, galería, srcset/tamaño seleccionado, destacadas y similares. Una única publicada puede dar similares vacíos; los casos de varias propiedades seguirán simulados hasta que haya suficientes datos autorizados.
4. En DevTools, comprobar únicamente los requests GET del catálogo y derivados. No compartir tokens ni URLs firmadas. Medir latencia, transferencia y errores; el rendimiento Free con imágenes no queda probado por el catálogo vacío.
5. Para verificar TTL real, obtener un enlace y repetir su carga desde red sin caché después de 300 segundos. Después reconsultar la ficha para renovar enlaces. Los bytes ya descargados pueden seguir visibles: no es un fallo de expiración.
6. Revisar los avisos globales: todavía dicen que todas las imágenes son IA. Si se usa otra procedencia, esto es un pendiente de textos anterior a activación; esta etapa no cambia diseño ni textos productivos.
7. El usuario autorizado devuelve la propiedad al estado inicial/archivado y comprueba que desaparece de list/detail/featured. No borrar archivos ni datos para limpiar la prueba. Cerrar el contexto aislado. La web normal debe seguir mostrando el JSON de siempre.

## Riesgos y reversión

- La validación real en Chromium aislado quedó completada para una propiedad, incluidas variantes y TTL de red. Esto no autoriza activar producción; la conexión directa desde los navegadores finales y las decisiones de publicación siguen siendo comprobaciones separadas.
- Imágenes de sesiones prolongadas no se renuevan automáticamente; el placeholder ofrece recarga, sin fallback al JSON.
- El selector actual de zonas está acotado a Corrientes; las consultas geográficas preparadas no equivalen a una interfaz completa para varias localidades.
- Revisar avisos de procedencia, galería, accesibilidad y volumen real antes de activación. No crear un número WhatsApp ficticio para probar envíos; el generador de mensaje y el estado deshabilitado sí se validan.
- Descartar/cerrar el contexto de prueba basta para retirar el override local. Para una futura activación productiva, el cambio debe ser explícito y aprobado en public-data-config.js; la reversión sería publicar provider=json. Esa reversión no elimina propiedades en Supabase ni revoca instantáneamente enlaces ya emitidos.


## Cierre de la prueba integral real

Propiedad: «Casa de prueba NEXO», código público `nexo-48eb678f-d449-4a81-b218-29edc808d95d`. La publicación y el archivado fueron realizados manualmente por el propietario; las herramientas solo hicieron GET.

**Fase publicada:** pasaron inicio, catálogo, coincidencia de filtros combinados, orden por precio, ausencia de coincidencias, restablecimiento, historial atrás/adelante, ficha y destacada. Se recorrieron las cuatro fotografías de la galería, srcset y selección WebP. Se descargaron JPEG/WebP reales y se comprobaron anchuras/metadatos. La ficha y el catálogo se revisaron a 390/768/1440 px, sin overflow. El mensaje WhatsApp incluyó código y URL correctos; el enlace siguió deshabilitado sin número configurado y no se envió mensaje alguno. Similares devolvió vacío, correcto para una sola publicada. La multipaginación y el ranking entre varias propiedades permanecen cubiertos por fixtures, no por esta muestra real.

**TTL real y renovación:** un enlace inicialmente válido dejó de entregar la fotografía después de más de cinco minutos, con HTTP 400 y error de expiración confirmado desde red sin caché. Una nueva consulta entregó otro enlace, expiración avanzada y fotografía HTTP 200. El reloj no fue simulado. Un primer intento del arnés temporal reutilizaba por error un AbortSignal de 25 segundos: se corrigió exclusivamente ese script temporal y se repitió completamente la espera; no fue un fallo del producto. Los tokens se mantuvieron solo en memoria, nunca en reportes o repositorio.

**Fase archivada:** se abrió un contexto Chromium nuevo tras el aviso del propietario. La propiedad desapareció del catálogo y de destacadas; su ficha mostró «Propiedad no encontrada». Catálogo vacío, filtro por casa sin coincidencias y restablecimiento pasaron. Ocho GET de API, cero imágenes, cero requests bloqueados y cero errores JavaScript; JSON continuó intacto en disco.

**Producción:** otro contexto recibió por HTTPS los archivos reales de GitHub Pages, sin override de configuración ni archivos locales. Verificó provider=json, 12 tarjetas de catálogo, seis destacadas, igualdad del JSON remoto con los 12 registros originales locales y ninguna solicitud a Supabase. Cero errores JavaScript.

V5D.4 puede considerarse completada para el alcance aprobado. El cambio activo sigue sin realizarse. Permanecen como decisiones de activación los avisos globales de procedencia, la ausencia de renovación automática en sesiones largas, el alcance geográfico del selector y qué propiedades se autorizará publicar. La propiedad de prueba permanece archivada. Los cambios de esta rama son únicamente pruebas y documentación y están preparados para revisión por PR, sin commits ni publicación automática.
