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

    supabase
      .from('teams')
      .select('*')
      .order('fifa_ranking')
      .then(({ data }) => {
        if (!data) return;
        const grouped: Record<string, Team[]> = {};
        GROUPS.forEach((g) => {
          grouped[g] = data.filter((t) => t.group_name === g);
        });
        setTeams(grouped);
        setGroupOrders(grouped);
        setLoading(false);
      });
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
    const slots: { slot: string; teamA: Team | null; teamB: Team | null }[] = [];
    const groupPairs = [
      ['A', 'B'],
      ['C', 'D'],
      ['E', 'F'],
      ['G', 'H'],
      ['I', 'J'],
      ['K', 'L'],
    ];
    let slotNum = 1;
    for (const [g1, g2] of groupPairs) {
      slots.push({
        slot: `R32_${String(slotNum).padStart(2, '0')}`,
        teamA: groupOrders[g1]?.[0] || null,
        teamB: groupOrders[g2]?.[1] || null,
      });
      slotNum++;
      slots.push({
        slot: `R32_${String(slotNum).padStart(2, '0')}`,
        teamA: groupOrders[g2]?.[0] || null,
        teamB: groupOrders[g1]?.[1] || null,
      });
      slotNum++;
    }
    thirdPlacePicks.slice(0, 8).forEach((team) => {
      slots.push({
        slot: `R32_${String(slotNum).padStart(2, '0')}`,
        teamA: team,
        teamB: null,
      });
      slotNum++;
    });
    return slots.slice(0, 16);
  };

  const getMatchesForRound = (round: string, prevSlotPrefix: string) => {
    const prevWinners = Object.entries(knockoutWinners)
      .filter(([slot]) => slot.startsWith(prevSlotPrefix))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, team]) => team);

    const matches: { slot: string; teamA: Team | null; teamB: Team | null }[] =
      [];
    for (let i = 0; i < prevWinners.length; i += 2) {
      const slotNum = Math.floor(i / 2) + 1;
      matches.push({
        slot: `${round}_${String(slotNum).padStart(2, '0')}`,
        teamA: prevWinners[i] || null,
        teamB: prevWinners[i + 1] || null,
      });
    }
    return matches;
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
          <KnockoutBracket
            round="R32"
            matches={getR32Matches()}
            winners={knockoutWinners}
            onPick={handleKnockoutPick}
            locked={locked}
          />
        )}

        {currentStep.id === 'R16' && (
          <KnockoutBracket
            round="R16"
            matches={getMatchesForRound('R16', 'R32')}
            winners={knockoutWinners}
            onPick={handleKnockoutPick}
            locked={locked}
          />
        )}

        {currentStep.id === 'QF' && (
          <KnockoutBracket
            round="QF"
            matches={getMatchesForRound('QF', 'R16')}
            winners={knockoutWinners}
            onPick={handleKnockoutPick}
            locked={locked}
          />
        )}

        {currentStep.id === 'SF' && (
          <KnockoutBracket
            round="SF"
            matches={getMatchesForRound('SF', 'QF')}
            winners={knockoutWinners}
            onPick={handleKnockoutPick}
            locked={locked}
          />
        )}

        {currentStep.id === 'FINAL' && (
          <KnockoutBracket
            round="FINAL"
            matches={getMatchesForRound('FINAL', 'SF')}
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
