-- =====================================================================
-- Dillon Consulting 2026 World Cup Bracket Challenge — database setup
-- Same schema as your original, with the REAL confirmed 2026 teams.
--
-- You already ran the original version successfully. To load the correct
-- teams, run the RESET block at the bottom, OR if starting fresh just run
-- this whole file in Supabase → SQL Editor.
-- =====================================================================

-- ---------- TABLES ----------
create table if not exists pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  invite_token uuid unique not null default gen_random_uuid(),
  lock_time timestamptz not null,
  theme jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null,
  group_name text not null,
  flag_emoji text not null,
  fifa_ranking int not null,
  created_at timestamptz default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid references pools(id) on delete cascade,
  nickname text not null,
  email text not null,
  total_points int default 0,
  max_possible int default 530,
  boldness_score numeric default 0,
  bonus_picks jsonb default '{}',
  created_at timestamptz default now(),
  unique(pool_id, email)
);

create table if not exists picks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references entries(id) on delete cascade,
  match_slot text not null,
  pick_type text not null,
  team_id uuid references teams(id),
  predicted_rank int,
  is_correct boolean,
  created_at timestamptz default now(),
  unique(entry_id, match_slot)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  slot text not null,
  round text not null,
  home_team_id uuid references teams(id),
  away_team_id uuid references teams(id),
  home_score int,
  away_score int,
  status text default 'scheduled',
  kickoff_time timestamptz,
  winner_team_id uuid references teams(id),
  api_match_id text,
  updated_at timestamptz default now()
);

create table if not exists trash_talk (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid references pools(id) on delete cascade,
  entry_id uuid references entries(id) on delete cascade,
  message text not null check(char_length(message) <= 280),
  is_deleted boolean default false,
  created_at timestamptz default now()
);

create table if not exists admin_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_id text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz default now()
);

-- ---------- SEED POOL ----------
insert into pools (name, slug, lock_time)
select 'Dillon Consulting Bracket Challenge', 'dillon', '2026-06-11T19:00:00Z'
where not exists (select 1 from pools where slug = 'dillon');

-- ---------- SEED REAL 2026 TEAMS ----------
-- Clear any old/placeholder teams first (safe: picks reference teams, so we
-- only do this before anyone has submitted real brackets).
delete from teams;

insert into teams (name, short_code, group_name, flag_emoji, fifa_ranking) values
-- Group A
('Mexico','MEX','A','🇲🇽',16),
('South Korea','KOR','A','🇰🇷',23),
('South Africa','RSA','A','🇿🇦',60),
('Czechia','CZE','A','🇨🇿',36),
-- Group B
('Canada','CAN','B','🇨🇦',38),
('Switzerland','SUI','B','🇨🇭',21),
('Qatar','QAT','B','🇶🇦',37),
('Bosnia & Herzegovina','BIH','B','🇧🇦',74),
-- Group C
('Brazil','BRA','C','🇧🇷',5),
('Morocco','MAR','C','🇲🇦',14),
('Scotland','SCO','C','🏴󠁧󠁢󠁳󠁣󠁴󠁿',39),
('Haiti','HAI','C','🇭🇹',83),
-- Group D
('United States','USA','D','🇺🇸',13),
('Paraguay','PAR','D','🇵🇾',46),
('Australia','AUS','D','🇦🇺',24),
('Türkiye','TUR','D','🇹🇷',29),
-- Group E
('Germany','GER','E','🇩🇪',12),
('Ecuador','ECU','E','🇪🇨',33),
('Ivory Coast','CIV','E','🇨🇮',41),
('Curaçao','CUW','E','🇨🇼',82),
-- Group F
('Netherlands','NED','F','🇳🇱',7),
('Japan','JPN','F','🇯🇵',15),
('Tunisia','TUN','F','🇹🇳',45),
('Sweden','SWE','F','🇸🇪',32),
-- Group G
('Belgium','BEL','G','🇧🇪',8),
('Iran','IRN','G','🇮🇷',20),
('Egypt','EGY','G','🇪🇬',34),
('New Zealand','NZL','G','🇳🇿',86),
-- Group H
('Spain','ESP','H','🇪🇸',2),
('Uruguay','URU','H','🇺🇾',17),
('Saudi Arabia','KSA','H','🇸🇦',56),
('Cape Verde','CPV','H','🇨🇻',70),
-- Group I
('France','FRA','I','🇫🇷',3),
('Senegal','SEN','I','🇸🇳',18),
('Norway','NOR','I','🇳🇴',30),
('Iraq','IRQ','I','🇮🇶',58),
-- Group J
('Argentina','ARG','J','🇦🇷',1),
('Austria','AUT','J','🇦🇹',25),
('Algeria','ALG','J','🇩🇿',35),
('Jordan','JOR','J','🇯🇴',62),
-- Group K
('Portugal','POR','K','🇵🇹',6),
('Colombia','COL','K','🇨🇴',19),
('Uzbekistan','UZB','K','🇺🇿',57),
('DR Congo','COD','K','🇨🇩',59),
-- Group L
('England','ENG','L','🏴󠁧󠁢󠁥󠁮󠁧󠁿',4),
('Croatia','CRO','L','🇭🇷',10),
('Panama','PAN','L','🇵🇦',40),
('Ghana','GHA','L','🇬🇭',73);

-- ---------- ROW LEVEL SECURITY ----------
alter table pools enable row level security;
alter table entries enable row level security;
alter table picks enable row level security;
alter table matches enable row level security;
alter table trash_talk enable row level security;
alter table teams enable row level security;

drop policy if exists "Public read pools" on pools;
drop policy if exists "Public read teams" on teams;
drop policy if exists "Public read matches" on matches;
drop policy if exists "Public insert entries" on entries;
drop policy if exists "Public read entries after lock" on entries;
drop policy if exists "Public insert picks" on picks;
drop policy if exists "Public update picks" on picks;
drop policy if exists "Public read picks" on picks;
drop policy if exists "Public read trash talk" on trash_talk;
drop policy if exists "Public insert trash talk" on trash_talk;

create policy "Public read pools" on pools for select using (true);
create policy "Public read teams" on teams for select using (true);
create policy "Public read matches" on matches for select using (true);
create policy "Public insert entries" on entries for insert with check (true);
create policy "Public read entries after lock" on entries for select using (true);
create policy "Public insert picks" on picks for insert with check (true);
create policy "Public update picks" on picks for update using (true);
create policy "Public read picks" on picks for select using (true);
create policy "Public read trash talk" on trash_talk for select using (true);
create policy "Public insert trash talk" on trash_talk for insert with check (true);

-- =====================================================================
-- KNOCKOUT FIXTURES (official FIFA match codes M73–M104)
-- Seeded with no teams yet — teams are filled by group results or by the
-- API sync once each tie is set. The `slot` column carries the round so the
-- admin and scoring can find them. kickoff_time in UTC.
-- =====================================================================
delete from matches;

insert into matches (slot, round, kickoff_time, status) values
  -- Round of 32 (M73–M88), 28 Jun – 3 Jul
  ('M73','R32','2026-06-28T20:00:00Z','scheduled'),
  ('M74','R32','2026-06-29T17:00:00Z','scheduled'),
  ('M75','R32','2026-06-29T21:00:00Z','scheduled'),
  ('M76','R32','2026-06-29T23:00:00Z','scheduled'),
  ('M77','R32','2026-06-30T17:00:00Z','scheduled'),
  ('M78','R32','2026-06-30T21:00:00Z','scheduled'),
  ('M79','R32','2026-06-30T23:00:00Z','scheduled'),
  ('M80','R32','2026-07-01T17:00:00Z','scheduled'),
  ('M81','R32','2026-07-01T21:00:00Z','scheduled'),
  ('M82','R32','2026-07-01T23:00:00Z','scheduled'),
  ('M83','R32','2026-07-02T17:00:00Z','scheduled'),
  ('M84','R32','2026-07-02T21:00:00Z','scheduled'),
  ('M85','R32','2026-07-02T23:00:00Z','scheduled'),
  ('M86','R32','2026-07-03T17:00:00Z','scheduled'),
  ('M87','R32','2026-07-03T21:00:00Z','scheduled'),
  ('M88','R32','2026-07-03T23:00:00Z','scheduled'),
  -- Round of 16 (M89–M96), 4–7 Jul
  ('M89','R16','2026-07-04T17:00:00Z','scheduled'),
  ('M90','R16','2026-07-04T21:00:00Z','scheduled'),
  ('M91','R16','2026-07-05T20:00:00Z','scheduled'),
  ('M92','R16','2026-07-06T00:00:00Z','scheduled'),
  ('M93','R16','2026-07-06T19:00:00Z','scheduled'),
  ('M94','R16','2026-07-07T00:00:00Z','scheduled'),
  ('M95','R16','2026-07-07T16:00:00Z','scheduled'),
  ('M96','R16','2026-07-07T20:00:00Z','scheduled'),
  -- Quarter-finals (M97–M100), 9–12 Jul
  ('M97','QF','2026-07-09T20:00:00Z','scheduled'),
  ('M98','QF','2026-07-10T19:00:00Z','scheduled'),
  ('M99','QF','2026-07-11T21:00:00Z','scheduled'),
  ('M100','QF','2026-07-12T01:00:00Z','scheduled'),
  -- Semi-finals (M101–M102), 14–15 Jul
  ('M101','SF','2026-07-14T19:00:00Z','scheduled'),
  ('M102','SF','2026-07-15T19:00:00Z','scheduled'),
  -- Final (M104), 19 Jul. (M103 is the third-place playoff, 18 Jul.)
  ('M103','3RD','2026-07-18T19:00:00Z','scheduled'),
  ('M104','FINAL','2026-07-19T19:00:00Z','scheduled');
