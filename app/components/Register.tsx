'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Pool } from '@/lib/supabase';

export default function Register({
  pool,
  onRegistered,
}: {
  pool: Pool;
  onRegistered: (entryId: string, nickname: string) => void;
}) {
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nickname.trim() || !email.trim()) {
      setError('Please fill in both fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    const { data: existing } = await supabase
      .from('entries')
      .select('id, nickname')
      .eq('pool_id', pool.id)
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      onRegistered(existing.id, existing.nickname);
      setLoading(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from('entries')
      .insert({
        pool_id: pool.id,
        nickname: nickname.trim(),
        email: email.toLowerCase().trim(),
      })
      .select()
      .single();

    if (insertError) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    onRegistered(data.id, data.nickname);
    setLoading(false);
  };

  return (
    <div className="min-h-screen stadium-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block bg-white/10 rounded-xl px-6 py-2 mb-4">
            <span className="text-white/70 text-sm font-medium tracking-wider uppercase">
              Dillon Consulting
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            2026 FIFA World Cup
          </h1>
          <h2 className="text-2xl text-yellow-300 font-semibold">
            Bracket Challenge
          </h2>
        </div>

        <div className="card">
          <h3 className="text-xl font-bold text-gray-800 mb-1">
            Join the Challenge
          </h3>
          <p className="text-gray-500 text-sm mb-6">
            Enter your details to create your bracket. You can edit it any time
            before the deadline.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nickname
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. GoalMachine99"
                maxLength={30}
                className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 text-gray-800 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dillon.ca"
                className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 text-gray-800 focus:outline-none focus:border-teal-500 transition-colors"
              />
              <p className="text-xs text-gray-400 mt-1">
                Used to identify your bracket. One entry per email.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary mt-2">
              {loading ? 'Joining...' : 'Join the Challenge →'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          Bracket locks June 11, 2026 at 3:00 PM ET
        </p>
      </div>
    </div>
  );
}
