export const metadata = {
  title: '文档数据助理',
  description: '个人知识库，采编写一站式解决',
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
