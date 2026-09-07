import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pronunciation Trainer',
  description:
    'Multilingual Pronunciation Learning and Assessment System - practise pronunciation and track your progress.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
