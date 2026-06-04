import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSetupOwner } from '../features/auth/api';
import { ApiError } from '../lib/api/client';
import { useTranslation } from '../lib/i18n';

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setupOwner = useSetupOwner();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const error = setupOwner.error instanceof ApiError ? setupOwner.error.message : null;

  return (
    <main className="auth-page">
      <form
        className="auth-panel"
        onSubmit={(event) => {
          event.preventDefault();
          setupOwner.mutate(
            { email, password },
            {
              onSuccess: () => navigate('/dashboard'),
            },
          );
        }}
      >
        <div>
          <p className="eyebrow">{t('auth.firstRun')}</p>
          <h1>{t('auth.setupTitle')}</h1>
        </div>
        <label>
          {t('auth.ownerEmail')}
          <input value={email} type="email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          {t('common.password')}
          <input value={password} type="password" autoComplete="new-password" minLength={10} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={setupOwner.isPending}>
          {setupOwner.isPending ? t('common.saving') : t('auth.savePassword')}
        </button>
        <Link to="/login">{t('auth.backToLogin')}</Link>
      </form>
    </main>
  );
}
