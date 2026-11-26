-- NeonPlay database schema. Run in Supabase → SQL Editor.

-- Profiles: one row per user, full progress stored as JSON.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  avatar jsonb not null default '{"emoji":"🎮","color":"violet"}',
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists profiles_xp_idx on public.profiles (xp desc);

-- Best score per user per game (powers the global leaderboards).
create table if not exists public.scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null check (game_id in ('reaction','2048','snake','tictactoe','rps','memory','minesweeper','clicker','flappy','typing')),
  score double precision not null check (score >= 0),
  username text not null,
  avatar jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists scores_game_score_idx on public.scores (game_id, score);

-- Newer Supabase projects don't expose new tables to the API automatically.
-- These grants let the website reach the tables; the row-level security
-- policies below still decide which rows each player can read or write.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.scores to anon, authenticated;
grant insert, update on public.profiles, public.scores to authenticated;

alter table public.profiles enable row level security;
alter table public.scores enable row level security;

-- Leaderboards are public; players can only write their own rows.
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "scores readable" on public.scores;
create policy "scores readable" on public.scores for select using (true);
drop policy if exists "scores insert own" on public.scores;
create policy "scores insert own" on public.scores for insert with check (auth.uid() = user_id);
drop policy if exists "scores update own" on public.scores;
create policy "scores update own" on public.scores for update using (auth.uid() = user_id);

-- Create a profile row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'player_' || substr(new.id::text, 1, 8)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
