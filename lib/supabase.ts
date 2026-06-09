import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Pool = {
  id: string;
  name: string;
  slug: string;
  invite_token: string;
  lock_time: string;
  theme: Record<string, any>;
};

export type Team = {
  id: string;
  name: string;
  short_code: string;
  group_name: string;
  flag_emoji: string;
  fifa_ranking: number;
};

export type Entry = {
  id: string;
  pool_id: string;
  nickname: string;
  email: string;
  total_points: number;
  max_possible: number;
  boldness_score: number;
  bonus_picks: Record<string, any>;
  created_at: string;
};

export type Pick = {
  id: string;
  entry_id: string;
  match_slot: string;
  pick_type: string;
  team_id: string;
  predicted_rank: number | null;
  is_correct: boolean | null;
};

export type Match = {
  id: string;
  slot: string;
  round: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  kickoff_time: string;
  winner_team_id: string | null;
};
