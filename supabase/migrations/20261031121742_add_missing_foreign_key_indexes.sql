create index if not exists eixpay_order_reward_queue_user_id_idx
  on private.eixpay_order_reward_queue (user_id);

create index if not exists eixpay_product_reviews_decided_by_idx
  on private.eixpay_product_reviews (decided_by);

create index if not exists eixpay_product_reviews_order_id_idx
  on private.eixpay_product_reviews (order_id);

create index if not exists eixverse_campaigns_created_by_idx
  on private.eixverse_campaigns (created_by);

create index if not exists eixverse_campaigns_updated_by_idx
  on private.eixverse_campaigns (updated_by);

create index if not exists eixverse_mission_claims_campaign_id_idx
  on private.eixverse_mission_claims (campaign_id);

create index if not exists neweix_plus_memberships_tier_code_idx
  on private.neweix_plus_memberships (tier_code);
