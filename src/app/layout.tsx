import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppProviders } from '@/components/AppProviders';

export const metadata: Metadata = {
  title: {
    default: 'برنامه‌ریز من — زمان‌بند شخصی',
    template: '%s | برنامه‌ریز من',
  },
  description:
    'زمان‌بند شخصی دانش‌آموز با تایم‌لاین روزانه، یادآور، موتور تکرار پیشرفته، ورود/خروج JSON و کارکرد کامل آفلاین.',
  applicationName: 'برنامه‌ریز من',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'برنامه‌ریز من',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fb' },
    { media: '(prefers-color-scheme: dark)', color: '#15161a' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa-IR" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- this is the root layout used by every route */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only sr-only-focusable">
          رفتن به محتوای اصلی
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
