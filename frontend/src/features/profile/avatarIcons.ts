export type AvatarIcon = {
  id: string;
  labelKey: string;
  src: string;
};

export const AVATAR_ICONS: AvatarIcon[] = [
  { id: 'runner_route', labelKey: 'profile.avatarIcon.runnerRoute', src: '/avatar-icons/01_runner_route.png' },
  { id: 'stopwatch', labelKey: 'profile.avatarIcon.stopwatch', src: '/avatar-icons/02_stopwatch.png' },
  { id: 'heart_rate', labelKey: 'profile.avatarIcon.heartRate', src: '/avatar-icons/03_heart_rate.png' },
  { id: 'running_shoes', labelKey: 'profile.avatarIcon.runningShoes', src: '/avatar-icons/04_running_shoes.png' },
  { id: 'trail_path', labelKey: 'profile.avatarIcon.trailPath', src: '/avatar-icons/05_trail_path.png' },
  { id: 'water_bottle', labelKey: 'profile.avatarIcon.waterBottle', src: '/avatar-icons/06_water_bottle.png' },
  { id: 'route_map', labelKey: 'profile.avatarIcon.routeMap', src: '/avatar-icons/07_route_map.png' },
  { id: 'calories_flame', labelKey: 'profile.avatarIcon.caloriesFlame', src: '/avatar-icons/08_calories_flame.png' },
  { id: 'goal_target', labelKey: 'profile.avatarIcon.goalTarget', src: '/avatar-icons/09_goal_target.png' },
  { id: 'medal', labelKey: 'profile.avatarIcon.medal', src: '/avatar-icons/10_medal.png' },
  { id: 'music_headphones', labelKey: 'profile.avatarIcon.musicHeadphones', src: '/avatar-icons/11_music_headphones.png' },
  { id: 'trophy', labelKey: 'profile.avatarIcon.trophy', src: '/avatar-icons/12_trophy.png' },
  { id: 'calendar_check', labelKey: 'profile.avatarIcon.calendarCheck', src: '/avatar-icons/13_calendar_check.png' },
  { id: 'night_run', labelKey: 'profile.avatarIcon.nightRun', src: '/avatar-icons/14_night_run.png' },
  { id: 'weather', labelKey: 'profile.avatarIcon.weather', src: '/avatar-icons/15_weather.png' },
  { id: 'smartwatch', labelKey: 'profile.avatarIcon.smartwatch', src: '/avatar-icons/16_smartwatch.png' },
  { id: 'badge_check', labelKey: 'profile.avatarIcon.badgeCheck', src: '/avatar-icons/17_badge_check.png' },
  { id: 'strength', labelKey: 'profile.avatarIcon.strength', src: '/avatar-icons/18_strength.png' },
];

export function avatarIconById(iconId: string | null | undefined) {
  return AVATAR_ICONS.find((icon) => icon.id === iconId) ?? null;
}
