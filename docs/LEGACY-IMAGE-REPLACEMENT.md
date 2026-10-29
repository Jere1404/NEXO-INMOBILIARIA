# Reemplazo reversible de fotografías heredadas

## Alcance

Nueva migración aditiva `202610280001_legacy_image_replacement.sql`. No modifica las
migraciones históricas V5A/V5B/V5C, los archivos originales ni el proveedor JSON.
Las filas `legacy` no se convierten a `managed`: cada candidata es una fila nueva.
No hay eliminación física en las operaciones de reemplazo, cancelación o reversión.
El procesador conserva también los derivados parciales fallidos de candidatas
inactivas; el registro de intentos queda pendiente de una limpieza futura autorizada.
La limpieza preexistente de cargas normales no cambia.

## Contrato y seguridad

`property_images.image_active` comienza en true para todas las imágenes existentes.
La tabla `image_replacements` relaciona solicitud, propiedad, origen y candidata.
Sus estados son `prepared`, `confirmed`, `reverted` (también representa cancelación).
Tiene una candidata única por solicitud y un índice que impide dos operaciones
pendientes/confirmadas para una misma heredada. Solo un administrador habilitado
puede leer operaciones; los clientes no pueden escribirlas directamente.

Las nuevas RPC son SECURITY DEFINER, con search_path vacío y EXECUTE limitado a
service_role. El backend obtiene el actor de auth.getUser y vuelve a verificar la
membresía. Las RPC verifican membresía, bloquean propiedad/operación/imágenes y
validan asociación y estado. Deben crearse con propietario postgres, igual que V5C.

- **Preparar:** reserva mediante la RPC existente y oculta la candidata en la misma
  transacción. Repetir UUID y metadatos devuelve la misma reserva; no adopta una
  carga normal preexistente. Un UUID con otro contenido o vínculo es rechazado.
- **Procesar:** reutiliza originales privados, hashes, límites y variantes V5C.
  Un trigger impide que la finalización marque como portada o active una candidata
  preparada/cancelada. La original permanece activa.
- **Confirmar:** exige candidata ready, hash verificado y original sin cambios
  respecto de la preparación. Intercambia posiciones usando una posición temporal
  libre, transfiere la portada si correspondía y cambia activación atómicamente.
  Guarda snapshots posteriores para detectar conflictos de reversión.
- **Revertir:** restaura activación, posición y portada de la heredada; conserva la
  candidata inactiva. Si hubo cambios posteriores incompatibles, rechaza la operación
  en lugar de sobrescribirlos. Repetir confirmación/reversión es idempotente.
- **Cancelar preparación:** libera el origen para otra operación y conserva la
  candidata oculta. Un procesamiento tardío no puede activarla.

Los triggers impiden cambios directos de activación desde el navegador y cambios
manuales de posición/portada durante una operación abierta. Se retienen los registros
originales; las FK y guards impiden perderlos por DELETE. Se exige una portada activa
antes de preparar, confirmar o revertir un reemplazo confirmado. El índice anterior
continúa impidiendo dos portadas. Las condiciones se prueban para portada y no-portada.

## Panel y consultas

El selector de destino permite agregar normalmente o elegir una heredada activa.
Un reemplazo acepta un solo archivo. Las operaciones se consultan al refrescar:
tras recargar la página se puede procesar, comparar, confirmar, cancelar o revertir.
Si falta el original subido, hay que volver a elegir el mismo archivo. Se recupera
el UUID y los metadatos persistidos, y el servidor verifica su coincidencia.

La confirmación requiere ambas vistas previas cargadas y una confirmación explícita.
Los botones respetan cambios sin guardar, sesión, propiedad actual y trabajo en curso.
Los listados activos filtran image_active; las comparaciones se cargan aparte bajo
RLS administrativa. No se amplía la lectura pública de metadatos managed.

La API pública selecciona solo activas, vuelve a comprobar sus IDs después de firmar
URLs y falla de forma cerrada si observa un cambio concurrente. No transmite el
historial, snapshots ni IDs internos de reemplazo al DTO público.
Las URLs ya emitidas conservan su vencimiento de cinco minutos. Un cambio posterior
a la última comprobación aún puede coincidir con una respuesta en vuelo; PostgreSQL
y Storage/HTTP no forman una transacción única.

**La web pública sigue leyendo JSON:** este reemplazo administrativo no cambia por
sí solo las fotos visibles en el sitio. No se activa el proveedor Supabase.

## Validación local

Desde la raíz:

```bash
npm test
npm test --prefix supabase/tests
npm test --prefix supabase/functions
python supabase/tests/run-v5c-postgres.py --replacement
PLAYWRIGHT_MODULE=/workspace/.nexo-tools/browser/node_modules/playwright node tests/browser/admin-images.cjs
```

El módulo Playwright puede instalarse fuera del checkout en otra ruta; requiere
Chromium y la variable PLAYWRIGHT_MODULE correspondiente. El test intercepta todo
Supabase y bloquea otros destinos remotos. No requiere una cuenta real.

El script estándar de SQL ahora incluye todas las suites *.test.mjs, con concurrencia
limitada a uno para evitar varias instancias WASM pesadas simultáneas. La nueva suite
instala V5A/V5B/V5C en PGlite, conserva un snapshot del seed, aplica solo entonces la
migración nueva y ejecuta `image-replacement-behavior.sql`. Cubre privilegios,
asociaciones, UUID/metadatos incompatibles, candidato pendiente, portada/no-portada,
fallo inyectado durante el intercambio, idempotencia, cancelación con finalización
tardía, cambios posteriores, capacidad y revocación.

El runner PostgreSQL 17 utiliza un contenedor descartable, sin red ni puertos
publicados. Prueba solicitudes idénticas y competidoras en sesiones concurrentes,
así como confirmaciones y reversiones concurrentes. Su modo anterior sigue disponible
sin --replacement. Ningún modo acepta conexiones de base remota.

Auth/Storage se modelan con las interfaces SQL mínimas del fixture local: estas
pruebas no equivalen a probar el stack completo de Supabase, PostgREST, firmas reales,
JWT reales o ejecución de WASM en Edge Free. La prueba de navegador simula backend;
las pruebas SQL verifican la lógica transaccional real por separado.

## Activación futura y prueba controlada con nexo-001

Nada de lo siguiente fue ejecutado en producción. Requiere autorización posterior.

1. Revisar el esquema actual y preparar respaldo/registro del estado de nexo-001:
   UUID real, imagen heredada, portada, posición y metadatos. No usar UUID de fixtures.
2. Acordar cómo aplicar exclusivamente la migración nueva. V5A/V5B/V5C ya están
   instaladas físicamente y falta su historial CLI: NO reaplicarlas, NO usar db push
   ni migration up. Esta tarea no repara el historial remoto.
3. Orden de actualización: migración aditiva, API pública con filtro de activación,
   procesador con acciones nuevas y finalmente panel. No habilitar reemplazos mientras
   una versión anterior de la API pueda mostrar candidatas inactivas. Revisar antes
   permisos de Storage y orígenes permitidos del entorno de prueba autorizado.
4. Seleccionar solo nexo-001 y una imagen ficticia con procedencia autorizada; por
   ejemplo, una ilustración local existente con licencia/procedencia ya revisada.
5. Preparar y procesar una candidata. Confirmar que la original sigue activa, revisar
   ambas y confirmar explícitamente. Comprobar portada, posición y las otras once
   propiedades. No esperar un cambio en el sitio JSON.
6. Revertir y verificar la restauración. Conservar ambas filas y todos los archivos.
   Registrar los identificadores de la operación para revisión; no eliminarlos.

## Límites deliberados

- El límite V5C de 20 filas por propiedad cuenta candidatas conservadas, incluso
  canceladas/revertidas. No hay purga ni aumento silencioso del límite.
- La idempotencia evita duplicados por reintento de una operación; no prohíbe
  globalmente usar el mismo archivo en distintas propiedades u operaciones nuevas.
- El límite de cinco intentos de procesamiento continúa vigente.
- No se ofrece reactivación de una operación revertida; una nueva preparación utiliza
  otro UUID. La revisión de conflictos y la limpieza física quedan fuera del alcance.

## Resultados ejecutados e inventario

Validación de esta implementación, sin conexiones a producción:

| Comando / recorrido | Resultado |
| --- | --- |
| `npm test` | 116 aprobados, cero fallos/omitidos |
| `npm test --prefix supabase/tests` | 24 resultados aprobados, cero fallos/omitidos |
| `npm test --prefix supabase/functions` (aislado) | 21 aprobados, cero fallos/omitidos |
| PostgreSQL 17 con `--replacement` | SQL de comportamiento y concurrencia de preparación, confirmación y reversión aprobados |
| PostgreSQL 17 sin opción | Recorrido anterior V5C y reserva concurrente aprobados |
| Chromium con Supabase simulado | Preparación, recarga, comparación, confirmación, reversión, responsive y regresión del catálogo JSON aprobados |

Durante la ejecución simultánea de las suites pesadas se observó un DECODE_FAILED
al procesar el JPEG con WASM; la ejecución aislada posterior aprobó las 21 pruebas.
El codec mantiene sus límites originales, incluido time=3 segundos. El resultado
bajo carga refuerza la necesidad de medir recursos antes de una prueba Edge real;
no se eliminaron límites ni se ocultaron aserciones para obtener un resultado verde.

Archivos nuevos:

- `supabase/migrations/202610280001_legacy_image_replacement.sql`.
- `supabase/tests/image-replacement.test.mjs`.
- `supabase/tests/image-replacement-behavior.sql`.
- `docs/LEGACY-IMAGE-REPLACEMENT.md`.

Archivos modificados:

- `admin/propiedad.html`.
- `assets/css/admin-editor.css`.
- `assets/js/admin/property-editor.js`.
- `assets/js/admin/image-panel.js`.
- `assets/js/backend/image-uploads.js`.
- `supabase/functions/_shared/handler.mjs`.
- `supabase/functions/_shared/public-catalog-contract.mjs`.
- `supabase/functions/_shared/public-catalog-repository.mjs`.
- `supabase/functions/tests/handler.test.mjs`.
- `supabase/tests/package.json` (incluye las nuevas pruebas SQL en el comando estándar).
- `supabase/tests/run-v5c-postgres.py` (modo local adicional, conserva el anterior).
- `tests/browser/admin-images.cjs`.
- `tests/image-uploads.test.mjs`.
- `tests/public-catalog-api.test.mjs`.

Todo queda sin commit en `feature/nexo-legacy-image-replacement`, desde `b05c260`.
No se modificaron main, las migraciones históricas, el proveedor JSON ni archivos
originales de fotografías. No se ejecutaron SQL remoto, reparaciones del historial,
push, PR, merge ni despliegues.
