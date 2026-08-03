import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

/** เส้นทางทั้งหมดของแอป — หน้าที่ยังไม่ทำใช้ PlaceholderPage เพื่อให้เมนูครบตาม PLAN.md */
export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route
          path="/companies"
          element={
            <PlaceholderPage
              title="บริษัท"
              phase="Phase 7"
              description="จัดการรายชื่อบริษัทลูกค้าและ site"
            />
          }
        />
        <Route
          path="/certificates"
          element={
            <PlaceholderPage
              title="Certificates"
              phase="Phase 7"
              description="รายการใบรับรองทั้งหมด พร้อมค้นหาและดูรายละเอียด"
            />
          }
        />
        <Route
          path="/import"
          element={
            <PlaceholderPage
              title="นำเข้าข้อมูล"
              phase="Phase 7"
              description="นำเข้าไฟล์ Excel รายเดือน (API พร้อมแล้วตั้งแต่ Phase 3)"
            />
          }
        />
        <Route
          path="/tasks"
          element={
            <PlaceholderPage
              title="งานต่ออายุ"
              phase="Phase 7"
              description="ติดตามงานต่ออายุตามขั้นของ workflow"
            />
          }
        />
        <Route
          path="/reports"
          element={
            <PlaceholderPage
              title="รายงาน"
              phase="Phase 8"
              description="ส่งออกรายงาน Excel รายเดือน/รายบริษัท"
            />
          }
        />
        <Route
          path="/settings"
          element={
            <PlaceholderPage
              title="ตั้งค่า/ผู้ใช้"
              phase="Phase 7"
              description="จัดการผู้ใช้และสิทธิ์ (admin)"
            />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
