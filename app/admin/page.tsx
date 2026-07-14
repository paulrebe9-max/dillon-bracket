'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ADMIN_PASSWORD = 'dillon2026';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'entries' | 'results' | 'export'>(
    'entries'
  );
  const [matchEdit, setMatchEdit] = useState<
    Record<string, { home: string; away: string; status: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Sync failed: ${data.error ?? 'unknown error'}`);
      } else {
        setMsg(
          `Synced from API-Football — ${data.matches_updated} match(es) updated.`
        );
        fetchData();
      }
    } catch (err: any) {
      setMsg(`Sync failed: ${err?.message ?? 'network error'}`);
    }
    setSyncing(false);
    setTimeout(() => setMsg(''), 5000);
  };

  const fetchData = async () => {
    setLoading(true);
    const [{ data: e }, { data: m }, { data: t }] = await Promise.all([
      supabase.from('entries').select('*').order('created_at', { ascending: false }),
      supabase.from('matches').select('*').order('kickoff_time'),
      supabase.from('teams').select('*').order('group_name'),
    ]);
    if (e) setEntries(e);
    if (m) setMatches(m);
    if (t) setTeams(t);
    setLoading(false);
  };

  useEffect(() => {
    if (authed) fetchData();
  }, [authed]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAuthed(true);
    } else {
      setMsg('Incorrect password');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Delete this entry and all their picks?')) return;
    await supabase.from('entries').delete().eq('id', id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setMsg('Entry deleted.');
  };

  const handleSaveResult = async (matchId: string) => {
    const edit = matchEdit[matchId];
    if (!edit) return;
    setSaving(true);

    const homeScore = parseInt(edit.home);
    const awayScore = parseInt(edit.away);

    let winnerId = null;
    const match = matches.find((m) => m.id === matchId);
    if (edit.status === 'final' && match) {
      if (homeScore > awayScore) winnerId = match.home_team_id;
      else if (awayScore > homeScore) winnerId = match.away_team_id;
    }

    await supabase
      .from('matches')
      .update({
        home_score: isNaN(homeScore) ? null : homeScore,
        away_score: isNaN(awayScore) ? null : awayScore,
        status: edit.status,
        winner_team_id: winnerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    await supabase.from('admin_log').insert({
      action: 'update_match_result',
      target_id: matchId,
      after_json: {
        home_score: homeScore,
        away_score: awayScore,
        status: edit.status,
      },
    });

    // Recompute everyone's points now that this result changed.
    try {
      await fetch('/api/sync/recompute', { method: 'POST' });
    } catch {
      // non-fatal: the result is saved; scores can be recomputed via Sync too
    }

    setMsg('Result saved & scores updated!');
    fetchData();
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleExport = () => {
    const headers = [
      'nickname',
      'email',
      'total_points',
      'max_possible',
      'boldness_score',
      'created_at',
    ];
    const rows = entries.map((e) =>
      headers.map((h) => JSON.stringify(e[h] ?? '')).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dillon_bracket_entries.csv';
    a.click();
  };

  if (!authed) {
    return (
      <div className="min-h-screen stadium-bg flex items-center justify-center px-4">
        <div className="card w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 mb-4">Admin Login</h1>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 text-gray-800 focus:outline-none focus:border-teal-500"
            />
            {msg && <p className="text-red-500 text-sm">{msg}</p>}
            <button type="submit" className="btn-primary">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#f4f6f9' }}>
      <div className="stadium-bg px-4 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            <p className="text-white/60 text-sm">
              Dillon Consulting Bracket Challenge
            </p>
          </div>
          <a href="/" className="text-white/60 hover:text-white text-sm">
            ← Back to site
          </a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {msg && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm mb-4">
            {msg}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {(['entries', 'results', 'export'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {tab === 'entries'
                ? `👥 Entries (${entries.length})`
                : tab === 'results'
                ? '⚽ Match Results'
                : '📥 Export'}
            </button>
          ))}
        </div>

        {activeTab === 'entries' && (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-5 gap-4">
              {['Nickname', 'Email', 'Points', 'Joined', 'Actions'].map((h) => (
                <div
                  key={h}
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </div>
              ))}
            </div>
            {loading ? (
              <div className="px-4 py-8 text-center text-gray-400">
                Loading...
              </div>
            ) : entries.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400">
                No entries yet.
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="px-4 py-3 grid grid-cols-5 gap-4 items-center border-b border-gray-100 hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-800 text-sm">
                    {entry.nickname}
                  </div>
                  <div className="text-gray-500 text-sm truncate">
                    {entry.email}
                  </div>
                  <div className="font-bold text-gray-800">
                    {entry.total_points}
                  </div>
                  <div className="text-gray-400 text-xs">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </div>
                  <button
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="text-red-500 hover:text-red-700 text-xs font-medium text-left"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'results' && (
          <div className="flex flex-col gap-4">
            <div className="card flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-semibold text-gray-800">
                  Auto-fetch results
                </div>
                <p className="text-sm text-gray-500">
                  Pull the latest scores from API-Football. Updates run
                  automatically every hour, or click to sync now.
                </p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="btn-primary py-2 px-5 text-sm"
              >
                {syncing ? 'Syncing…' : '🔄 Sync now'}
              </button>
            </div>
            <div className="card bg-blue-50 border border-blue-100">
              <p className="text-sm text-blue-700">
                You can also enter a score manually below and set status to{' '}
                <strong>final</strong>. Manual edits override the last sync
                until the next one runs.
              </p>
            </div>
            {matches.length === 0 ? (
              <div className="card text-center py-8 text-gray-400">
                No matches in the database yet. Matches will be seeded when the
                tournament schedule is confirmed.
              </div>
            ) : (
              matches.map((match) => {
                const home = teams.find((t) => t.id === match.home_team_id);
                const away = teams.find((t) => t.id === match.away_team_id);
                const edit = matchEdit[match.id] || {
                  home: match.home_score ?? '',
                  away: match.away_score ?? '',
                  status: match.status,
                };
                return (
                  <div key={match.id} className="card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-semibold text-gray-800">
                        {home?.flag_emoji} {home?.name} vs {away?.flag_emoji}{' '}
                        {away?.name}
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          match.status === 'final'
                            ? 'bg-green-100 text-green-700'
                            : match.status === 'live'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {match.status}
                      </span>
                    </div>
                    <div className="flex gap-3 items-center flex-wrap">
                      <input
                        type="number"
                        min="0"
                        placeholder="Home"
                        value={edit.home}
                        onChange={(e) =>
                          setMatchEdit((prev) => ({
                            ...prev,
                            [match.id]: { ...edit, home: e.target.value },
                          }))
                        }
                        className="w-20 border-2 border-gray-200 rounded-lg px-3 py-2 text-center font-bold text-gray-800 focus:outline-none focus:border-teal-500"
                      />
                      <span className="text-gray-400 font-bold">–</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="Away"
                        value={edit.away}
                        onChange={(e) =>
                          setMatchEdit((prev) => ({
                            ...prev,
                            [match.id]: { ...edit, away: e.target.value },
                          }))
                        }
                        className="w-20 border-2 border-gray-200 rounded-lg px-3 py-2 text-center font-bold text-gray-800 focus:outline-none focus:border-teal-500"
                      />
                      <select
                        value={edit.status}
                        onChange={(e) =>
                          setMatchEdit((prev) => ({
                            ...prev,
                            [match.id]: { ...edit, status: e.target.value },
                          }))
                        }
                        className="border-2 border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:border-teal-500"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="live">Live</option>
                        <option value="final">Final</option>
                      </select>
                      <button
                        onClick={() => handleSaveResult(match.id)}
                        disabled={saving}
                        className="btn-primary py-2 px-4 text-sm"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'export' && (
          <div className="card">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Export Data</h3>
            <p className="text-gray-500 text-sm mb-6">
              Download all entries as a CSV file. Includes nickname, email,
              points, and submission date.
            </p>
            <button onClick={handleExport} className="btn-primary">
              📥 Download Entries CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
