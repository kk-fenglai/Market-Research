import { useState } from 'react';
import { message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import PasswordStrengthBar from '../components/PasswordStrengthBar';
import { validatePassword, formatPasswordReasons, PASSWORD_MIN_LENGTH } from '../utils/passwordPolicy';
import { AuthShell, Field } from '../components/research/AuthShell';
import { btn } from '../components/research/dark';

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const v = validatePassword(password);
    if (!v.ok) {
      setError(formatPasswordReasons(v.reasons, t));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.reset.mismatch'));
      return;
    }
    try {
      const result = await register(email, password, name || undefined);
      if (result.emailVerificationRequired) {
        navigate(`/verification-sent?email=${encodeURIComponent(result.email)}`);
      } else {
        message.success(t('auth.registerSuccess'));
        navigate('/projects');
      }
    } catch (err: any) {
      const details = err.response?.data?.details;
      if (Array.isArray(details) && details.length) {
        setError(details.map((d: any) => d.message).join('；'));
      } else {
        setError(err.response?.data?.error || t('auth.registerFail'));
      }
    }
  };

  return (
    <AuthShell title={t('auth.register')} subtitle="Create your MarketIntel account">
      <form onSubmit={onSubmit} className="space-y-md">
        <label className="block">
          <span className="mb-base block font-label-caps text-label-caps uppercase text-on-surface-variant">{t('auth.nickname')}</span>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.nicknameOptional')}
            className="w-full rounded border border-outline-variant bg-surface-container-low px-sm py-xs font-body-md text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-primary"
          />
        </label>
        <Field label={t('auth.email')} type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="your@email.com" />
        <Field label={t('auth.password')} type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} />
        <PasswordStrengthBar password={password} />
        <Field label={t('auth.reset.confirmPassword')} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <p className="font-data-sm text-data-sm text-error">{error}</p>}
        <button type="submit" disabled={loading} className={`${btn('primary')} w-full py-sm`}>
          {loading ? 'Creating…' : t('auth.submitRegister')}
        </button>
      </form>
      <p className="mt-lg text-center font-data-sm text-data-sm text-on-surface-variant">
        <Link to="/login" className="text-primary hover:opacity-70">{t('auth.toLogin')}</Link>
      </p>
    </AuthShell>
  );
}
