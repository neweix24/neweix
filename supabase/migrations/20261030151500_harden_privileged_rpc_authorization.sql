-- Defense-in-depth authorization for privileged order and submission RPCs.
-- These functions are called by authenticated server routes using service_role.
-- Keep the database-side actor check so an internal caller cannot spoof an arbitrary actor.

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_status text;
begin
  if p_order_id is null or p_actor_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  if p_new_status is null or p_new_status not in (
    'pending', 'confirmed', 'processing', 'packed',
    'shipped', 'delivered', 'cancelled', 'returned'
  ) then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  if not exists (
    select 1
      from public.staff_profiles sp
     where sp.user_id = p_actor_id
       and sp.role in ('supreme', 'admin')
       and sp.is_active = true
  ) then
    raise exception 'ACTOR_NOT_AUTHORIZED';
  end if;

  select status
    into v_old_status
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_old_status = p_new_status then
    return pg_catalog.jsonb_build_object(
      'order_id', p_order_id,
      'old_status', v_old_status,
      'new_status', p_new_status,
      'changed', false
    );
  end if;

  update public.orders
     set status = p_new_status,
         updated_at = pg_catalog.now()
   where id = p_order_id;

  insert into public.audit_logs (
    actor_id, action, target_type, target_id, details
  ) values (
    p_actor_id,
    'admin_order_status_updated',
    'order',
    p_order_id::text,
    pg_catalog.jsonb_build_object(
      'old_status', v_old_status,
      'new_status', p_new_status
    )
  );

  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'changed', true
  );
end;
$function$;

revoke all on function public.admin_update_order_status(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_update_order_status(uuid, text, uuid)
  to service_role;

create or replace function public.review_product_submission(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_submission public.product_submissions%rowtype;
  v_product_id uuid;
  v_payload jsonb;
begin
  if p_submission_id is null or p_reviewer_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_REVIEW_DECISION';
  end if;

  if p_review_note is not null and pg_catalog.length(p_review_note) > 1000 then
    raise exception 'REVIEW_NOTE_TOO_LONG';
  end if;

  if not exists (
    select 1
      from public.staff_profiles sp
     where sp.user_id = p_reviewer_id
       and sp.role in ('supreme', 'admin')
       and sp.is_active = true
  ) then
    raise exception 'REVIEWER_NOT_AUTHORIZED';
  end if;

  select *
    into v_submission
    from public.product_submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  if v_submission.status <> 'pending' then
    raise exception 'SUBMISSION_ALREADY_REVIEWED';
  end if;

  if p_decision = 'approved' then
    v_payload := v_submission.product_data;

    insert into public.products (
      name, slug, description, price, compare_at_price, image_urls,
      stock, category_id, video_url, variants, sku, is_active,
      is_featured, weight_grams, low_stock_threshold
    )
    values (
      v_payload->>'name',
      v_payload->>'slug',
      nullif(v_payload->>'description', ''),
      (v_payload->>'price')::numeric,
      nullif(v_payload->>'compare_at_price', '')::numeric,
      coalesce(
        array(
          select jsonb_array_elements_text(
            coalesce(v_payload->'image_urls', '[]'::jsonb)
          )
        ),
        '{}'::text[]
      ),
      coalesce((v_payload->>'stock')::integer, 0),
      nullif(v_payload->>'category_id', '')::uuid,
      nullif(v_payload->>'video_url', ''),
      coalesce(v_payload->'variants', '[]'::jsonb),
      nullif(v_payload->>'sku', ''),
      coalesce((v_payload->>'is_active')::boolean, false),
      coalesce((v_payload->>'is_featured')::boolean, false),
      coalesce((v_payload->>'weight_grams')::integer, 500),
      coalesce((v_payload->>'low_stock_threshold')::integer, 5)
    )
    returning id into v_product_id;
  end if;

  update public.product_submissions
     set status = p_decision,
         review_note = nullif(pg_catalog.btrim(coalesce(p_review_note, '')), ''),
         reviewed_by = p_reviewer_id,
         reviewed_at = pg_catalog.now(),
         created_product_id = v_product_id,
         updated_at = pg_catalog.now()
   where id = p_submission_id;

  insert into public.audit_logs (
    actor_id, action, target_type, target_id, details
  ) values (
    p_reviewer_id,
    case when p_decision = 'approved'
      then 'product_submission.approved'
      else 'product_submission.rejected'
    end,
    'product_submission',
    p_submission_id::text,
    pg_catalog.jsonb_build_object(
      'decision', p_decision,
      'product_id', v_product_id,
      'review_note', nullif(pg_catalog.btrim(coalesce(p_review_note, '')), '')
    )
  );

  return pg_catalog.jsonb_build_object(
    'submission_id', p_submission_id,
    'status', p_decision,
    'product_id', v_product_id
  );
end;
$function$;

revoke all on function public.review_product_submission(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_product_submission(uuid, uuid, text, text)
  to service_role;
