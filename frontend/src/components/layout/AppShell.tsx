import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  Dumbbell,
  FileText,
  Gauge,
  LogOut,
  Map,
  MoreHorizontal,
  Settings,
  Trash2,
  Trophy,
  UserCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useLogout } from '../../features/auth/api';
import {
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationSummary,
} from '../../features/notifications/api';
import { useCalendar } from '../../features/plans/api';
import { AVATAR_ICONS, avatarIconById } from '../../features/profile/avatarIcons';
import { useUpdateUserPreferences, useUserPreferences } from '../../features/profile/api';
import type { CalendarResponse, PlannedWorkout, User } from '../../lib/api/types';
import { toIsoDate } from '../../lib/date';
import { formatDuration } from '../../lib/format';
import { enumLabel, useTranslation } from '../../lib/i18n';

type AppShellProps = {
  user: User | undefined;
  children: ReactNode;
};

const navItems = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: Gauge },
  { to: '/activities', labelKey: 'nav.activities', icon: Activity },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays },
  { to: '/events', labelKey: 'nav.events', icon: Trophy },
  { to: '/plans', labelKey: 'nav.plans', icon: Dumbbell },
  { to: '/reports', labelKey: 'nav.reports', icon: FileText },
  { to: '/heatmap', labelKey: 'nav.heatmap', icon: Map },
  { to: '/trends', labelKey: 'nav.trends', icon: BarChart3 },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

const mobilePrimaryItems = navItems.filter((item) => ['/dashboard', '/activities', '/calendar', '/plans'].includes(item.to));
const mobileMoreItems = navItems.filter((item) => !mobilePrimaryItems.some((primary) => primary.to === item.to));
const AVATAR_IMAGE_MAX_BYTES = 1_500_000;

export function AppShell({ user, children }: AppShellProps) {
  const { setLocale, t } = useTranslation();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [selectedAvatarIcon, setSelectedAvatarIcon] = useState<string | null>(null);
  const [selectedAvatarImage, setSelectedAvatarImage] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);
  const preferences = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const notificationSummary = useNotificationSummary();
  const notifications = useNotifications(notificationsOpen);
  const markNotificationRead = useMarkNotificationRead();
  const markAllNotificationsRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();
  const [today, setToday] = useState(() => toIsoDate(new Date()));
  const todayCalendar = useCalendar(today, today);
  const todayCard = useMemo(
    () => buildTodayCard(todayCalendar.data, today, todayCalendar.isLoading, t),
    [todayCalendar.data, todayCalendar.isLoading, today, t],
  );
  const moreActive = mobileMoreItems.some((item) => location.pathname.startsWith(item.to));
  const unreadCount = notificationSummary.data?.unread_count ?? 0;
  const unreadLabel = unreadCount === 1 ? t('notifications.unread.one') : t('notifications.unread.many');
  const currentAvatarImage = safeAvatarImage(preferences.data?.avatar_image_data_url);
  const currentAvatarIcon = avatarIconById(preferences.data?.avatar_icon);
  const selectedIcon = avatarIconById(selectedAvatarIcon);
  const selectedImage = safeAvatarImage(selectedAvatarImage);
  const isDemo = Boolean(user?.is_demo);

  useEffect(() => {
    if (preferences.data?.locale) {
      setLocale(preferences.data.locale);
    }
  }, [preferences.data?.locale, setLocale]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setToday(toIsoDate(new Date())), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!avatarOpen) {
      return;
    }
    setSelectedAvatarIcon(preferences.data?.avatar_icon ?? AVATAR_ICONS[0]?.id ?? null);
    setSelectedAvatarImage(preferences.data?.avatar_image_data_url ?? null);
    setAvatarStatus(null);
  }, [avatarOpen, preferences.data?.avatar_icon, preferences.data?.avatar_image_data_url]);

  const saveAvatar = () => {
    updatePreferences.mutate(
      {
        avatar_icon: selectedAvatarImage ? null : selectedAvatarIcon,
        avatar_image_data_url: selectedAvatarImage,
      },
      {
        onSuccess: () => setAvatarOpen(false),
      },
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <button
            className="brand-mark brand-avatar-button"
            type="button"
            aria-label={t('profile.editAvatar')}
            disabled={isDemo}
            onClick={() => {
              if (!isDemo) {
                setAvatarOpen(true);
              }
            }}
          >
            {currentAvatarImage ? (
              <img src={currentAvatarImage} alt="" />
            ) : currentAvatarIcon ? (
              <img src={currentAvatarIcon.src} alt="" />
            ) : (
              <UserCircle size={30} />
            )}
          </button>
          <div>
            <strong>{t('app.name')}</strong>
            <span>{user?.email}</span>
            {isDemo ? <span className="status-pill warning">{t('demo.badge')}</span> : null}
          </div>
          <div className="brand-actions">
            <button
              className={unreadCount > 0 ? 'notification-button active' : 'notification-button'}
              type="button"
              aria-expanded={notificationsOpen}
              aria-label={t('notifications.aria', { count: unreadCount, unreadLabel })}
              onClick={() => setNotificationsOpen((current) => !current)}
            >
              <Bell size={18} />
              {unreadCount > 0 ? <span>{unreadCount}</span> : null}
            </button>
            {notificationsOpen ? (
              <div className="notification-popover" role="dialog" aria-label={t('notifications.title')}>
                <div className="notification-popover-header">
                  <strong>{t('notifications.title')}</strong>
                  {unreadCount > 0 && !isDemo ? (
                    <button className="text-button" type="button" onClick={() => markAllNotificationsRead.mutate()}>
                      {t('notifications.markAllRead')}
                    </button>
                  ) : null}
                </div>
                <div className="notification-list">
                  {(notifications.data ?? []).length > 0 ? (
                    (notifications.data ?? []).map((notification) => (
                      <div className={notification.read_at ? 'notification-item' : 'notification-item unread'} key={notification.id}>
                        <Link
                          className="notification-item-content"
                          to={notification.action_url ?? '/dashboard'}
                          onClick={() => {
                            setNotificationsOpen(false);
                            if (!notification.read_at && !isDemo) {
                              markNotificationRead.mutate(notification.id);
                            }
                          }}
                        >
                          <strong>{notification.title}</strong>
                          <span>{notification.body}</span>
                        </Link>
                        <button
                          aria-label={t('notifications.delete')}
                          className="notification-delete-button"
                          disabled={isDemo || deleteNotification.isPending}
                          type="button"
                          onClick={() => {
                            if (!isDemo) {
                              deleteNotification.mutate(notification.id);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>{t('notifications.empty')}</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Icon size={18} />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>
        <button
          className="nav-link button-link"
          type="button"
          onClick={() => {
            logout.mutate(undefined, {
              onSettled: () => navigate('/login'),
            });
          }}
        >
          <LogOut size={18} />
          <span>{t('nav.logout')}</span>
        </button>
        <div className="sidebar-route-card">
          <span>{t('nav.today')}</span>
          <strong>{todayCard.title}</strong>
          {todayCard.detail ? <small>{todayCard.detail}</small> : null}
          <div className="sidebar-route-line" />
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="bottom-nav">
        {mobilePrimaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} className="bottom-nav-link">
              <Icon size={20} />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
        <button
          className={moreActive || moreOpen ? 'bottom-nav-link active' : 'bottom-nav-link'}
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((current) => !current)}
        >
          <MoreHorizontal size={20} />
          <span>{t('nav.more')}</span>
        </button>
      </nav>
      {moreOpen ? (
        <div className="mobile-more-sheet">
          <div aria-label={t('nav.moreNavigation')} className="mobile-more-panel" role="dialog">
            {mobileMoreItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? 'mobile-more-link active' : 'mobile-more-link')}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon size={18} />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              );
            })}
            <button
              className="mobile-more-link"
              type="button"
              onClick={() => {
                logout.mutate(undefined, {
                  onSettled: () => navigate('/login'),
                });
              }}
            >
              <LogOut size={18} />
              <span>{t('nav.logout')}</span>
            </button>
          </div>
        </div>
      ) : null}
      {avatarOpen ? (
        <div className="modal-backdrop">
          <div className="modal-panel avatar-dialog" role="dialog" aria-modal="true" aria-label={t('profile.avatarTitle')}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t('profile.avatarEyebrow')}</p>
                <h2>{t('profile.avatarTitle')}</h2>
              </div>
              <button className="secondary-button" type="button" onClick={() => setAvatarOpen(false)}>
                {t('common.close')}
              </button>
            </div>
            <div className="avatar-preview-row">
              <div className="avatar-preview-frame">
                {selectedImage ? (
                  <img src={selectedImage} alt="" />
                ) : selectedIcon ? (
                  <img src={selectedIcon.src} alt="" />
                ) : (
                  <UserCircle size={58} />
                )}
              </div>
              <div>
                <strong>{t('profile.avatarPreview')}</strong>
                <span>{t('profile.avatarPreviewHelp')}</span>
              </div>
            </div>
            <label className="avatar-upload-control">
              {t('profile.uploadPhoto')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(change) => {
                  const file = change.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  if (!file.type.startsWith('image/')) {
                    setAvatarStatus(t('profile.chooseImage'));
                    return;
                  }
                  if (file.size > AVATAR_IMAGE_MAX_BYTES) {
                    setAvatarStatus(t('profile.avatarTooLarge'));
                    return;
                  }
                  setAvatarStatus(t('profile.readingAvatar'));
                  readDataUrlFile(
                    file,
                    (content) => {
                      setSelectedAvatarImage(content);
                      setAvatarStatus(t('profile.loadedFile', { name: file.name }));
                    },
                    () => setAvatarStatus(t('profile.avatarReadFailed')),
                  );
                }}
              />
            </label>
            {selectedImage ? (
              <button className="secondary-button" type="button" onClick={() => setSelectedAvatarImage(null)}>
                {t('profile.useIconInstead')}
              </button>
            ) : null}
            <div className="avatar-icon-grid" aria-label={t('profile.predefinedIcons')}>
              {AVATAR_ICONS.map((icon) => (
                <button
                  key={icon.id}
                  className={selectedAvatarIcon === icon.id && !selectedImage ? 'avatar-icon-option selected' : 'avatar-icon-option'}
                  type="button"
                  aria-pressed={selectedAvatarIcon === icon.id && !selectedImage}
                  onClick={() => {
                    setSelectedAvatarIcon(icon.id);
                    setSelectedAvatarImage(null);
                  }}
                >
                  <img src={icon.src} alt="" />
                  <span>{t(icon.labelKey)}</span>
                </button>
              ))}
            </div>
            {avatarStatus ? <span className="status-pill neutral">{avatarStatus}</span> : null}
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setAvatarOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className="primary-button" type="button" disabled={updatePreferences.isPending} onClick={saveAvatar}>
                {updatePreferences.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type TodayCard = {
  title: string;
  detail: string | null;
};

function buildTodayCard(
  calendar: CalendarResponse | undefined,
  today: string,
  isLoading: boolean,
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string,
): TodayCard {
  if (calendar?.activities.some((activity) => activity.date === today)) {
    const activity = calendar.activities.find((item) => item.date === today);
    return {
      title: t('sidebar.todayDone'),
      detail: activity ? `${activity.name ?? t('activity.run')} · ${formatCompactDistance(activity.distance_m)}` : null,
    };
  }

  const plannedWorkouts = (calendar?.planned_workouts ?? [])
    .filter((workout) => workout.scheduled_date === today && workout.status !== 'cancelled')
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  if (plannedWorkouts.length > 1) {
    const firstWorkout = plannedWorkouts.find((workout) => workout.workout_type !== 'rest') ?? plannedWorkouts[0];
    return {
      title: t('sidebar.todaySessions', { count: plannedWorkouts.length }),
      detail: cardDetailFromPlannedWorkout(firstWorkout, t),
    };
  }
  if (plannedWorkouts.length === 1) {
    return cardFromPlannedWorkout(plannedWorkouts[0], t);
  }

  if (isLoading) {
    return { title: t('sidebar.loadingToday'), detail: null };
  }

  return { title: t('sidebar.noPlanToday'), detail: null };
}

function cardFromPlannedWorkout(workout: PlannedWorkout, t: (key: string) => string): TodayCard {
  if (workout.workout_type === 'rest') {
    return { title: t('sidebar.restToday'), detail: null };
  }

  const title = workout.title.trim() || enumLabel(t, 'workout', workout.workout_type);
  const distance = workout.target_distance_m ? formatCompactDistance(workout.target_distance_m) : null;
  const duration = !distance && workout.target_duration_s ? formatDuration(workout.target_duration_s) : null;
  const detail = workout.target_intensity ? enumLabel(t, 'intensity', workout.target_intensity) : null;

  return {
    title: [title, distance ?? duration].filter(Boolean).join(' '),
    detail,
  };
}

function cardDetailFromPlannedWorkout(workout: PlannedWorkout, t: (key: string) => string): string {
  const title = workout.title.trim() || enumLabel(t, 'workout', workout.workout_type);
  return [workout.session_label, title].filter(Boolean).join(' · ');
}

function formatCompactDistance(meters: number | null | undefined) {
  const km = (meters ?? 0) / 1000;
  if (Number.isInteger(km)) {
    return `${km} km`;
  }
  return `${km.toFixed(km >= 10 ? 1 : 2)} km`;
}

function readDataUrlFile(file: File, onLoad: (content: string) => void, onError: () => void) {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result ?? ''));
  reader.onerror = onError;
  reader.readAsDataURL(file);
}

function safeAvatarImage(value: string | null | undefined) {
  if (!value?.startsWith('data:image/')) {
    return null;
  }
  return value;
}
