import './globals.css';

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
            __html: `
              (function () {
                try {
                  localStorage.removeItem('aidp_theme_mode_v1');
                  document.documentElement.dataset.theme = 'dark';
                  document.documentElement.style.colorScheme = 'dark';
                } catch (error) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
