import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recomputeAllScores } from '@/lib/scoring';

// Recomputes every entry's score from the current match results.
// Called by the admin panel after a manual result save. Uses the
// service-role client so it can read all picks and update all entries.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const admin = createAdminClient();
    const { scored } = await recomputeAllScores(admin);
    await admin.from('admin_log').insert({
      action: 'recompute_scores',
      after_json: { scored },
    });
    return NextResponse.json({ ok: true, entries_scored: scored });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Recompute failed: ${err?.message ?? 'unknown'}` },
      { status: 500 }
    );
  }
}
