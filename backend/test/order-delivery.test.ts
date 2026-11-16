import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { orderDeliveryDetails } from '../src/order-delivery.js';

test('operational order projection prefers the recipient and delivery address without exposing buyer phone', () => {
  assert.deepEqual(orderDeliveryDetails({
    contact_name: 'Buyer Name',
    contact_phone: '+255700000000',
    recipient_name: 'Recipient Name',
    recipient_phone: '+12025550123',
    delivery_address: '  12 Example Road  ',
    dest_lat: -6.16,
    dest_lng: 35.75,
  }, {
    name: 'Authenticated Buyer',
    phone: '+255711111111',
  }, {
    name: 'Pending Payment Buyer',
    phone: '+255722222222',
  }, {
    mayViewBuyerContact: false,
    supplierScoped: true,
  }), {
    customer_name: 'Recipient',
    customer_phone: '+12025550123',
    recipient: { name: 'Recipient Name', phone: '+12025550123' },
    delivery_address: '12 Example Road',
    area: '12 Example Road',
  });
});

test('order projection retains buyer contact fallback only for authorized views', () => {
  const order = orderDeliveryDetails({
    contact_name: 'Buyer Name',
    contact_phone: '+255700000000',
    dest_lat: -6.16,
    dest_lng: 35.75,
  }, { name: 'Profile Name', phone: '+255711111111' }, {}, {
    mayViewBuyerContact: false,
    supplierScoped: true,
  });
  assert.equal(order.customer_name, 'Buyer');
  assert.equal(order.customer_phone, '');
  assert.equal(order.area, '-6.1600, 35.7500');
  assert.equal(order.delivery_address, null);
});
