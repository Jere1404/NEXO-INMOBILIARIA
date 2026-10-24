# NEXO Inmobiliaria

**Tu próximo hogar comienza acá.**

Proyecto de portfolio y demostración comercial para una inmobiliaria ficticia de Corrientes Capital, Argentina. La futura web ayudará a encontrar propiedades de forma sencilla mediante el recorrido **Buscar → Explorar → Conocer → Contactar**.

## Estado actual

**Etapa 2: encabezado, portada y buscador principal implementados, pendientes de revisión.** La Etapa 1 fue aprobada. El catálogo y las páginas Nosotros, Servicios y Contacto son provisionales; no muestran resultados ni contenido definitivo.

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

El buscador usa GET hacia `propiedades.html`, con `operacion=venta|alquiler`, `tipo=casa|departamento|terreno` y `zona=` (todas), `centro`, `camba-cua`, `costanera`, `camba-punta` o `molina-punta`. Ejemplo: `propiedades.html?operacion=venta&tipo=casa&zona=centro`. No se simulan resultados. No requiere JavaScript; este solo mejora el menú móvil.

Manrope se sirve localmente con licencia OFL. El hero usa un fondo CSS provisional: falta seleccionar una fotografía autorizada y optimizada. Véase [docs/RECURSOS.md](docs/RECURSOS.md).

## Alcance previsto

Inicio con buscador, catálogo de 12 propiedades ficticias, filtros, fichas individuales, consultas por WhatsApp, propiedades similares y páginas Nosotros, Servicios y Contacto. Diseño responsive y accesible, con identidad moderna, elegante, minimalista y profesional.

Los inmuebles y sus datos serán ficticios y se identificarán como demostración, aunque sus zonas pertenezcan a Corrientes Capital.

## Flujo de trabajo

El desarrollo de esta etapa se realiza exclusivamente en `feature/nexo-home-hero`. No se realizan commits, push, Pull Requests ni merges automáticos. El siguiente paso requiere aprobación explícita del responsable del proyecto.
