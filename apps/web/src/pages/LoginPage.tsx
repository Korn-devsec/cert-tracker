import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { useAuth } from '../lib/auth-context';

interface LocationState {
  from?: string;
}

export function LoginPage(): React.JSX.Element {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from ?? '/';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (loginError) {
      // api ตอบข้อความเดียวกันทุกกรณีที่ login ไม่ผ่าน (กัน user enumeration ตาม Phase 2)
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card">
        <h1>เข้าสู่ระบบ</h1>
        <p className="subtitle">ระบบบริหารวงจรชีวิต SSL Certificate</p>

        {error !== null && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <label htmlFor="email">อีเมล</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">รหัสผ่าน</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button type="submit" className="btn" style={{ width: '100%' }} disabled={isSubmitting}>
            {isSubmitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </Card>
    </div>
  );
}
