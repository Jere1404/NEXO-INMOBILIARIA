# Despliegue manual de nexo-property-image con GitHub Actions

Preparado localmente; no publicado ni ejecutado. Alternativa al CLI de Codex: GitHub Actions recibe su secreto directamente y evita la incompatibilidad entre la validación `sbp_…` del CLI y el marcador protegido que utiliza el proxy de Codex.

## Alcance

Archivo: `.github/workflows/deploy-property-image.yml`.

Solo `workflow_dispatch`, sin eventos de push, PR ni programación. Proyecto y función están fijados: `ugrqstsuhamjjewusigh` / `nexo-property-image`. Acciones fijadas por commit y CLI 2.122.0. Permiso GitHub `contents: read`; checkout sin persistir credenciales. Una sola ejecución simultánea, sin cancelar un despliegue que ya esté en curso.

Instala únicamente las dependencias de pruebas del procesador desde su lockfile, sin scripts de instalación; regenera `magick.wasm` desde ImageMagick 0.0.45; comprueba los nueve archivos, el binario y `verify_jwt=false`; ejecuta las pruebas del procesador y autenticación. Solo después expone `SUPABASE_ACCESS_TOKEN` al paso que despliega la función y consulta su estado.

El comando es explícito:

```bash
supabase functions deploy nexo-property-image --project-ref ugrqstsuhamjjewusigh --use-api --output-format text
```

No utiliza `--prune`, no despliega todas las funciones, no cambia secretos remotos, no ejecuta SQL ni construye/publica el frontend. `verify_jwt=false` se conserva en `supabase/config.toml`: el handler valida sesión con `auth.getUser()` y membresía administrativa antes de construir el cliente privilegiado.

No hay bucle de reintentos añadido al workflow. El CLI conserva su comportamiento propio ante límites de la API. Si el despliegue falla, el job termina sin ejecutar la lectura posterior; si falla la lectura, el job puede marcarse fallido aunque la función ya esté desplegada. Revisar el estado antes de repetirlo.

## Publicación futura, con autorización separada

1. Revisar y publicar el workflow y sus dependencias del backend: `supabase/config.toml`, `supabase/functions/` (sin `node_modules` ni WASM generado), `scripts/prepare-image-function.mjs` y sus lockfiles/licencias. Las pruebas también necesitan las imágenes existentes de referencia, ya presentes en el repositorio. No hace falta publicar los cambios del frontend para desplegar esta función.
2. GitHub exige que el archivo con `workflow_dispatch` exista en la **rama predeterminada** para habilitar la ejecución manual. Publicarlo solo en una feature branch no garantiza que aparezca el botón. Integrar ese archivo y el backend debe ser una operación revisada/autorizada aparte; después se puede elegir la rama o revisión aprobada desde Actions.
3. En GitHub: repositorio → **Settings → Secrets and variables → Actions → New repository secret**. Nombre exacto: `SUPABASE_ACCESS_TOKEN`. Introducir allí el token personal de Supabase con acceso al proyecto y permisos de lectura/despliegue de Edge Functions. No pegarlo en conversaciones, YAML, comandos versionados ni logs. El secreto de Codex no se transfiere automáticamente a GitHub Actions. `GITHUB_TOKEN` no sustituye este token.
4. Mantener los dos secretos de ejecución ya configurados en Supabase (`NEXO_SUPABASE_PUBLISHABLE_KEY` y `NEXO_ALLOWED_ORIGINS`). El workflow no los modifica. No requiere contraseña de base de datos ni claves `service_role` en GitHub.
5. Tras autorizarlo: **Actions → Deploy nexo-property-image → Run workflow**. Elegir la rama aprobada que contenga todos los archivos y ejecutar una vez. No activar logs de depuración ni imprimir el entorno.
6. Verificar el resultado del job, la comprobación `ACTIVE`, `verify_jwt=false` y la función en Supabase Dashboard. La publicación del frontend es independiente y requiere su propia autorización.

## Verificación pendiente en Supabase real

El contrato y la carga binaria se verifican localmente; la aceptación real del paquete, arranque, resolución de dependencias npm y consumo de CPU/memoria del plan Free requieren un despliegue autorizado. `ACTIVE` no demuestra que el WASM ya haya decodificado una fotografía: se inicializa al procesar la primera imagen.

Primera prueba posterior: una fotografía JPEG pequeña, con administrador habilitado y propiedad de prueba existente. Usar el frontend local V5C.2 con su origen autorizado, o el frontend cuando su publicación se apruebe. Confirmar original privado, derivados JPEG/WebP, `ready`, vista previa y ausencia de errores en logs. No ampliar los orígenes ni crear/modificar datos de prueba automáticamente mediante este workflow.

## Fuentes oficiales

- [Supabase: despliegue y GitHub Actions](https://supabase.com/docs/guides/functions/deploy#github-actions).
- [Acción oficial supabase/setup-cli](https://github.com/supabase/setup-cli).
- [GitHub: ejecución manual de workflows](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/manually-running-a-workflow).

## Resultado de validación local

`actionlint` 1.7.12 aprobó la estructura y expresiones del workflow. También se comprobaron la sintaxis Bash y Python, el disparador exclusivamente manual, el destino fijo y el aislamiento del secreto al paso remoto. Se ejecutaron exactamente los cuatro pasos previos al despliegue, sin el secreto de Supabase: instalación desde lockfile, regeneración del WASM (15.425.791 bytes, hash esperado), verificación de los nueve archivos y 18 pruebas aprobadas. No se ejecutó el job en GitHub Actions ni el comando remoto de despliegue. La prueba real del plan Free sigue pendiente.
