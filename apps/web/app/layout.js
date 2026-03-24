import './globals.css';

export const metadata = {
  title: 'AI 知识数据管理',
  description: '个人知识库，采编写一站式解决',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
