import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { RouteCandidateMap } from '../components/maps/RouteCandidateMap';
import { EmptyState } from '../components/ui/EmptyState';
import { MetricCard } from '../components/ui/MetricCard';
import { useActivities } from '../features/activities/api';
import { useSuggestLoopRoute } from '../features/routes/api';
import type { Activity, RouteCandidate, RouteSuggestionRequest, RouteSuggestionResponse } from '../lib/api/types';
import { formatDate, formatDistance } from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';

type RouteExplorerForm = {
  startLat: string;
  startLng: string;
  targetDistanceM: string;
  distanceToleranceM: string;
  hillPreference: RouteSuggestionRequest['hill_preference'];
  surfacePreference: RouteSuggestionRequest['surface_preference'];
  candidateCount: string;
};

const defaultForm: RouteExplorerForm = {
  startLat: '50.0755',
  startLng: '14.4378',
  targetDistanceM: '12000',
  distanceToleranceM: '800',
  hillPreference: 'balanced',
  surfacePreference: 'mixed',
  candidateCount: '3',
};

export function RouteExplorerPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState<RouteExplorerForm>(defaultForm);
  const [response, setResponse] = useState<RouteSuggestionResponse | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const previousRoutes = useActivities({ sport_type: 'Run', sort: '-start_time' });
  const suggestion = useSuggestLoopRoute();
  const candidates = response?.candidates ?? [];
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0] ?? null,
    [candidates, selectedCandidateId],
  );
  const previousGpsRoutes = useMemo(
    () => (Array.isArray(previousRoutes.data) ? previousRoutes.data.filter((activity) => activity.map_polyline).slice(0, 5) : []),
    [previousRoutes.data],
  );

  const submitRouteRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
            <span>{t('routes.startLat')}</span>
            <input
              aria-label={t('routes.startLat')}
              type="number"
              min="-90"
              max="90"
              step="0.0001"
              required
              value={form.startLat}
              onChange={(event) => setForm((current) => ({ ...current, startLat: event.target.value }))}
            />
          </label>
          <label>
            <span>{t('routes.startLng')}</span>
            <input
              aria-label={t('routes.startLng')}
              type="number"
              min="-180"
              max="180"
              step="0.0001"
              required
              value={form.startLng}
              onChange={(event) => setForm((current) => ({ ...current, startLng: event.target.value }))}
            />
          </label>
          <label>
            <span>{t('routes.targetDistance')}</span>
            <input
              aria-label={t('routes.targetDistance')}
              type="number"
              min="500"
              max="50000"
              step="100"
              required
              value={form.targetDistanceM}
              onChange={(event) => setForm((current) => ({ ...current, targetDistanceM: event.target.value }))}
            />
          </label>
          <label>
            <span>{t('routes.distanceTolerance')}</span>
            <input
              aria-label={t('routes.distanceTolerance')}
              type="number"
              min="100"
              max="10000"
              step="100"
              required
              value={form.distanceToleranceM}
              onChange={(event) => setForm((current) => ({ ...current, distanceToleranceM: event.target.value }))}
            />
          </label>
          <label>
            <span>{t('routes.hillPreference')}</span>
            <select
              aria-label={t('routes.hillPreference')}
              value={form.hillPreference}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  hillPreference: event.target.value as RouteSuggestionRequest['hill_preference'],
                }))
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
                setForm((current) => ({
                  ...current,
                  surfacePreference: event.target.value as RouteSuggestionRequest['surface_preference'],
                }))
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
              onChange={(event) => setForm((current) => ({ ...current, candidateCount: event.target.value }))}
            />
          </label>
          <button className="primary-button" type="submit" disabled={suggestion.isPending}>
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
            {response ? <span className={`status-pill ${response.status === 'ok' ? 'success' : 'warning'}`}>{response.status}</span> : null}
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
    target_distance_m: Number(form.targetDistanceM),
    distance_tolerance_m: Number(form.distanceToleranceM),
    hill_preference: form.hillPreference,
    surface_preference: form.surfacePreference,
    candidate_count: Number(form.candidateCount),
  };
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
