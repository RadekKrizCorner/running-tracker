import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useMe } from '../features/auth/api';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { SetupPage } from '../pages/SetupPage';
import { useTranslation } from '../lib/i18n';

const ActivitiesPage = lazy(() => import('../pages/ActivitiesPage').then((module) => ({ default: module.ActivitiesPage })));
const ActivityDetailPage = lazy(() => import('../pages/ActivityDetailPage').then((module) => ({ default: module.ActivityDetailPage })));
const CalendarPage = lazy(() => import('../pages/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const EventDetailPage = lazy(() => import('../pages/EventDetailPage').then((module) => ({ default: module.EventDetailPage })));
const EventsPage = lazy(() => import('../pages/EventsPage').then((module) => ({ default: module.EventsPage })));
const HeatmapPage = lazy(() => import('../pages/HeatmapPage').then((module) => ({ default: module.HeatmapPage })));
const PlansPage = lazy(() => import('../pages/PlansPage').then((module) => ({ default: module.PlansPage })));
const ReportsPage = lazy(() => import('../pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const RouteExplorerPage = lazy(() => import('../pages/RouteExplorerPage').then((module) => ({ default: module.RouteExplorerPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const TrendsPage = lazy(() => import('../pages/TrendsPage').then((module) => ({ default: module.TrendsPage })));

function ProtectedRoutes() {
  const { t } = useTranslation();
  const me = useMe();

  if (me.isLoading) {
    return <div className="screen-center">{t('common.loadingProfile')}</div>;
  }

  if (me.isError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell user={me.data}>
      <Suspense fallback={<div className="screen-center">{t('common.loading')}</div>}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventDetailPage />} />
          <Route path="/heatmap" element={<HeatmapPage />} />
          <Route path="/routes" element={<RouteExplorerPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}
