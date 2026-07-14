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
  const [activeTab, setActiveTab] = useState<
    'entries' | 'results' | 'knockout' | 'export'
  >('entries');
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
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    // Fall back to the match's current values if the admin didn't retype
    // anything, so clicking Save always does something visible.
    const edit = matchEdit[matchId] || {
      home: match.home_score ?? '',
      away: match.away_score ?? '',
      status: match.status,
    };
    setSaving(true);

    const homeScore = parseInt(edit.home);
    const awayScore = parseInt(edit.away);

    let winnerId = null;
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
          {(['entries', 'results', 'knockout', 'export'] as const).map((tab) => (
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
                ? '⚽ Group Results'
                : tab === 'knockout'
                ? '🏆 Knockout'
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

        {activeTab === 'knockout' && (
          <KnockoutPanel
            teams={teams}
            matches={matches}
            onSaved={fetchData}
          />
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

// ============================================================
// Knockout panel: enter R32 matchups + all knockout scores.
// Winners auto-advance server-side; scoring recomputes on save.
// ============================================================

type KTeam = { id: string; name: string; flag_emoji?: string };
type KMatch = {
  slot: string;
  round: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  winner_team_id: string | null;
};

// FIFA slot code -> app slot (reverse of the server map) and round label.
const MATCH_TO_SLOT: Record<string, string> = {
  M73: 'R32_01', M74: 'R32_02', M75: 'R32_03', M76: 'R32_04',
  M77: 'R32_05', M78: 'R32_06', M79: 'R32_07', M80: 'R32_08',
  M81: 'R32_09', M82: 'R32_10', M83: 'R32_11', M84: 'R32_12',
  M85: 'R32_13', M86: 'R32_14', M87: 'R32_15', M88: 'R32_16',
  M89: 'R16_01', M90: 'R16_02', M91: 'R16_03', M92: 'R16_04',
  M93: 'R16_05', M94: 'R16_06', M95: 'R16_07', M96: 'R16_08',
  M97: 'QF_01', M98: 'QF_02', M99: 'QF_03', M100: 'QF_04',
  M101: 'SF_01', M102: 'SF_02', M104: 'FINAL_01',
};

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'FINAL'];
const ROUND_LABEL: Record<string, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
};

function roundOf(appSlot: string): string {
  if (appSlot.startsWith('R32')) return 'R32';
  if (appSlot.startsWith('R16')) return 'R16';
  if (appSlot.startsWith('QF')) return 'QF';
  if (appSlot.startsWith('SF')) return 'SF';
  return 'FINAL';
}

function KnockoutPanel({
  teams,
  matches,
  onSaved,
}: {
  teams: KTeam[];
  matches: KMatch[];
  onSaved: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Only knockout matches (those in the MATCH_TO_SLOT map).
  const koMatches = matches
    .filter((m) => MATCH_TO_SLOT[m.slot])
    .map((m) => ({ ...m, appSlot: MATCH_TO_SLOT[m.slot] }))
    .sort((a, b) => a.appSlot.localeCompare(b.appSlot));

  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  const teamName = (id: string | null) =>
    id ? teams.find((t) => t.id === id)?.name ?? '—' : '—';

  const editFor = (m: any) =>
    edits[m.appSlot] || {
      homeTeamId: m.home_team_id || '',
      awayTeamId: m.away_team_id || '',
      homeScore: m.home_score ?? '',
      awayScore: m.away_score ?? '',
      penHome: '',
      penAway: '',
      status: m.status || 'scheduled',
    };

  const setField = (slot: string, base: any, field: string, value: any) => {
    setEdits((prev) => ({
      ...prev,
      [slot]: { ...base, [field]: value },
    }));
  };

  const save = async (m: any) => {
    const e = editFor(m);
    setSavingSlot(m.appSlot);
    setNote('');
    try {
      const res = await fetch('/api/sync/knockout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: m.appSlot, ...e }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(`⚠️ ${data.error ?? 'Save failed'}`);
      } else {
        const adv = data.advancedTo
          ? ` Winner advanced to ${data.advancedTo}.`
          : '';
        setNote(`✓ Saved ${m.appSlot}.${adv} Scores recomputed.`);
        onSaved();
      }
    } catch (err: any) {
      setNote(`⚠️ ${err?.message ?? 'Network error'}`);
    }
    setSavingSlot(null);
    setTimeout(() => setNote(''), 5000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card bg-amber-50 border border-amber-200">
        <p className="text-sm text-amber-800">
          <strong>How this works:</strong> For the Round of 32, pick both teams
          from the official matchups and enter the score. When you mark a match{' '}
          <strong>Final</strong>, the winner automatically moves into the next
          round below. Penalty boxes only matter if the score is a draw.
        </p>
      </div>

      {note && (
        <div className="card text-sm text-gray-700 bg-white">{note}</div>
      )}

      {ROUND_ORDER.map((round) => {
        const inRound = koMatches.filter((m) => roundOf(m.appSlot) === round);
        if (inRound.length === 0) return null;
        return (
          <div key={round} className="flex flex-col gap-3">
            <h3 className="text-lg font-bold text-gray-800 mt-2">
              {ROUND_LABEL[round]}
            </h3>
            {inRound.map((m) => {
              const e = editFor(m);
              const isR32 = round === 'R32';
              return (
                <div key={m.appSlot} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-gray-800 text-sm">
                      {m.appSlot} ({m.slot})
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.status === 'final'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* HOME team: dropdown for R32, name label otherwise */}
                    {isR32 ? (
                      <select
                        value={e.homeTeamId}
                        onChange={(ev) =>
                          setField(m.appSlot, e, 'homeTeamId', ev.target.value)
                        }
                        className="border-2 border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-800 max-w-[160px]"
                      >
                        <option value="">— home team —</option>
                        {sortedTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm font-medium text-gray-800 min-w-[120px]">
                        {teamName(m.home_team_id)}
                      </span>
                    )}
                    <input
                      type="number"
                      min="0"
                      placeholder="H"
                      value={e.homeScore}
                      onChange={(ev) =>
                        setField(m.appSlot, e, 'homeScore', ev.target.value)
                      }
                      className="w-14 border-2 border-gray-200 rounded-lg px-2 py-2 text-center font-bold text-gray-800"
                    />
                    <span className="text-gray-400 font-bold">–</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="A"
                      value={e.awayScore}
                      onChange={(ev) =>
                        setField(m.appSlot, e, 'awayScore', ev.target.value)
                      }
                      className="w-14 border-2 border-gray-200 rounded-lg px-2 py-2 text-center font-bold text-gray-800"
                    />
                    {isR32 ? (
                      <select
                        value={e.awayTeamId}
                        onChange={(ev) =>
                          setField(m.appSlot, e, 'awayTeamId', ev.target.value)
                        }
                        className="border-2 border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-800 max-w-[160px]"
                      >
                        <option value="">— away team —</option>
                        {sortedTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm font-medium text-gray-800 min-w-[120px]">
                        {teamName(m.away_team_id)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs text-gray-400">
                      Pens (if drawn):
                    </span>
                    <input
                      type="number"
                      min="0"
                      placeholder="H"
                      value={e.penHome}
                      onChange={(ev) =>
                        setField(m.appSlot, e, 'penHome', ev.target.value)
                      }
                      className="w-12 border-2 border-gray-200 rounded-lg px-2 py-1 text-center text-sm text-gray-800"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="A"
                      value={e.penAway}
                      onChange={(ev) =>
                        setField(m.appSlot, e, 'penAway', ev.target.value)
                      }
                      className="w-12 border-2 border-gray-200 rounded-lg px-2 py-1 text-center text-sm text-gray-800"
                    />
                    <select
                      value={e.status}
                      onChange={(ev) =>
                        setField(m.appSlot, e, 'status', ev.target.value)
                      }
                      className="border-2 border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-800"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="final">Final</option>
                    </select>
                    <button
                      onClick={() => save(m)}
                      disabled={savingSlot === m.appSlot}
                      className="btn-primary py-1.5 px-4 text-sm"
                    >
                      {savingSlot === m.appSlot ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
