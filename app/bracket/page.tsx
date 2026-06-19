'use client';

import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import type { Team } from '@/lib/supabase';
import GroupStage from '@/app/components/GroupStage';
import KnockoutBracket from '@/app/components/KnockoutBracket';

const LOCK_TIME = new Date('2026-06-11T19:00:00Z');
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

const STEPS = [
  { id: 'instructions', label: 'How it works' },
  { id: 'groups_ABCD', label: 'Groups A–D' },
  { id: 'groups_EFGH', label: 'Groups E–H' },
  { id: 'groups_IJKL', label: 'Groups I–L' },
  { id: 'third_place', label: 'Best 3rd Place' },
  { id: 'R32', label: 'Round of 32' },
  { id: 'R16', label: 'Round of 16' },
  { id: 'QF', label: 'Quarter-finals' },
  { id: 'SF', label: 'Semi-finals' },
  { id: 'FINAL', label: 'Final' },
  { id: 'bonus', label: 'Bonus Picks' },
  { id: 'submit', label: 'Submit' },
];

export default function BracketPage() {
  const [teams, setTeams] = useState<Record<string, Team[]>>({});
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const locked = Date.now() >= LOCK_TIME.getTime();

  const [groupOrders, setGroupOrders] = useState<Record<string, Team[]>>({});
  const [knockoutWinners, setKnockoutWinners] = useState<Record<string, Team>>(
    {}
  );
  const [thirdPlacePicks, setThirdPlacePicks] = useState<Team[]>([]);
  const [topScorer, setTopScorer] = useState('');
  const [darkHorse, setDarkHorse] = useState('');
  const [upsetTeam, setUpsetTeam] = useState('');

  useEffect(() => {
    const savedEntry = localStorage.getItem('dillon_entry_id');
    const savedNick = localStorage.getItem('dillon_nickname');
    if (!savedEntry) {
      window.location.href = '/';
      return;
    }
    setEntryId(savedEntry);
    setNickname(savedNick);

    const load = async () => {
      // 1. Load all teams, grouped.
      const { data: teamData } = await supabase
        .from('teams')
        .select('*')
        .order('fifa_ranking');
      if (!teamData) {
        setLoading(false);
        return;
      }
      const grouped: Record<string, Team[]> = {};
      GROUPS.forEach((g) => {
        grouped[g] = teamData.filter((t) => t.group_name === g);
      });
      const teamById: Record<string, Team> = {};
      teamData.forEach((t) => (teamById[t.id] = t));
      setTeams(grouped);

      // 2. Load this user's saved picks, if any.
      const { data: savedPicks } = await supabase
        .from('picks')
        .select('match_slot, pick_type, team_id, predicted_rank')
        .eq('entry_id', savedEntry);

      // Start from the default (FIFA-ranked) order, then override with saved.
      const restoredOrders: Record<string, Team[]> = { ...grouped };
      const restoredThirds: Team[] = [];
      const restoredKnockout: Record<string, Team> = {};

      if (savedPicks && savedPicks.length > 0) {
        // Group rankings: rebuild each group's order from saved ranks.
        const groupRank: Record<string, (Team | undefined)[]> = {};
        savedPicks.forEach((p) => {
          if (p.match_slot.startsWith('GROUP_')) {
            const [, letter] = p.match_slot.split('_');
            const team = teamById[p.team_id];
            if (!team) return;
            const rank = (p.predicted_rank ?? 1) - 1;
            (groupRank[letter] ||= [])[rank] = team;
          } else if (p.match_slot.startsWith('THIRD_')) {
            const team = teamById[p.team_id];
            if (team) restoredThirds.push(team);
          } else {
            // knockout slot (R32_xx, R16_xx, QF_xx, SF_xx, FINAL_01)
            const team = teamById[p.team_id];
            if (team) restoredKnockout[p.match_slot] = team;
          }
        });
        // Apply restored group orders (fill any gaps from default order).
        Object.entries(groupRank).forEach(([letter, arr]) => {
          const base = grouped[letter] || [];
          const seen = new Set<string>();
          const ordered: Team[] = [];
          arr.forEach((t) => {
            if (t && !seen.has(t.id)) {
              ordered.push(t);
              seen.add(t.id);
            }
          });
          base.forEach((t) => {
            if (!seen.has(t.id)) ordered.push(t);
          });
          restoredOrders[letter] = ordered;
        });
      }

      setGroupOrders(restoredOrders);
      setThirdPlacePicks(restoredThirds);
      setKnockoutWinners(restoredKnockout);

      // 3. Load saved bonus picks from the entry row.
      const { data: entryRow } = await supabase
        .from('entries')
        .select('bonus_picks')
        .eq('id', savedEntry)
        .single();
      const bonus = entryRow?.bonus_picks || {};
      if (bonus.top_scorer) setTopScorer(bonus.top_scorer);
      if (bonus.dark_horse) setDarkHorse(bonus.dark_horse);
      if (bonus.upset_team) setUpsetTeam(bonus.upset_team);

      setLoading(false);
    };

    load();
  }, []);

  const handleGroupSave = (groupName: string, orderedTeams: Team[]) => {
    setGroupOrders((prev) => ({ ...prev, [groupName]: orderedTeams }));
  };

  const handleKnockoutPick = (slot: string, team: Team) => {
    setKnockoutWinners((prev) => ({ ...prev, [slot]: team }));
  };

  const getThirdPlaceTeams = () => {
    return GROUPS.map((g) => groupOrders[g]?.[2]).filter(Boolean) as Team[];
  };

  const toggleThirdPlace = (team: Team) => {
    setThirdPlacePicks((prev) => {
      if (prev.find((t) => t.id === team.id)) {
        return prev.filter((t) => t.id !== team.id);
      }
      if (prev.length >= 8) return prev;
      return [...prev, team];
    });
  };

  const getR32Matches = () => {
    // Official FIFA 2026 Round of 32 chart (matches M73–M88).
    // Each entry: home seed, away seed. Seeds use position+group:
    //   '1A' = winner Group A, '2B' = runner-up Group B,
    //   '3:ABCDF' = a third-place team from one of groups A/B/C/D/F.
    // FIFA assigns specific third-place teams to slots via a lookup table once
    // all 8 are known; for a prediction bracket we fill the third-place slots,
    // in match order, from the user's 8 picks.
    const R32_CHART: { slot: string; home: string; away: string }[] = [
      { slot: 'R32_01', home: '2A', away: '2B' }, // M73
      { slot: 'R32_02', home: '1E', away: '3:ABCDF' }, // M74
      { slot: 'R32_03', home: '1F', away: '2C' }, // M75
      { slot: 'R32_04', home: '1C', away: '2F' }, // M76
      { slot: 'R32_05', home: '1I', away: '3:CDFGH' }, // M77
      { slot: 'R32_06', home: '2E', away: '2I' }, // M78
      { slot: 'R32_07', home: '1A', away: '3:CEFHI' }, // M79
      { slot: 'R32_08', home: '1L', away: '3:EHIJK' }, // M80
      { slot: 'R32_09', home: '1D', away: '3:BEFIJ' }, // M81
      { slot: 'R32_10', home: '1G', away: '3:AEHIJ' }, // M82
      { slot: 'R32_11', home: '2K', away: '2L' }, // M83
      { slot: 'R32_12', home: '1H', away: '2J' }, // M84
      { slot: 'R32_13', home: '1B', away: '3:EFGIJ' }, // M85
      { slot: 'R32_14', home: '1J', away: '2H' }, // M86
      { slot: 'R32_15', home: '1K', away: '3:DEIJL' }, // M87
      { slot: 'R32_16', home: '2D', away: '2G' }, // M88
    ];

    // Resolve a seed code to the predicted team.
    let thirdIdx = 0;
    const thirds = thirdPlacePicks.slice(0, 8);
    const resolve = (code: string): Team | null => {
      if (code.startsWith('3:')) {
        // assign the user's third-place picks in chart order
        const t = thirds[thirdIdx] || null;
        thirdIdx++;
        return t;
      }
      const pos = code[0]; // '1' or '2'
      const grp = code[1]; // 'A'..'L'
      const idx = pos === '1' ? 0 : 1;
      return groupOrders[grp]?.[idx] || null;
    };

    return R32_CHART.map((m) => ({
      slot: m.slot,
      teamA: resolve(m.home),
      teamB: resolve(m.away),
    }));
  };

  // Official FIFA feed map: which two earlier matches feed each later match.
  // Keyed by the produced match's slot; values are the two source slots.
  const FEED_MAP: Record<string, [string, string]> = {
    // Round of 16 (M89–M96) fed by Round of 32 winners
    R16_01: ['R32_02', 'R32_05'], // M89 = W M74 + W M77
    R16_02: ['R32_01', 'R32_03'], // M90 = W M73 + W M75
    R16_03: ['R32_04', 'R32_06'], // M91 = W M76 + W M78
    R16_04: ['R32_07', 'R32_08'], // M92 = W M79 + W M80
    R16_05: ['R32_09', 'R32_10'], // M93 = W M81 + W M82
    R16_06: ['R32_11', 'R32_12'], // M94 = W M83 + W M84
    R16_07: ['R32_13', 'R32_14'], // M95 = W M85 + W M86
    R16_08: ['R32_15', 'R32_16'], // M96 = W M87 + W M88
    // Quarter-finals (M97–M100)
    QF_01: ['R16_01', 'R16_02'], // M97 = W M89 + W M90
    QF_02: ['R16_03', 'R16_04'], // M98 = W M91 + W M92
    QF_03: ['R16_05', 'R16_06'], // M99 = W M93 + W M94
    QF_04: ['R16_07', 'R16_08'], // M100 = W M95 + W M96
    // Semi-finals (M101–M102)
    SF_01: ['QF_01', 'QF_02'], // M101 = W M97 + W M98
    SF_02: ['QF_03', 'QF_04'], // M102 = W M99 + W M100
    // Final (M104)
    FINAL_01: ['SF_01', 'SF_02'], // M104 = W M101 + W M102
  };

  const getMatchesForRound = (round: string) => {
    const slotsForRound = Object.keys(FEED_MAP).filter((s) =>
      s.startsWith(round + '_')
    );
    return slotsForRound.map((slot) => {
      const [srcA, srcB] = FEED_MAP[slot];
      return {
        slot,
        teamA: knockoutWinners[srcA] || null,
        teamB: knockoutWinners[srcB] || null,
      };
    });
  };

  const handleSave = async () => {
    if (!entryId || locked) return;
    setSaving(true);

    const picks: any[] = [];

    GROUPS.forEach((g) => {
      const ordered = groupOrders[g] || [];
      ordered.forEach((team, idx) => {
        picks.push({
          entry_id: entryId,
          match_slot: `GROUP_${g}_${idx + 1}`,
          pick_type: 'group_rank',
          team_id: team.id,
          predicted_rank: idx + 1,
        });
      });
    });

    thirdPlacePicks.forEach((team, idx) => {
      picks.push({
        entry_id: entryId,
        match_slot: `THIRD_${idx + 1}`,
        pick_type: 'advance',
        team_id: team.id,
        predicted_rank: null,
      });
    });

    Object.entries(knockoutWinners).forEach(([slot, team]) => {
      picks.push({
        entry_id: entryId,
        match_slot: slot,
        pick_type: slot.startsWith('FINAL') ? 'champion' : 'knockout_winner',
        team_id: team.id,
        predicted_rank: null,
      });
    });

    if (picks.length > 0) {
      await supabase
        .from('picks')
        .upsert(picks, { onConflict: 'entry_id,match_slot' });
    }

    await supabase
      .from('entries')
      .update({
        bonus_picks: {
          top_scorer: topScorer,
          dark_horse: darkHorse,
          upset_team: upsetTeam,
        },
      })
      .eq('id', entryId);

    setSaving(false);
    setSaved(true);
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen stadium-bg flex items-center justify-center">
        <div className="text-white text-xl">Loading bracket...</div>
      </div>
    );
  }

  const currentStep = STEPS[step];

  return (
    <div className="min-h-screen" style={{ background: '#f4f6f9' }}>
      <div className="stadium-bg px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <a href="/" className="text-white/60 hover:text-white text-sm">
              ← Home
            </a>
            <span className="text-white/60 text-sm">
              {locked ? '🔒 Bracket locked' : `Welcome, ${nickname}`}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">
            2026 World Cup Bracket
          </h1>

          <div className="flex gap-1 flex-wrap">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setStep(i)}
                className={`step-dot ${
                  i === step ? 'active' : i < step ? 'done' : ''
                }`}
                title={s.label}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-white/80 text-sm font-medium">
              Step {step + 1} of {STEPS.length}: {currentStep.label}
            </span>
            {!locked && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-semibold px-4 py-1.5 rounded-full transition-colors"
              >
                {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Progress'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {currentStep.id === 'instructions' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Welcome to the Dillon Consulting Bracket Challenge 🏆
            </h2>
            <p className="text-gray-500 mb-6">
              Follow the steps to fill out your complete World Cup bracket.
              Here&apos;s how it works:
            </p>
            <div className="flex flex-col gap-4">
              {[
                {
                  num: '1',
                  title: 'Rank the groups',
                  desc: 'For each of the 12 groups, drag teams into your predicted finishing order. The top 2 from each group advance automatically.',
                },
                {
                  num: '2',
                  title: 'Pick the best 3rd-place teams',
                  desc: "The 8 best 3rd-place finishers also advance. Pick which 8 you think they'll be.",
                },
                {
                  num: '3',
                  title: 'Fill out the knockout rounds',
                  desc: 'Click a team in each match to advance them. Go from Round of 32 all the way to the Final.',
                },
                {
                  num: '4',
                  title: 'Add bonus picks',
                  desc: 'Optionally pick a top scorer, dark horse team, and biggest upset team for extra points.',
                },
                {
                  num: '5',
                  title: 'Submit before the deadline',
                  desc: 'Brackets lock on June 11, 2026 at 3:00 PM ET. You can edit any time before then.',
                },
              ].map((item) => (
                <div key={item.num} className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full stadium-bg text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {item.num}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800">
                      {item.title}
                    </div>
                    <div className="text-sm text-gray-500">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <div className="font-semibold text-yellow-800 mb-1">
                ⏰ Deadline
              </div>
              <div className="text-sm text-yellow-700">
                June 11, 2026 at 3:00 PM Eastern Time. Brackets are
                automatically locked after this time.
              </div>
            </div>
          </div>
        )}

        {currentStep.id === 'groups_ABCD' && (
          <div className="flex flex-col gap-4">
            <div className="card bg-blue-50 border border-blue-100">
              <p className="text-sm text-blue-700 font-medium">
                📋 Drag teams up or down to set your predicted group finishing
                order. The top 2 teams advance to the Round of 32.
              </p>
            </div>
            {['A', 'B', 'C', 'D'].map((g) => (
              <GroupStage
                key={g}
                groupName={g}
                teams={teams[g] || []}
                savedOrder={groupOrders[g] || null}
                onSave={handleGroupSave}
              />
            ))}
          </div>
        )}

        {currentStep.id === 'groups_EFGH' && (
          <div className="flex flex-col gap-4">
            <div className="card bg-blue-50 border border-blue-100">
              <p className="text-sm text-blue-700 font-medium">
                📋 Drag teams up or down to set your predicted group finishing
                order. The top 2 teams advance to the Round of 32.
              </p>
            </div>
            {['E', 'F', 'G', 'H'].map((g) => (
              <GroupStage
                key={g}
                groupName={g}
                teams={teams[g] || []}
                savedOrder={groupOrders[g] || null}
                onSave={handleGroupSave}
              />
            ))}
          </div>
        )}

        {currentStep.id === 'groups_IJKL' && (
          <div className="flex flex-col gap-4">
            <div className="card bg-blue-50 border border-blue-100">
              <p className="text-sm text-blue-700 font-medium">
                📋 Drag teams up or down to set your predicted group finishing
                order. The top 2 teams advance to the Round of 32.
              </p>
            </div>
            {['I', 'J', 'K', 'L'].map((g) => (
              <GroupStage
                key={g}
                groupName={g}
                teams={teams[g] || []}
                savedOrder={groupOrders[g] || null}
                onSave={handleGroupSave}
              />
            ))}
          </div>
        )}

        {currentStep.id === 'third_place' && (
          <div className="card">
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              Best 3rd-Place Teams
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              8 of the 12 third-place finishers will advance to the Round of 32.
              Pick which 8 you think will make it.
            </p>
            <div className="mb-4 flex items-center gap-2">
              <div className="text-sm font-semibold text-teal-700">
                {thirdPlacePicks.length} / 8 selected
              </div>
              {thirdPlacePicks.length === 8 && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  ✓ Complete
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {getThirdPlaceTeams().map((team) => (
                <div
                  key={team.id}
                  onClick={() => !locked && toggleThirdPlace(team)}
                  className={`team-card cursor-pointer ${
                    thirdPlacePicks.find((t) => t.id === team.id)
                      ? 'border-teal-400 bg-teal-50'
                      : ''
                  }`}
                >
                  <span className="text-2xl">{team.flag_emoji}</span>
                  <span className="font-semibold text-gray-800 flex-1">
                    {team.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    Group {team.group_name} · 3rd
                  </span>
                  {thirdPlacePicks.find((t) => t.id === team.id) && (
                    <span className="text-teal-600 font-bold">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep.id === 'R32' && (
          <div className="flex flex-col gap-4">
            {thirdPlacePicks.length < 8 && (
              <div className="card bg-yellow-50 border border-yellow-200">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ Some matchups show TBD because you&apos;ve only picked{' '}
                  {thirdPlacePicks.length} of 8 best third-place teams. Go back
                  to the <strong>Best 3rd Place</strong> step and pick all 8 to
                  fill the remaining Round of 32 slots.
                </p>
              </div>
            )}
            <KnockoutBracket
              round="R32"
              matches={getR32Matches()}
              winners={knockoutWinners}
              onPick={handleKnockoutPick}
              locked={locked}
            />
          </div>
        )}

        {currentStep.id === 'R16' && (
          <KnockoutBracket
            round="R16"
            matches={getMatchesForRound('R16')}
            winners={knockoutWinners}
            onPick={handleKnockoutPick}
            locked={locked}
          />
        )}

        {currentStep.id === 'QF' && (
          <KnockoutBracket
            round="QF"
            matches={getMatchesForRound('QF')}
            winners={knockoutWinners}
            onPick={handleKnockoutPick}
            locked={locked}
          />
        )}

        {currentStep.id === 'SF' && (
          <KnockoutBracket
            round="SF"
            matches={getMatchesForRound('SF')}
            winners={knockoutWinners}
            onPick={handleKnockoutPick}
            locked={locked}
          />
        )}

        {currentStep.id === 'FINAL' && (
          <KnockoutBracket
            round="FINAL"
            matches={getMatchesForRound('FINAL')}
            winners={knockoutWinners}
            onPick={handleKnockoutPick}
            locked={locked}
          />
        )}

        {currentStep.id === 'bonus' && (
          <div className="card">
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              Bonus Picks ⭐
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Optional picks for extra points. These won&apos;t hurt your score
              if wrong.
            </p>
            <div className="flex flex-col gap-5">
              {[
                {
                  label: 'Top Scorer (Golden Boot)',
                  key: 'topScorer',
                  value: topScorer,
                  setter: setTopScorer,
                  placeholder: 'e.g. Kylian Mbappé',
                  points: '+10 pts',
                },
                {
                  label: 'Dark Horse Team',
                  key: 'darkHorse',
                  value: darkHorse,
                  setter: setDarkHorse,
                  placeholder: 'e.g. Morocco',
                  points: '+8 pts if they reach semis',
                },
                {
                  label: 'Biggest Upset Team',
                  key: 'upsetTeam',
                  value: upsetTeam,
                  setter: setUpsetTeam,
                  placeholder: 'e.g. Saudi Arabia',
                  points: '+5 pts',
                },
              ].map((item) => (
                <div key={item.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-gray-700">
                      {item.label}
                    </label>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      {item.points}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={item.value}
                    onChange={(e) => item.setter(e.target.value)}
                    placeholder={item.placeholder}
                    disabled={locked}
                    className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 text-gray-800 focus:outline-none focus:border-teal-500 transition-colors disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep.id === 'submit' && (
          <div className="card text-center">
            <div className="text-5xl mb-4">🏆</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              {locked ? 'Your bracket is locked!' : 'Ready to submit?'}
            </h3>
            <p className="text-gray-500 mb-6">
              {locked
                ? 'The deadline has passed. Your picks are saved.'
                : 'Hit save to lock in your picks. You can come back and edit until June 11 at 3:00 PM ET.'}
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
              <div className="text-sm font-semibold text-gray-700 mb-3">
                Your bracket summary
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-500">Groups ranked</div>
                <div className="font-medium text-gray-800">
                  {Object.keys(groupOrders).length} / 12
                </div>
                <div className="text-gray-500">3rd place picks</div>
                <div className="font-medium text-gray-800">
                  {thirdPlacePicks.length} / 8
                </div>
                <div className="text-gray-500">Knockout picks</div>
                <div className="font-medium text-gray-800">
                  {Object.keys(knockoutWinners).length} total
                </div>
                <div className="text-gray-500">Champion pick</div>
                <div className="font-medium text-gray-800">
                  {knockoutWinners['FINAL_01']
                    ? `${knockoutWinners['FINAL_01'].flag_emoji} ${knockoutWinners['FINAL_01'].name}`
                    : 'Not picked yet'}
                </div>
              </div>
            </div>
            {!locked && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary w-full"
              >
                {saving
                  ? 'Saving...'
                  : saved
                  ? '✓ Bracket Saved!'
                  : '💾 Save My Bracket'}
              </button>
            )}
            <div className="mt-4 flex gap-3 justify-center">
              <a href="/" className="btn-secondary">
                ← Back to Home
              </a>
              <a href="/leaderboard" className="btn-secondary">
                View Leaderboard →
              </a>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <button
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={step === STEPS.length - 1}
            className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
