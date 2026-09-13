'use strict';
module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    // Strapi republishes documents by creating a row; preserve its reserved folio.
    if (Number.isSafeInteger(data.folio) && data.folio > 0) return;
    const relation = data.evento?.connect?.[0] || data.evento?.set?.[0] || data.evento;
    const value = relation?.documentId || relation?.id || relation;
    if (!value) throw new Error('El boleto requiere un evento');
    const filter = /^\d+$/.test(String(value)) ? { id: Number(value) } : { documentId: String(value) };
    const associated = await strapi.db.query('api::evento.evento').findOne({ where: filter });
    if (!associated) throw new Error('Evento inexistente');
    // Payment service holds the event lock while reserving all tickets in a transaction.
    const last = await strapi.db.query('api::boleto.boleto').findOne({
      select: ['folio'], where: { evento: { documentId: associated.documentId }, folio: { $notNull: true } },
      orderBy: { folio: 'desc' },
    });
    const minimum = Number(associated.FolioMin) || 1;
    const maximum = Number(associated.FolioMax) || 999999;
    const next = Math.max(minimum, Number(last?.folio || 0) + 1);
    if (next > maximum) throw new Error('No hay más folios disponibles');
    data.folio = next;
  },
};
