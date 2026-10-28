# Reconstrucción del estado instalado de V5C

## Alcance y procedencia

Estos archivos reconstruyen el estado observado en una auditoría de solo lectura de
Supabase. **No son los originales históricos ni deben volver a aplicarse al proyecto
que ya tiene V5C instalado.** No se consultó ni modificó Supabase durante este trabajo.
No se implementa sustitución de fotografías ni se cambia el proveedor público JSON.

La evidencia está conservada como metadatos técnicos en
`supabase/tests/fixtures/v5c-audit.json`. Contiene las filas de los diez CSV del
`Archivo.zip` (query-2 a query-11) y los cinco CSV adicionales (query-12 a query-16).
Se omitieron los archivos auxiliares `__MACOSX`, que no contienen resultados SQL.
No contiene contraseñas, tokens de acceso ni filas de usuarios o fotografías.
Los nombres de roles y las definiciones de funciones son metadatos de PostgreSQL.
El resultado vacío de ENUM/DOMAIN fue informado por el responsable; no hay un CSV
que permita revisar el alcance del filtro de esa consulta.

| Evidencia | Contenido |
| --- | --- |
| 2 | Inventario, propietarios, RLS habilitada/forzada |
| 3 | Columnas, tipos, defaults y expresiones generadas |
| 4 / 5 / 6 | Restricciones / índices / triggers |
| 7 | Políticas permisivas y restrictivas |
| 8 / 9 | Definiciones de funciones / permisos de ejecución |
| 10 / 11 | Permisos efectivos de tablas / configuración de buckets |
| 12 | Definición y ACL de `nexo_service_cleanup_attempt` |
| 13 | Atributos, propietarios y ACL completas de funciones V5C |
| 14 / 15 | ACL de esquemas/tablas/columnas / permisos predeterminados |
| 16 | Atributos adicionales de los dos buckets |

## Separación elegida y dependencias

1. `202610250001_v5c1_image_contract.sql`: añade ocho columnas de almacenamiento y
   limpieza sobre `property_images`, sus contratos e índices únicos, el guard de
   identidad y cuatro políticas restrictivas. Depende de V5A; la secuencia local
   validada conserva también V5B.2 y V5B.3.
2. `202610250002_v5c1_private_storage.sql`: configura los dos buckets, recupera
   `image_object_allowed` y las doce políticas sobre tablas Storage. Depende del
   contrato anterior y de la infraestructura Storage de Supabase. Sus atributos
   adicionales requieren una versión compatible con la auditada.
3. `202610250003_v5c2_image_processing.sql`: añade siete columnas de procesamiento,
   contratos, la tabla privada de intentos, hash inmutable, autorización y siete
   RPC: reserve, claim, get, stage, finalize, fail y cleanup_attempt. Añade dos
   políticas restrictivas que reservan la escritura de imágenes gestionadas al
   backend. Se instala después de las dos anteriores.

Los cuerpos de funciones se recuperan de `pg_get_functiondef`, sin reescribir su
lógica. Se mantienen SQLSTATE, bloqueos, límites, condiciones y firmas observados.
Columnas, expresiones, restricciones, índices, triggers y políticas proceden de
las definiciones exportadas. Se conservan las estructuras y políticas anteriores
V5A/V5B; no se reemplaza la tabla de imágenes ni se recrea la infraestructura
interna de Auth/Storage.

## Decisiones que no pueden comprobarse históricamente

- La división anterior y el orden interno son decisiones para satisfacer las
  dependencias del estado final; no prueban cómo estaban escritos los originales.
- Los archivos usan transacciones y un `search_path` local explícito para resolver
  los nombres no calificados de las definiciones exportadas. Se espera el rol
  `postgres`, propietario observado. No contienen mecanismos de conexión.
- Se emiten CREATE/ALTER normales, sin ocultar duplicados con IF NOT EXISTS ni
  sobrescribir buckets con UPSERT. Una segunda aplicación falla: no son scripts
  de reconciliación para producción.
- Los REVOKE/GRANT de funciones recuperan sus ACL observadas incluso con los
  permisos predeterminados amplios de Supabase. La tabla privada de intentos
  queda sin acceso directo de anon/authenticated/service_role.
- Las ACL compartidas de public/storage y los permisos predeterminados se usan
  como contexto y evidencia, no se vuelven a configurar globalmente. No hay
  evidencia de que V5C haya creado esos defaults. `nexo_private` conserva los
  permisos de esquema establecidos por V5A.
- Se fijan explícitamente los atributos auditados de buckets, sin copiar fechas
  ni propietarios de archivos. No se reproducen cambios de datos históricos
  desconocidos. Las filas V5A existentes reciben `storage_kind='legacy'` mediante
  el default comprobado; las pruebas verifican que conservan sus datos previos.
- No pueden recuperarse comentarios originales, versiones intermedias,
  sentencias de backfill perdidas ni el registro remoto de aplicación. No se
  afirma identidad textual con los originales.

## Pruebas reproducibles

Desde la raíz del repositorio, con dependencias ya instaladas:

```bash
node --test supabase/tests/v5c-recovery.test.mjs
npm test
npm test --prefix supabase/tests
npm test --prefix supabase/functions
python supabase/tests/run-v5c-postgres.py
```

El test nuevo se ejecuta explícitamente: no se modificó el script existente de
`supabase/tests/package.json`, que continúa seleccionando la suite V5A/V5B.

La suite PGlite crea una base nueva por ejecución, instala V5A/V5B, carga el seed
existente y aplica los tres archivos reconstruidos. Compara con los CSV columnas,
expresiones, restricciones, índices, triggers, políticas, RLS, cuerpos de
funciones, atributos, ACL de funciones/tablas propias y configuración de buckets.
Comprueba además que las filas heredadas y las funciones anteriores no cambian.

El archivo SQL `supabase/tests/v5c-recovery-behavior.sql` prueba autorización y
revocación, permisos RPC, idempotencia de reserva, bloqueo de un claim activo,
rutas inválidas, RLS sobre originales/derivados, restricciones sobre escritura
managed, hashes, finalización, fallo tardío, retención y confirmación de limpieza.
Introduce políticas permisivas ajenas en la base de prueba para verificar que
los guards restrictivos siguen protegiendo los buckets NEXO.

El runner Python utiliza una imagen PostgreSQL 17 Alpine fijada por digest,
contenedor descartable, sin red ni puertos publicados. Se comunica por `docker
exec` y elimina el contenedor al finalizar. No acepta URL de base remota. También
prueba dos sesiones concurrentes reservando el mismo UUID, con una barrera que
mantiene bloqueada la primera transacción: debe conservarse una única reserva.

**Límite:** ambos entornos usan `v5c-local-platform.sql`, una implementación mínima
de las interfaces SQL de Auth/Storage necesaria para estas pruebas. No es el
stack completo de Supabase ni reproduce todos sus triggers internos. El enum
STANDARD del fixture es solo el subconjunto usado por los buckets auditados.
La validación no prueba HTTP Storage, firma real de URLs, objetos binarios,
PostgREST, JWT, Edge Functions ni todas las carreras posibles de finalización y
limpieza. No equivale a certificar producción ni una instalación Supabase completa.

## Resultado y pasos antes de cualquier publicación

Resultados ejecutados en esta reconstrucción:

- Suite nueva PGlite: 7 resultados aprobados (test contenedor y seis subtests),
  sin fallos ni omitidos.
- Aplicación: 113 aprobados; SQL V5A/V5B: 16 aprobados; procesador: 18 aprobados.
  Sin fallos ni omitidos en esas suites.
- PostgreSQL 17 descartable: aplicación de la secuencia completa y todas las
  aserciones SQL aprobadas; reserva concurrente en dos sesiones aprobada.
- Los contenedores de prueba fueron eliminados. No se ejecutaron pruebas remotas.

Los cambios quedan locales en `recovery/v5c-audited-migrations`, sin commit, push,
PR, merge ni despliegue. Solo se añadieron archivos; no se modificaron fuentes,
manifest, lockfiles, migraciones anteriores ni configuración del proveedor JSON.

Antes de una futura operación de migración hay que comparar estos tres IDs con
el historial remoto y revisar los pipelines: una instalación manual podría no
haberlos registrado y `db push` podría intentar repetirlos. Esa comprobación y
cualquier reparación del historial requieren autorización separada. Incorporar
los archivos al repositorio no autoriza ejecutarlos sobre producción.

La reconstrucción preserva deliberadamente el comportamiento observado. Por
ejemplo, eliminar imágenes managed (incluso por cascada de propiedades) está
bloqueado por el guard; cleanup_attempt actualiza el registro de intentos, no
borra objetos. No se amplían esas funciones para sustituir fotografías.
