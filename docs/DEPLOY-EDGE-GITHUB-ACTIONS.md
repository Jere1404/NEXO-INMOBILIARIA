# Despliegue manual de nexo-property-image con GitHub Actions y Docker

Cambios locales, sin publicar ni desplegar. El empaquetado anterior con `--use-api` falló con HTTP 413: el multipart de fuentes medía 15.680.339 bytes. Ese número no es el tamaño del bundle ESZIP.

## Flujo revisado

Archivo: `.github/workflows/deploy-property-image.yml`. Solo `workflow_dispatch`, sin push, PR ni programación. Proyecto y función fijos: `ugrqstsuhamjjewusigh` / `nexo-property-image`. Acciones fijadas por commit y CLI 2.122.0. Permiso GitHub `contents: read`; checkout sin persistir credenciales. No modifica frontend, SQL, secretos remotos ni otras funciones.

1. Instalar las dependencias del procesador desde el lockfile sin scripts de instalación.
2. Regenerar el WASM de ImageMagick 0.0.45 y conservar las verificaciones actuales del paquete y `verify_jwt=false`.
3. Ejecutar las 18 pruebas existentes del procesador/autorización.
4. Comprobar `docker info` y ejecutar las pruebas de los controles de empaquetado.
5. Empaquetar realmente con Docker mediante `python3 -B scripts/deploy-image-function-docker.py`. Por defecto es **dry run**: no contacta la Management API ni despliega. Recibe el artefacto real generado por el CLI, mide y valida su integridad. Si falla, no se alcanza el paso con el secreto.
6. Solo durante la ejecución manual autorizada del workflow, ejecutar el mismo programa con `--deploy`. Vuelve a empaquetar y verificar el artefacto exacto que se enviará. El secreto de GitHub Actions se limita a ese paso. Después consulta por lectura el estado `ACTIVE` y `verify_jwt=false`.

## Por qué no basta con cambiar el flag

CLI 2.122.0 admite `--use-docker`, pero su código todavía puede pasar a empaquetado por API cuando detecta Docker caído. Además, comprime el ESZIP con Brotli y antepone `EZBR` antes de enviarlo. Un `du` del directorio de fuentes, o un tamaño mostrado después de publicar, no controla ese artefacto antes del despliegue.

`scripts/deploy-image-function-docker.py` ejecuta el CLI con `--use-docker` a través de un perfil local temporal y un gateway ligado exclusivamente a `127.0.0.1`. No modifica la configuración del proyecto Supabase. El gateway:

- Rechaza siempre `/functions/deploy`, multipart y fuentes. Incluso si el CLI intenta fallback, no puede reenviarlo a Supabase.
- Solo permite la lectura del listado y la creación/actualización de la función fija mediante el endpoint de bundle binario; no permite SQL, otras funciones, DELETE, secrets ni endpoints arbitrarios.
- Comprueba el checksum que proporciona el CLI contra los bytes reales.
- Usa `scripts/check-image-function-bundle.mjs` para validar `EZBR`, descomprimir el ESZIP, verificar su cabecera y que contiene intacto el WASM preparado.
- Muestra por separado `eszip_bytes` (bundle descomprimido) y `upload_bytes` (artefacto transmitido). El umbral de **20.000.000 bytes** se aplica a `upload_bytes`, el bundle transmitido, sobre el cual el CLI calcula su mensaje `script size`. Es un umbral conservador frente a 20 MiB. El tamaño sin Brotli se informa separadamente: no se presenta como tamaño transmitido ni como consumo de memoria de la función. Se limita también la descompresión de inspección a 128 MB para evitar agotamiento de memoria.
- Solo permite un intento de escritura remoto. Un timeout puede dejar un resultado incierto: revisar Supabase antes de ejecutar de nuevo. No sigue redirecciones ni repite mutaciones automáticamente.

La credencial real permanece en memoria en el gateway; el CLI usa una credencial efímera válida solo para loopback. No hay valores privados en perfiles, reportes, bundles o logs. Las solicitudes remotas utilizan exclusivamente HTTPS a `api.supabase.com`. No se desactiva TLS. El CLI solo recibe un perfil local temporal, eliminado al finalizar.

El dry run simula localmente la respuesta del endpoint al bundle. El programa imprime explícitamente `LOCAL DRY RUN`, suprime los mensajes de éxito simulado del CLI y termina confirmando que no desplegó nada. Solo `--deploy` habilita la solicitud remota. No se debe invocar el CLI directamente para saltarse el guard.

## Publicación y ejecución futura

1. Publicar, con autorización separada, el workflow, los dos helpers de Docker, sus pruebas, la guía y las dependencias de backend ya revisadas. No incluir frontend, migraciones, `.temp`, `node_modules` ni el WASM generado.
2. GitHub exige que el workflow exista en la **rama predeterminada** para habilitar el botón manual. Una rama feature por sí sola puede no habilitarlo. Publicación e integración requieren autorización aparte.
3. En **Settings → Secrets and variables → Actions**, configurar `SUPABASE_ACCESS_TOKEN` con el token personal de Supabase autorizado para leer y desplegar Edge Functions. El secreto de Codex no se transfiere automáticamente. No se requiere contraseña de base de datos ni `service_role` en GitHub.
4. Mantener los secretos de ejecución ya configurados en Supabase. Este workflow no los modifica.
5. Tras autorización, **Actions → Deploy nexo-property-image → Run workflow**, eligiendo la revisión aprobada. Revisar primero el resultado Docker y las dos medidas reales. El paso de despliegue vuelve a validar antes de enviar.
6. Confirmar resultado del job y función `ACTIVE`. La publicación del frontend es independiente.

## Validación y límites

Pruebas locales: `node --test scripts/tests/image-function-bundle.test.mjs`, `python3 -B -m unittest discover -s scripts/tests -p 'test_deploy_image_function_docker.py'` y `npm test --prefix supabase/functions`. También se valida el workflow con actionlint y la sintaxis Bash/Python. Las medidas diminutas de los fixtures unitarios no representan el bundle de NEXO.

Solo una ejecución real del bundler Docker puede establecer el tamaño del ESZIP completo, incluidas dependencias npm. Si el entorno local no logra terminar ese proceso, la medición queda pendiente en el paso dry run de GitHub Actions; no se sustituye por el tamaño de las fuentes.

Desplegar y obtener `ACTIVE` no demuestra que el procesador respete los límites de Supabase Free: 256 MB de memoria y 2 segundos de CPU por petición. Tras un despliegue autorizado, probar un JPEG pequeño con administrador habilitado y una propiedad de prueba existente; revisar original privado, variantes, `ready`, vista previa y logs. Luego ampliar formatos/tamaños. No se crean datos de prueba desde el workflow.

## Fuentes oficiales

- [Supabase: límites](https://supabase.com/docs/guides/functions/limits): 20 MB empaquetados localmente frente a 5 MB en servidor; los archivos estáticos requieren Docker.
- [Supabase: GitHub Actions](https://supabase.com/docs/guides/functions/deploy#github-actions).
- [CLI 2.122.0: bundler Docker, EZBR y fallback](https://github.com/supabase/cli/blob/v2.122.0/apps/cli/src/shared/functions/deploy.ts).
- [Acción oficial setup-cli](https://github.com/supabase/setup-cli).

## Resultado local de esta revisión

Se completó el bundler Docker real con CLI 2.122.0 y `supabase/edge-runtime:v1.77.8`, usando el gateway en modo dry run. El artefacto EZBR transmitible midió **15.678.986 bytes**; el ESZIP antes de Brotli, **56.159.947 bytes**. Ambas son medidas del artefacto generado, no del directorio de fuentes. Se comprobó que el WASM estaba intacto dentro del ESZIP. La medición se repite en GitHub y antes de cualquier envío autorizado.

El entorno local necesitó montar su almacén público de certificados dentro del contenedor para confiar en el proxy HTTPS; se hizo con una herramienta temporal fuera del repositorio, sin desactivar TLS. Ese ajuste es propio de Codex y no se incorpora a GitHub Actions. No hubo solicitudes a la Management API durante el dry run. La aceptación del bundle por Supabase y el funcionamiento del procesador dentro de Free siguen pendientes.

La revisión pasó actionlint, las 18 pruebas originales y 14 pruebas adicionales del empaquetado/gateway (5 Node y 9 Python), incluida la interrupción antes de iniciar el CLI si Docker no funciona. La última ejecución dry run terminó correctamente con la misma medida real del artefacto. No se modificaron el código de la función ni su configuración JWT.
