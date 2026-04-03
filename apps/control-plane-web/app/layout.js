import './globals.css';
import ControlPlaneNav from './components/ControlPlaneNav';

export const metadata = {
  title: 'AI Data Platform Control Plane',
  description: 'Windows installer control plane for licensing, releases, and model pools.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="cp-app-shell">
          <ControlPlaneNav />
          {children}
        </div>
      </body>
    </html>
  );
}
