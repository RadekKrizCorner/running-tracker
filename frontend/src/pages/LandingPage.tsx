import { Activity, BarChart3, CalendarDays, CheckCircle2, Code, LockKeyhole, Map, Route, ShieldCheck, TrendingUp, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import heroRunner from '../assets/landing/landing-hero-runner.webp';
import routeHeatmap from '../assets/landing/landing-route-heatmap.webp';
import trainingPlan from '../assets/landing/landing-training-plan.webp';
import { useTranslation } from '../lib/i18n';

type LandingFeature = {
  icon: LucideIcon;
  titleKey: string;
  detailKey: string;
};

type LandingMetric = {
  labelKey: string;
  valueKey: string;
};

type LandingRow = {
  dayKey: string;
  workoutKey: string;
  statusKey: string;
};

const featureCards: LandingFeature[] = [
  {
    icon: Activity,
    titleKey: 'landing.featureImportTitle',
    detailKey: 'landing.featureImportDetail',
  },
  {
    icon: CalendarDays,
    titleKey: 'landing.featurePlanTitle',
    detailKey: 'landing.featurePlanDetail',
  },
  {
    icon: TrendingUp,
    titleKey: 'landing.featureTrendsTitle',
    detailKey: 'landing.featureTrendsDetail',
  },
];

const insightCards: LandingFeature[] = [
  {
    icon: Route,
    titleKey: 'landing.insightRoutesTitle',
    detailKey: 'landing.insightRoutesDetail',
  },
  {
    icon: Trophy,
    titleKey: 'landing.insightEventsTitle',
    detailKey: 'landing.insightEventsDetail',
  },
  {
    icon: ShieldCheck,
    titleKey: 'landing.insightPrivacyTitle',
    detailKey: 'landing.insightPrivacyDetail',
  },
];

const dashboardMetrics: LandingMetric[] = [
  { labelKey: 'landing.metricDistance', valueKey: 'landing.metricDistanceValue' },
  { labelKey: 'landing.metricLoad', valueKey: 'landing.metricLoadValue' },
  { labelKey: 'landing.metricPlan', valueKey: 'landing.metricPlanValue' },
];

const planRows: LandingRow[] = [
  { dayKey: 'landing.planDayOne', workoutKey: 'landing.planWorkoutOne', statusKey: 'landing.planStatusDone' },
  { dayKey: 'landing.planDayTwo', workoutKey: 'landing.planWorkoutTwo', statusKey: 'landing.planStatusNext' },
  { dayKey: 'landing.planDayThree', workoutKey: 'landing.planWorkoutThree', statusKey: 'landing.planStatusReady' },
];

export function LandingPage() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <img className="landing-hero-image" src={heroRunner} alt="" />
        <div className="landing-hero-overlay" />
        <header className="landing-nav" aria-label={t('landing.navigation')}>
          <Link className="landing-brand" to="/">
            <span className="landing-brand-mark" aria-hidden="true">RT</span>
            <span>{t('app.name')}</span>
          </Link>
          <nav>
            <a href="#overview">{t('landing.navOverview')}</a>
            <a href="#planning">{t('landing.navPlanning')}</a>
            <a href="#privacy">{t('landing.navPrivacy')}</a>
          </nav>
          <div className="landing-header-actions">
            <div className="landing-language-switch" role="group" aria-label={t('common.language')}>
              <button
                className={locale === 'cs-CZ' ? 'active' : ''}
                type="button"
                aria-pressed={locale === 'cs-CZ'}
                onClick={() => setLocale('cs-CZ')}
              >
                CZ
              </button>
              <button
                className={locale === 'en-US' ? 'active' : ''}
                type="button"
                aria-pressed={locale === 'en-US'}
                onClick={() => setLocale('en-US')}
              >
                EN
              </button>
            </div>
            <a
              className="landing-icon-link"
              href="https://github.com/RadekKrizCorner/running-tracker"
              aria-label={t('landing.githubRepository')}
              title={t('landing.githubRepository')}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Code size={18} strokeWidth={2.2} aria-hidden="true" />
            </a>
            <Link className="landing-login-link" to="/login">{t('auth.loginButton')}</Link>
          </div>
        </header>

        <div className="landing-hero-content">
          <h1 id="landing-title">{t('app.name')}</h1>
          <p>{t('landing.heroText')}</p>
          <div className="landing-hero-actions">
            <Link className="primary-button landing-primary-cta" to="/login">{t('landing.primaryCta')}</Link>
          </div>
          <dl className="landing-proof-list" aria-label={t('landing.proofLabel')}>
            <div>
              <dt>{t('landing.proofOwner')}</dt>
              <dd>{t('landing.proofOwnerDetail')}</dd>
            </div>
            <div>
              <dt>{t('landing.proofPrivate')}</dt>
              <dd>{t('landing.proofPrivateDetail')}</dd>
            </div>
            <div>
              <dt>{t('landing.proofTransparent')}</dt>
              <dd>{t('landing.proofTransparentDetail')}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="landing-section landing-overview" id="overview">
        <div className="landing-section-heading">
          <p className="eyebrow">{t('landing.overviewEyebrow')}</p>
          <h2>{t('landing.overviewTitle')}</h2>
          <p>{t('landing.overviewText')}</p>
        </div>
        <div className="landing-feature-grid">
          {featureCards.map((feature) => (
            <FeatureCard key={feature.titleKey} feature={feature} />
          ))}
        </div>
      </section>

      <section className="landing-section landing-product-section">
        <div className="landing-dashboard-preview" aria-label={t('landing.dashboardPreviewLabel')}>
          <div className="landing-preview-topbar">
            <span>{t('landing.previewWeek')}</span>
            <span>{t('landing.previewSynced')}</span>
          </div>
          <div className="landing-preview-metrics">
            {dashboardMetrics.map((metric) => (
              <div key={metric.labelKey}>
                <span>{t(metric.labelKey)}</span>
                <strong>{t(metric.valueKey)}</strong>
              </div>
            ))}
          </div>
          <div className="landing-preview-chart">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="landing-preview-footer">
            <CheckCircle2 size={18} strokeWidth={2.4} />
            <span>{t('landing.previewFooter')}</span>
          </div>
        </div>
        <div className="landing-product-copy">
          <p className="eyebrow">{t('landing.productEyebrow')}</p>
          <h2>{t('landing.productTitle')}</h2>
          <p>{t('landing.productText')}</p>
          <div className="landing-insight-list">
            {insightCards.map((feature) => (
              <FeatureCard key={feature.titleKey} feature={feature} compact />
            ))}
          </div>
        </div>
      </section>

      <section className="landing-media-band">
        <div>
          <img src={routeHeatmap} alt={t('landing.routeImageAlt')} />
        </div>
        <div>
          <p className="eyebrow">{t('landing.heatmapEyebrow')}</p>
          <h2>{t('landing.heatmapTitle')}</h2>
          <p>{t('landing.heatmapText')}</p>
        </div>
      </section>

      <section className="landing-section landing-planning-section" id="planning">
        <div className="landing-planning-copy">
          <p className="eyebrow">{t('landing.planningEyebrow')}</p>
          <h2>{t('landing.planningTitle')}</h2>
          <p>{t('landing.planningText')}</p>
          <div className="landing-plan-list" aria-label={t('landing.planPreviewLabel')}>
            {planRows.map((row) => (
              <div className="landing-plan-row" key={row.dayKey}>
                <span>{t(row.dayKey)}</span>
                <strong>{t(row.workoutKey)}</strong>
                <small>{t(row.statusKey)}</small>
              </div>
            ))}
          </div>
        </div>
        <img className="landing-planning-image" src={trainingPlan} alt={t('landing.trainingImageAlt')} />
      </section>

      <section className="landing-privacy-band" id="privacy">
        <div>
          <LockKeyhole size={30} strokeWidth={2.2} />
          <h2>{t('landing.privacyTitle')}</h2>
        </div>
        <p>{t('landing.privacyText')}</p>
        <ul>
          <li>{t('landing.privacyPointTokens')}</li>
          <li>{t('landing.privacyPointOwner')}</li>
          <li>{t('landing.privacyPointExport')}</li>
        </ul>
      </section>

      <section className="landing-final-cta">
        <div>
          <Map size={34} strokeWidth={2.1} />
          <BarChart3 size={34} strokeWidth={2.1} />
        </div>
        <h2>{t('landing.finalTitle')}</h2>
        <p>{t('landing.finalText')}</p>
        <Link className="primary-button landing-primary-cta" to="/login">{t('landing.primaryCta')}</Link>
      </section>
    </main>
  );
}

function FeatureCard({ feature, compact = false }: { feature: LandingFeature; compact?: boolean }) {
  const { t } = useTranslation();
  const Icon = feature.icon;

  return (
    <article className={compact ? 'landing-feature-card compact' : 'landing-feature-card'}>
      <Icon size={22} strokeWidth={2.2} />
      <h3>{t(feature.titleKey)}</h3>
      <p>{t(feature.detailKey)}</p>
    </article>
  );
}
