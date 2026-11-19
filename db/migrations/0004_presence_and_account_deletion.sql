-- Stage 03 final touches. Additive only: one new table, and authorship columns that may now be
-- emptied when a person deletes their account (their work stays with the workspace).

-- who has a project open right now (heartbeats every ~15 s; rows older than a day are cleaned up)
create table project_presence (
  project_id uuid not null references projects(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  focus text not null default '' check (char_length(focus) <= 40),
  seen_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_presence_seen_idx on project_presence(project_id, seen_at desc);

-- authorship survives account deletion as "Former member"
alter table workspaces drop constraint if exists workspaces_created_by_fkey, alter column created_by drop not null,
  add constraint workspaces_created_by_fkey foreign key (created_by) references "user"(id) on delete set null;
alter table invitations drop constraint if exists invitations_invited_by_fkey, alter column invited_by drop not null,
  add constraint invitations_invited_by_fkey foreign key (invited_by) references "user"(id) on delete set null;
alter table projects drop constraint if exists projects_created_by_fkey, alter column created_by drop not null,
  add constraint projects_created_by_fkey foreign key (created_by) references "user"(id) on delete set null;
alter table project_versions drop constraint if exists project_versions_created_by_fkey, alter column created_by drop not null,
  add constraint project_versions_created_by_fkey foreign key (created_by) references "user"(id) on delete set null;
alter table comments drop constraint if exists comments_author_id_fkey, alter column author_id drop not null,
  add constraint comments_author_id_fkey foreign key (author_id) references "user"(id) on delete set null;
alter table comments drop constraint if exists comments_resolved_by_fkey,
  add constraint comments_resolved_by_fkey foreign key (resolved_by) references "user"(id) on delete set null;
alter table activity_events drop constraint if exists activity_events_actor_id_fkey, alter column actor_id drop not null,
  add constraint activity_events_actor_id_fkey foreign key (actor_id) references "user"(id) on delete set null;
alter table proposals drop constraint if exists proposals_decided_by_fkey,
  add constraint proposals_decided_by_fkey foreign key (decided_by) references "user"(id) on delete set null;
alter table proposals drop constraint if exists proposals_created_by_fkey, alter column created_by drop not null,
  add constraint proposals_created_by_fkey foreign key (created_by) references "user"(id) on delete set null;
alter table assets drop constraint if exists assets_created_by_fkey, alter column created_by drop not null,
  add constraint assets_created_by_fkey foreign key (created_by) references "user"(id) on delete set null;
alter table publishes drop constraint if exists publishes_created_by_fkey, alter column created_by drop not null,
  add constraint publishes_created_by_fkey foreign key (created_by) references "user"(id) on delete set null;
