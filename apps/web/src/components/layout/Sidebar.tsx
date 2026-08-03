/**
 * เมนูหลักของระบบ — รายการตาม PLAN.md Phase 6
 * (หน้า Companies/Certificates/Import/Tasks/Settings สร้างจริงใน Phase 7, Reports ใน Phase 8)
 */
import { NavLink } from 'react-router-dom';
import { USER_ROLE_LABEL_TH } from '@cert-tracker/shared';
import { useAuth } from '../../lib/auth-context';

interface MenuItem {
  to: string;
  label: string;
  icon: string;
}

const MENU: MenuItem[] = [
  { to: '/', label: 'Dashboard', icon: '▤' },
  { to: '/companies', label: 'บริษัท', icon: '◫' },
  { to: '/certificates', label: 'Certificates', icon: '▧' },
  { to: '/import', label: 'นำเข้าข้อมูล', icon: '↥' },
  { to: '/tasks', label: 'งานต่ออายุ', icon: '☑' },
  { to: '/reports', label: 'รายงาน', icon: '▦' },
  { to: '/settings', label: 'ตั้งค่า/ผู้ใช้', icon: '⚙' },
];

export function Sidebar(): React.JSX.Element {
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        SSL Certificate
        <span>ระบบบริหารวงจรชีวิตใบรับรอง</span>
      </div>

      <nav className="sidebar-nav" aria-label="เมนูหลัก">
        {MENU.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}
          >
            <span className="sidebar-link-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {user !== null && (
        <div className="sidebar-user">
          <div>
            <strong>{user.name}</strong>
            <div>{USER_ROLE_LABEL_TH[user.role]}</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      )}
    </aside>
  );
}
