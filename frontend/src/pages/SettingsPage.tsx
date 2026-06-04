import { useEffect, useRef, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { apiRequest, downloadUrl } from '../lib/api/client';
import { useDisconnectStrava, useStravaStatus, useStravaSync, useStravaSyncJob, stravaConnectUrl, syncStatusIsActive } from '../features/connections/api';
import {
  useHeartRateZones,
  useRecomputeElevationMetrics,
  useRecomputeHeartRateMetrics,
  useSaveHeartRateZones,
  useUpdateUserPreferences,
  useUserPreferences,
} from '../features/profile/api';
import { RunnerScene } from '../components/visuals/RunnerScene';
import type { ElevationRecomputeResponse, HeartRateRecomputeResponse, HeartRateZone, HeartRateZoneSet } from '../lib/api/types';
import { addDaysToIso } from '../lib/date';
import { formatDate } from '../lib/format';
import { useTranslation } from '../lib/i18n';

const DEFAULT_ZONES: HeartRateZone[] = [
  { name: 'Z1', min_hr: 90, max_hr: 120 },
  { name: 'Z2', min_hr: 121, max_hr: 140 },
  { name: 'Z3', min_hr: 141, max_hr: 160 },
  { name: 'Z4', min_hr: 161, max_hr: 180 },
  { name: 'Z5', min_hr: 181, max_hr: 205 },
];

const GARMIN_ZONE_STYLES = [
  { color: '#9aa3ad', background: 'rgba(154, 163, 173, 0.14)' },
  { color: '#2f80ed', background: 'rgba(47, 128, 237, 0.12)' },
  { color: '#2f9e44', background: 'rgba(47, 158, 68, 0.12)' },
  { color: '#f08c00', background: 'rgba(240, 140, 0, 0.13)' },
  { color: '#e03131', background: 'rgba(224, 49, 49, 0.11)' },
];

export function SettingsPage() {
  const { locale, setLocale, t } = useTranslation();
  const strava = useStravaStatus();
  const sync = useStravaSync();
  const disconnect = useDisconnectStrava();
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const hrZones = useHeartRateZones();
  const preferences = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const saveHrZones = useSaveHeartRateZones();
  const recomputeHrMetrics = useRecomputeHeartRateMetrics();
  const recomputeElevation = useRecomputeElevationMetrics();
  const defaultZoneSetName = t('settings.defaultZoneSetName');
  const [zoneSetName, setZoneSetName] = useState(defaultZoneSetName);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [zones, setZones] = useState<HeartRateZone[]>(DEFAULT_ZONES);
  const [elevationEnabled, setElevationEnabled] = useState(false);
  const [elevationMode, setElevationMode] = useState<'only_when_zero' | 'always'>('only_when_zero');
  const [elevationProviderUrl, setElevationProviderUrl] = useState('');
  const [dashboardMode, setDashboardMode] = useState<'simple' | 'advanced'>('advanced');
  const [hrHistoryOpen, setHrHistoryOpen] = useState(false);
  const lastSyncedZoneSetSignature = useRef<string | null>(null);
  const hasSavedZones = (hrZones.data?.length ?? 0) > 0;
  const latestZoneSet = latestHeartRateZoneSet(hrZones.data ?? []);
  const latestZoneSetSignature = latestZoneSet ? heartRateZoneSetSignature(latestZoneSet) : null;
  const recomputeMessage = recomputeMessageFor(recomputeHrMetrics.data, recomputeHrMetrics.error, t);
  const elevationMessage = elevationRecomputeMessageFor(recomputeElevation.data, recomputeElevation.error, t);
  const missingStravaScopes = strava.data?.missing_scopes ?? [];
  const shouldForceStravaApproval = missingStravaScopes.length > 0;
  const stravaResultMessage = stravaResultMessageFor(new URLSearchParams(window.location.search).get('strava'), t);
  const activeJobId = syncJobId ?? strava.data?.active_job_id ?? null;
  const syncJob = useStravaSyncJob(activeJobId);
  const syncJobStatus = syncJob.data?.status;
  const syncActive = sync.isPending || Boolean(activeJobId && !syncJobStatus) || syncStatusIsActive(syncJobStatus);

  useEffect(() => {
    if (!preferences.data) {
      return;
    }
    setElevationEnabled(Boolean(preferences.data.elevation_correction_enabled));
    setElevationMode(preferences.data.elevation_correction_mode ?? 'only_when_zero');
    setElevationProviderUrl(preferences.data.elevation_provider_url ?? '');
    setDashboardMode(preferences.data.dashboard_mode ?? 'advanced');
    setLocale(preferences.data.locale);
  }, [preferences.data, setLocale]);

  useEffect(() => {
    if (latestZoneSet) {
      return;
    }
    setZoneSetName((current) => (isDefaultZoneSetName(current) ? defaultZoneSetName : current));
  }, [defaultZoneSetName, latestZoneSet]);

  useEffect(() => {
    if (!latestZoneSet || !latestZoneSetSignature) {
      lastSyncedZoneSetSignature.current = null;
      return;
    }
    if (lastSyncedZoneSetSignature.current === latestZoneSetSignature) {
      return;
    }
    lastSyncedZoneSetSignature.current = latestZoneSetSignature;
    setZoneSetName(latestZoneSet.name);
    setEffectiveFrom(latestZoneSet.effective_from);
    setZones(latestZoneSet.zones.map((zone) => ({ ...zone })));
  }, [latestZoneSet, latestZoneSetSignature]);

  useEffect(() => {
    if (strava.data?.active_job_id) {
      setSyncJobId(strava.data.active_job_id);
    }
  }, [strava.data?.active_job_id]);

  const startStravaSync = (mode: 'recent' | 'history') => {
    sync.mutate({ mode }, {
      onSuccess: (result) => setSyncJobId(result.job_id),
    });
  };

  return (
    <div className="page-stack">
      <header className="visual-page-hero settings">
        <div>
          <p className="eyebrow">{t('settings.eyebrow')}</p>
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.heroDetail')}</p>
          <div className="hero-stat-row">
            <span>{strava.data?.connected ? t('settings.stravaConnected') : t('settings.stravaNotConnected')}</span>
            <span>{hasSavedZones ? t('settings.hrZonesSaved') : t('settings.hrZonesMissing')}</span>
            <span>{elevationEnabled ? t('settings.elevationOn') : t('settings.elevationOff')}</span>
          </div>
        </div>
        <RunnerScene variant="settings" label={t('settings.title')} />
      </header>
      <section className="split-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{t('settings.display')}</p>
              <h2>{t('settings.dashboardView')}</h2>
            </div>
          </div>
          <p className="helper-text">{t('settings.dashboardHelp')}</p>
          <div className="segmented-control" role="group" aria-label={t('settings.dashboardView')}>
            <button
              className={dashboardMode === 'simple' ? 'active' : ''}
              type="button"
              onClick={() => updateDashboardMode('simple', setDashboardMode, updatePreferences.mutate)}
            >
              {t('settings.simple')}
            </button>
            <button
              className={dashboardMode === 'advanced' ? 'active' : ''}
              type="button"
              onClick={() => updateDashboardMode('advanced', setDashboardMode, updatePreferences.mutate)}
            >
              {t('settings.advanced')}
            </button>
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{t('settings.display')}</p>
              <h2>{t('settings.languageTitle')}</h2>
            </div>
          </div>
          <p className="helper-text">{t('settings.languageHelp')}</p>
          <div className="segmented-control" role="group" aria-label={t('settings.languageTitle')}>
            <button
              className={locale === 'cs-CZ' ? 'active' : ''}
              type="button"
              onClick={() => updateLanguage('cs-CZ', setLocale, updatePreferences.mutate)}
            >
              {t('common.czech')}
            </button>
            <button
              className={locale === 'en-US' ? 'active' : ''}
              type="button"
              onClick={() => updateLanguage('en-US', setLocale, updatePreferences.mutate)}
            >
              {t('common.english')}
            </button>
          </div>
        </div>
        <div className="panel">
          <h2>{t('settings.stravaConnection')}</h2>
          {stravaResultMessage ? <p className="helper-text" role="status">{stravaResultMessage}</p> : null}
          <p>{t('common.status')}: <strong>{strava.data?.status ?? t('common.unknown')}</strong></p>
          <p>{t('settings.missingScopes')}: {missingStravaScopes.join(', ') || t('common.none')}</p>
          <div className="button-row">
            <a className="primary-button" href={stravaConnectUrl(shouldForceStravaApproval)}>
              {shouldForceStravaApproval ? t('settings.reauthorizeStrava') : t('settings.connectStrava')}
            </a>
            <button className="secondary-button" type="button" disabled={syncActive} onClick={() => startStravaSync('recent')}>{t('settings.syncRecent')}</button>
            <button className="secondary-button" type="button" disabled={syncActive} onClick={() => startStravaSync('history')}>{t('settings.syncHistory')}</button>
            <button className="secondary-button" type="button" onClick={() => disconnect.mutate()} disabled={!strava.data?.connected}>
              {t('settings.disconnect')}
            </button>
          </div>
        </div>
        <div className="panel">
          <h2>{t('settings.hrZones')}</h2>
          <form
            className="hr-zone-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveHrZones.mutate({
                name: zoneSetName,
                effective_from: effectiveFrom,
                zones,
              });
            }}
          >
            <div className="form-grid">
              <label>
                {t('settings.zoneSetName')}
                <input value={zoneSetName} onChange={(event) => setZoneSetName(event.target.value)} required />
              </label>
              <label>
                {t('settings.effectiveFrom')}
                <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required />
              </label>
            </div>
            <div className="hr-zone-grid">
              {zones.map((zone, index) => (
                <div className="hr-zone-row" key={zone.name} style={garminZoneStyle(index)}>
                  <strong>{zone.name}</strong>
                  <label>
                    {t('settings.min')}
                    <input
                      type="number"
                      value={zone.min_hr}
                      min={1}
                      max={260}
                      onChange={(event) => setZoneValue(zones, setZones, index, 'min_hr', event.target.value)}
                    />
                  </label>
                  <label>
                    {t('settings.max')}
                    <input
                      type="number"
                      value={zone.max_hr}
                      min={1}
                      max={260}
                      onChange={(event) => setZoneValue(zones, setZones, index, 'max_hr', event.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
            <button className="primary-button" type="submit" disabled={saveHrZones.isPending}>
              {t('settings.saveHrZones')}
            </button>
          </form>
          <div className="button-row">
            <button
              className="secondary-button"
              type="button"
              disabled={recomputeHrMetrics.isPending || !hasSavedZones}
              onClick={() => recomputeHrMetrics.mutate()}
            >
              {recomputeHrMetrics.isPending ? t('settings.recalculatingIntensity') : t('settings.recalculateIntensity')}
            </button>
          </div>
          {recomputeMessage ? <p className="helper-text">{recomputeMessage}</p> : null}
          <HrDiagnostics data={recomputeHrMetrics.data} />
          {!hasSavedZones ? <p className="helper-text">{t('settings.saveZonesFirst')}</p> : null}
          {latestZoneSet ? (
            <LatestHeartRateZones zoneSet={latestZoneSet} onShowHistory={() => setHrHistoryOpen(true)} />
          ) : null}
        </div>
        <div className="panel">
          <h2>{t('settings.elevationCorrection')}</h2>
          <p>{t('settings.elevationHelp')}</p>
          <form
            className="hr-zone-form"
            onSubmit={(event) => {
              event.preventDefault();
              updatePreferences.mutate({
                elevation_correction_enabled: elevationEnabled,
                elevation_correction_mode: elevationMode,
                elevation_provider_url: elevationProviderUrl.trim() || null,
              });
            }}
          >
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={elevationEnabled}
                onChange={(event) => setElevationEnabled(event.target.checked)}
              />
              {t('settings.useGpsElevation')}
            </label>
            <label>
              {t('settings.correctionMode')}
              <select value={elevationMode} onChange={(event) => setElevationMode(event.target.value as 'only_when_zero' | 'always')}>
                <option value="only_when_zero">{t('settings.onlyWhenZero')}</option>
                <option value="always">{t('settings.alwaysReplace')}</option>
              </select>
            </label>
            <label>
              {t('settings.elevationProviderUrl')}
              <input
                type="url"
                value={elevationProviderUrl}
                onChange={(event) => setElevationProviderUrl(event.target.value)}
                placeholder="https://your-elevation-provider.example/lookup"
              />
            </label>
            <p className="helper-text">{t('settings.elevationPrivacy')}</p>
            <div className="button-row">
              <button className="primary-button" type="submit" disabled={updatePreferences.isPending}>
                {updatePreferences.isPending ? t('settings.savingElevation') : t('settings.saveElevation')}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={updatePreferences.isPending || recomputeElevation.isPending || !elevationEnabled || !elevationProviderUrl.trim()}
                onClick={() => recomputeElevation.mutate()}
              >
                {recomputeElevation.isPending ? t('settings.recalculatingElevation') : t('settings.recalculateElevation')}
              </button>
            </div>
          </form>
          {elevationMessage ? <p className="helper-text">{elevationMessage}</p> : null}
        </div>
        <div className="panel">
          <h2>{t('settings.dataPrivacy')}</h2>
          <p>{t('settings.privacyHelp')}</p>
          <div className="button-row">
            <a className="secondary-button" href={downloadUrl('/export/data')}>
              <Download size={16} />
              {t('settings.exportData')}
            </a>
            <button
              className="danger-button"
              type="button"
              onClick={async () => {
                if (window.confirm(t('settings.deleteConfirm'))) {
                  await apiRequest<void>('/account', { method: 'DELETE' });
                  window.location.assign('/login');
                }
              }}
            >
              <Trash2 size={16} />
              {t('settings.deleteAccount')}
            </button>
          </div>
        </div>
      </section>
      {hrHistoryOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-label={t('settings.hrHistory')} className="modal-panel" role="dialog">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t('settings.pastZoneSets')}</p>
                <h2>{t('settings.hrHistory')}</h2>
              </div>
              <button className="secondary-button" type="button" onClick={() => setHrHistoryOpen(false)}>
                {t('common.close')}
              </button>
            </div>
            <HeartRateZoneTimeline zoneSets={hrZones.data ?? []} />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function elevationRecomputeMessageFor(data: ElevationRecomputeResponse | undefined, error: Error | null, t: (key: string, params?: Record<string, string | number>) => string) {
  if (data) {
    if (data.failed_activities > 0) {
      return t('settings.elevationRecomputeFailed', {
        recomputed: data.recomputed_activities,
        skipped: data.skipped_activities,
        failed: data.failed_activities,
      });
    }
    return t('settings.elevationRecomputeDone', {
      recomputed: data.recomputed_activities,
      skipped: data.skipped_activities,
      failed: data.failed_activities,
    });
  }
  return error?.message;
}

function HrDiagnostics({ data }: { data: HeartRateRecomputeResponse | undefined }) {
  const { t } = useTranslation();
  if (!data) {
    return null;
  }
  const classified = Math.max(0, data.recomputed_activities - data.remaining_unknown_activities);
  return (
    <div className="hr-diagnostics">
      <h2>{t('settings.hrDiagnostics')}</h2>
      <div className="diagnostic-grid">
        <Metric label={t('settings.recomputed')} value={`${data.recomputed_activities}`} />
        <Metric label={t('settings.classified')} value={`${classified}`} />
        <Metric label={t('settings.stillUnknown')} value={`${data.remaining_unknown_activities}`} />
        <Metric label={t('settings.missingEffectiveZones')} value={`${data.activities_without_effective_zones}`} />
      </div>
      {data.activities_without_effective_zones > 0 && data.earliest_activity_without_effective_zones ? (
        <p className="helper-text">
          {t('settings.addEffectiveZone', { date: formatDate(data.earliest_activity_without_effective_zones) })}
        </p>
      ) : (
        <p className="helper-text">{t('settings.unknownHelp')}</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card compact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function updateDashboardMode(
  mode: 'simple' | 'advanced',
  setDashboardMode: (mode: 'simple' | 'advanced') => void,
  savePreferences: (payload: { dashboard_mode: 'simple' | 'advanced' }) => void,
) {
  setDashboardMode(mode);
  savePreferences({ dashboard_mode: mode });
}

function updateLanguage(
  locale: 'cs-CZ' | 'en-US',
  setLocale: (locale: string) => void,
  savePreferences: (payload: { locale: 'cs-CZ' | 'en-US' }) => void,
) {
  setLocale(locale);
  savePreferences({ locale });
}

function latestHeartRateZoneSet(zoneSets: HeartRateZoneSet[]) {
  return [...zoneSets].sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0] ?? null;
}

function heartRateZoneSetSignature(zoneSet: HeartRateZoneSet) {
  return JSON.stringify({
    id: zoneSet.id,
    name: zoneSet.name,
    effective_from: zoneSet.effective_from,
    zones: zoneSet.zones,
  });
}

function stravaResultMessageFor(result: string | null, t: (key: string) => string) {
  if (!result) {
    return null;
  }
  const messages: Record<string, string> = {
    connected: t('settings.stravaOAuthConnected'),
    denied: t('settings.stravaOAuthDenied'),
    invalid_state: t('settings.stravaOAuthInvalidState'),
    error: t('settings.stravaOAuthError'),
  };
  return messages[result] ?? null;
}

function isDefaultZoneSetName(name: string) {
  return name === 'Current zones' || name === 'Aktuální zóny';
}

function garminZoneStyle(index: number): CSSProperties {
  const style = GARMIN_ZONE_STYLES[index] ?? GARMIN_ZONE_STYLES[GARMIN_ZONE_STYLES.length - 1];
  return {
    '--zone-color': style.color,
    '--zone-bg': style.background,
  } as CSSProperties;
}

function LatestHeartRateZones({ zoneSet, onShowHistory }: { zoneSet: HeartRateZoneSet; onShowHistory: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="hr-zone-latest">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('settings.lastEntered')}</p>
          <h2>{zoneSet.name}</h2>
          <p className="helper-text">{t('settings.effectiveFromDate', { date: formatDate(zoneSet.effective_from) })}</p>
        </div>
        <button className="secondary-button" type="button" onClick={onShowHistory}>
          {t('settings.viewHistory')}
        </button>
      </div>
      <div className="hr-zone-pill-list">
        {zoneSet.zones.map((zone) => (
          <span key={zone.name}>{zone.name} {zone.min_hr}-{zone.max_hr} bpm</span>
        ))}
      </div>
    </div>
  );
}

function HeartRateZoneTimeline({ zoneSets }: { zoneSets: HeartRateZoneSet[] }) {
  const { t } = useTranslation();
  const sorted = [...zoneSets].sort((left, right) => left.effective_from.localeCompare(right.effective_from));
  return (
    <div className="hr-zone-timeline">
      <h2>{t('settings.hrHistory')}</h2>
      <div className="template-list timeline-list">
        {sorted.map((zoneSet, index) => {
          const next = sorted[index + 1];
          const until = next ? addDaysToIso(next.effective_from, -1) : null;
          return (
            <article className="template-item timeline-item" key={zoneSet.id}>
              <strong>{zoneSet.name}</strong>
              <small>
                {until
                  ? t('settings.zoneSetRange', { from: formatDate(zoneSet.effective_from), until: formatDate(until) })
                  : t('settings.zoneSetOnward', { from: formatDate(zoneSet.effective_from) })}
              </small>
              <p>{zoneSet.zones.map((zone) => `${zone.name} ${zone.min_hr}-${zone.max_hr}`).join(' · ')}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function setZoneValue(
  zones: HeartRateZone[],
  setZones: (zones: HeartRateZone[]) => void,
  index: number,
  key: 'min_hr' | 'max_hr',
  value: string,
) {
  const next = zones.map((zone, zoneIndex) => (zoneIndex === index ? { ...zone, [key]: Number(value) } : zone));
  setZones(next);
}

function recomputeMessageFor(data: HeartRateRecomputeResponse | undefined, error: Error | null, t: (key: string, params?: Record<string, string | number>) => string) {
  if (data?.activities_without_effective_zones) {
    const earliest = data.earliest_activity_without_effective_zones
      ? ` ${t('settings.addZoneBefore', { date: formatDate(data.earliest_activity_without_effective_zones) })}`
      : '';
    return `${t('settings.hrRecomputeMissingZones', {
      recomputed: data.recomputed_activities,
      missing: data.activities_without_effective_zones,
    })}${earliest}`;
  }
  if (data) {
    return t('settings.hrRecomputeDone', {
      recomputed: data.recomputed_activities,
      unknown: data.remaining_unknown_activities,
    });
  }
  return error?.message;
}
