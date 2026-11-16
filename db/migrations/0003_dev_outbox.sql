-- Staging and local only: holds verification / reset links when no email provider is configured
-- (DEV_OUTBOX=true). Never written in production.
create table dev_outbox (
  id bigint generated always as identity primary key,
  email text not null,
  kind text not null,
  url text not null,
  created_at timestamptz not null default now()
);
create index dev_outbox_email_idx on dev_outbox(email, created_at desc);
