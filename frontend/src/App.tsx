import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import AppShell from './layouts/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/admin/UsersPage';
import UploadsPage from './pages/admin/UploadsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* 인증 필요 (USER, ADMIN 모두) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Route>

      {/* ADMIN 전용 */}
      <Route element={<ProtectedRoute allow={['ADMIN']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/uploads" element={<UploadsPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
