import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useMe } from '../features/auth/api';
import { ActivitiesPage } from '../pages/ActivitiesPage';
import { ActivityDetailPage } from '../pages/ActivityDetailPage';
import { CalendarPage } from '../pages/CalendarPage';
import { DashboardPage } from '../pages/DashboardPage';
import { EventDetailPage } from '../pages/EventDetailPage';
import { EventsPage } from '../pages/EventsPage';
import { HeatmapPage } from '../pages/HeatmapPage';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { PlansPage } from '../pages/PlansPage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SetupPage } from '../pages/SetupPage';
import { TrendsPage } from '../pages/TrendsPage';
import { useTranslation } from '../lib/i18n';

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
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:eventId" element={<EventDetailPage />} />
        <Route path="/heatmap" element={<HeatmapPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
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
