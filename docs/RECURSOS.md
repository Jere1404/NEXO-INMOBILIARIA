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
