# Sistema de fotografías de propiedades — V3A

## Estado

Se prepara el soporte técnico sin descargar ni generar fotografías. Las doce propiedades mantienen sus identificadores, precios, filtros y demás datos. La fotografía del hero no se modifica.

`imagen` admite un objeto con estos campos:

| Campo | Contenido |
| --- | --- |
| `src` | Ruta relativa al JPEG de respaldo, o `null` mientras no haya foto |
| `width`, `height` | Dimensiones reales del JPEG, o `null` |
| `alt` | Descripción breve de la imagen de referencia; vacía mientras no haya foto |
| `webp` | Lista de variantes `{ src, width }` WebP |
| `jpeg` | Lista opcional de variantes `{ src, width }` JPEG para `srcset` |

Los doce registros tienen `src`, `width` y `height` en `null`, `alt` vacío y listas vacías. `fotografias` se conserva vacío para una futura galería. El valor anterior `imagen: null`, un campo ausente o metadatos incompletos continúan siendo compatibles: se muestra el respaldo sin impedir la carga del catálogo.

Solo se aceptan rutas locales dentro de `assets/images/propiedades/`, con nombres alfanuméricos, guiones, guiones bajos y subcarpetas; se rechazan URLs externas, rutas ascendentes y formatos no admitidos. Las variantes inválidas se ignoran y se ordenan por ancho, eliminando anchos repetidos. Para mostrar una fotografía se requiere un JPEG válido, dimensiones enteras positivas y texto alternativo no vacío.

## Representación compartida

`assets/js/property-cards.js` genera `<picture>` con `<source type="image/webp">` y `<img>` JPEG. Usa `srcset` con descriptores de ancho y `sizes` adaptado a las columnas de inicio y catálogo, incluido el panel lateral de filtros. Los atributos `width` y `height` describen el respaldo; CSS reserva un bloque 4:3 y usa `object-fit: cover`.

El respaldo CSS “Fotografía no disponible” ocupa el mismo espacio antes y después de cargar. Al recibir `load` se oculta; ante `error` se retira el `<picture>` y permanece el respaldo, evitando iconos rotos y bucles de reintentos. El texto alternativo de una fotografía deberá describir el recurso ilustrativo sin atribuirlo a una vivienda real de Corrientes.

Las imágenes usan `decoding="async"`. `renderPropertyCards` acepta `priorityImages`, con cero como valor predeterminado: todas las imágenes de las destacadas usan `loading="lazy"`. El catálogo solicita una primera imagen `eager` y las demás `lazy`; no compiten con la prioridad alta del hero. La carga prioritaria se aplica por posición visible tras filtrar u ordenar.

## Organización y siguiente etapa

Carpeta común: `assets/images/propiedades/`. Subcarpetas por identificador: `nexo-001/` a `nexo-012/`. Guardar solamente versiones optimizadas necesarias, sin originales pesados o recursos temporales en el sitio. Antes de añadir una fotografía se verificará procedencia, licencia y pertinencia con el tipo de propiedad.

No se implementan fichas individuales, galerías, nuevos filtros ni contactos en esta etapa. Los respaldos no son enlaces y no simulan disponibilidad de fotografías.

## Verificación

Ejecutar desde la raíz:

```bash
node --test tests/*.test.mjs
```

Para revisar el sitio, servirlo por HTTP. Además de los tests de datos y filtros, verificar seis destacadas y doce tarjetas de catálogo, bloque 4:3, ausencia de desbordamientos, casos de foto ausente/error y selección WebP/JPEG con metadatos de prueba interceptados en el navegador. Esos casos no agregan fotografías ni rutas ficticias al JSON del proyecto.
