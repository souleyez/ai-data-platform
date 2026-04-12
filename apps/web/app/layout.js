import './globals.css';

export const metadata = {
  title: 'AI智能助手',
  description: '个人知识库，采编写一站式解决',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var mode = localStorage.getItem('aidp_theme_mode_v1');
                  var nextMode = mode === 'dark' ? 'dark' : 'light';
                  document.documentElement.dataset.theme = nextMode;
                  document.documentElement.style.colorScheme = nextMode;
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
