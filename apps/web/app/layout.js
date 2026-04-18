import './globals.css';
import { buildChunkRecoveryScript } from './lib/chunk-error-recovery';

export const metadata = {
  title: 'AI智能助手',
  description: '个人知识库，采编写一站式解决',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning data-theme="dark" style={{ colorScheme: 'dark' }}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: buildChunkRecoveryScript(),
          }}
        />
        {children}
      </body>
    </html>
  );
}
