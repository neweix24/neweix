-- NEWEIX public identity IDs.
-- Staff (admin/manager/employee): eix:e + 12 lowercase alphanumeric characters.
-- Customer accounts: eix:a + 12 lowercase alphanumeric characters.
-- Supreme: supreme.
-- Internal auth.users UUIDs remain unchanged and continue to be used for relations.

begin;

alter table public.customer_profiles
  add column if not exists public_id text;

alter table public.staff_profiles
  add column if not exists public_id text;

create or replace function public.neweix_generate_public_id(p_prefix text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bytes bytea;
  v_suffix text;
  v_candidate text;
  i integer;
  v_exists boolean;
begin
  if p_prefix not in ('eix:a', 'eix:e') then
    raise exception 'Unsupported NEWEIX public ID prefix';
  end if;

  loop
    v_bytes := public.gen_random_bytes(12);
    v_suffix := '';

    for i in 0..11 loop
      v_suffix := v_suffix ||
        pg_catalog.substr(
          '0123456789abcdefghijklmnopqrstuvwxyz',
          (pg_catalog.get_byte(v_bytes, i) % 36) + 1,
          1
        );
    end loop;

    v_candidate := p_prefix || v_suffix;

    if p_prefix = 'eix:a' then
      select exists (
        select 1 from public.customer_profiles cp
        where cp.public_id = v_candidate
      ) into v_exists;
    else
      select exists (
        select 1 from public.staff_profiles sp
        where sp.public_id = v_candidate
      ) into v_exists;
    end if;

    if not v_exists then
      return v_candidate;
    end if;
  end loop;
end;
$$;

-- Backfill all existing customer accounts and staff accounts.
update public.customer_profiles
set public_id = public.neweix_generate_public_id('eix:a')
where public_id is null or btrim(public_id) = '';

update public.staff_profiles
set public_id = case
  when role = 'supreme' then 'supreme'
  else public.neweix_generate_public_id('eix:e')
end
where public_id is null or btrim(public_id) = '';

alter table public.customer_profiles
  alter column public_id set not null;

alter table public.staff_profiles
  alter column public_id set not null;

create unique index if not exists customer_profiles_public_id_uidx
  on public.customer_profiles (public_id);

create unique index if not exists staff_profiles_public_id_uidx
  on public.staff_profiles (public_id);

-- There can be only one Supreme position/account.
create unique index if not exists staff_profiles_single_supreme_uidx
  on public.staff_profiles (role)
  where role = 'supreme';

create or replace function public.neweix_customer_public_id_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.public_id is null or btrim(new.public_id) = '' then
      new.public_id := public.neweix_generate_public_id('eix:a');
    elsif new.public_id !~ '^eix:a[a-z0-9]{12}$' then
      raise exception 'Invalid NEWEIX customer public ID format';
    end if;
  elsif new.public_id is distinct from old.public_id then
    raise exception 'NEWEIX public IDs are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.neweix_staff_public_id_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'supreme' then
      if new.public_id is null or btrim(new.public_id) = '' then
        new.public_id := 'supreme';
      elsif new.public_id <> 'supreme' then
        raise exception 'Supreme public ID must be supreme';
      end if;
    else
      if new.public_id is null or btrim(new.public_id) = '' then
        new.public_id := public.neweix_generate_public_id('eix:e');
      elsif new.public_id !~ '^eix:e[a-z0-9]{12}$' then
        raise exception 'Invalid NEWEIX staff public ID format';
      end if;
    end if;
  elsif new.public_id is distinct from old.public_id then
    raise exception 'NEWEIX public IDs are immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists customer_profiles_public_id_guard
  on public.customer_profiles;
create trigger customer_profiles_public_id_guard
before insert or update of public_id on public.customer_profiles
for each row execute function public.neweix_customer_public_id_guard();

drop trigger if exists staff_profiles_public_id_guard
  on public.staff_profiles;
create trigger staff_profiles_public_id_guard
before insert or update of public_id on public.staff_profiles
for each row execute function public.neweix_staff_public_id_guard();

comment on column public.customer_profiles.public_id is
  'Public NEWEIX account ID: eix:a followed by 12 random lowercase alphanumeric characters. Immutable.';
comment on column public.staff_profiles.public_id is
  'Public NEWEIX staff ID: eix:e followed by 12 random lowercase alphanumeric characters; Supreme uses supreme. Immutable.';

revoke all on function public.neweix_generate_public_id(text) from public, anon, authenticated;
revoke all on function public.neweix_customer_public_id_guard() from public, anon, authenticated;
revoke all on function public.neweix_staff_public_id_guard() from public, anon, authenticated;

commit;
