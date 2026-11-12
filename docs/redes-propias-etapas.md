# Redes propias y vinculaciones entre campañas

## Etapa 1 — Titularidad (implementada parcialmente)
- API `GET /api/redes-propias`: lista referencias de redes registradas del cliente autenticado.
- API `POST /api/redes-propias` con `{"campanaId":"..."}`: registra una referencia de propiedad para una campaña existente del cliente autenticado.
- Requiere token Firebase `Authorization: Bearer <ID_TOKEN>`, usuario activo `cliente_admin`, cliente existente y plan activo.
- Documento `redesPropias/{clienteId}__{campanaId}`: `propietarioUid`, `clienteOrigenId`, `campanaOrigenId`, `rutaDatos`, `version`, `estado: origen_sin_migrar`, `accesoCompartido: false`.
- Operación idempotente mediante transacción; no reemplaza propietario existente. **No se ejecuta automáticamente**, ni mueve datos, ni crea invitaciones.
- En esta etapa `redesPropias` es metadato de propiedad, **no** fuente de autorización para leer Firestore. Las reglas actuales permanecen vigentes.
- La API solo contempla clientes administradores. Las redes de líderes `red_usuario` requieren resolver primero propiedad, pertenencia y promoción comercial sin perder el nodo original.

## Etapa 2 — Invitaciones (pendiente)
- Crear invitaciones con identificador aleatorio, caducidad, estado, destinatario autenticado y campaña de origen verificada en servidor.
- WhatsApp comparte un enlace a la aplicación; **nunca** un token de Firebase ni datos personales.
- Aceptación explícita y transacción que impida dos vinculaciones activas de la misma categoría electoral.
- Categorías electorales definidas por corporación, incluyendo alcaldía, gobernación, presidencia, senado, cámara, etc.; no mezclar municipio/departamento con tipo de elección.

## Etapa 3 — Acceso, desvinculación y ficha sombra (pendiente)
- La red es propiedad del usuario; el candidato recibe acceso temporal a datos completos solo durante una vinculación activa.
- Las consultas de red compartida deben verificarse en servidor contra propietario, destinatario, campaña, estado y alcance.
- Al desvincular: revocar acceso antes de actualizar vistas y agregados; recalcular indicadores de campaña; conservar una ficha sombra sin información personal ni acceso a descendientes.
- Revisar exportaciones, cachés, enlaces públicos, archivos descargados y copias: la revocación de acceso futuro no elimina copias ya descargadas.
- Requerir consentimiento informado y controles de protección de datos personales, especialmente por tratarse de información relacionada con actividad política.

## Etapa 4 — Planes comerciales y promoción (pendiente)
- Solicitud de plan a Master, aprobación y creación de cliente propio.
- Migración verificable, reversible y auditada de la red del líder, sin borrado de usuarios ni alteración silenciosa de campañas existentes.
- Pruebas de permisos y regresión antes de habilitar el flujo para usuarios.

## Compatibilidad
El sistema actual sigue leyendo `clientes/{clienteId}/campanas/{campanaId}/nodos` y sus subcolecciones. No se modifica la interfaz de `/mired` ni el dashboard en esta etapa. La futura migración necesita plan de respaldo y pruebas con cuentas reales de diferentes roles.
