import type { Metadata, Viewport } from 'next';
import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { SideNav } from '@/components/layout/SideNav';
import { StoreProvider } from '@/lib/store/StoreProvider';
import { ToastHost } from '@/components/ui/ToastHost';
import './globals.css';

export const metadata: Metadata = {
  title: 'Академия — Безумный Азарт',
  description: 'Здесь роскошь и отчаяние идут рука об руку.',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/logo.ico', type: 'image/x-icon' }],
    shortcut: '/favicon.ico',
    apple: '/logo.ico',
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Академия' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#08070a',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <StoreProvider>
          <TopBar />
          <div className="lg:flex lg:gap-6 lg:max-w-7xl lg:mx-auto lg:px-6">
            <SideNav />
            <main className="flex-1 pb-24 lg:pb-8 min-w-0">
              {children}
            </main>
          </div>
          <BottomNav />
          <ToastHost />
        </StoreProvider>
      </body>
    </html>
  );
}
