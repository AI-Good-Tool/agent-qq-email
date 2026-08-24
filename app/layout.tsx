import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_ORIGIN ?? 'http://localhost:3000'),
  title: '云邮盒 · 多微信邮箱管理',
  description: '聚合多个微信账号下的邮箱，在一个工作台中统一检索、筛选与处理。',
  openGraph: {
    title: '云邮盒 · 多个微信，一个收件箱',
    description: '聚合多个微信账号下的邮箱，在一个工作台中统一检索、筛选与处理。',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: '云邮盒：多个微信，一个收件箱' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '云邮盒 · 多个微信，一个收件箱',
    description: '统一检索、筛选与处理多个微信账号下的邮箱。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={geistSans.variable}>{children}</body>
    </html>
  );
}
