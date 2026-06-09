'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Entry, Team } from '@/lib/supabase';

const LOCK_TIME = new Date('2026-06-11T19:00:00Z');

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [loading, setLoading] = useState(true);
  const [championPicks, setChampionPicks] = useState<Record<string, string>>(
    {}
  );
  const [myEntryId] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('dillon_entry_id')
      : null
  );
  const locked = Date.now() >= LOCK_TIME.getTime();

  useEffect(() => {
    const fetchData = async () => {
      const { data: teamsData } = await supabase.from('teams').select('*');
      if (teamsData) {
        const teamsMap: Record<string, Team> = {};
        teamsData.forEach((t) => {
          teamsMap[t.id] = t;
        });
        setTeams(teamsMap);
      }

      const { data: entriesData } = await supabase
        .from('entries')
        .select('*')
        .order('total_points', { ascending: false });

      if (entriesData) setEntries(entriesData);
      setLoading(false);
    };

    fetchData();

    const channel = supabase
      .channel('leaderboard')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'entries' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (entries.length === 0) return;
    entries.forEach(async (entry) => {
      const { data } = await supabase
        .from('picks')
        .select('team_id')
        .eq('entry_id', entry.id)
        .eq('match_slot', 'FINAL_01')
        .single();
      if (data?.team_id) {
        setChampionPicks((prev) => ({ ...prev, [entry.id]: data.team_id }));
      }
    });
  }, [entries]);

  if (loading) {
    return (
      <div className="min-h-screen stadium-bg flex items-center justify-center">
        <div className="text-white text-xl">Loading leaderboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#f4f6f9' }}>
      <div className="stadium-bg px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block bg-white/10 rounded-xl px-6 py-2 mb-4">
            <span className="text-white/70 text-sm font-medium tracking-wider uppercase">
              Dillon Consulting
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">🏆 Leaderboard</h1>
          <p className="text-white/60 text-sm">
            {locked
              ? 'Brackets are locked — final standings'
              : 'Brackets not yet locked — rankings will update as the tournament progresses'}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {!locked && (
          <div className="card mb-6 bg-yellow-50 border border-yellow-200">
            <p className="text-yellow-800 text-sm font-medium">
              🔓 Brackets are still open. The leaderboard will become active
              after the lock time on June 11 at 3:00 PM ET.
            </p>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">👀</div>
            <p className="text-gray-500">No entries yet. Be the first to join!</p>
            <a href="/" className="btn-primary inline-block mt-4">
              Join the Challenge
            </a>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="leaderboard-row bg-gray-50 border-b border-gray-200">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Rank
              </div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Player
              </div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                Points
              </div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                Max Left
              </div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Champion Pick
              </div>
            </div>

            {entries.map((entry, index) => {
              const isMe = entry.id === myEntryId;
              const championTeam = championPicks[entry.id]
                ? teams[championPicks[entry.id]]
                : null;

              return (
                <div
                  key={entry.id}
                  className={`leaderboard-row ${isMe ? 'me' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    {index === 0 && <span className="text-xl">🥇</span>}
                    {index === 1 && <span className="text-xl">🥈</span>}
                    {index === 2 && <span className="text-xl">🥉</span>}
                    {index > 2 && (
                      <span className="text-gray-500 font-semibold text-sm">
                        {index + 1}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="font-semibold text-gray-800 text-sm">
                      {entry.nickname}
                    </span>
                    {isMe && (
                      <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-gray-800">
                      {entry.total_points}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">pts</span>
                  </div>

                  <div className="text-right">
                    <span className="text-sm text-gray-500">
                      {entry.max_possible}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600">
                    {championTeam ? (
                      <span>
                        {championTeam.flag_emoji} {championTeam.name}
                      </span>
                    ) : (
                      <span className="text-gray-300 italic text-xs">
                        Not picked
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-between mt-6">
          <a href="/" className="btn-secondary">
            ← Home
          </a>
          {myEntryId && (
            <a href="/bracket" className="btn-primary">
              {locked ? '📋 View My Bracket' : '✏️ Edit My Bracket'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
