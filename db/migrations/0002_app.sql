-- AETHER application schema. Every workspace-owned row carries workspace_id (directly or through its project)
-- and is only reachable through API guards that check membership and role.

create type member_role as enum ('owner', 'admin', 'editor', 'viewer');
create type core_stage as enum ('spark', 'drop', 'form', 'lattice', 'orbit', 'universe');

-- ---------- users and workspaces ----------
create table user_preferences (
  user_id text primary key references "user"(id) on delete cascade,
  last_workspace_id uuid,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on workspace_members(user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by text not null references "user"(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_workspace_idx on invitations(workspace_id);

-- ---------- design system ----------
create table design_systems (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  tokens jsonb not null default '{}',       -- colour palettes, typography, spacing, radius
  components jsonb not null default '[]',
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);
create index design_systems_workspace_idx on design_systems(workspace_id);

-- ---------- projects ----------
create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,48}$'),
  name text not null check (char_length(name) between 1 and 120),
  client text not null default '',
  description text not null default '',
  category text not null default 'site',
  health text not null default 'On track' check (health in ('On track', 'In review', 'At risk')),
  stage core_stage not null default 'form',
  outputs text[] not null default '{site}',
  due date,
  progress real not null default 0 check (progress between 0 and 1),
  doc jsonb not null,              -- design configuration
  motion jsonb not null,           -- motion tracks
  space jsonb not null,            -- 3D / material settings
  settings jsonb not null default '{}',
  direction jsonb,                 -- the creative direction the project was created from
  design_system_id uuid references design_systems(id) on delete set null,
  revision integer not null default 1,   -- optimistic concurrency for saves
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, slug)
);
create index projects_workspace_idx on projects(workspace_id, updated_at desc) where deleted_at is null;

create table project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number integer not null,
  kind text not null check (kind in ('create', 'edit', 'muse', 'restore', 'publish', 'duplicate')),
  label text not null,
  snapshot jsonb not null,         -- { name, description, stage, doc, motion, space }
  restored_from uuid references project_versions(id) on delete set null,
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);

-- ---------- collaboration ----------
create table comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id text not null references "user"(id),
  body text not null check (char_length(body) between 1 and 2000),
  target text not null,
  resolved_at timestamptz,
  resolved_by text references "user"(id),
  created_at timestamptz not null default now()
);
create index comments_project_idx on comments(project_id, created_at);

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  actor_id text not null references "user"(id),
  kind text not null check (kind in ('muse', 'edit', 'publish', 'comment', 'create')),
  body text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_workspace_idx on activity_events(workspace_id, created_at desc);

create table audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid,
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  ip text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_workspace_idx on audit_log(workspace_id, created_at desc);

-- ---------- Muse ----------
create table muse_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  user_id text references "user"(id) on delete set null,
  kind text not null check (kind in ('project', 'ideation')),
  created_at timestamptz not null default now()
);
create unique index muse_conversation_project_idx on muse_conversations(project_id) where kind = 'project';

create table muse_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references muse_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'muse')),
  body text not null,
  context jsonb not null default '[]',
  source text not null default 'user' check (source in ('user', 'ai', 'fallback')),
  model text,
  author_id text references "user"(id) on delete set null,
  created_at timestamptz not null default now()
);
create index muse_messages_conversation_idx on muse_messages(conversation_id, created_at);

create table creative_directions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references muse_conversations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  anon_key text,                    -- hashed visitor key for idea-first sessions
  idea text not null,
  interpretation jsonb not null default '{}',
  directions jsonb not null,
  selected jsonb,
  source text not null check (source in ('ai', 'fallback')),
  model text,
  created_at timestamptz not null default now()
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  message_id uuid references muse_messages(id) on delete set null,
  title text not null,
  target text not null,
  from_text text not null,
  to_text text not null,
  rationale text not null,
  change jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'stale')),
  source text not null default 'ai' check (source in ('ai', 'fallback', 'check')),
  decided_by text references "user"(id),
  decided_at timestamptz,
  applied_version_id uuid references project_versions(id) on delete set null,
  created_by text not null references "user"(id),
  created_at timestamptz not null default now()
);
create index proposals_project_idx on proposals(project_id, status);

create table ai_usage (
  id bigint generated always as identity primary key,
  workspace_id uuid references workspaces(id) on delete set null,
  user_id text references "user"(id) on delete set null,
  anon_key text,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms integer not null default 0,
  attempts integer not null default 1,
  status text not null check (status in ('ok', 'invalid_output', 'timeout', 'error', 'rate_limited', 'budget')),
  error text,
  created_at timestamptz not null default now()
);
create index ai_usage_workspace_idx on ai_usage(workspace_id, created_at desc);
create index ai_usage_created_idx on ai_usage(created_at);

-- ---------- assets ----------
create table assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  kind text not null check (kind in ('3d', 'material', 'image', 'motion', 'component')),
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_provider text not null,
  storage_key text not null,
  checksum text,
  width integer,
  height integer,
  tags text[] not null default '{}',
  meta jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_provider, storage_key)
);
create index assets_workspace_idx on assets(workspace_id, created_at desc) where deleted_at is null;

create table asset_projects (
  asset_id uuid not null references assets(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (asset_id, project_id)
);

-- ---------- launch ----------
create table publishes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version_id uuid not null references project_versions(id),
  number integer not null,
  status text not null check (status in ('queued', 'building', 'deploying', 'live', 'failed', 'superseded', 'unpublished')),
  adapter text not null,
  slug text not null,
  url text,
  artifact text,                   -- immutable build output
  artifact_hash text,
  checks jsonb not null default '[]',
  log jsonb not null default '[]',
  error text,
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (project_id, number)
);
create index publishes_project_idx on publishes(project_id, created_at desc);

-- which publish is live for a public slug (domain configuration for the built-in host)
create table sites (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  project_id uuid not null unique references projects(id) on delete cascade,
  publish_id uuid references publishes(id) on delete set null,
  custom_domain text,
  updated_at timestamptz not null default now()
);

-- ---------- API rate limiting (fixed windows) ----------
create table api_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
