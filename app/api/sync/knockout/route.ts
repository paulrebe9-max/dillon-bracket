import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recomputeAllScores } from '@/lib/scoring';

// Save one knockout result and advance the winner into the next round.
//
// The admin screen posts: { slot, homeTeamId, awayTeamId, homeScore,
// awayScore, penHome?, penAway?, status }. For R32 the admin supplies both
// teams (the official matchups). For later rounds the teams are already
// filled by advancement, but the admin can still override them.
//
// When a match is marked final, we compute the winner (penalties break ties)
// and write that winner into whichever slot/side FEED_MAP says it feeds.
// Then we recompute everyone's score.
//
// Uses the service-role client so it bypasses RLS. Writes only to `matches`
// and the three score columns on `entries`. Never touches picks.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Which app slot maps to which FIFA match code (must match scoring.ts).
const SLOT_TO_MATCH: Record<string, string> = {
  R32_01: 'M73', R32_02: 'M74', R32_03: 'M75', R32_04: 'M76',
  R32_05: 'M77', R32_06: 'M78', R32_07: 'M79', R32_08: 'M80',
  R32_09: 'M81', R32_10: 'M82', R32_11: 'M83', R32_12: 'M84',
  R32_13: 'M85', R32_14: 'M86', R32_15: 'M87', R32_16: 'M88',
  R16_01: 'M89', R16_02: 'M90', R16_03: 'M91', R16_04: 'M92',
  R16_05: 'M93', R16_06: 'M94', R16_07: 'M95', R16_08: 'M96',
  QF_01: 'M97', QF_02: 'M98', QF_03: 'M99', QF_04: 'M100',
  SF_01: 'M101', SF_02: 'M102',
  FINAL_01: 'M104',
};

// Which two source slots feed each later match, and in order (index 0 = home
// side of the produced match, index 1 = away side). Mirrors bracket/page.tsx.
const FEED_MAP: Record<string, [string, string]> = {
  R16_01: ['R32_02', 'R32_05'],
  R16_02: ['R32_01', 'R32_03'],
  R16_03: ['R32_04', 'R32_06'],
  R16_04: ['R32_07', 'R32_08'],
  R16_05: ['R32_09', 'R32_10'],
  R16_06: ['R32_11', 'R32_12'],
  R16_07: ['R32_13', 'R32_14'],
  R16_08: ['R32_15', 'R32_16'],
  QF_01: ['R16_01', 'R16_02'],
  QF_02: ['R16_03', 'R16_04'],
  QF_03: ['R16_05', 'R16_06'],
  QF_04: ['R16_07', 'R16_08'],
  SF_01: ['QF_01', 'QF_02'],
  SF_02: ['QF_03', 'QF_04'],
  FINAL_01: ['SF_01', 'SF_02'],
};

// Given a source slot, find the produced slot and which side (0/1) it feeds.
function findDownstream(
  sourceSlot: string
): { producedSlot: string; side: 0 | 1 } | null {
  for (const [produced, sources] of Object.entries(FEED_MAP)) {
    if (sources[0] === sourceSlot) return { producedSlot: produced, side: 0 };
    if (sources[1] === sourceSlot) return { producedSlot: produced, side: 1 };
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      slot,
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
      penHome,
      penAway,
      status,
    } = body ?? {};

    const matchCode = SLOT_TO_MATCH[slot];
    if (!matchCode) {
      return NextResponse.json(
        { error: `Unknown knockout slot: ${slot}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Work out the winner if this game is final.
    const hs = homeScore === '' || homeScore == null ? null : Number(homeScore);
    const as = awayScore === '' || awayScore == null ? null : Number(awayScore);
    const ph = penHome === '' || penHome == null ? null : Number(penHome);
    const pa = penAway === '' || penAway == null ? null : Number(penAway);

    let winnerId: string | null = null;
    if (status === 'final' && homeTeamId && awayTeamId) {
      if (hs != null && as != null && hs !== as) {
        winnerId = hs > as ? homeTeamId : awayTeamId;
      } else if (ph != null && pa != null && ph !== pa) {
        // draw in regulation -> penalties decide
        winnerId = ph > pa ? homeTeamId : awayTeamId;
      }
    }

    // 1. Update the match itself (by FIFA slot code).
    const { error: updErr } = await admin
      .from('matches')
      .update({
        home_team_id: homeTeamId || null,
        away_team_id: awayTeamId || null,
        home_score: hs,
        away_score: as,
        status: status || 'scheduled',
        winner_team_id: winnerId,
        updated_at: new Date().toISOString(),
      })
      .eq('slot', matchCode);

    if (updErr) {
      return NextResponse.json(
        { error: `Could not update match: ${updErr.message}` },
        { status: 500 }
      );
    }

    // 2. Advance the winner into the next round, if there is one and we have
    //    a winner. If the match is no longer final (correction), clear that
    //    side of the downstream match so stale teams don't linger.
    const downstream = findDownstream(slot);
    let advancedTo: string | null = null;
    if (downstream) {
      const nextCode = SLOT_TO_MATCH[downstream.producedSlot];
      if (nextCode) {
        const column = downstream.side === 0 ? 'home_team_id' : 'away_team_id';
        const value = status === 'final' ? winnerId : null;
        // Only write if it actually changes, to avoid needless churn.
        const { error: advErr } = await admin
          .from('matches')
          .update({ [column]: value, updated_at: new Date().toISOString() })
          .eq('slot', nextCode);
        if (!advErr && value) advancedTo = downstream.producedSlot;
      }
    }

    // 3. Recompute all scores now that a knockout result changed.
    let scored = 0;
    try {
      const r = await recomputeAllScores(admin);
      scored = r.scored;
    } catch (e) {
      console.error('Scoring failed after knockout save:', e);
    }

    await admin.from('admin_log').insert({
      action: 'knockout_result',
      target_id: matchCode,
      after_json: { slot, winnerId, advancedTo, scored },
    });

    return NextResponse.json({
      ok: true,
      slot,
      matchCode,
      winnerId,
      advancedTo,
      entries_scored: scored,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Knockout save failed: ${err?.message ?? 'unknown'}` },
      { status: 500 }
    );
  }
}
