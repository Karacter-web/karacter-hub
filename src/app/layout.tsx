import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Karacter Hub - AI Web App Builder',
  description: 'Turn your ideas into running web applications. Describe what you want, AI builds it, you refine it.',
  keywords: ['AI', 'web development', 'app builder', 'code generation', 'Next.js', 'React'],
  authors: [{ name: 'Karacter Hub' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://karacter.hub',
    siteName: 'Karacter Hub',
    title: 'Karacter Hub - AI Web App Builder',
    description: 'Turn your ideas into running web applications.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Karacter Hub - AI Web App Builder',
    description: 'Turn your ideas into running web applications.',
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
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
