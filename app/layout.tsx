import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '秋招雷达 2027｜校招岗位工作台',
  description: '聚合并核验 2027 届校招岗位，管理 Base、行业、公司类型与投递行动。',
  openGraph: {
    title: '秋招雷达 2027',
    description: '通用校招岗位发现与投递工作台',
    images: ['/job-pilot-social.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
