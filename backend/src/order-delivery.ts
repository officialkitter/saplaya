export type OperationalOrder = {
  contact_name?: string | null;
  contact_phone?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  delivery_address?: string | null;
  dest_lat?: number | string | null;
  dest_lng?: number | string | null;
};

export function orderDeliveryDetails(
  order: OperationalOrder | undefined,
  buyer: { name?: string | null; phone?: string | null },
  paymentContact: { name?: string | null; phone?: string | null },
  options: { mayViewBuyerContact: boolean; supplierScoped: boolean },
) {
  const fullName = order?.recipient_name || order?.contact_name || paymentContact.name || buyer.name || 'Customer';
  const deliveryAddress = typeof order?.delivery_address === 'string' && order.delivery_address.trim()
    ? order.delivery_address.trim()
    : null;
  const hasCoordinates = order?.dest_lat != null && order.dest_lng != null;

  return {
    customer_name: options.supplierScoped ? fullName.split(/\s+/)[0] : fullName,
    customer_phone: options.mayViewBuyerContact
      ? order?.recipient_phone || order?.contact_phone || paymentContact.phone || buyer.phone || ''
      : order?.recipient_phone || '',
    recipient: order?.recipient_name || order?.recipient_phone ? {
      name: order.recipient_name ?? '',
      phone: order.recipient_phone ?? '',
    } : null,
    delivery_address: deliveryAddress,
    area: deliveryAddress ?? (hasCoordinates
      ? `${Number(order.dest_lat).toFixed(4)}, ${Number(order.dest_lng).toFixed(4)}`
      : 'Delivery location'),
  };
}
