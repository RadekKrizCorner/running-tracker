import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthOptions, useDemoLogin, useLogin } from '../features/auth/api';
import { ApiError } from '../lib/api/client';
import { useTranslation } from '../lib/i18n';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authOptions = useAuthOptions();
  const login = useLogin();
  const demoLogin = useDemoLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loginError = login.error instanceof ApiError ? login.error.message : null;
  const demoError = demoLogin.error instanceof ApiError ? demoLogin.error.message : null;
  const error = loginError ?? demoError;

  return (
    <main className="auth-page">
      <form
        className="auth-panel"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate(
            { email, password },
            {
              onSuccess: () => navigate('/dashboard'),
            },
          );
        }}
      >
        <div>
          <p className="eyebrow">{t('auth.eyebrow')}</p>
          <h1>{t('auth.login')}</h1>
        </div>
        <label>
          {t('common.email')}
          <input value={email} type="email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          {t('common.password')}
          <input value={password} type="password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={login.isPending}>
          {login.isPending ? t('auth.loggingIn') : t('auth.loginButton')}
        </button>
        {authOptions.data?.demo_enabled ? (
          <button
            className="secondary-button"
            type="button"
            disabled={demoLogin.isPending}
            onClick={() => {
              demoLogin.mutate(undefined, {
                onSuccess: () => navigate('/dashboard'),
              });
            }}
          >
            {demoLogin.isPending ? t('auth.loggingIn') : t('auth.tryDemo')}
          </button>
        ) : null}
      </form>
    </main>
  );
}
