# Fichas individuales — V4

## Rutas y fuente única

`propiedad.html?id=nexo-001` es una única plantilla para todos los registros de `data/propiedades.json`. Las tarjetas de inicio, catálogo y similares generan enlaces relativos a esta ruta; no se duplican los registros ni se crean doce páginas.

`assets/js/propiedad.js` presenta la ficha. `property-details.js` contiene funciones puras de validación de ID, búsqueda, galería, similares y mensaje de consulta. `property-cards.js` comparte carga/validación e imágenes responsive con la ficha. La búsqueda por identificador usa un índice `Map`; las recomendaciones se calculan sobre los datos cargados, sin peticiones por cada tarjeta.

Este enfoque sirve al catálogo estático actual. Para grandes volúmenes, los módulos de presentación pueden conservarse mientras la carga de JSON completo se sustituye por consultas paginadas o un servicio. No se agregan backend ni dependencias en V4.

## Contenido

Se muestran título, tipo, operación, precio y moneda, alquiler por mes cuando corresponde, ubicación, superficie total, habitaciones, baños, comodidades, descripción y referencia barrial. Los datos proceden del JSON. No se calcula ni inventa cantidad de ambientes. Habitaciones y baños `null` en terrenos no se muestran. No hay mapas, direcciones exactas ni afirmaciones de ofertas reales.

Los IDs ausentes, mal formados o repetidos muestran un aviso de enlace inválido. Un ID válido pero desconocido muestra “Propiedad no encontrada”. Los errores de JSON o red tienen un mensaje distinto y regreso al catálogo. Hay aviso sin JavaScript.

## Galería

Se usa `imagen` como principal y se admite agregar objetos con el mismo contrato en `fotografias`. La normalización existente descarta entradas incompletas y elimina imágenes duplicadas por `src`. Actualmente `fotografias` está vacío: cada ficha usa solo su imagen real de referencia disponible, sin duplicarla ni inventar recursos.

La imagen principal es `eager`, con WebP/JPEG, `srcset`, `sizes`, dimensiones reservadas y respaldo ante error. El bloque usa proporción 4:3 y `object-fit: contain` para conservar la composición. Los controles nativos de selección aparecen únicamente si hay varias imágenes; usan etiquetas, foco visible, `aria-pressed` y anuncio de la imagen seleccionada. No hay reproducción automática ni animaciones.

## Similares

Hasta tres propiedades, excluyendo la actual. Se prioriza el mismo tipo (4 puntos), la misma operación (2) y luego la zona (1). Se incluyen solo registros con alguna coincidencia; los empates usan ID estable. No se comparan precios entre monedas. Si no hay alternativas, se omite la sección. Se reutilizan las tarjetas y enlaces de catálogo.

## Consulta por WhatsApp

`assets/js/site-config.js` mantiene `whatsappNumber = null`. No hay número real ni de ejemplo configurado. El botón permanece deshabilitado con explicación visible y mensaje personalizado de solo lectura. No se envía ni se abre ninguna consulta.

El mensaje incluye título, ID, URL de la ficha y aviso de demostración. Cuando se proporcione y autorice un destino, se deberá configurar su número internacional (solo dígitos), revisar el texto y verificar manualmente el enlace. La función de creación del enlace codifica el mensaje con `encodeURIComponent`; no realiza solicitudes ni envíos. Los números presentes en tests son fixtures, no configuración del sitio.

## Pruebas

```bash
node --test tests/*.test.mjs
```

Las pruebas nuevas cubren los doce IDs, errores de parámetros, similares, galería sin duplicados, rutas bajo subdirectorios y mensajes de consulta sin destino configurado. La revisión de navegador debe cubrir fichas en móvil/escritorio, enlaces de tarjetas, menú, imagen fallida, datos fallidos, teclado y regresión del buscador/filtros. La simulación de fotografías adicionales se hace solo interceptando datos de prueba; el JSON del proyecto no se modifica.
