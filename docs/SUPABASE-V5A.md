# V5A — base de datos, autenticación y permisos

## Alcance y estado

Implementación preparada, **sin proyecto Supabase configurado ni cambios remotos aplicados**. El sitio público sigue leyendo `data/propiedades.json`. No se crean usuarios reales, no se envían invitaciones, no se cargan imágenes ni se activa el proveedor Supabase desde ninguna página.

Se incluyen:

- `supabase/migrations/202610240001_v5a_schema.sql`: tablas, restricciones, índices, ACL y RLS.
- `supabase/seeds/001_demo_properties.sql`: importación reproducible de las doce propiedades de demostración.
- `scripts/generate-supabase-seed.mjs`: genera esa importación desde el JSON, sin credenciales.
- `assets/js/backend/`: fábrica de cliente inactiva, autenticación de administrador y repositorio público con adaptador.
- Tests unitarios y pruebas SQL sobre PostgreSQL embebido, separados de las pruebas pendientes de servicios reales.

## Modelo

`properties` usa un UUID interno y `public_code` único e inmutable (`nexo-001`… en el importador), conservando las URLs actuales. Tiene estado `draft`, `published` o `archived`, precio decimal positivo y no NaN, moneda ARS/USD, tipo, operación, zona, superficie en m², habitaciones/baños opcionales, descripción, ubicación aproximada, destacada y marca de demostración. Los terrenos exigen habitaciones/baños nulos.

`zones` y `amenities` normalizan las opciones, con `property_amenities` como relación. `property_images` contiene orden, principal única, dimensiones, alt, variantes WebP/JPEG, procedencia y estado de procesamiento. Una imagen `ready` requiere metadatos completos. Las relaciones con propiedades tienen FK y borrado en cascada de metadatos; esto **no elimina archivos de Storage**, que se resolverá en V5C. Los índices cubren publicación, tipo/operación/zona, moneda/precio y superficie.

`created_at`, `updated_at` y `version` permiten preparar control de ediciones concurrentes. El trigger preserva UUID/código/fecha de creación y aumenta versión. En V5B las escrituras deberán comparar la versión esperada y detectar cero filas modificadas.

No se incluyen contactos de propietarios, documentos privados, direcciones exactas ni claves de almacenamiento en las filas públicas. Si se necesitan, deberán ir en tablas privadas con permisos propios.

## Permisos efectivos

| Actor | Lectura | Escritura |
| --- | --- | --- |
| Visitante `anon` | Propiedades publicadas; comodidades de esas propiedades e imágenes `ready`; catálogos de zonas/comodidades | Ninguna |
| Autenticado sin membresía habilitada | Igual que visitante; puede consultar solo su propia membresía | Ninguna |
| Administrador habilitado | Todos los estados y metadatos | CRUD de propiedades, relaciones, imágenes y opciones |
| Operador privilegiado del proyecto | Gestión fuera del navegador | Alta/revocación de administradores y migraciones |

RLS protege las seis tablas, además de los GRANT explícitos. No hay políticas de escritura de `admin_memberships` para clientes, ni siquiera administradores. Los permisos no se toman de `user_metadata`. La función `nexo_private.is_admin()` usa `auth.uid()`, `SECURITY DEFINER` y `search_path` vacío; consulta membresía habilitada, de modo que revocarla afecta inmediatamente a las siguientes consultas. El esquema privado no debe agregarse a los esquemas expuestos de la API.

El administrador inicial se crea fuera de la aplicación. La tabla admite más miembros autorizados en el futuro, pero actualmente solo el rol `admin`; no hay autogestión de roles. Ningún control del frontend reemplaza estas políticas.

## Pasos en un proyecto Supabase de desarrollo

1. Crear o elegir un proyecto de desarrollo; comprobar versión de PostgreSQL y guardar el identificador. No usar producción para esta primera validación.
2. Revisar y ejecutar la migración con una conexión privilegiada del proyecto (SQL Editor o herramienta de migraciones). Es una migración versionada de una sola aplicación; no ejecutarla dos veces. Si existen tablas con esos nombres, detenerse y revisar conflictos, sin borrarlas automáticamente.
3. **Deshabilitar el registro de nuevos usuarios** en la configuración de Auth; desactivar proveedores no utilizados y el acceso anónimo. No confundir el rol API `anon` de visitantes con usuarios anónimos de Auth. Esta es una configuración del servicio: no la impone el SQL ni el módulo JavaScript. Comprobar explícitamente que la API de signup rechaza un alta.
4. Crear al administrador desde las herramientas privilegiadas de Auth, por invitación o alta controlada. Confirmar la cuenta, configurar credenciales por el flujo seguro y nunca guardarlas en Git ni compartirlas por chat. SMTP, entrega de correo, aceptación de invitación y recuperación de contraseña requieren validación real; sus pantallas/callbacks se implementarán en V5B.
5. Asociar el UUID real de esa cuenta con `admin_memberships` mediante SQL privilegiado. Ejemplo de aprovisionamiento (reemplazar solo el correo de referencia en el editor seguro):

   ```sql
   do $$
   declare target_user uuid;
   begin
     select id into strict target_user from auth.users
       where lower(email) = lower('reemplazar@example.invalid');
     insert into public.admin_memberships(user_id, role, enabled)
       values (target_user, 'admin', true)
       on conflict (user_id) do update set role='admin', enabled=true;
   end $$;
   ```

   La consulta falla si no identifica exactamente una cuenta. Para revocar acceso, el operador privilegiado establece `enabled=false`. No se ofrece esa operación desde el navegador.
6. Ejecutar `supabase/seeds/001_demo_properties.sql` con SQL privilegiado. Se espera exactamente 12 propiedades (4 casas, 5 departamentos, 3 terrenos), 12 imágenes principales y todas en **borrador**. No publica ni modifica el catálogo actual.
7. Repetir la importación para comprobar idempotencia. `ON CONFLICT DO NOTHING` conserva UUID y registros existentes; no es un mecanismo de sincronización ni de actualización de cambios hechos en el panel. Puede completar relaciones faltantes; ejecutarla solo como importación controlada. Para reproducirla: `node scripts/generate-supabase-seed.mjs`.
8. Comprobar permisos con peticiones reales usando la clave pública y luego sesiones de usuario sin rol y administrador. Crear borrador, publicar una propiedad de prueba y despublicarla; verificar también sus imágenes/relaciones por URL/API directa. No usar clave `service_role` para verificar RLS: omite sus restricciones.
9. Configurar URLs de sitio y redirecciones exactas antes de implementar invitación/recuperación. Usar HTTPS fuera del desarrollo local, habilitar MFA para el administrador y cerrar el diseño de exigencia de segundo factor en los permisos antes de producción. La MFA, su interfaz y su verificación con Auth real **no están implementadas en V5A**.

No publicar propiedades reales ni conectar la web pública hasta aprobar estas pruebas y disponer de respaldo/recuperación del proyecto.

## Cliente y autenticación preparados

`createBackendClient(createClient, {url, publishableKey}, storage)` recibe la fábrica del SDK oficial `@supabase/supabase-js` y configuración pública explícita. No importa SDK desde CDN ni instancia un cliente por sí sola; no es dependencia de la web actual. Al conectarlo en V5B se fijará una versión del SDK. La URL del proyecto y clave **publishable** son públicas; nunca pasar `sb_secret_*`, `service_role` o claves de base de datos. La fábrica rechaza claves sin el prefijo publishable y conexiones HTTP.

Para el futuro panel, pasar `window.sessionStorage` y habilitar una política CSP adecuada. Sin almacenamiento explícito la sesión no persiste. Se prepara PKCE y `detectSessionInUrl=false`; los callbacks de invitación/recuperación y el intercambio de código requieren implementación explícita en V5B. No hay método `signUp`.

`createAdminAuth` permite login/logout y verifica la identidad con `auth.getUser()` y la membresía habilitada en servidor. Si la cuenta no está autorizada, cierra la sesión. Una validación de UI ayuda a la experiencia, pero RLS seguirá siendo la autoridad. No se promete login real operativo hasta configurar y probar Auth.

## Acceso público preparado, todavía inactivo

`createPublicRepository` ofrece `listPublished({page,pageSize})` (máximo 100, conteo y orden estable) y `getPublished(publicCode)`. Siempre agrega `status='published'`, incluso si se le entrega una sesión de administrador. No aplica silenciosamente un fallback al JSON si falla Supabase: podría volver a exponer datos despublicados.

`adaptProperty` convierte filas/relaciones a la estructura española actual y se verifica contra las doce propiedades. Conserva imágenes principales, variantes, códigos y `ficticia`. La importación referencia rutas locales existentes y mantiene todos los recursos como ilustrativos de IA. No mueve archivos ni configura buckets.

En V5D habrá que trasladar filtros/similares a consultas paginadas, permitir únicamente el host Storage autorizado en la validación de imágenes y actualizar los avisos que hoy presuponen que todos los registros son ficticios/IA. No se debe activar la integración con datos reales antes de resolverlo.

## Almacenamiento, pendiente de V5C

V5A protege **metadatos** de imágenes, no administra archivos. Los PNG/JPEG/WebP actuales siguen siendo archivos estáticos de demostración, públicos por diseño. No se cargaron originales en Supabase ni se crearon buckets, funciones de optimización o políticas Storage. La despublicación actual oculta filas y metadatos del backend; no puede revocar archivos estáticos ya publicados ni copias guardadas por terceros.

Antes de usar fotos reales, implementar originales/borradores privados, validación por contenido y límites, variantes autorizadas, acceso coherente con el estado de publicación, limpieza de archivos y política de caché. No usar un bucket público para imágenes privadas esperando que RLS de `properties` las proteja.

## Pruebas locales y límites

Sin instalar dependencias de la aplicación:

```bash
node --test tests/*.test.mjs
```

Para ejecutar SQL real en PostgreSQL embebido PGlite (dependencia exclusiva de pruebas, versión y checksum fijados en su lockfile):

```bash
npm ci --prefix supabase/tests
npm test --prefix supabase/tests
```

La suite levanta una base efímera en memoria, aplica las migraciones y ejecuta la importación dos veces. Prueba RLS con `SET ROLE`, simula `auth.uid()` y verifica visitante, usuario sin rol, administrador, revocación, constraints, publicación, despublicación e imágenes pendientes. **Nunca ejecutar el bootstrap de pruebas en Supabase real**: crea roles y una tabla simulada de Auth. No contiene usuarios o claves reales.

Verificado en este entorno: 31 tests unitarios y 8 pruebas PostgreSQL (test principal más siete subpruebas). El motor usado fue PostgreSQL 18.6 mediante PGlite 0.5.11; no es el servicio Supabase y no confirma compatibilidad con una versión distinta de PostgreSQL hasta probarla.

Pendiente con proyecto real: aplicar migración en su versión de PostgreSQL, relaciones PostgREST, signup bloqueado, login/logout/invitaciones/recuperación/MFA, cookies/tokens/SDK, roles JWT reales, límites del plan y futuras políticas de Storage. Los tests de autenticación de JavaScript usan dobles; no sustituyen esas verificaciones.
