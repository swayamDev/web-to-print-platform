-- The exact artwork (DesignDocument JSON) the customer paid for, frozen at checkout.
-- The saved design can keep changing afterwards; proofs and print files start from this copy.
alter table public.order_items
  add column design_snapshot jsonb,
  add constraint order_items_design_snapshot_is_object
    check (design_snapshot is null or jsonb_typeof(design_snapshot) = 'object');

comment on column public.order_items.design_snapshot is
  'DesignDocument at checkout time. Proof v1 is generated from this, not from the live design.';
