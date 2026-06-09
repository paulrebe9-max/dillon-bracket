# Dillon Consulting — 2026 World Cup Bracket Challenge  

A nickname + email bracket pool (no login). Drag-to-rank group stage,
knockout bracket, bonus picks, live leaderboard, and an admin panel for
entering results. Built with Next.js 14 + Supabase.

This project is **verified to build cleanly** — the import/folder issues from
the earlier attempt are gone (flat structure, `@/` import paths).

---

## Easiest possible deploy (no terminal, no StackBlitz, ~15 min)

You already have a Supabase project and your keys. Here's the cleanest path.

### 1. Load the correct teams into Supabase
Open your Supabase project → **SQL Editor** → **New query**. Paste the entire
contents of `supabase-setup.sql` and click **Run**. (It clears the old
placeholder teams and loads the real 2026 teams. Safe to run now, before
anyone has submitted.)

### 2. Put the code on GitHub — drag and drop, no git commands
1. Go to https://github.com/new and create a repo named `dillon-bracket`
   (leave it empty — no README).
2. On the next page click **"uploading an existing file"**.
3. Unzip the project, then **select everything INSIDE the folder** (the
   `app` folder, `lib`, `package.json`, etc. — NOT the outer folder itself)
   and drag it into the browser.
   - ⚠️ This is the one thing that went wrong last time: make sure
     `package.json` ends up at the **top level** of the repo, not inside a
     subfolder. After uploading, the repo's main page should show `app`,
     `lib`, `package.json` directly.
4. Click **Commit changes**.

### 3. Deploy on Vercel
1. Go to https://vercel.com/new and **Import** the `dillon-bracket` repo.
2. Leave **Root Directory** blank (the files are at the root — don't set it).
3. Expand **Environment Variables** and add these **four**:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://stcnkhfdiwctruogeegt.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key (the long `eyJ...` string)
   - `SUPABASE_SERVICE_ROLE_KEY` = your **service_role** key (from Supabase →
     Settings → API). This is secret — it's only used server-side by the
     results sync. Never put it anywhere public.
   - `RAPIDAPI_KEY` = your API-Football key from RapidAPI.
4. Click **Deploy**. ~60 seconds later you get a live URL.

### 4. Share it
Send your coworkers the Vercel URL. They open it, enter a nickname + email,
fill out their bracket. Nothing to install on their end.

The admin panel is at `your-url.vercel.app/admin` — password is `dillon2026`
(change it in `app/admin/page.tsx`, line with `ADMIN_PASSWORD`).

---

## Live results (auto-fetch)

Scores update automatically. There are two layers:

1. **Auto-sync from API-Football.** A scheduled job hits `/api/sync` **every
   hour** (configured in `vercel.json`) and pulls the latest scores, marking
   matches live/final and setting winners (including penalty shootouts). You
   can also force it any time from the admin **Match Results** tab → **Sync
   now**.
2. **Live leaderboard.** The leaderboard subscribes to the database in
   real time, so the moment a sync (or a manual edit) changes standings,
   everyone's screen updates without refreshing.

Manual entry still works as a fallback — type a score in the admin panel and
set status to **final**. The next hourly sync will overwrite it with official
data, so only use manual entry for matches the API hasn't posted yet.

**Note on the API plan:** API-Football's free tier is 100 calls/day, which is
fine for hourly syncing (~24/day). During the group stage, several matches run
at once; hourly is still plenty for a pool. If you want near-instant scores
you'd need the paid plan, but it isn't required.

---

## Scoring & fixtures
The schema includes a `boldness_score` column (the FIFA-ranking-based scoring
from the spec). The full knockout bracket (the real FIFA matches M73–M104,
Round of 32 through the Final) is seeded by `supabase-setup.sql`, so the admin
panel and the API sync have rows to update from day one. Teams fill into each
knockout tie automatically as results come in.

## If you ever want to run it locally
Requires Node.js. Then: copy `.env.example` to `.env.local`, fill in keys,
`npm install`, `npm run dev`, open http://localhost:3000.
