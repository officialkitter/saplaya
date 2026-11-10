export function confirmedOrder(result: unknown): { order_id: string } {
  if (typeof result === 'object' && result !== null) {
    if ('order_id' in result && typeof result.order_id === 'string' && result.order_id.trim()) {
      return { order_id: result.order_id };
    }
    if ('status' in result && result.status === 'pending') {
      throw new Error('Payment is still processing. Retry verification before starting another payment.');
    }
  }
  throw new Error('The payment response did not contain a confirmed order. Check order tracking before retrying.');
}

export async function verifyAfterPaymentBrowser<T>(
  references: { txRef: string; orderTrackingId: string },
  openBrowser: () => Promise<unknown>,
  verify: (txRef: string, orderTrackingId: string) => Promise<T>,
): Promise<T> {
  await openBrowser();
  return verify(references.txRef, references.orderTrackingId);
}
