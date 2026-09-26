# PRINCIPLES.md — Principios de UI/UX

## 1. Qué es la interfaz de Kindly

Una herramienta de trabajo diario para profesionales (despachos, gestorías)
que atienden clientes por WhatsApp/Telegram. Se usa muchas horas, con
interrupciones constantes, a menudo con varias conversaciones a la vez. La
pregunta que la UI tiene que responder en todo momento es:

> **¿Quién necesita mi atención ahora, y qué puedo hacer al respecto?**

De ahí salen los principios.

## 2. Principios

1. **Operativa antes que vistosa.** Densidad de información moderada-alta,
   jerarquía por peso tipográfico y posición antes que por color, cero
   animaciones que retrasen una acción. Si una mejora estética añade un clic
   o un segundo, no entra.
2. **El contexto nunca se pierde.** Organización → módulo → página →
   contexto → contenido → acciones siempre visibles o a un vistazo (header,
   sidebar, breadcrumbs, cabecera de página). Trabajar una conversación no
   debe sacar al usuario de la lista (Sheet, ver `CHAT.md`).
3. **Un sistema, no pantallas.** Toda página se compone de las mismas piezas
   (`PageHeader`, `PageSection`, `Card`, `DataList`, `EmptyState`…) sobre
   los mismos tokens. Una pantalla "especial" es una señal de que falta una
   pieza en el sistema, no una licencia para improvisar.
4. **Estados explícitos.** Cada vista y componente define sus estados:
   vacío (inicial / sin resultados), cargando, error, deshabilitado (con
   motivo), éxito. Ninguno se deja al navegador ni al azar.
5. **Honestidad técnica en la UI.** Si una limitación del proveedor impide
   algo (ventana de 24 h de WhatsApp, "escribiendo…" del contacto que Meta no
   notifica, invitaciones sin email), la UI lo dice en el sitio donde el
   usuario lo echa en falta, con la consecuencia práctica. Es una regla
   heredada de `docs/DECISIONS.md` y no se relaja por estética.
6. **La AI es copiloto visible, nunca actor invisible.** Toda sugerencia se
   presenta como borrador revisable, con fuentes y nivel de evidencia; la
   acción de enviar siempre es humana y separada (`CLAUDE.md` §2).
7. **Accesible por construcción.** Teclado, foco, contraste, etiquetas y
   estados anunciables son parte de la API de cada componente
   (`ACCESSIBILITY.md`).
8. **Tokens como única fuente visual.** Cambiar la marca, el tema o la
   densidad es editar tokens, no componentes (`TOKENS.md`).

## 3. Criterio de decisión cuando algo no está especificado

En este orden (lo fija el encargo de rediseño, 2026-09-26):

1. Necesidades funcionales del producto.
2. Accesibilidad.
3. Consistencia con nuestro sistema de diseño.
4. Patrones establecidos en Supabase (`SUPABASE_REFERENCE.md`).
5. Reutilización de componentes.
6. Simplicidad.
7. Estética.

Y siempre: **no introducir un componente o patrón nuevo si uno existente
resuelve el problema correctamente.**

## 4. Identidad visual (propia, no la de Supabase)

Se conserva la identidad ya definida en PKG-010 (`docs/DECISIONS.md`,
2026-09-20) y se extiende a la app:

- **Tinta sobre papel frío.** Neutros azulados (tinta de documento oficial)
  sobre blanco/gris frío, nunca crema.
- **Un solo acento: verde "sello de vigente".** Es el color funcional
  primario (acciones principales, selección, foco), igual que Supabase usa
  su verde, pero con nuestro significado: lo verificado, lo que está en
  vigor.
- **Sans para la interfaz, serif para lo documental.** El serif (Literata)
  solo aparece donde el producto produce algo con peso de documento:
  borradores del copiloto, citas normativas, textos legales. La app usa
  Inter; los datos técnicos (IDs, teléfonos, URLs de webhook) usan mono.
- **Colores de estado sobrios.** Evidencia (`SUFFICIENT` / `PARTIAL` /
  `INSUFFICIENT`), estado de canal y entrega tienen tokens propios,
  documentales, no un semáforo saturado.

## 5. Voz y copy de la interfaz

Adaptado de la guía de copywriting de Supabase a español y a nuestro usuario
(profesional no técnico):

- **Verbos concretos en botones**: "Invitar miembro", "Desconectar canal",
  "Marcar como identificado". Nunca "Aceptar", "Enviar" a secas cuando hay
  ambigüedad, ni "Submit".
- **El botón de confirmación repite la acción del título**: diálogo
  "Revocar invitación" → botón "Revocar invitación".
- **Errores: qué pasó + cómo se arregla**, sin disculpas ni culpas:
  "No se pudo conectar el canal: el token ha caducado. Vuelve a autorizar la
  cuenta." Nada de "Ups, algo ha ido mal".
- **Éxitos breves y concretos**: "Invitación revocada", "Cambios guardados".
- **Cargas que describen la acción**: "Enviando…", "Conectando canal…",
  nunca "Cargando…" genérico si se sabe qué ocurre.
- **Estados vacíos: qué falta + cómo añadirlo**: "Todavía no hay contactos.
  Crea el primero o espera a que escriba alguien."
- **Confirmaciones que dicen la consecuencia**: "¿Desconectar WhatsApp?
  Dejarán de sincronizarse los mensajes de este número."
- **Capitalización tipo frase** en todo (botones, títulos, secciones),
  incluidos los nombres de módulo de la navegación.
- **Sin marketing dentro de la app** ("fácilmente", "potente").
- **Terminología de dominio consistente**: en la UI se usa el término
  español (Contactos, Casos, Tareas, Miembros, Organización, Canales); los
  nombres del modelo (`Contact`, `Case`) quedan en código. **Excepción:
  "Inbox"** se mantiene como nombre propio del módulo, porque es como lo
  llama el propio usuario. La migración de los textos que hoy están en
  inglés ("Contacts", "Cases", "Tasks") se hace en la Fase 4 **junto con
  sus E2E**.
