export const metadata = {
  title: 'AI 数据分析中台',
  description: '基于 OpenClaw 定制的企业只读型 AI 数据分析中台',
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
