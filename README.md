# NEXO Inmobiliaria

**Tu próximo hogar comienza acá.**

Proyecto de portfolio y demostración comercial para una inmobiliaria ficticia de Corrientes Capital, Argentina. La futura web ayudará a encontrar propiedades de forma sencilla mediante el recorrido **Buscar → Explorar → Conocer → Contactar**.

## Estado actual

**Etapa 3A: catálogo visual implementado, pendiente de revisión.** El inicio conserva sus seis destacadas. El catálogo muestra 12 propiedades ficticias con contador y tarjetas responsive. Los parámetros de búsqueda se leen, pero todavía no filtran resultados; se informa explícitamente que se muestra el catálogo completo. Nosotros, Servicios y Contacto siguen siendo páginas provisionales.

El alcance, la identidad visual, la navegación, la estructura de archivos propuesta y los criterios de finalización están en [docs/PLAN-MAESTRO.md](docs/PLAN-MAESTRO.md).

## Tecnologías previstas

- HTML5, CSS3, JavaScript vanilla y JSON.
- Publicación futura en GitHub Pages.
- Sin frameworks complejos, backend ni base de datos en la versión 1.0.

No se requieren dependencias de aplicación ni credenciales. Para revisar el sitio con un servidor estático, desde la raíz del repositorio:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Abrir el servidor en un navegador local. Detenerlo con `Ctrl+C`. En GitHub Pages, servir la raíz del repositorio; todos los recursos y enlaces usan rutas relativas, compatibles con su subdirectorio. La publicación todavía no forma parte de esta entrega.

El buscador usa GET hacia `propiedades.html`, con `operacion=venta|alquiler`, `tipo=casa|departamento|terreno` y `zona=` (todas), `centro`, `camba-cua`, `costanera`, `camba-punta` o `molina-punta`. Ejemplo: `propiedades.html?operacion=venta&tipo=casa&zona=centro`. Los parámetros se reciben y se describen en el catálogo, sin aplicar filtros en esta etapa. El buscador no requiere JavaScript. JavaScript mejora el menú móvil y carga las tarjetas del inicio y del catálogo desde JSON; si se desactiva o falla la carga, se muestra un aviso y los enlaces por categoría siguen disponibles.

Manrope se sirve localmente con licencia OFL. El hero usa un fondo CSS provisional: falta seleccionar una fotografía autorizada y optimizada. Véase [docs/RECURSOS.md](docs/RECURSOS.md).

## Alcance previsto

Inicio con buscador, catálogo de 12 propiedades ficticias, filtros, fichas individuales, consultas por WhatsApp, propiedades similares y páginas Nosotros, Servicios y Contacto. Diseño responsive y accesible, con identidad moderna, elegante, minimalista y profesional.

Los inmuebles y sus datos serán ficticios y se identificarán como demostración, aunque sus zonas pertenezcan a Corrientes Capital.

## Flujo de trabajo

El desarrollo de esta etapa se realiza exclusivamente en `feature/nexo-catalogo`. No se realizan commits, push, Pull Requests ni merges automáticos. El siguiente paso requiere aprobación explícita del responsable del proyecto.

## Datos del catálogo

`data/propiedades.json` contiene exactamente 12 registros ficticios: cuatro casas, cinco departamentos y tres terrenos. Los seis identificadores iniciales y sus datos previos se conservan. Solo esos seis registros tienen `destacada: true`.

Cada registro usa `id`, `titulo`, `tipo`, `operacion`, `zona` (valor de URL), `ubicacion` (nombre visible de la zona), `ciudad`, `precio`, `moneda` (`ARS` o `USD`), `superficie`, `unidadSuperficie`, `habitaciones`, `banos`, `comodidades`, `descripcion`, `ubicacionAproximada`, `destacada`, `ficticia`, `imagen` y `fotografias`.

- Los tipos son `casa`, `departamento` y `terreno`; operaciones y zonas mantienen los valores del buscador.
- `comodidades` usa identificadores estables: `patio`, `jardin`, `cochera`, `parrilla`, `balcon`, `ascensor` y `acceso-vehicular`.
- Habitaciones y baños son `null` en terrenos. Los alquileres se expresan por mes y la superficie total en m².
- `ubicacionAproximada` es una referencia barrial textual, sin direcciones exactas, coordenadas de viviendas ni mapas.
- No hay fotografías autorizadas: `imagen: null` y `fotografias: []`. No se atribuyen licencias supuestas. El catálogo muestra placeholders identificados como “Fotografía pendiente”.

`assets/js/property-cards.js` comparte carga, validación básica y representación de tarjetas entre `home.js` y `propiedades.js`, mediante módulos nativos. Las tarjetas son informativas, sin botones ni enlaces a fichas individuales. No se implementan filtros, ordenamiento ni otras funcionalidades de etapas posteriores.

`propiedades.js` lee `operacion`, `tipo` y `zona` mediante `URLSearchParams`. Muestra los valores reconocidos como etiquetas; los desconocidos se indican sin interpretarlos como HTML. Ningún parámetro modifica los resultados. Un parámetro repetido se lee por su primera aparición. La URL permanece intacta para la siguiente etapa.

La carga necesita HTTP: abrir el HTML mediante `file://` puede impedir módulos y JSON. Con JavaScript desactivado se presenta un aviso; si falla la petición, el JSON es inválido o los datos básicos no son válidos, se muestra un error sin anunciar un contador exitoso. Todos los enlaces y recursos usan rutas relativas compatibles con GitHub Pages.
