-- Add PayPal to the shared verified-checkout settlement path.

alter table public.checkout_payments
  drop constraint if exists checkout_payments_provider_check;
alter table public.checkout_payments
  add constraint checkout_payments_provider_check
  check (provider in ('pesapal', 'stripe', 'snippe', 'paypal'));

alter table public.orders
  drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('pesapal', 'stripe', 'snippe', 'paypal', 'cash_on_delivery'));

create or replace function public.complete_checkout_payment(
  p_transaction_ref text,
  p_provider text,
  p_gateway_transaction_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.checkout_payments%rowtype;
  v_order_id uuid;
  v_order_subtotal integer;
begin
  if p_provider not in ('pesapal', 'stripe', 'snippe', 'paypal') then
    raise exception 'Unsupported payment provider';
  end if;

  select * into v_payment
    from public.checkout_payments
    where transaction_ref = p_transaction_ref
    for update;
  if not found then raise exception 'Payment reference not found'; end if;
  if v_payment.provider is distinct from p_provider then
    raise exception 'Payment provider does not match';
  end if;
  if v_payment.gateway_transaction_id is distinct from p_gateway_transaction_id then
    raise exception 'Payment transaction ID does not match';
  end if;

  if v_payment.order_id is not null then
    return v_payment.order_id;
  end if;
  if v_payment.status <> 'pending' then raise exception 'Payment is not pending'; end if;

  v_order_id := public.place_paid_order(
    v_payment.customer_id,
    v_payment.mode,
    v_payment.items,
    v_payment.delivery_fee,
    v_payment.distance_km,
    v_payment.dest_lat,
    v_payment.dest_lng
  );
  select subtotal into v_order_subtotal from public.orders where id = v_order_id;
  if v_order_subtotal + v_payment.delivery_fee <> v_payment.amount then
    raise exception 'Paid amount does not match the order total';
  end if;

  update public.orders
    set delivery_window = v_payment.delivery_window,
        payment_method = v_payment.provider,
        contact_name = v_payment.customer_name,
        contact_email = v_payment.customer_email,
        contact_phone = v_payment.customer_phone,
        recipient_name = v_payment.recipient_name,
        recipient_phone = v_payment.recipient_phone,
        delivery_address = v_payment.delivery_address
    where id = v_order_id;
  update public.checkout_payments
    set status = 'paid', order_id = v_order_id, paid_at = now()
    where transaction_ref = p_transaction_ref;
  return v_order_id;
end;
$$;

revoke all on function public.complete_checkout_payment(text, text, text) from public, anon, authenticated;
grant execute on function public.complete_checkout_payment(text, text, text) to service_role;
