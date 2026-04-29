module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    // 1. Extraer ID del evento
    let eventId;
    if (data.evento?.set?.[0]) {
      eventId = data.evento.set[0].documentId || data.evento.set[0].id;
    } else {
      eventId = data.evento?.documentId || data.evento?.id || data.evento;
    }

    if (!eventId) return;

    try {
      // 2. Obtener límites del evento
      const eventos = await strapi.documents('api::evento.evento').findMany({
        filters: {
          $or: [{ documentId: eventId }, { id: eventId }]
        },
        fields: ['FolioMin', 'FolioMax'],
        limit: 1
      });

      const eventoAsociado = eventos[0];
      if (!eventoAsociado) return;

      const fMin = Number(eventoAsociado.FolioMin) || 1;
      const fMax = Number(eventoAsociado.FolioMax) || 999999;

      // 3. CAMBIO CLAVE: Buscar el folio más alto sin importar el estado
      // Usamos strapi.db.query para saltarnos las restricciones de publicación de Strapi 5
      const ultimoBoleto = await strapi.db.query('api::boleto.boleto').findOne({
        select: ['folio'],
        where: {
          evento: {
            $or: [
              { documentId: eventId },
              { id: eventId }
            ]
          },
          folio: { $notNull: true }
        },
        orderBy: { folio: 'desc' },
      });

      let nuevoFolio;

      if (ultimoBoleto && ultimoBoleto.folio) {
        // Si existe un folio previo, sumamos 1
        nuevoFolio = Number(ultimoBoleto.folio) + 1;
        
        // Si por error el folio actual es menor al mínimo, lo nivelamos
        if (nuevoFolio < fMin) {
          nuevoFolio = fMin;
        }
      } else {
        // Si es el primer registro, usamos el mínimo
        nuevoFolio = fMin;
      }

      // 4. Validar límite máximo
      if (nuevoFolio > fMax) {
        throw new Error("LIMITE_ALCANZADO: No hay más folios.");
      }

      // 5. Asignar el folio
      data.folio = nuevoFolio;
      console.log(`🚀 Sincronización exitosa: Evento ${eventId} -> Nuevo Folio: ${nuevoFolio}`);

    } catch (err) {
      console.error("❌ Error en Hook Folio:", err.message);
      throw err;
    }
  },
};