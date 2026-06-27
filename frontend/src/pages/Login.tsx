import { useState } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { message, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { api } from '../api/client';
import { AuthShell, Field } from '../components/research/AuthShell';
import { btn } from '../components/research/dark';

export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const redirectAfterLogin = (() => {
    const from = (location.state as { from?: Location } | null)?.from?.pathname;
    return from && from !== '/login' ? from : '/projects';
  })();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      message.success(t('auth.loginSuccess'));
      navigate(redirectAfterLogin, { replace: true });
    } catch (err: any) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      if (status === 403 && code === 'EMAIL_NOT_VERIFIED') {
        const addr = err.response?.data?.email || email;
        Modal.confirm({
          title: t('auth.verify.requiredTitle'),
          content: t('auth.verify.requiredDesc', { email: addr }),
          okText: t('auth.sent.resend'),
          cancelText: t('auth.common.cancel'),
          onOk: async () => {
            try {
              await api.post('/auth/resend-verification', { email: addr, locale: i18n.language });
              message.success(t('auth.sent.resent'));
            } catch (e2: any) {
              message.error(e2.response?.data?.error || t('auth.sent.resendFail'));
            }
          },
        });
      } else if (status === 403 && code === 'USE_ADMIN_LOGIN') {
        message.info(err.response?.data?.error || t('auth.useAdminLogin'));
        navigate('/admin/login');
      } else {
        setError(err.response?.data?.error || t('auth.loginFail'));
      }
    }
  };

  return (
    <AuthShell title={t('auth.login')} subtitle="Welcome back — resume your market research">
      <form onSubmit={onSubmit} className="space-y-md">
        <Field label={t('auth.email')} type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="your@email.com" />
        <Field label={t('auth.password')} type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <p className="font-data-sm text-data-sm text-error">{error}</p>}
        <button type="submit" disabled={loading} className={`${btn('primary')} w-full py-sm`}>
          {loading ? 'Signing in…' : t('auth.submitLogin')}
        </button>
      </form>
      <div className="mt-lg space-y-sm text-center font-data-sm text-data-sm text-on-surface-variant">
        <div className="flex justify-between">
          <Link to="/register" className="text-primary hover:opacity-70">{t('auth.toRegister')}</Link>
          <Link to="/forgot-password" className="hover:text-on-surface">{t('auth.forgotPassword')}</Link>
        </div>
        <Link to="/change-password" className="block hover:text-on-surface">{t('auth.changePassword.fromLogin')}</Link>
      </div>
    </AuthShell>
  );
}
