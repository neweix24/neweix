-- Keep customer consent entries aligned with the consent controls actually shown in the account UI.
-- Existing historical consent rows remain unchanged and readable by their owner.
begin;

alter policy customer_consents_insert_own
on public.customer_consents
to authenticated
with check (
  (select auth.uid()) = user_id
  and consent_type in ('marketing_email', 'marketing_sms')
  and source = 'account_privacy_settings'
);

commit;
