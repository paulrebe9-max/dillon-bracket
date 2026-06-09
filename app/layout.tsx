import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dillon Consulting | 2026 FIFA World Cup Bracket Challenge',
  description: 'Pick your winners. Climb the leaderboard. Glory awaits.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
