import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from './Sidebar';

/** โครงหน้าหลัง login: sidebar + เนื้อหา — ยังไม่ login ให้เด้งไปหน้า Login */
export function AppLayout(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // จำหน้าที่ผู้ใช้ตั้งใจเปิดไว้ เพื่อกลับมาให้ถูกที่หลัง login
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
