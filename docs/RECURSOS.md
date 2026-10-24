# Recursos visuales — Etapas 2 y 2B

## Tipografía

Manrope variable (pesos 200–800), alojada localmente en `assets/fonts/Manrope-variable.ttf`, con `font-display: swap` y respaldo Segoe UI, Arial y sans-serif.

- Fuente: repositorio oficial de Google Fonts, directorio [ofl/manrope](https://github.com/google/fonts/tree/main/ofl/manrope).
- Archivo original: `Manrope[wght].ttf`, renombrado localmente sin alterar su contenido.
- Licencia: SIL Open Font License 1.1, incluida íntegramente en `assets/fonts/OFL.txt`.
- Descarga: 24 de octubre de 2026 (UTC).
- No se realizan solicitudes a servicios externos de fuentes durante la navegación.

## Fondo de portada

El fondo actual es una composición original de degradados CSS en tonos azul marino. Es provisional y no representa una propiedad ni simula una fotografía.

No se incorporaron fotografías porque todavía no se seleccionó una con autorización de uso documentada. Queda pendiente elegir una casa moderna, registrar autor, procedencia y licencia, optimizar el archivo y comprobar nuevamente la legibilidad del texto en todos los tamaños.

## Alcance provisional

Propiedades, Nosotros, Servicios y Contacto son páginas mínimas con avisos de desarrollo y enlaces para volver. No hay resultados ficticios de búsqueda ni acciones de contacto habilitadas. No se crean fichas individuales ni catálogo completo. En la Etapa 2B se agrega `data/propiedades.json` con seis propiedades destacadas ficticias como base reutilizable, sin simular resultados de búsqueda.

## Contraste del botón

Se conserva `#2878D0` como acento de marca. El botón usa una variante apenas más oscura, `#2676CE`, para que el texto blanco normal supere la relación mínima de contraste de 4,5:1.

## Imágenes pendientes — Etapa 2B

Se intentó consultar Wikimedia Commons, pero el proxy del entorno rechazó el acceso HTTP con 403. No fue posible verificar allí una fotografía y su licencia. Se conserva el fondo CSS de portada, conforme a la alternativa autorizada; no se descargaron fotografías de fuentes desconocidas ni se atribuyeron licencias supuestas.

Las tarjetas destacadas se presentan sin imágenes ni bloques que simulen fotografías. El campo `imagen: null` deja explícito que el recurso está pendiente. Antes de incorporar imágenes habrá que verificar su licencia, guardar atribución y procedencia, generar tamaños optimizados y agregar textos alternativos si aportan información. Manrope continúa alojada localmente bajo la licencia ya incluida.

## Catálogo visual — Etapa 3A

El catálogo mantiene la ausencia de fotografías sin licencia verificada. Cada tarjeta muestra un placeholder CSS con el texto “Fotografía pendiente”; no es una imagen del inmueble. Los datos ahora contienen 12 propiedades ficticias, sin atribuir ofertas reales a direcciones concretas. Las seis destacadas del inicio conservan su presentación sin fotografías. Antes de incorporar fotografías habrá que documentar fuente, licencia, atribución, tamaños optimizados y textos alternativos.

## Fotografía de portada solicitada — mejoras visuales

La dirección visual aprobada pasa a ser un edificio residencial contemporáneo y elegante al atardecer, con balcones, grandes ventanales y luces cálidas. Se priorizará el edificio a la derecha para conservar el texto a la izquierda, evitando oficinas y escenas excesivamente oscuras.

El 24 de octubre de 2026 se intentó consultar las páginas oficiales de licencia de Unsplash (`https://unsplash.com/license`) y Pexels (`https://www.pexels.com/license/`). El proxy rechazó ambos accesos con HTTP 403 durante CONNECT. No se pudo consultar su contenido ni verificar una fotografía específica, su autor o su licencia. No se descargaron imágenes ni se incorporaron recursos sin autorización.

Se mantiene el fondo CSS existente. Para continuar se necesita acceso a esas fuentes y sus servidores de imágenes, o una fotografía aportada con procedencia y permiso de uso comprobables. No hay candidatos concretos verificados para recomendar todavía.

Una vez seleccionada y verificada la fotografía, se prepararán variantes responsive WebP con respaldo JPEG y se integrarán mediante `<picture>`, con carga prioritaria, encuadre adaptable y superposición azul marino. Se revisarán contraste y recortes en móvil y escritorio antes de dar por terminada la mejora.

## Fotografía incorporada desde GitHub

La persona responsable del proyecto aportó y autorizó expresamente esta imagen mediante el commit `e4f902d`, en `feature/nexo-mejoras-visuales`. Ruta recibida: `assets/pierre-chatel-innocenti-gxyeia7Syuk-unsplash.jpg`. Se integra únicamente como imagen ambiental decorativa del hero; no representa una propiedad del catálogo ni se afirma que esté ubicada en Corrientes.

- Procedencia declarada por el usuario: fotografía gratuita de Unsplash.
- Autor indicado por el nombre del archivo: Pierre Châtel-Innocenti; atribución pendiente de cotejar con la ficha original.
- Identificador indicado por el archivo: `gxyeia7Syuk`. Referencia a verificar: `https://unsplash.com/photos/gxyeia7Syuk`. No se verificó su disponibilidad ni su contenido.
- Licencia: el usuario la indicó como gratuita y autorizó su incorporación. Queda pendiente verificar la ficha original, la licencia concreta aplicable y cualquier permiso adicional relevante. No se afirma haber verificado derechos comerciales de manera independiente. Referencia general pendiente: `https://unsplash.com/license`.
- La foto real muestra un edificio residencial de día, con balcones y ventanales; no es una toma al atardecer ni muestra iluminación cálida interior. Se utiliza la fotografía aportada sin alterar esa realidad.

El original recibido era un JPEG vertical de 3387 × 4234 px. Se trasladó a `assets/images/hero/nexo-edificio.jpg` y se optimizó como respaldo horizontal de 1920 × 1080 px (aproximadamente 121 KiB). No se conserva una copia de alta resolución innecesaria dentro del sitio.

Variantes generadas en la misma carpeta:

| Archivo | Tamaño | Peso aproximado |
| --- | --- | --- |
| `nexo-edificio-1280.webp` | 1280 × 720 | 31 KiB |
| `nexo-edificio-1920.webp` | 1920 × 1080 | 57 KiB |
| `nexo-edificio-mobile-480.webp` | 480 × 600 | 32 KiB |
| `nexo-edificio-mobile-960.webp` | 960 × 1200 | 87 KiB |
| `nexo-edificio-mobile.jpg` | 960 × 1200 | 147 KiB |

Se usa `<picture>` para elegir el recorte vertical en móvil y horizontal en tablet/escritorio, WebP con respaldo JPEG, carga `eager` y prioridad alta. El texto y el formulario permanecen independientes de la fotografía. Una superposición azul marino semitransparente conserva el contraste y el degradado previo sigue como respaldo si la imagen no carga. La imagen decorativa usa `alt=""` para evitar redundancia con el contenido del hero.

## Sistema de imágenes de propiedades — V3A

Se prepara el soporte de fotografías sin incorporar recursos nuevos. Las doce propiedades muestran un respaldo CSS 4:3. No hay nuevas licencias ni atribuciones que registrar todavía. La selección y verificación de fotografías se realizará en una etapa posterior autorizada; ver `docs/IMAGENES-PROPIEDADES.md`. La fotografía del hero se conserva intacta.

## V3B — imágenes ilustrativas generadas con IA

El usuario aportó doce PNG mediante el commit `4186c60` y autorizó su uso ilustrativo. Se normalizaron sus nombres a `nexo-001.png`…`nexo-012.png`, conservando los originales sin alteraciones. No son fotografías de viviendas reales ni acreditan ubicaciones, superficies o disponibilidad. El generador y sus condiciones de uso no fueron proporcionados; no se atribuye una licencia de banco de imágenes.

Se generaron derivados locales por identificador, con anchos 480 y 960 px en WebP (calidad 82) y JPEG progresivo (calidad 84). Solo estos derivados se referencian en JSON: los PNG originales no se cargan en las tarjetas.

Recortes aplicados únicamente a derivados: `nexo-005`, 150 px superiores de cielo; `nexo-006`, `nexo-009` y `nexo-010`, 155 px superiores de techo. Se conserva el ancho completo y no se estiran las imágenes. Los originales se mantienen intactos para revisión.

Los carteles de `nexo-007`, `nexo-008`, `nexo-011` y `nexo-012` permanecen: retirarlos por recorte comprometería el encuadre de vegetación/arquitectura. Requieren una versión limpia o edición externa antes de considerar cerrada la revisión visual. No se hizo reconstrucción de contenido ni retoque generativo.

Las tarjetas conservan el espacio uniforme 4:3 pero usan `object-fit: contain`: muestran el encuadre completo, con bandas discretas cuando el recurso tiene otra proporción. Esto preserva el original 3:2 de nexo-005 antes del recorte y las proporciones reales de los derivados. Inicio y catálogo muestran avisos de propiedad ficticia e imagen ilustrativa generada con IA.
