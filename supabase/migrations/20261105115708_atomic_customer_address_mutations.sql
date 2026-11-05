-- Make customer address mutations atomic and preserve exactly one default address per customer.
begin;

create or replace function public.customer_save_address(
  p_address_id uuid,
  p_label text,
  p_recipient_name text,
  p_phone text,
  p_address_line text,
  p_area text,
  p_upazila text,
  p_district text,
  p_division text,
  p_postal_code text,
  p_is_default boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_address_id uuid;
  v_label text := pg_catalog.btrim(p_label);
  v_recipient_name text := pg_catalog.btrim(p_recipient_name);
  v_phone text := pg_catalog.btrim(p_phone);
  v_address_line text := pg_catalog.btrim(p_address_line);
  v_area text := nullif(pg_catalog.btrim(p_area), '');
  v_upazila text := nullif(pg_catalog.btrim(p_upazila), '');
  v_district text := pg_catalog.btrim(p_district);
  v_division text := pg_catalog.btrim(p_division);
  v_postal_code text := nullif(pg_catalog.btrim(p_postal_code), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if v_label is null or pg_catalog.char_length(v_label) not between 1 and 40
     or v_recipient_name is null or pg_catalog.char_length(v_recipient_name) not between 2 and 100
     or v_phone is null or pg_catalog.char_length(v_phone) not between 6 and 30
     or v_address_line is null or pg_catalog.char_length(v_address_line) not between 5 and 500
     or (v_area is not null and pg_catalog.char_length(v_area) > 120)
     or (v_upazila is not null and pg_catalog.char_length(v_upazila) > 120)
     or v_district is null or pg_catalog.char_length(v_district) not between 2 and 120
     or v_division is null or pg_catalog.char_length(v_division) not between 2 and 120
     or (v_postal_code is not null and pg_catalog.char_length(v_postal_code) > 20)
  then
    raise exception using errcode = '22023', message = 'INVALID_ADDRESS_DETAILS';
  end if;

  -- Serialize all address mutations for this account to avoid concurrent
  -- default-address races and partial clear-then-save updates.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if p_is_default then
    update public.customer_addresses
       set is_default = false
     where user_id = v_user_id
       and (p_address_id is null or id <> p_address_id);
  end if;

  if p_address_id is null then
    insert into public.customer_addresses (
      user_id, label, recipient_name, phone, address_line, area, upazila,
      district, division, postal_code, is_default
    ) values (
      v_user_id, v_label, v_recipient_name, v_phone, v_address_line, v_area, v_upazila,
      v_district, v_division, v_postal_code, coalesce(p_is_default, false)
    )
    returning id into v_address_id;
  else
    update public.customer_addresses
       set label = v_label,
           recipient_name = v_recipient_name,
           phone = v_phone,
           address_line = v_address_line,
           area = v_area,
           upazila = v_upazila,
           district = v_district,
           division = v_division,
           postal_code = v_postal_code,
           is_default = coalesce(p_is_default, false)
     where id = p_address_id
       and user_id = v_user_id
    returning id into v_address_id;

    if v_address_id is null then
      raise exception using errcode = 'P0002', message = 'ADDRESS_NOT_FOUND';
    end if;
  end if;

  -- The first saved address is always the default. If a customer unchecks the
  -- current default without selecting another, keep a valid default in place.
  if not exists (
    select 1 from public.customer_addresses
     where user_id = v_user_id and is_default = true
  ) then
    update public.customer_addresses
       set is_default = true
     where id = v_address_id and user_id = v_user_id;
  end if;

  return v_address_id;
end;
$function$;

create or replace function public.customer_delete_address(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_was_default boolean;
  v_next_default_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select is_default into v_was_default
    from public.customer_addresses
   where id = p_address_id and user_id = v_user_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ADDRESS_NOT_FOUND';
  end if;

  delete from public.customer_addresses
   where id = p_address_id and user_id = v_user_id;

  if v_was_default then
    select id into v_next_default_id
      from public.customer_addresses
     where user_id = v_user_id
     order by created_at asc, id asc
     limit 1
     for update;

    if v_next_default_id is not null then
      update public.customer_addresses
         set is_default = true
       where id = v_next_default_id and user_id = v_user_id;
    end if;
  end if;
end;
$function$;

revoke all on function public.customer_save_address(uuid,text,text,text,text,text,text,text,text,text,boolean)
  from public, anon;
grant execute on function public.customer_save_address(uuid,text,text,text,text,text,text,text,text,text,boolean)
  to authenticated;
revoke all on function public.customer_delete_address(uuid) from public, anon;
grant execute on function public.customer_delete_address(uuid) to authenticated;

commit;
