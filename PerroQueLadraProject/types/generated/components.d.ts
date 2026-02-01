import type { Schema, Struct } from '@strapi/strapi';

export interface OrdenItemPedido extends Struct.ComponentSchema {
  collectionName: 'components_orden_item_pedidos';
  info: {
    displayName: 'item_pedido';
    icon: 'clock';
  };
  attributes: {
    cantidad: Schema.Attribute.Integer;
    Precio_Unitario: Schema.Attribute.Decimal;
    Producto_Nombre: Schema.Attribute.String;
    Subtotal: Schema.Attribute.Decimal;
    Variante: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'orden.item-pedido': OrdenItemPedido;
    }
  }
}
