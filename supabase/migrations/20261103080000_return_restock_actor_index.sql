-- Cover the restocked_by foreign key for staff/user cleanup and lookup paths.
begin;

create index if not exists order_item_return_restocks_restocked_by_idx
  on public.order_item_return_restocks(restocked_by);

commit;
