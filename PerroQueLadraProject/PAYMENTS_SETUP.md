# Migración de Mercado Pago a Strapi

Se recuperan boleto y evento-precio de homepage/brand (094320a), conservando la configuración actual de master. No se importan ni borran datos del VPS. Respaldar la base de datos antes del despliegue: restaurar esquemas de Git no recupera registros que ya se hayan borrado en producción.

## Configuración del backend

En el .env privado de Strapi, definir:

```dotenv
MP_ACCESS_TOKEN=<Access Token de la aplicación>
MP_WEBHOOK_SECRET=<firma secreta de Webhooks de la misma aplicación>
MP_COLLECTOR_ID=<ID de la cuenta vendedora>
MP_LIVE_MODE=false
FRONTEND_URL=https://perroqueladra.com.mx
MP_WEBHOOK_URL=https://<dominio-publico-strapi>/api/payments/webhook
```

Para producción usar credenciales productivas y MP_LIVE_MODE=true. Obtener el ID vendedor desde la cuenta de Mercado Pago o GET /users/me autenticado en el servidor con ese Access Token. No se necesita Client Secret para este checkout de cuenta propia. La aplicación no requiere una dependencia nueva: utiliza fetch de Node 20+.

En Settings > Users & Permissions > Roles > Authenticated habilitar payment.create y pedido.find/findOne, boleto.find/findOne si se consultan boletos. No habilitar payment.create para Public; además el controlador exige usuario autenticado. Los endpoints REST genéricos de escritura de pedidos y boletos están retirados, y su API GraphQL está deshabilitada: el cliente no puede modificar totales, propietarios o estados pagados. El administrador puede seguir gestionándolos desde Content Manager.

Revisar permisos de lectura de eventos, evento-precios y productos y que estén publicados. Publicar las categorías y relacionarlas con su evento. Mantener Authorization y el dominio frontend permitido en CORS. Los carritos antiguos de boletos que solo contienen texto y Total deben eliminarse y añadirse de nuevo para guardar relaciones evento/evento_precio.

Configurar en Mercado Pago > Tus integraciones > Webhooks el evento payment y la URL MP_WEBHOOK_URL. Se verifica x-signature con la clave MP_WEBHOOK_SECRET; no enviar ni publicar esa clave. La misma URL se envía al crear preferencias, sustituyendo la dirección ngrok fija anterior.

## Configuración del frontend

Conservar NEXT_PUBLIC_STRAPI_URL y NEXT_PUBLIC_MP_PUBLIC_KEY. Retirar MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET y credenciales privadas exclusivas de pagos del entorno Next.js después de la migración. Una variable de servidor de Next.js no implica por sí sola exposición al navegador; rotar si se publicó en Git, registros, respuestas o bundle.

FormularioInscripcion envía eventoId, precioId y datos del participante. BoletoSelector guarda las relaciones de evento/categoría en el carrito. Carrito solo envía shippingData; Strapi consulta el carrito de la cuenta autenticada y sus precios, crea el pedido y reserva sus folios. Los boletos comprados desde el carrito usan los datos del comprador. Para participantes con datos individuales usar el formulario de inscripción.

MP_Preference_ID guarda la preferencia; MP_Payment_ID solo guarda el pago real confirmado. La referencia externa corresponde al documentId del pedido. El webhook valida cuenta, modo, importe, moneda e identidad del pago antes de actualizar pedido/boletos. Duplicados no repiten actualizaciones; un intento rechazado no degrada un pago aprobado. La pantalla /gracias consulta el pedido autenticado; no confirma pagos a partir de status en la URL.

## Despliegue coordinado

1. Respaldar la base de datos y verificar que boletos/precios existentes sigan presentes.
2. Actualizar backend, instalar con el gestor habitual y compilar: npm ci y npm run build. Configurar las variables y reiniciar Strapi con el gestor de procesos usado en el VPS.
3. Revisar modelos, relaciones, permisos y CORS anteriores.
4. Actualizar frontend y compilar con el gestor habitual (pnpm install y pnpm build si se usa su lockfile). Reiniciar Next.js.
5. Actualizar las notificaciones en Mercado Pago y probar un pago con cuentas de prueba, validando pedido y boleto en Strapi. Confirmar un reintento del mismo webhook y un pago rechazado.

Las rutas antiguas de Next.js responden 410. Las preferencias antiguas no se migran automáticamente: tienen otra URL y totales no verificados. Conciliar pagos pendientes anteriores con Mercado Pago y actualizar su pedido/boleto desde administración antes de retirar la versión antigua. No usar este webhook nuevo para marcarlos pagados sin revisar los importes originales.

Un fallo al crear la preferencia deja el pedido pendiente y puede reservar folios; revisarlo en administración antes de repetir muchas veces. No se liberan ni reutilizan automáticamente folios. No se añadió gestión de inventario ni envío automático de correo: el lifecycle recuperado asigna folios.

## Validación local

```bash
node --test tests/payment.test.js
node tests/payment.integration.js
```

La integración usa SQLite temporal y respuestas simuladas de Mercado Pago; no hace cobros ni envía correos. Se debe completar la prueba de sandbox con las credenciales y configuración del VPS antes de habilitar cobros productivos.

Referencias: https://www.mercadopago.com.mx/developers/es/docs/your-integrations/notifications/webhooks y https://docs.strapi.io/cms/backend-customization/routes

Observación de compatibilidad: el lockfile actual mezcla versiones de paquetes Strapi. En la prueba HTTP, una solicitud sin sesión se rechaza, pero el middleware existente la presenta como 500 en vez de 403. El checkout autenticado devuelve 200; la firma inválida del webhook devuelve 401. Conviene alinear las versiones de Strapi en una actualización separada.
