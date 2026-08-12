# Sistema visual del frontend React

## Principios

La interfaz se llama provisionalmente **Inventario** y sirve a cualquier tipo
de negocio. Evita iconografía, lenguaje y referencias visuales específicas de
una industria. La prioridad es que el estado de sesión, negocio y permisos
sea comprensible antes de habilitar módulos operativos.

## Fundamentos

- Fondo gris muy claro (`--color-page`) y superficies blancas.
- Índigo oscuro como color principal; verde para éxito, ámbar para advertencia
  y rojo para errores o acciones peligrosas.
- Tipografía del sistema para rendimiento y legibilidad.
- Espaciado de 4, 8, 12, 16, 24, 32 y 48 px mediante variables CSS.
- Bordes suaves, radios de 8–16 px y sombras discretas.

## Estados y accesibilidad

- Carga con indicador textual y animación no esencial.
- Errores legibles con `role="alert"`; no se muestran detalles técnicos.
- Estados vacíos explican el siguiente paso disponible.
- Controles deshabilitados reducen opacidad y mantienen semántica nativa.
- Todos los controles tienen etiqueta; el foco visible usa un anillo índigo.
- El layout es adaptable: barra lateral en escritorio y navegación desplegable
  en móvil. Se conservan encabezados y regiones semánticas.

## Componentes base

`Button`, `Input`, `Select`, `Card`, `Alert`, `Spinner`, `EmptyState` y
`PageHeader` reutilizan las variables del sistema y exponen etiquetas,
mensajes de error o estados deshabilitados cuando aplica.
