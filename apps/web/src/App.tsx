import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { CertificateDetailPage } from './pages/CertificateDetailPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportPage } from './pages/ImportPage';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage } from './pages/ReportsPage';
import { TasksPage } from './pages/TasksPage';
import { UsersPage } from './pages/UsersPage';

/** เส้นทางทั้งหมดของแอป — หน้า Reports ยังเป็น placeholder รอ Phase 8 */
export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
        <Route path="/certificates/:id" element={<CertificateDetailPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<UsersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
