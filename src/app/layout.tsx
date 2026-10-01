import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import AuthSessionProvider from '@/components/auth/AuthSessionProvider';
import './globals.css';

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const codeFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KaracterHub | Ideas into working software',
  description: 'Describe an idea, generate a working app, and shape it in a live development workspace.',
  applicationName: 'KaracterHub',
  keywords: ['KaracterHub', 'AI app builder', 'web development', 'code generation'],
  authors: [{ name: 'KaracterHub' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'KaracterHub',
    title: 'KaracterHub | Ideas into working software',
    description: 'Generate, preview, and refine web applications in one focused workspace.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KaracterHub | Ideas into working software',
    description: 'Generate, preview, and refine web applications in one focused workspace.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#111827' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// Security headers via middleware would be better, but these are defaults
export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${codeFont.variable}`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
