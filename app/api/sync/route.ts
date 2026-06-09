import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

// Run on the Node runtime (needs the service-role key) and never cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_HOST = 'api-football-v1.p.rapidapi.com';
const LEAGUE_ID = 1; // FIFA World Cup
const SEASON = 2026;

// Map API-Football team names -> our teams.short_code.
// API names occasionally differ from ours, so we normalise the common ones.
const NAME_TO_CODE: Record<string, string> = {
  Mexico: 'MEX',
  'South Korea': 'KOR',
  'Korea Republic': 'KOR',
  'South Africa': 'RSA',
  Czechia: 'CZE',
  'Czech Republic': 'CZE',
  Canada: 'CAN',
  Switzerland: 'SUI',
  Qatar: 'QAT',
  'Bosnia and Herzegovina': 'BIH',
  'Bosnia & Herzegovina': 'BIH',
  Brazil: 'BRA',
  Morocco: 'MAR',
  Scotland: 'SCO',
  Haiti: 'HAI',
  USA: 'USA',
  'United States': 'USA',
  Paraguay: 'PAR',
  Australia: 'AUS',
  Turkey: 'TUR',
  'Türkiye': 'TUR',
  Germany: 'GER',
  Ecuador: 'ECU',
  'Ivory Coast': 'CIV',
  "Côte d'Ivoire": 'CIV',
  'Curacao': 'CUW',
  'Curaçao': 'CUW',
  Netherlands: 'NED',
  Japan: 'JPN',
  Tunisia: 'TUN',
  Sweden: 'SWE',
  Belgium: 'BEL',
  Iran: 'IRN',
  'IR Iran': 'IRN',
  Egypt: 'EGY',
  'New Zealand': 'NZL',
  Spain: 'ESP',
  Uruguay: 'URU',
  'Saudi Arabia': 'KSA',
  'Cape Verde': 'CPV',
  'Cabo Verde': 'CPV',
  France: 'FRA',
  Senegal: 'SEN',
  Norway: 'NOR',
  Iraq: 'IRQ',
  Argentina: 'ARG',
  Austria: 'AUT',
  Algeria: 'ALG',
  Jordan: 'JOR',
  Portugal: 'POR',
  Colombia: 'COL',
  Uzbekistan: 'UZB',
  'DR Congo': 'COD',
  'Congo DR': 'COD',
  England: 'ENG',
  Croatia: 'CRO',
  Panama: 'PAN',
  Ghana: 'GHA',
};

// API-Football status codes that mean the match is over.
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE']);

export async function POST() {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'RAPIDAPI_KEY is not set on the server.' },
      { status: 500 }
    );
  }

  // 1. Pull all World Cup fixtures.
  let apiData: any;
  try {
    const res = await fetch(
      `https://${API_HOST}/v3/fixtures?league=${LEAGUE_ID}&season=${SEASON}`,
      {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': API_HOST,
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `API-Football returned ${res.status}` },
        { status: 502 }
      );
    }
    apiData = await res.json();
  } catch (err: any) {
    return NextResponse.json(
      { error: `Fetch failed: ${err?.message ?? 'unknown'}` },
      { status: 502 }
    );
  }

  const fixtures: any[] = apiData?.response ?? [];

  // 2. Load our teams and matches.
  const admin = createAdminClient();
  const [{ data: teams }, { data: matches }] = await Promise.all([
    admin.from('teams').select('id, name, short_code'),
    admin.from('matches').select('*'),
  ]);

  if (!teams || !matches) {
    return NextResponse.json(
      { error: 'Could not load teams/matches from the database.' },
      { status: 500 }
    );
  }

  const codeToId: Record<string, string> = {};
  teams.forEach((t) => (codeToId[t.short_code] = t.id));

  const codeFor = (apiName: string): string | null => {
    if (NAME_TO_CODE[apiName]) return NAME_TO_CODE[apiName];
    // fall back to a loose match against our own team names
    const hit = teams.find(
      (t) => t.name.toLowerCase() === apiName.toLowerCase()
    );
    return hit ? hit.short_code : null;
  };

  // Index our matches by the unordered pair of team ids, so we can line up
  // an API fixture with the right row regardless of home/away ordering.
  const pairKey = (a: string | null, b: string | null) =>
    [a, b].filter(Boolean).sort().join('|');

  const matchByPair: Record<string, any> = {};
  matches.forEach((m: any) => {
    if (m.home_team_id && m.away_team_id) {
      matchByPair[pairKey(m.home_team_id, m.away_team_id)] = m;
    }
  });

  let updated = 0;
  const updates: any[] = [];

  for (const fx of fixtures) {
    const statusShort: string = fx?.fixture?.status?.short ?? 'NS';
    const homeName: string = fx?.teams?.home?.name ?? '';
    const awayName: string = fx?.teams?.away?.name ?? '';
    const homeCode = codeFor(homeName);
    const awayCode = codeFor(awayName);
    if (!homeCode || !awayCode) continue;

    const homeId = codeToId[homeCode];
    const awayId = codeToId[awayCode];
    if (!homeId || !awayId) continue;

    const row = matchByPair[pairKey(homeId, awayId)];
    if (!row) continue; // fixture we don't track (e.g. group game not seeded)

    const homeGoals: number | null = fx?.goals?.home ?? null;
    const awayGoals: number | null = fx?.goals?.away ?? null;

    let status = 'scheduled';
    if (FINISHED.has(statusShort)) status = 'final';
    else if (LIVE.has(statusShort)) status = 'live';

    // Decide the winner. For knockouts that went to penalties, API-Football
    // puts the shootout in score.penalty; the higher aggregate decides.
    let winnerId: string | null = null;
    if (status === 'final') {
      const pen = fx?.score?.penalty ?? {};
      const hp = pen?.home;
      const ap = pen?.away;
      if (hp != null && ap != null && hp !== ap) {
        winnerId = hp > ap ? homeId : awayId;
      } else if (homeGoals != null && awayGoals != null) {
        if (homeGoals > awayGoals) winnerId = homeId;
        else if (awayGoals > homeGoals) winnerId = awayId;
      }
    }

    updates.push(
      admin
        .from('matches')
        .update({
          // align our home/away to the API's so scores read correctly
          home_team_id: homeId,
          away_team_id: awayId,
          home_score: homeGoals,
          away_score: awayGoals,
          status,
          winner_team_id: winnerId,
          api_match_id: String(fx?.fixture?.id ?? ''),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    );
    updated++;
  }

  await Promise.all(updates);

  await admin.from('admin_log').insert({
    action: 'api_sync',
    after_json: { fixtures: fixtures.length, updated },
  });

  return NextResponse.json({
    ok: true,
    fixtures_seen: fixtures.length,
    matches_updated: updated,
  });
}

// Allow GET too, so a cron service (e.g. Vercel Cron) can hit it on a schedule.
export async function GET() {
  return POST();
}
