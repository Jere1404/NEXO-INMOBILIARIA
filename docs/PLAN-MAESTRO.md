# NEXO Inmobiliaria — Plan maestro

## 1. Estado y propósito

**Etapa 1: planificación y documentación. Pendiente de aprobación.** Este documento define la futura versión 1.0; no implica que sus funcionalidades ya estén desarrolladas.

NEXO Inmobiliaria es una inmobiliaria ficticia ubicada en Corrientes Capital, Argentina. El sitio será un proyecto de portfolio y una demostración comercial para presentar ante un posible cliente real.

El objetivo es ayudar a las personas a encontrar la propiedad adecuada de manera sencilla, mediante una experiencia moderna, elegante, minimalista y profesional. El recorrido principal será **Buscar → Explorar → Conocer → Contactar**.

## 2. Identidad visual

| Elemento | Definición |
| --- | --- |
| Nombre | NEXO Inmobiliaria |
| Eslogan | “Tu próximo hogar comienza acá” |
| Logo | Tipográfico, con NEXO en mayúsculas |
| Color principal | `#142D4E` |
| Color secundario | `#FFFFFF` |
| Fondo alternativo | `#F3F5F7` |
| Acento | `#2878D0` |
| Tipografía | Manrope |
| Ubicación | Corrientes Capital, Argentina |

La implementación deberá mantener jerarquía tipográfica clara, espacios amplios y consistencia de colores y componentes. Los usos de color deberán comprobarse para asegurar contraste accesible. La procedencia y licencia de fuentes e imágenes se documentarán cuando se seleccionen los recursos.

## 3. Objetivos

- Facilitar la búsqueda y comparación de inmuebles mediante información clara y filtros útiles.
- Presentar fotografías, características y precios de manera comprensible.
- Facilitar consultas por WhatsApp con contexto de la propiedad elegida.
- Demostrar calidad visual, accesibilidad y adaptación a dispositivos móviles.
- Mantener una solución estática sencilla de desarrollar y publicar en GitHub Pages.

## 4. Navegación propuesta

Navegación principal: **Inicio · Propiedades · Nosotros · Servicios · Contacto**.

| Destino | Contenido y recorrido |
| --- | --- |
| Inicio | Fotografía grande de una casa moderna, eslogan y buscador integrado; conduce al catálogo |
| Propiedades | Catálogo, filtros y acceso a las fichas individuales |
| Ficha de propiedad | Fotografías, descripción, precio, características, ubicación aproximada, WhatsApp y propiedades similares |
| Nosotros | Presentación de la marca y su filosofía de acompañamiento |
| Servicios | Presentación clara de los servicios inmobiliarios de la demostración |
| Contacto | Información de contacto de demostración y acceso a consultas |

Las fichas deberán permitir regresar al catálogo. El pie de página incluirá navegación útil y el aviso de proyecto ficticio. Los textos definitivos de Nosotros, Servicios y Contacto se redactarán en una etapa posterior.

## 5. Funcionalidades de la versión 1.0

1. Inicio con imagen principal de una casa moderna y buscador integrado.
2. Catálogo de **12 propiedades ficticias: 4 casas, 5 departamentos y 3 terrenos**.
3. Filtros por operación, tipo, ubicación, precio, habitaciones, baños, superficie y comodidades. Deben poder combinarse y restablecerse, con un estado claro cuando no existan resultados.
4. Fichas individuales con fotografías, descripción, precio, características y ubicación aproximada.
5. Consultas por WhatsApp desde la ficha, con referencia a la propiedad. El destino deberá definirse antes de habilitar contactos reales; no se utilizarán números de terceros sin autorización.
6. Propiedades similares con un criterio documentado y enlaces a sus fichas.
7. Páginas Nosotros, Servicios y Contacto.
8. Diseño responsive y accesible en todas las páginas.

### Datos de demostración

Las zonas corresponderán a lugares reales de Corrientes Capital. Todos los inmuebles, precios, descripciones y demás datos serán ficticios y estarán identificados como demostración, tanto en el catálogo como en las fichas. La ubicación será aproximada, sin atribuir una oferta ficticia a una vivienda real concreta.

Se propone guardar el catálogo en JSON con identificador único, título, operación, tipo, zona, precio y moneda, habitaciones, baños, superficie y unidad, comodidades, descripción, fotografías y referencia de ubicación aproximada. Los campos no aplicables, por ejemplo habitaciones en terrenos, se tratarán explícitamente. Operaciones disponibles, monedas, rangos de filtros y nombres de zonas se definirán al preparar los datos, antes de implementar la búsqueda.

## 6. Tecnologías y límites

- HTML5 semántico para la estructura.
- CSS3 para estilos y diseño responsive.
- JavaScript vanilla para carga de datos, filtros e interacción.
- JSON para el catálogo estático.
- GitHub Pages para alojamiento.

No se utilizarán React ni frameworks complejos. La versión 1.0 no incluirá cuentas de usuario, panel administrativo, base de datos, favoritos, mapas interactivos ni inteligencia artificial. No se necesita backend para el alcance previsto.

## 7. Estructura futura propuesta

Este árbol es una propuesta: **en la etapa 1 solo se crean o actualizan README.md y docs/PLAN-MAESTRO.md**. No se crearán carpetas de implementación ni archivos vacíos para anticipar el desarrollo.

```text
NEXO-INMOBILIARIA/
├── README.md
├── docs/
│   ├── PLAN-MAESTRO.md
│   └── RECURSOS.md                # Futuras fuentes, licencias y atribuciones
├── index.html                    # Inicio
├── propiedades.html              # Catálogo
├── propiedad.html                # Ficha según identificador
├── nosotros.html
├── servicios.html
├── contacto.html
├── assets/
│   ├── css/
│   │   ├── styles.css            # Base, identidad y componentes compartidos
│   │   └── pages.css             # Estilos específicos cuando sean necesarios
│   ├── js/
│   │   ├── main.js               # Comportamiento compartido
│   │   ├── propiedades.js        # Catálogo y filtros
│   │   └── propiedad.js          # Ficha y similares
│   ├── images/
│   │   ├── branding/
│   │   ├── hero/
│   │   └── propiedades/          # Fotografías agrupadas por identificador
│   └── fonts/                    # Manrope, si se aloja localmente
└── data/
    └── propiedades.json
```

Se propone una plantilla `propiedad.html?id=…` que cargue cada ficha desde JSON, compatible con alojamiento estático. Los enlaces y recursos usarán rutas relativas compatibles con el subdirectorio del repositorio en GitHub Pages. La organización podrá ajustarse durante una etapa autorizada sin introducir complejidad innecesaria.

## 8. Criterios de finalización

### Etapa 1

- Repositorio inspeccionado y cambios previos respetados.
- Rama `feature/nexo-estructura-inicial` preparada.
- Plan maestro con identidad, objetivos, navegación, funcionalidades, tecnologías y estructura propuesta.
- README que explique el proyecto y su estado inicial.
- Solo cambios de documentación; sin HTML, CSS o JavaScript vacíos.
- Sin commits, push, Pull Requests ni merge a main automáticos.
- Entrega de resultados y espera de aprobación antes de continuar.

### Versión 1.0 futura

- Todas las páginas previstas permiten completar Buscar → Explorar → Conocer → Contactar.
- El catálogo contiene exactamente 12 propiedades con la distribución de tipos indicada, identificadores únicos y datos coherentes.
- El buscador conduce a resultados correctos y los filtros funcionan individualmente y combinados, incluyendo restablecimiento y ausencia de resultados.
- Cada ficha carga sus datos e imágenes, muestra ubicación aproximada y maneja un identificador inválido sin romper la navegación.
- WhatsApp genera una consulta con la propiedad correcta y un destino aprobado; las propiedades similares enlazan a fichas válidas.
- Se identifica de forma visible el carácter ficticio de la demostración.
- La navegación funciona con teclado, el foco es visible, los controles tienen etiquetas, las imágenes cuentan con textos alternativos adecuados y el contraste se verifica con referencia a WCAG 2.2 AA.
- El diseño se revisa en móvil, tablet y escritorio sin desbordamientos horizontales ni pérdida de contenido.
- Se comprueban rutas, recursos y carga de JSON en GitHub Pages, además de la ausencia de errores de consola durante los recorridos principales.
- Se documentan recursos, licencias, ejecución local y publicación; no se incluyen secretos ni datos personales reales.

## 9. Secuencia recomendada y autorización

El próximo paso recomendado es revisar y aprobar este plan. Después de la aprobación, se podrá definir el diseño de las páginas, preparar contenidos y recursos, concretar el esquema JSON y acordar el alcance de la siguiente etapa antes de implementarlo.

No se avanzará automáticamente a otra etapa. No se realizarán commits, push, Pull Requests ni merges a main sin autorización. El trabajo se limita al repositorio NEXO-INMOBILIARIA.
