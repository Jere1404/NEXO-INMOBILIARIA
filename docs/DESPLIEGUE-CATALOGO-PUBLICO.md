# Despliegue manual de nexo-public-catalog

## Alcance

`.github/workflows/deploy-public-catalog.yml` solo admite workflow_dispatch y ejecuta el job únicamente para este repositorio y la rama main. Hace checkout del SHA elegido en esa ejecución, usa CLI Supabase 2.122.0 y Deno 2.1.4. No tiene inputs de proyecto/función ni comandos de migración, secretos, datos o frontend. No llama al workflow del procesador ni necesita ImageMagick, WASM o Docker.

Antes de desplegar valida paquete/verify_jwt=false, ejecuta pruebas de aplicación/API y SQL local, y comprueba imports, lock y cuatro pruebas del entrypoint en Deno sin permiso de red. Las dependencias se descargan antes; las pruebas Deno usan caché y respuestas simuladas. Solo el último paso recibe SUPABASE_ACCESS_TOKEN. Después verifica por GET de Management API que la función objetivo esté ACTIVE con verify_jwt=false. No imprime credenciales ni la respuesta completa de esa API.

## Requisitos

- Revisar, aprobar e integrar el workflow a main por separado. Crearlo localmente o abrir un PR no lo ejecuta.
- El secreto de Actions SUPABASE_ACCESS_TOKEN debe existir y autorizar despliegue en el proyecto `ugrqstsuhamjjewusigh`. No copiarlo al repositorio ni compartirlo por chat. No se necesita DB password.
- Supabase debe conservar las migraciones ya instaladas y las variables de runtime que utiliza el procesador: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXO_SUPABASE_PUBLISHABLE_KEY y NEXO_ALLOWED_ORIGINS. Este workflow no las crea ni modifica.
- El origen de GitHub Pages es `https://jere1404.github.io`, sin el subdirectorio. Los buckets continúan privados. No cambiar RLS.

## Ejecución (solo con autorización de despliegue)

1. GitHub → Actions → **Deploy nexo-public-catalog** → **Run workflow**.
2. Seleccionar **main**, comprobar que incluye la revisión aprobada y confirmar Run workflow. Otras ramas omiten el job.
3. Revisar primero los pasos de configuración y pruebas. Si alguno falla, el despliegue no se ejecuta.
4. El único comando de despliegue es:

   ```sh
   supabase functions deploy nexo-public-catalog --project-ref ugrqstsuhamjjewusigh --use-api
   ```

5. Confirmar que finalice con `Verified nexo-public-catalog: ACTIVE; verify_jwt=false`. Revisar también Supabase → Edge Functions → nexo-public-catalog → logs de arranque.
6. Si el despliegue termina pero falla la verificación posterior, no asumir que no se desplegó: comprobar estado y logs antes de reintentar. No hay reintento automático del job.

## Primera comprobación de lectura

Base: `https://ugrqstsuhamjjewusigh.supabase.co/functions/v1/nexo-public-catalog`.

- GET `/list` y `/list?page=9`: 200 con paginación; vacío si no hay publicadas.
- GET `/options`: 200, provincias paginadas.
- GET `/options?scope=localities&provincia=18`: 200.
- GET `/detail?id=referencia-inexistente`: 404.
- GET `/list?pageSize=49`: 400.
- OPTIONS con Origin de Pages: 204 y Access-Control-Allow-Origin correcto; otro Origin: 403.

No publicar propiedades para conseguir resultados ni cambiar el frontend JSON. La firma real requiere posteriormente una propiedad expresamente autorizada como pública. URLs de derivados vencen a los 300 segundos; nunca copiar tokens/URLs firmadas ni cuerpos privados a logs o informes. El estado ACTIVE no demuestra aún procesamiento de consultas, RLS real o rendimiento Free: seguir las pruebas de `CATALOGO-PUBLICO-V5D2.md`.
