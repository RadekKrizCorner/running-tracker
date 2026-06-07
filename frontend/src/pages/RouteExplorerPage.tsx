import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RouteCandidateMap } from '../components/maps/RouteCandidateMap';
import { EmptyState } from '../components/ui/EmptyState';
import { MetricCard } from '../components/ui/MetricCard';
import { useActivities } from '../features/activities/api';
import { useUpdateUserPreferences, useUserPreferences } from '../features/profile/api';
import { useSuggestLoopRoute } from '../features/routes/api';
import type { Activity, RouteCandidate, RouteSuggestionRequest, RouteSuggestionResponse, UserPreference } from '../lib/api/types';
import { formatDate, formatDistance } from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';

type StartSource = 'default_gps' | 'manual_gps' | 'address';

type RouteExplorerForm = {
  startSource: StartSource;
  startLat: string;
  startLng: string;
  startLabel: string;
  startAddress: string;
  targetDistanceKm: string;
  distanceToleranceKm: string;
  hillPreference: RouteSuggestionRequest['hill_preference'];
  surfacePreference: RouteSuggestionRequest['surface_preference'];
  candidateCount: string;
};

const fallbackRouteStart = {
  lat: 50.0755,
  lng: 14.4378,
};

const defaultForm: RouteExplorerForm = {
  startSource: 'default_gps',
  startLat: formatCoordinate(fallbackRouteStart.lat),
  startLng: formatCoordinate(fallbackRouteStart.lng),
  startLabel: '',
  startAddress: '',
  targetDistanceKm: '10',
  distanceToleranceKm: '1',
  hillPreference: 'balanced',
  surfacePreference: 'mixed',
  candidateCount: '3',
};

export function RouteExplorerPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState<RouteExplorerForm>(defaultForm);
  const [response, setResponse] = useState<RouteSuggestionResponse | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [defaultSaved, setDefaultSaved] = useState(false);
  const preferences = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const previousRoutes = useActivities({ sport_type: 'Run', sort: '-start_time' });
  const suggestion = useSuggestLoopRoute();
  const candidates = response?.candidates ?? [];
  const defaultStart = routeStartFromPreferences(preferences.data);
  const defaultGpsLabel = form.startLabel.trim() || defaultStart.label || t('routes.defaultGpsFallback');
  const addressMode = form.startSource === 'address';
  const startGpsValid = isStartGpsValid(form);
  const gpsFormValid = isGpsFormValid(form);
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0] ?? null,
    [candidates, selectedCandidateId],
  );
  const previousGpsRoutes = useMemo(
    () => (Array.isArray(previousRoutes.data) ? previousRoutes.data.filter((activity) => activity.map_polyline).slice(0, 5) : []),
    [previousRoutes.data],
  );

  useEffect(() => {
    if (form.startSource !== 'default_gps') {
      return;
    }
    const nextStart = routeStartFromPreferences(preferences.data);
    const nextLat = formatCoordinate(nextStart.lat);
    const nextLng = formatCoordinate(nextStart.lng);
    const nextLabel = nextStart.label ?? '';
    setForm((current) => {
      if (current.startSource !== 'default_gps') {
        return current;
      }
      if (current.startLat === nextLat && current.startLng === nextLng && current.startLabel === nextLabel) {
        return current;
      }
      return { ...current, startLat: nextLat, startLng: nextLng, startLabel: nextLabel };
    });
  }, [
    form.startSource,
    preferences.data?.route_start_lat,
    preferences.data?.route_start_lng,
    preferences.data?.route_start_label,
  ]);

  const updateForm = (changes: Partial<RouteExplorerForm>) => {
    setDefaultSaved(false);
    setForm((current) => ({ ...current, ...changes }));
  };

  const changeStartSource = (startSource: StartSource) => {
    setDefaultSaved(false);
    if (startSource === 'default_gps') {
      const nextStart = routeStartFromPreferences(preferences.data);
      setForm((current) => ({
        ...current,
        startSource,
        startLat: formatCoordinate(nextStart.lat),
        startLng: formatCoordinate(nextStart.lng),
        startLabel: nextStart.label ?? '',
      }));
      return;
    }
    setForm((current) => ({ ...current, startSource }));
  };

  const saveDefaultGps = () => {
    if (!startGpsValid) {
      return;
    }
    setDefaultSaved(false);
    updatePreferences.mutate(
      {
        route_start_lat: Number(form.startLat),
        route_start_lng: Number(form.startLng),
        route_start_label: form.startLabel.trim() || null,
      },
      {
        onSuccess: (nextPreferences) => {
          const nextStart = routeStartFromPreferences(nextPreferences);
          setForm((current) => ({
            ...current,
            startSource: 'default_gps',
            startLat: formatCoordinate(nextStart.lat),
            startLng: formatCoordinate(nextStart.lng),
            startLabel: nextStart.label ?? '',
          }));
          setDefaultSaved(true);
        },
      },
    );
  };

  const submitRouteRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addressMode || !gpsFormValid) {
      return;
    }
    const payload = formPayload(form);
    suggestion.mutate(payload, {
      onSuccess: (nextResponse) => {
        setResponse(nextResponse);
        setSelectedCandidateId(nextResponse.candidates[0]?.id ?? null);
      },
    });
  };

  return (
    <div className="page-stack">
      <header className="visual-page-hero routes">
        <div>
          <p className="eyebrow">{t('routes.eyebrow')}</p>
          <h1>{t('routes.title')}</h1>
          <p>{t('routes.hero')}</p>
          <div className="hero-stat-row">
            <span>{t('routes.selfHosted')}</span>
            <span>{t('routes.loopRoutes')}</span>
            <span>{t('routes.czScope')}</span>
          </div>
        </div>
      </header>

      <section className="route-explorer-grid">
        <form className="panel route-form" onSubmit={submitRouteRequest}>
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{t('routes.formEyebrow')}</p>
              <h2>{t('routes.formTitle')}</h2>
            </div>
          </div>
          <label>
            <span>{t('routes.startSource')}</span>
            <select
              aria-label={t('routes.startSource')}
              value={form.startSource}
              onChange={(event) => changeStartSource(event.target.value as StartSource)}
            >
              <option value="default_gps">{t('routes.startSource.defaultGps')}</option>
              <option value="manual_gps">{t('routes.startSource.manualGps')}</option>
              <option value="address">{t('routes.startSource.address')}</option>
            </select>
          </label>
          {form.startSource === 'default_gps' ? (
            <div className="route-default-start" aria-label={t('routes.defaultGpsLabel')}>
              <strong>{defaultGpsLabel}</strong>
              <span>
                {form.startLat}, {form.startLng}
              </span>
            </div>
          ) : null}
          {addressMode ? (
            <>
              <label>
                <span>{t('routes.startAddress')}</span>
                <input
                  aria-label={t('routes.startAddress')}
                  type="text"
                  value={form.startAddress}
                  placeholder={t('routes.startAddressPlaceholder')}
                  onChange={(event) => updateForm({ startAddress: event.target.value })}
                />
              </label>
              <p className="helper-text">{t('routes.addressLookupUnavailable')}</p>
            </>
          ) : (
            <>
              <label>
                <span>{t('routes.startLat')}</span>
                <input
                  aria-label={t('routes.startLat')}
                  type="number"
                  min="-90"
                  max="90"
                  step="0.0000001"
                  required
                  readOnly={form.startSource === 'default_gps'}
                  value={form.startLat}
                  onChange={(event) => updateForm({ startLat: event.target.value })}
                />
              </label>
              <label>
                <span>{t('routes.startLng')}</span>
                <input
                  aria-label={t('routes.startLng')}
                  type="number"
                  min="-180"
                  max="180"
                  step="0.0000001"
                  required
                  readOnly={form.startSource === 'default_gps'}
                  value={form.startLng}
                  onChange={(event) => updateForm({ startLng: event.target.value })}
                />
              </label>
              <label>
                <span>{t('routes.startLabel')}</span>
                <input
                  aria-label={t('routes.startLabel')}
                  type="text"
                  maxLength={255}
                  value={form.startLabel}
                  onChange={(event) => updateForm({ startLabel: event.target.value })}
                />
              </label>
              <div className="route-action-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!startGpsValid || updatePreferences.isPending}
                  onClick={saveDefaultGps}
                >
                  <Save size={16} />
                  {updatePreferences.isPending ? t('routes.savingDefaultGps') : t('routes.saveDefaultGps')}
                </button>
              </div>
              {defaultSaved ? <p className="helper-text">{t('routes.defaultGpsSaved')}</p> : null}
              {updatePreferences.isError ? <p className="form-error">{updatePreferences.error.message}</p> : null}
            </>
          )}
          <label>
            <span>{t('routes.targetDistance')}</span>
            <input
              aria-label={t('routes.targetDistance')}
              type="number"
              min="0.5"
              max="50"
              step="0.1"
              required
              value={form.targetDistanceKm}
              onChange={(event) => updateForm({ targetDistanceKm: event.target.value })}
            />
          </label>
          <label>
            <span>{t('routes.distanceTolerance')}</span>
            <input
              aria-label={t('routes.distanceTolerance')}
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              required
              value={form.distanceToleranceKm}
              onChange={(event) => updateForm({ distanceToleranceKm: event.target.value })}
            />
          </label>
          <label>
            <span>{t('routes.hillPreference')}</span>
            <select
              aria-label={t('routes.hillPreference')}
              value={form.hillPreference}
              onChange={(event) =>
                updateForm({
                  hillPreference: event.target.value as RouteSuggestionRequest['hill_preference'],
                })
              }
            >
              <option value="flat">{t('routes.hill.flat')}</option>
              <option value="balanced">{t('routes.hill.balanced')}</option>
              <option value="hilly">{t('routes.hill.hilly')}</option>
            </select>
          </label>
          <label>
            <span>{t('routes.surfacePreference')}</span>
            <select
              aria-label={t('routes.surfacePreference')}
              value={form.surfacePreference}
              onChange={(event) =>
                updateForm({
                  surfacePreference: event.target.value as RouteSuggestionRequest['surface_preference'],
                })
              }
            >
              <option value="road">{enumLabel(t, 'surface', 'road')}</option>
              <option value="mixed">{enumLabel(t, 'surface', 'mixed')}</option>
              <option value="trail">{enumLabel(t, 'surface', 'trail')}</option>
            </select>
          </label>
          <label>
            <span>{t('routes.candidates')}</span>
            <input
              aria-label={t('routes.candidates')}
              type="number"
              min="1"
              max="6"
              step="1"
              required
              value={form.candidateCount}
              onChange={(event) => updateForm({ candidateCount: event.target.value })}
            />
          </label>
          <button className="primary-button" type="submit" disabled={suggestion.isPending || addressMode || !gpsFormValid}>
            {suggestion.isPending ? t('routes.generating') : t('routes.generate')}
          </button>
          {suggestion.isError ? <p className="form-error">{suggestion.error.message}</p> : null}
        </form>

        <section className="panel route-results-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{t('routes.resultsEyebrow')}</p>
              <h2>{t('routes.resultsTitle')}</h2>
            </div>
            {response ? (
              <span className={`status-pill ${response.status === 'ok' ? 'success' : 'warning'}`}>
                {t(`routes.status.${response.status}`)}
              </span>
            ) : null}
          </div>

          {!response ? (
            <EmptyState title={t('routes.noResults')} detail={t('routes.noResultsDetail')} />
          ) : response.status === 'unavailable' ? (
            <EmptyState title={t('routes.unavailable')} detail={response.detail} />
          ) : (
            <>
              <div className="route-result-layout">
                <div className="route-candidate-list" aria-label={t('routes.candidateList')}>
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={candidate.id === selectedCandidate?.id ? 'route-candidate-card selected' : 'route-candidate-card'}
                      onClick={() => setSelectedCandidateId(candidate.id)}
                    >
                      <strong>{candidate.name}</strong>
                      <span>
                        {formatRouteDuration(candidate.duration_s)} · {formatElevation(candidate.elevation_gain_m)} · {t('routes.score', { score: Math.round(candidate.score * 100) })}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="route-candidate-preview">
                  <RouteCandidateMap candidate={selectedCandidate} />
                </div>
              </div>
              {selectedCandidate ? <RouteCandidateMetrics candidate={selectedCandidate} /> : null}
              {selectedCandidate?.warnings.length ? (
                <ul className="route-warning-list">
                  {selectedCandidate.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>
      </section>

      <section className="panel previous-routes-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">{t('routes.previousEyebrow')}</p>
            <h2>{t('routes.previousTitle')}</h2>
          </div>
          <span className="badge">{previousGpsRoutes.length}</span>
        </div>
        {previousRoutes.isLoading ? (
          <div className="screen-center compact">{t('routes.previousLoading')}</div>
        ) : previousGpsRoutes.length > 0 ? (
          <div className="previous-route-list">
            {previousGpsRoutes.map((activity) => (
              <PreviousRouteItem key={activity.id} activity={activity} />
            ))}
          </div>
        ) : (
          <EmptyState title={t('routes.previousEmpty')} detail={t('routes.previousEmptyDetail')} />
        )}
      </section>
    </div>
  );
}

function PreviousRouteItem({ activity }: { activity: Activity }) {
  const { t } = useTranslation();
  return (
    <Link className="previous-route-item" to={`/activities/${activity.id}`}>
      <strong>{activity.name ?? t('activity.run')}</strong>
      <span>
        {formatDate(activity.start_time_utc)} · {formatDistance(activity.distance_m)} · {formatRouteDuration(activity.moving_time_s)}
      </span>
    </Link>
  );
}

function RouteCandidateMetrics({ candidate }: { candidate: RouteCandidate }) {
  const { t } = useTranslation();
  return (
    <div className="metric-grid compact route-metric-grid">
      <MetricCard label={t('common.distance')} value={formatDistance(candidate.distance_m)} detail={candidate.provider} />
      <MetricCard label={t('common.time')} value={formatRouteDuration(candidate.duration_s)} detail={t('routes.estimated')} />
      <MetricCard label={t('common.elevation')} value={formatElevation(candidate.elevation_gain_m)} detail={t('routes.estimated')} />
    </div>
  );
}

function formPayload(form: RouteExplorerForm): RouteSuggestionRequest {
  return {
    start_lat: Number(form.startLat),
    start_lng: Number(form.startLng),
    target_distance_m: kilometersToMeters(form.targetDistanceKm),
    distance_tolerance_m: kilometersToMeters(form.distanceToleranceKm),
    hill_preference: form.hillPreference,
    surface_preference: form.surfacePreference,
    candidate_count: Number(form.candidateCount),
  };
}

function routeStartFromPreferences(preferences: UserPreference | null | undefined) {
  const lat = preferences?.route_start_lat;
  const lng = preferences?.route_start_lng;
  if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
    return {
      lat,
      lng,
      label: preferences?.route_start_label ?? null,
    };
  }
  return {
    ...fallbackRouteStart,
    label: null,
  };
}

function isGpsFormValid(form: RouteExplorerForm) {
  const targetDistanceKm = Number(form.targetDistanceKm);
  const distanceToleranceKm = Number(form.distanceToleranceKm);
  const candidateCount = Number(form.candidateCount);
  return (
    isStartGpsValid(form)
    && isFiniteNumber(targetDistanceKm)
    && targetDistanceKm >= 0.5
    && targetDistanceKm <= 50
    && isFiniteNumber(distanceToleranceKm)
    && distanceToleranceKm >= 0.1
    && distanceToleranceKm <= 10
    && Number.isInteger(candidateCount)
    && candidateCount >= 1
    && candidateCount <= 6
  );
}

function isStartGpsValid(form: RouteExplorerForm) {
  const startLat = Number(form.startLat);
  const startLng = Number(form.startLng);
  return (
    isFiniteNumber(startLat)
    && startLat >= -90
    && startLat <= 90
    && isFiniteNumber(startLng)
    && startLng >= -180
    && startLng <= 180
  );
}

function kilometersToMeters(value: string) {
  return Math.round(Number(value) * 1000);
}

function formatCoordinate(value: number) {
  return String(Number(value.toFixed(7)));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatRouteDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes}m`;
}

function formatElevation(meters: number | null | undefined) {
  if (meters === null || meters === undefined) {
    return 'n/a';
  }
  return `${Math.round(meters)} m`;
}
