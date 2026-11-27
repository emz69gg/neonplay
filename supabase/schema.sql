-- =====================================================================
-- NeonPlay — complete database setup.
-- Paste this whole file into Supabase → SQL Editor and click Run.
-- It is safe to run again at any time (it only adds or updates things).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Player profiles and leaderboard scores
-- ---------------------------------------------------------------------
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
create index if not exists profiles_username_lower_idx on public.profiles (lower(username));

create table if not exists public.scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  score double precision not null check (score >= 0),
  username text not null,
  avatar jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists scores_game_score_idx on public.scores (game_id, score);

-- any well-formed game id (new games never need a database change)
alter table public.scores drop constraint if exists scores_game_id_check;
alter table public.scores add constraint scores_game_id_check check (game_id ~ '^[a-z0-9]{2,20}$');

-- Newer Supabase projects don't expose new tables to the website automatically.
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


-- ---------------------------------------------------------------------
-- 2. Sign-up: create the profile row, and skip email verification
-- ---------------------------------------------------------------------
-- Creates a profile for every new account. If the chosen username is
-- missing, invalid or already taken, a free variant is used instead, so
-- this can never make a sign-up fail.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text := coalesce(new.raw_user_meta_data ->> 'username', '');
  candidate text;
  n integer := 0;
begin
  if base !~ '^[A-Za-z0-9_]{3,16}$' then
    base := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    n := n + 1;
    candidate := left(base, 15 - length(n::text)) || '_' || n;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate) on conflict (id) do nothing;
  return new;
exception when others then
  return new; -- never block a sign-up because of the profile
end $$;

-- The statements that touch Supabase's own auth tables are wrapped so that,
-- if your project doesn't allow one of them, the rest of this file still runs.
do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();
exception when others then
  raise notice 'Could not create the profile trigger (%). Profiles will still be created by the website.', sqlerrm;
end $$;

-- Mark every new account's email as confirmed, so players can log in
-- straight away without clicking a link in an email.
create or replace function public.auto_confirm_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end $$;

do $$
begin
  drop trigger if exists auto_confirm_email on auth.users;
  create trigger auto_confirm_email before insert on auth.users
    for each row execute function public.auto_confirm_email();
  -- confirm anyone who already signed up but never clicked the email link
  update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
exception when others then
  raise notice 'Could not auto-confirm emails (%). Turn off "Confirm email" under Authentication → Sign In / Providers → Email.', sqlerrm;
end $$;

-- give older accounts a profile if they are missing one
do $$
begin
  insert into public.profiles (id, username)
  select u.id, 'player_' || substr(replace(u.id::text, '-', ''), 1, 8)
  from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id)
  on conflict do nothing;
exception when others then
  raise notice 'Skipped backfilling profiles (%).', sqlerrm;
end $$;


-- ---------------------------------------------------------------------
-- 3. Online chess
-- Players never write to this table directly: every change goes through
-- the functions below, which check whose turn it is and run the chess
-- clocks on the server.
-- ---------------------------------------------------------------------
create table if not exists public.chess_games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  is_private boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete cascade,
  white uuid references auth.users (id) on delete set null,
  black uuid references auth.users (id) on delete set null,
  white_name text,
  black_name text,
  white_avatar jsonb,
  black_avatar jsonb,
  time_ms integer not null check (time_ms between 60000 and 3600000),
  white_ms integer not null,
  black_ms integer not null,
  moves jsonb not null default '[]'::jsonb,
  last_move_at timestamptz,
  draw_offer text check (draw_offer in ('w', 'b')),
  winner text check (winner in ('w', 'b')),
  result_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.chess_games add column if not exists seen_at timestamptz not null default now();
alter table public.chess_games add column if not exists rematch_id uuid;
alter table public.chess_games add column if not exists rematch_by text;
create index if not exists chess_games_waiting_idx on public.chess_games (status, is_private, time_ms, created_at);
create index if not exists chess_games_white_idx on public.chess_games (white);
create index if not exists chess_games_black_idx on public.chess_games (black);

alter table public.chess_games enable row level security;
grant select on public.chess_games to authenticated;

drop policy if exists "chess players can read their games" on public.chess_games;
create policy "chess players can read their games" on public.chess_games
  for select to authenticated
  using (auth.uid() = white or auth.uid() = black or auth.uid() = created_by);

-- live updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chess_games') then
    alter publication supabase_realtime add table public.chess_games;
  end if;
end $$;

-- helpers --------------------------------------------------------------
create or replace function public.chess_color_of(g public.chess_games, uid uuid)
returns text language sql immutable as $$
  select case when g.white = uid then 'w' when g.black = uid then 'b' else null end
$$;

create or replace function public.chess_turn_of(g public.chess_games)
returns text language sql immutable as $$
  select case when jsonb_array_length(g.moves) % 2 = 0 then 'w' else 'b' end
$$;

-- ms the side to move has used since the last move (clocks start once both sides have moved)
create or replace function public.chess_elapsed_ms(g public.chess_games)
returns integer language sql stable as $$
  select case
    when g.status <> 'active' or g.last_move_at is null or jsonb_array_length(g.moves) < 2 then 0
    else greatest(0, floor(extract(epoch from (now() - g.last_move_at)) * 1000))::integer
  end
$$;

create or replace function public.chess_create(p_time_ms integer, p_private boolean, p_name text, p_avatar jsonb, p_color text)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.chess_games;
  as_white boolean := coalesce(p_color = 'w', random() < 0.5);
begin
  if uid is null then raise exception 'Log in to play online'; end if;
  insert into public.chess_games (code, is_private, created_by, white, black, white_name, black_name, white_avatar, black_avatar, time_ms, white_ms, black_ms, seen_at)
  values (
    upper(substr(md5(gen_random_uuid()::text), 1, 6)), coalesce(p_private, false), uid,
    case when as_white then uid end, case when as_white then null else uid end,
    case when as_white then left(p_name, 16) end, case when as_white then null else left(p_name, 16) end,
    case when as_white then p_avatar end, case when as_white then null else p_avatar end,
    p_time_ms, p_time_ms, p_time_ms, now())
  returning * into g;
  return g;
end $$;

create or replace function public.chess_take_seat(g public.chess_games, uid uuid, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare r public.chess_games;
begin
  update public.chess_games set
    white = coalesce(white, case when white is null then uid end),
    black = coalesce(black, case when black is null and white is not null then uid end),
    white_name = coalesce(white_name, case when white is null then left(p_name, 16) end),
    black_name = coalesce(black_name, case when black is null and white is not null then left(p_name, 16) end),
    white_avatar = coalesce(white_avatar, case when white is null then p_avatar end),
    black_avatar = coalesce(black_avatar, case when black is null and white is not null then p_avatar end),
    status = 'active', last_move_at = now(), updated_at = now()
  where id = g.id
  returning * into r;
  return r;
end $$;

create or replace function public.chess_finish(p_id uuid, p_winner text, p_reason text)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare r public.chess_games;
begin
  update public.chess_games set status = 'finished', winner = p_winner, result_reason = p_reason, draw_offer = null, updated_at = now()
   where id = p_id returning * into r;
  return r;
end $$;

-- public game functions ------------------------------------------------
create or replace function public.chess_new_game(p_time_ms integer, p_private boolean, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
begin
  return public.chess_create(p_time_ms, p_private, p_name, p_avatar, null);
end $$;

create or replace function public.chess_find_match(p_time_ms integer, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.chess_games;
begin
  if uid is null then raise exception 'Log in to play online'; end if;
  -- someone else waiting with the same time control, still on the page (heartbeat in the last 25 s)?
  select * into g from public.chess_games
   where status = 'waiting' and not is_private and time_ms = p_time_ms and created_by <> uid
     and seen_at > now() - interval '25 seconds'
   order by created_at
   limit 1
   for update skip locked;
  if found then
    return public.chess_take_seat(g, uid, p_name, p_avatar);
  end if;
  -- already waiting myself? reuse that seat
  select * into g from public.chess_games
   where status = 'waiting' and not is_private and time_ms = p_time_ms and created_by = uid
   order by created_at desc limit 1 for update;
  if found then
    update public.chess_games set seen_at = now() where id = g.id returning * into g;
    return g;
  end if;
  return public.chess_create(p_time_ms, false, p_name, p_avatar, null);
end $$;

-- the waiting player's page calls this every few seconds
create or replace function public.chess_heartbeat(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games;
begin
  update public.chess_games set seen_at = now()
   where id = p_id and created_by = uid and status = 'waiting'
   returning * into g;
  if not found then
    select * into g from public.chess_games where id = p_id and (white = uid or black = uid or created_by = uid);
  end if;
  return g;
end $$;

create or replace function public.chess_join(p_code text, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.chess_games;
begin
  if uid is null then raise exception 'Log in to play online'; end if;
  select * into g from public.chess_games where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Game not found — check the code'; end if;
  if g.white = uid or g.black = uid then return g; end if;
  if g.status = 'cancelled' then raise exception 'That invite was cancelled'; end if;
  if g.status <> 'waiting' then raise exception 'That game has already started or ended'; end if;
  return public.chess_take_seat(g, uid, p_name, p_avatar);
end $$;

create or replace function public.chess_move(p_id uuid, p_from integer, p_to integer, p_promo text, p_result text default null, p_winner text default null)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.chess_games;
  me text;
  left_ms integer;
begin
  select * into g from public.chess_games where id = p_id for update;
  if not found then raise exception 'Game not found'; end if;
  me := public.chess_color_of(g, uid);
  if me is null then raise exception 'You are not playing in this game'; end if;
  if g.status <> 'active' then raise exception 'This game is not in progress'; end if;
  if public.chess_turn_of(g) <> me then raise exception 'It is not your turn'; end if;
  if p_from not between 0 and 63 or p_to not between 0 and 63 then raise exception 'Bad move'; end if;
  if p_promo is not null and p_promo not in ('q', 'r', 'b', 'n') then raise exception 'Bad promotion'; end if;

  left_ms := case when me = 'w' then g.white_ms else g.black_ms end - public.chess_elapsed_ms(g);
  if left_ms <= 0 then
    update public.chess_games set white_ms = case when me = 'w' then 0 else white_ms end, black_ms = case when me = 'b' then 0 else black_ms end where id = p_id;
    return public.chess_finish(p_id, case when me = 'w' then 'b' else 'w' end, 'timeout');
  end if;

  update public.chess_games set
    moves = moves || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('from', p_from, 'to', p_to, 'promo', p_promo))),
    white_ms = case when me = 'w' then left_ms else white_ms end,
    black_ms = case when me = 'b' then left_ms else black_ms end,
    last_move_at = now(),
    draw_offer = null,
    updated_at = now()
  where id = p_id returning * into g;

  if p_result is not null then
    if p_result not in ('checkmate', 'stalemate', 'insufficient', 'fifty', 'repetition') then raise exception 'Bad result'; end if;
    -- only checkmate has a winner: the player who just moved
    return public.chess_finish(p_id, case when p_result = 'checkmate' then me else null end, p_result);
  end if;
  return g;
end $$;

create or replace function public.chess_resign(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games; me text;
begin
  select * into g from public.chess_games where id = p_id for update;
  me := public.chess_color_of(g, uid);
  if me is null then raise exception 'You are not playing in this game'; end if;
  if g.status = 'finished' then return g; end if;
  if g.status <> 'active' then raise exception 'You cannot resign this game'; end if;
  return public.chess_finish(p_id, case when me = 'w' then 'b' else 'w' end, 'resign');
end $$;

create or replace function public.chess_offer_draw(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games; me text;
begin
  select * into g from public.chess_games where id = p_id for update;
  me := public.chess_color_of(g, uid);
  if me is null or g.status <> 'active' then raise exception 'You cannot offer a draw now'; end if;
  update public.chess_games set draw_offer = me, updated_at = now() where id = p_id returning * into g;
  return g;
end $$;

create or replace function public.chess_answer_draw(p_id uuid, p_accept boolean)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games; me text;
begin
  select * into g from public.chess_games where id = p_id for update;
  me := public.chess_color_of(g, uid);
  if me is null or g.status <> 'active' or g.draw_offer is null or g.draw_offer = me then raise exception 'There is no draw offer to answer'; end if;
  if p_accept then return public.chess_finish(p_id, null, 'agreement'); end if;
  update public.chess_games set draw_offer = null, updated_at = now() where id = p_id returning * into g;
  return g;
end $$;

-- either player may call this; the server decides whether time really ran out
create or replace function public.chess_claim_timeout(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.chess_games; turn text; left_ms integer;
begin
  select * into g from public.chess_games where id = p_id for update;
  if not found or public.chess_color_of(g, uid) is null then raise exception 'You are not playing in this game'; end if;
  if g.status <> 'active' then return g; end if;
  turn := public.chess_turn_of(g);
  if jsonb_array_length(g.moves) < 2 then
    -- clocks haven't started: a player who doesn't make their first move within 60 s loses
    if now() - g.last_move_at > interval '60 seconds' then
      return public.chess_finish(p_id, case when turn = 'w' then 'b' else 'w' end, 'abandoned');
    end if;
    return g;
  end if;
  left_ms := case when turn = 'w' then g.white_ms else g.black_ms end - public.chess_elapsed_ms(g);
  if left_ms <= 0 then
    update public.chess_games set white_ms = case when turn = 'w' then 0 else white_ms end, black_ms = case when turn = 'b' then 0 else black_ms end where id = p_id;
    return public.chess_finish(p_id, case when turn = 'w' then 'b' else 'w' end, 'timeout');
  end if;
  return g;
end $$;

create or replace function public.chess_cancel(p_id uuid)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.chess_games;
begin
  update public.chess_games set status = 'cancelled', updated_at = now()
   where id = p_id and created_by = uid and status = 'waiting' returning * into r;
  return r;
end $$;

-- Rematch: the first player to ask creates a new game with colours swapped;
-- when the opponent also asks (accepts), they take the other seat.
create or replace function public.chess_rematch(p_id uuid, p_name text, p_avatar jsonb)
returns public.chess_games language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  old public.chess_games;
  g public.chess_games;
  me text;
begin
  select * into old from public.chess_games where id = p_id for update;
  me := public.chess_color_of(old, uid);
  if me is null then raise exception 'You did not play in that game'; end if;
  if old.status <> 'finished' then raise exception 'That game is not finished yet'; end if;
  if old.rematch_id is not null then
    select * into g from public.chess_games where id = old.rematch_id for update;
    if g.white = uid or g.black = uid then return g; end if;
    if g.status <> 'waiting' then raise exception 'That rematch is no longer available'; end if;
    return public.chess_take_seat(g, uid, p_name, p_avatar);
  end if;
  g := public.chess_create(old.time_ms, true, p_name, p_avatar, case when me = 'w' then 'b' else 'w' end);
  update public.chess_games set rematch_id = g.id, rematch_by = me, updated_at = now() where id = p_id;
  return g;
end $$;

-- Only signed-in players may call the game functions; internal helpers stay private.
revoke all on function public.chess_create(integer, boolean, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.chess_take_seat(public.chess_games, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.chess_finish(uuid, text, text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'chess_new_game(integer, boolean, text, jsonb)',
    'chess_find_match(integer, text, jsonb)',
    'chess_heartbeat(uuid)',
    'chess_join(text, text, jsonb)',
    'chess_move(uuid, integer, integer, text, text, text)',
    'chess_resign(uuid)',
    'chess_offer_draw(uuid)',
    'chess_answer_draw(uuid, boolean)',
    'chess_claim_timeout(uuid)',
    'chess_cancel(uuid)',
    'chess_rematch(uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- refresh the API's view of the database so the website sees the changes immediately
notify pgrst, 'reload schema';
