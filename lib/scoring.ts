// =====================================================================
// Dillon Consulting Bracket Challenge — scoring engine
//
// This module recomputes every entry's points from the current state of
// the `matches` table and each entry's `picks`, then writes the totals
// back to `entries.total_points` and `entries.max_possible`.
//
// It is intentionally self-contained and idempotent: running it twice in
// a row produces the same result. It NEVER touches `picks` rows (the data
// people entered) — it only reads them — and it only UPDATES the three
// score columns on `entries`. Nothing here can lose a submitted bracket.
//
// Called from:
//   - app/api/sync/route.ts      (after every API-Football sync)
//   - app/admin/page.tsx via     (after a manual result save — through the
//     /api/sync route's scoring, or the dedicated recompute path)
//
// It expects a Supabase client with read access to teams/matches/picks and
// update access to entries. The sync route passes the service-role admin
// client, which bypasses RLS.
// =====================================================================

type AnyClient = {
  from: (table: string) => any;
};

// ---------- POINTS TABLE ----------
// Tune these freely; they're the only knobs for the scoring scheme.
const POINTS = {
  // Group stage: did the team finish in the exact position the user ranked?
  group_exact_position: 5, // correct team in correct slot (1st/2nd/3rd/4th)
  group_advanced: 3, // team the user ranked 1st or 2nd did finish top 2
  // Best third-place picks: user named a team that actually finished 3rd
  third_place_correct: 6,
  // Knockout: user's predicted winner actually won that tie
  knockout: {
    R32: 8,
    R16: 12,
    QF: 18,
    SF: 25,
    FINAL: 40, // correct champion
  } as Record<string, number>,
};

// Map the app's internal knockout pick slots -> FIFA match codes in `matches`.
// Picks are saved as R32_01..R32_16, R16_01..R16_08, QF_01..QF_04,
// SF_01..SF_02, FINAL_01. Matches are seeded as M73..M104.
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

function roundForSlot(slot: string): string {
  if (slot.startsWith('R32')) return 'R32';
  if (slot.startsWith('R16')) return 'R16';
  if (slot.startsWith('QF')) return 'QF';
  if (slot.startsWith('SF')) return 'SF';
  if (slot.startsWith('FINAL')) return 'FINAL';
  return '';
}

type Team = { id: string; group_name: string };
type Match = {
  slot: string;
  round: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  winner_team_id: string | null;
};
type Pick = {
  entry_id: string;
  match_slot: string;
  pick_type: string;
  team_id: string;
  predicted_rank: number | null;
};

// ---------- GROUP STANDINGS ----------
// Derive each group's final 1st/2nd/3rd/4th from finished group matches.
// We only compute a group's standings once ALL of its group matches are
// final, so partial group play doesn't award (or revoke) group points
// prematurely. Group matches are any match whose round is 'GROUP' or whose
// slot starts with a group letter; in this schema group matches aren't
// seeded with FIFA codes, so we detect them by round === 'GROUP'.
function computeGroupStandings(
  teams: Team[],
  matches: Match[]
): Record<string, string[]> {
  const teamsByGroup: Record<string, string[]> = {};
  teams.forEach((t) => {
    (teamsByGroup[t.group_name] ||= []).push(t.id);
  });

  const groupMatches = matches.filter(
    (m) => (m.round || '').toUpperCase() === 'GROUP'
  );

  // points/goal-diff/goals per team
  const stat: Record<
    string,
    { pts: number; gd: number; gf: number; played: number }
  > = {};
  teams.forEach((t) => (stat[t.id] = { pts: 0, gd: 0, gf: 0, played: 0 }));

  for (const m of groupMatches) {
    if (m.status !== 'final') continue;
    if (
      !m.home_team_id ||
      !m.away_team_id ||
      m.home_score == null ||
      m.away_score == null
    )
      continue;
    const h = stat[m.home_team_id];
    const a = stat[m.away_team_id];
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += m.home_score; a.gf += m.away_score;
    h.gd += m.home_score - m.away_score;
    a.gd += m.away_score - m.home_score;
    if (m.home_score > m.away_score) h.pts += 3;
    else if (m.away_score > m.home_score) a.pts += 3;
    else { h.pts += 1; a.pts += 1; }
  }

  const standings: Record<string, string[]> = {};
  for (const [group, ids] of Object.entries(teamsByGroup)) {
    // a group is only "decided" when every team has played all 3 games
    const allDone = ids.every((id) => stat[id]?.played >= 3);
    if (!allDone) continue;
    const ordered = [...ids].sort((x, y) => {
      const sx = stat[x], sy = stat[y];
      if (sy.pts !== sx.pts) return sy.pts - sx.pts;
      if (sy.gd !== sx.gd) return sy.gd - sx.gd;
      return sy.gf - sx.gf;
    });
    standings[group] = ordered; // [1st, 2nd, 3rd, 4th]
  }
  return standings;
}

// ---------- MAIN ----------
export async function recomputeAllScores(supabase: AnyClient): Promise<{
  scored: number;
}> {
  const [{ data: teams }, { data: matches }, { data: entries }, { data: picks }] =
    await Promise.all([
      supabase.from('teams').select('id, group_name'),
      supabase.from('matches').select('*'),
      supabase.from('entries').select('id'),
      supabase.from('picks').select('entry_id, match_slot, pick_type, team_id, predicted_rank'),
    ]);

  if (!teams || !matches || !entries || !picks) {
    return { scored: 0 };
  }

  const standings = computeGroupStandings(teams as Team[], matches as Match[]);

  // index matches by FIFA slot for knockout lookups
  const matchBySlot: Record<string, Match> = {};
  (matches as Match[]).forEach((m) => (matchBySlot[m.slot] = m));

  // group picks and third-place picks need to know which group a team is in
  const groupOfTeam: Record<string, string> = {};
  (teams as Team[]).forEach((t) => (groupOfTeam[t.id] = t.group_name));

  // bucket picks by entry
  const picksByEntry: Record<string, Pick[]> = {};
  (picks as Pick[]).forEach((p) => {
    (picksByEntry[p.entry_id] ||= []).push(p);
  });

  // Max possible per entry is the same for everyone here: the sum of every
  // point that could still be earned. To keep "max left" meaningful we
  // compute, per entry, earned + still-achievable.
  const updates: Promise<any>[] = [];

  for (const entry of entries as { id: string }[]) {
    const myPicks = picksByEntry[entry.id] || [];
    let earned = 0;
    let stillPossible = 0;

    for (const p of myPicks) {
      if (p.match_slot.startsWith('GROUP_')) {
        // GROUP_<letter>_<rank>
        const parts = p.match_slot.split('_');
        const group = parts[1];
        const rank = p.predicted_rank ?? parseInt(parts[2], 10);
        const order = standings[group];
        if (!order) {
          // group not decided yet — these points are still in play
          stillPossible += POINTS.group_exact_position;
          continue;
        }
        const actualIdx = order.indexOf(p.team_id); // 0-based finishing pos
        if (actualIdx === rank - 1) {
          earned += POINTS.group_exact_position;
        } else if (
          (rank === 1 || rank === 2) &&
          (actualIdx === 0 || actualIdx === 1)
        ) {
          earned += POINTS.group_advanced;
        }
      } else if (p.match_slot.startsWith('THIRD_')) {
        const group = groupOfTeam[p.team_id];
        const order = group ? standings[group] : undefined;
        if (!order) {
          stillPossible += POINTS.third_place_correct;
          continue;
        }
        if (order.indexOf(p.team_id) === 2) {
          earned += POINTS.third_place_correct;
        }
      } else {
        // knockout pick
        const matchCode = SLOT_TO_MATCH[p.match_slot];
        const round = roundForSlot(p.match_slot);
        const value = POINTS.knockout[round];
        if (!matchCode || !value) continue;
        const m = matchBySlot[matchCode];
        if (!m || m.status !== 'final' || !m.winner_team_id) {
          stillPossible += value; // tie not played yet
          continue;
        }
        if (m.winner_team_id === p.team_id) earned += value;
      }
    }

    updates.push(
      supabase
        .from('entries')
        .update({
          total_points: earned,
          max_possible: earned + stillPossible,
        })
        .eq('id', entry.id)
    );
  }

  await Promise.all(updates);
  return { scored: (entries as any[]).length };
}
