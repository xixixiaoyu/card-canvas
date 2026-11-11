-- Card Canvas cloud schema
-- Run once in the Supabase SQL Editor. The script is safe to rerun.

create table if not exists public.boards (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '未命名白板',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  sync_client_id text not null default '',
  primary key (user_id, id)
);

create table if not exists public.cards (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text not null default '',
  content text not null default '',
  tags text[] not null default '{}',
  highlights jsonb,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  sync_client_id text not null default '',
  primary key (user_id, id)
);

create table if not exists public.board_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  card_id text not null,
  board_id text not null,
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision,
  color text,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  sync_client_id text not null default '',
  primary key (user_id, id)
);

create table if not exists public.connections (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  board_id text not null,
  from_card_id text not null,
  to_card_id text not null,
  label text,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  sync_client_id text not null default '',
  primary key (user_id, id)
);

create index if not exists boards_user_updated_idx
  on public.boards (user_id, updated_at);
create index if not exists cards_user_updated_idx
  on public.cards (user_id, updated_at);
create index if not exists board_items_user_board_idx
  on public.board_items (user_id, board_id);
create index if not exists board_items_user_updated_idx
  on public.board_items (user_id, updated_at);
create index if not exists connections_user_board_idx
  on public.connections (user_id, board_id);
create index if not exists connections_user_updated_idx
  on public.connections (user_id, updated_at);

create index if not exists boards_user_server_updated_idx
  on public.boards (user_id, server_updated_at);
create index if not exists cards_user_server_updated_idx
  on public.cards (user_id, server_updated_at);
create index if not exists board_items_user_server_updated_idx
  on public.board_items (user_id, server_updated_at);
create index if not exists connections_user_server_updated_idx
  on public.connections (user_id, server_updated_at);

alter table public.boards replica identity full;
alter table public.cards replica identity full;
alter table public.board_items replica identity full;
alter table public.connections replica identity full;

create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

drop trigger if exists boards_set_server_updated_at on public.boards;
create trigger boards_set_server_updated_at
before insert or update on public.boards
for each row execute function public.set_server_updated_at();

drop trigger if exists cards_set_server_updated_at on public.cards;
create trigger cards_set_server_updated_at
before insert or update on public.cards
for each row execute function public.set_server_updated_at();

drop trigger if exists board_items_set_server_updated_at on public.board_items;
create trigger board_items_set_server_updated_at
before insert or update on public.board_items
for each row execute function public.set_server_updated_at();

drop trigger if exists connections_set_server_updated_at on public.connections;
create trigger connections_set_server_updated_at
before insert or update on public.connections
for each row execute function public.set_server_updated_at();

alter table public.boards enable row level security;
alter table public.cards enable row level security;
alter table public.board_items enable row level security;
alter table public.connections enable row level security;

drop policy if exists "boards_select_own" on public.boards;
create policy "boards_select_own"
on public.boards for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "boards_insert_own" on public.boards;
create policy "boards_insert_own"
on public.boards for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "boards_update_own" on public.boards;
create policy "boards_update_own"
on public.boards for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "boards_delete_own" on public.boards;
create policy "boards_delete_own"
on public.boards for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own"
on public.cards for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own"
on public.cards for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own"
on public.cards for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own"
on public.cards for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "board_items_select_own" on public.board_items;
create policy "board_items_select_own"
on public.board_items for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "board_items_insert_own" on public.board_items;
create policy "board_items_insert_own"
on public.board_items for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "board_items_update_own" on public.board_items;
create policy "board_items_update_own"
on public.board_items for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "board_items_delete_own" on public.board_items;
create policy "board_items_delete_own"
on public.board_items for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "connections_select_own" on public.connections;
create policy "connections_select_own"
on public.connections for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "connections_insert_own" on public.connections;
create policy "connections_insert_own"
on public.connections for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "connections_update_own" on public.connections;
create policy "connections_update_own"
on public.connections for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "connections_delete_own" on public.connections;
create policy "connections_delete_own" on public.connections for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on public.boards, public.cards, public.board_items, public.connections
to authenticated;

revoke all
on public.boards, public.cards, public.board_items, public.connections
from anon;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'boards',
    'cards',
    'board_items',
    'connections'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end
$$;
