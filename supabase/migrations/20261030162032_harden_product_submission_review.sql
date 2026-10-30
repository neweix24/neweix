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
  submission public.product_submissions%rowtype;
  product_id uuid;
  payload jsonb;
  normalized_note text;
begin
  if p_submission_id is null or p_reviewer_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_REVIEW_DECISION';
  end if;

  normalized_note := nullif(pg_catalog.btrim(coalesce(p_review_note, '')), '');
  if normalized_note is not null and pg_catalog.length(normalized_note) > 1000 then
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
    into submission
    from public.product_submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  if submission.status <> 'pending' then
    raise exception 'SUBMISSION_ALREADY_REVIEWED';
  end if;

  if p_decision = 'approved' then
    payload := submission.product_data;

    insert into public.products (
      name, slug, description, price, compare_at_price, image_urls,
      stock, category_id, video_url, variants, sku, is_active,
      is_featured, weight_grams, low_stock_threshold
    )
    values (
      payload->>'name',
      payload->>'slug',
      nullif(payload->>'description', ''),
      (payload->>'price')::numeric,
      nullif(payload->>'compare_at_price', '')::numeric,
      coalesce(
        array(select pg_catalog.jsonb_array_elements_text(coalesce(payload->'image_urls', '[]'::jsonb))),
        '{}'::text[]
      ),
      coalesce((payload->>'stock')::integer, 0),
      nullif(payload->>'category_id', '')::uuid,
      nullif(payload->>'video_url', ''),
      coalesce(payload->'variants', '[]'::jsonb),
      nullif(payload->>'sku', ''),
      coalesce((payload->>'is_active')::boolean, false),
      coalesce((payload->>'is_featured')::boolean, false),
      coalesce((payload->>'weight_grams')::integer, 500),
      coalesce((payload->>'low_stock_threshold')::integer, 5)
    )
    returning id into product_id;
  end if;

  update public.product_submissions
     set status = p_decision,
         review_note = normalized_note,
         reviewed_by = p_reviewer_id,
         reviewed_at = pg_catalog.now(),
         created_product_id = product_id,
         updated_at = pg_catalog.now()
   where id = p_submission_id;

  insert into public.audit_logs (
    actor_id, action, target_type, target_id, details
  )
  values (
    p_reviewer_id,
    case when p_decision = 'approved'
      then 'product_submission.approved'
      else 'product_submission.rejected'
    end,
    'product_submission',
    p_submission_id::text,
    pg_catalog.jsonb_build_object(
      'decision', p_decision,
      'created_product_id', product_id,
      'review_note', normalized_note
    )
  );

  return pg_catalog.jsonb_build_object(
    'submission_id', p_submission_id,
    'status', p_decision,
    'product_id', product_id
  );
end;
$function$;

revoke all on function public.review_product_submission(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_product_submission(uuid, uuid, text, text)
  to service_role;
