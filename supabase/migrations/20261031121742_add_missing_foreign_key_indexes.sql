-- This version was applied to production after the EixPay/EixVerse schema
-- existed. Fresh test databases may reach this timestamp before the later
-- campaign migrations, so create each index only when its source table exists.
do $$
begin
  if to_regclass('private.eixpay_order_reward_queue') is not null then
    execute 'create index if not exists eixpay_order_reward_queue_user_id_idx on private.eixpay_order_reward_queue (user_id)';
  end if;
  if to_regclass('private.eixpay_product_reviews') is not null then
    execute 'create index if not exists eixpay_product_reviews_decided_by_idx on private.eixpay_product_reviews (decided_by)';
    execute 'create index if not exists eixpay_product_reviews_order_id_idx on private.eixpay_product_reviews (order_id)';
  end if;
  if to_regclass('private.eixverse_campaigns') is not null then
    execute 'create index if not exists eixverse_campaigns_created_by_idx on private.eixverse_campaigns (created_by)';
    execute 'create index if not exists eixverse_campaigns_updated_by_idx on private.eixverse_campaigns (updated_by)';
  end if;
  if to_regclass('private.eixverse_mission_claims') is not null then
    execute 'create index if not exists eixverse_mission_claims_campaign_id_idx on private.eixverse_mission_claims (campaign_id)';
  end if;
  if to_regclass('private.neweix_plus_memberships') is not null then
    execute 'create index if not exists neweix_plus_memberships_tier_code_idx on private.neweix_plus_memberships (tier_code)';
  end if;
end
$$;
