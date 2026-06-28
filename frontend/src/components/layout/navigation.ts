import {
  Activity,
  BarChart3,
  CalendarDays,
  Dumbbell,
  FileText,
  Gauge,
  Map,
  Route,
  Settings,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export type NavigationItem = {
  to: string;
  labelKey: string;
  mobileLabelKey?: string;
  icon: LucideIcon;
};

export type NavigationGroup = {
  labelKey: string;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    labelKey: 'nav.groupToday',
    items: [{ to: '/dashboard', labelKey: 'nav.dashboard', mobileLabelKey: 'nav.today', icon: Gauge }],
  },
  {
    labelKey: 'nav.groupTraining',
    items: [
      { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays },
      { to: '/plans', labelKey: 'nav.plans', icon: Dumbbell },
      { to: '/activities', labelKey: 'nav.activities', icon: Activity },
    ],
  },
  {
    labelKey: 'nav.groupProgress',
    items: [
      { to: '/trends', labelKey: 'nav.trends', mobileLabelKey: 'nav.progress', icon: BarChart3 },
      { to: '/events', labelKey: 'nav.events', icon: Trophy },
    ],
  },
  {
    labelKey: 'nav.groupTools',
    items: [
      { to: '/heatmap', labelKey: 'nav.heatmap', icon: Map },
      { to: '/routes', labelKey: 'nav.routes', icon: Route },
      { to: '/reports', labelKey: 'nav.reports', icon: FileText },
    ],
  },
  {
    labelKey: 'nav.groupAccount',
    items: [{ to: '/settings', labelKey: 'nav.settings', icon: Settings }],
  },
];

export const navigationItems = navigationGroups.flatMap((group) => group.items);

const mobilePaths = new Set(['/dashboard', '/plans', '/activities', '/trends']);

export const mobilePrimaryItems = navigationItems.filter((item) => mobilePaths.has(item.to));
export const mobileMoreItems = navigationItems.filter((item) => !mobilePaths.has(item.to));
