-- Additive customer profile fields populated from Google/Facebook OAuth metadata and customer-entered profile data.
begin;
alter table public.customer_profiles
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists date_of_birth date,
  add column if not exists preferred_language text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='customer_profiles_email_length' and conrelid='public.customer_profiles'::regclass) then
    alter table public.customer_profiles add constraint customer_profiles_email_length check (email is null or char_length(email) <= 320);
  end if;
  if not exists (select 1 from pg_constraint where conname='customer_profiles_avatar_url_https' and conrelid='public.customer_profiles'::regclass) then
    alter table public.customer_profiles add constraint customer_profiles_avatar_url_https check (avatar_url is null or avatar_url ~ '^https://');
  end if;
  if not exists (select 1 from pg_constraint where conname='customer_profiles_date_of_birth_range' and conrelid='public.customer_profiles'::regclass) then
    alter table public.customer_profiles add constraint customer_profiles_date_of_birth_range check (date_of_birth is null or date_of_birth between date '1900-01-01' and current_date);
  end if;
  if not exists (select 1 from pg_constraint where conname='customer_profiles_preferred_language_format' and conrelid='public.customer_profiles'::regclass) then
    alter table public.customer_profiles add constraint customer_profiles_preferred_language_format check (preferred_language is null or preferred_language ~ '^[a-z]{2}(-[A-Z]{2})?$');
  end if;
end $$;

create index if not exists customer_profiles_email_lower_idx on public.customer_profiles (lower(email)) where email is not null;
commit;
