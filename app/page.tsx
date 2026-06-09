'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Pool } from '@/lib/supabase';
import Register from '@/app/components/Register';

const LOCK_TIME = new Date('2026-06-11T19:00:00Z');

function useCountdown(target: Date) {
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, target.getTime() - Date.now())
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(Math.max(0, target.getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);
  const days = Math.floor(timeLeft / 86400000);
  const hours = Math.floor((timeLeft % 86400000) / 3600000);
  const minutes = Math.floor((timeLeft % 3600000) / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  return { days, hours, minutes, seconds, expired: timeLeft === 0 };
}

export default function Home() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(true);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const countdown = useCountdown(LOCK_TIME);

  useEffect(() => {
    const savedEntry = localStorage.getItem('dillon_entry_id');
    const savedNick = localStorage.getItem('dillon_nickname');
    if (savedEntry) setEntryId(savedEntry);
    if (savedNick) setNickname(savedNick);

    supabase
      .from('pools')
      .select('*')
      .eq('slug', 'dillon')
      .single()
      .then(({ data }) => {
        setPool(data);
        setLoading(false);
      });
  }, []);

  const handleRegistered = (id: string, nick: string) => {
    setEntryId(id);
    setNickname(nick);
    localStorage.setItem('dillon_entry_id', id);
    localStorage.setItem('dillon_nickname', nick);
  };

  if (loading) {
    return (
      <div className="min-h-screen stadium-bg flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!entryId) {
    return <Register pool={pool!} onRegistered={handleRegistered} />;
  }

  return (
    <div className="min-h-screen stadium-bg">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-block bg-white/10 rounded-xl px-6 py-2 mb-4">
            <span className="text-white/70 text-sm font-medium tracking-wider uppercase">
              Dillon Consulting
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            2026 FIFA World Cup
          </h1>
          <h2 className="text-2xl text-yellow-300 font-semibold mb-6">
            Bracket Challenge
          </h2>

          {!countdown.expired ? (
            <div className="mb-8">
              <p className="text-white/70 text-sm mb-3 uppercase tracking-wider">
                Bracket locks in
              </p>
              <div className="flex gap-3 justify-center">
                {[
                  { label: 'Days', value: countdown.days },
                  { label: 'Hours', value: countdown.hours },
                  { label: 'Mins', value: countdown.minutes },
                  { label: 'Secs', value: countdown.seconds },
                ].map(({ label, value }) => (
                  <div key={label} className="countdown-box">
                    <div className="text-3xl font-bold text-white">
                      {String(value).padStart(2, '0')}
                    </div>
                    <div className="text-white/60 text-xs mt-1">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-8 bg-yellow-400/20 rounded-xl px-6 py-3 inline-block">
              <p className="text-yellow-300 font-semibold">Brackets are locked</p>
            </div>
          )}

          <div className="card max-w-md mx-auto">
            <p className="text-lg font-semibold text-gray-800 mb-1">
              Welcome back, {nickname}!
            </p>
            <p className="text-gray-500 text-sm mb-4">
              {countdown.expired
                ? 'The bracket is locked. Check the leaderboard!'
                : 'Your bracket is saved. You can edit it until the deadline.'}
            </p>
            <div className="flex flex-col gap-3">
              <a href="/bracket" className="btn-primary text-center block">
                {countdown.expired ? 'View My Bracket' : 'Edit My Bracket'}
              </a>
              {countdown.expired && (
                <a href="/leaderboard" className="btn-secondary text-center block">
                  View Leaderboard
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
