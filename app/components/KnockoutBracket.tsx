'use client';

import type { Team } from '@/lib/supabase';

function MatchCard({
  teamA,
  teamB,
  winner,
  onPick,
  locked,
}: {
  teamA: Team | null;
  teamB: Team | null;
  winner: Team | null;
  onPick: (team: Team) => void;
  locked: boolean;
}) {
  return (
    <div className="bracket-match">
      {[teamA, teamB].map((team, i) => (
        <div
          key={i}
          className={`bracket-team ${winner?.id === team?.id ? 'selected' : ''}`}
          onClick={() => {
            if (!locked && team) onPick(team);
          }}
        >
          {team ? (
            <>
              <span className="text-lg">{team.flag_emoji}</span>
              <span className="truncate">{team.name}</span>
            </>
          ) : (
            <span className="text-gray-300 text-xs italic">TBD</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function KnockoutBracket({
  round,
  matches,
  winners,
  onPick,
  locked,
}: {
  round: string;
  matches: { slot: string; teamA: Team | null; teamB: Team | null }[];
  winners: Record<string, Team>;
  onPick: (slot: string, team: Team) => void;
  locked: boolean;
}) {
  const roundLabels: Record<string, string> = {
    R32: 'Round of 32',
    R16: 'Round of 16',
    QF: 'Quarter-finals',
    SF: 'Semi-finals',
    FINAL: 'Final',
  };

  return (
    <div className="card">
      <h3 className="text-lg font-bold text-gray-800 mb-1">
        {roundLabels[round] || round}
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Click a team to pick them as the winner and advance them to the next
        round
      </p>
      <div className="flex flex-wrap gap-4">
        {matches.map((match) => (
          <MatchCard
            key={match.slot}
            teamA={match.teamA}
            teamB={match.teamB}
            winner={winners[match.slot] || null}
            onPick={(team) => onPick(match.slot, team)}
            locked={locked}
          />
        ))}
      </div>
    </div>
  );
}
