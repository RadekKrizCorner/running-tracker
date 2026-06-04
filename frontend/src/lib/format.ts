let appLocale = 'cs-CZ';

export function setFormatLocale(locale: string) {
  appLocale = locale.startsWith('en') ? 'en-US' : 'cs-CZ';
}

export function getFormatLocale() {
  return appLocale;
}

export function formatDistance(meters: number | null | undefined) {
  const km = (meters ?? 0) / 1000;
  return `${km.toFixed(km >= 10 ? 1 : 2)} km`;
}

export function formatDuration(seconds: number | null | undefined) {
  const total = seconds ?? 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatSplitDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = String(total % 60).padStart(2, '0');
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${remainder}s`;
  }
  return `${minutes}m ${remainder}s`;
}

export function formatSplitPercentage(value: number | null | undefined) {
  return `${(value ?? 0).toFixed(1)} %`;
}

export function formatPace(distanceM: number | null | undefined, seconds: number | null | undefined) {
  if (!distanceM || !seconds) {
    return 'n/a';
  }
  const pace = seconds / (distanceM / 1000);
  return formatPaceSeconds(pace);
}

export function formatPaceSeconds(secondsPerKm: number | null | undefined) {
  if (!secondsPerKm) {
    return 'n/a';
  }
  const roundedSeconds = Math.round(secondsPerKm);
  const min = Math.floor(roundedSeconds / 60);
  const sec = (roundedSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${min}:${sec}/km`;
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat(appLocale, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(parseDate(value));
}

export function formatWeekdayDate(value: string | Date) {
  const date = parseDate(value);
  const weekday = new Intl.DateTimeFormat(appLocale, { weekday: 'long' }).format(date);
  return `${weekday}, ${formatDate(date)}`;
}

export function formatShortDate(value: string | Date) {
  return new Intl.DateTimeFormat(appLocale, { day: 'numeric', month: 'numeric' }).format(parseDate(value));
}

export function formatWeekRange(start: string, end: string) {
  const separator = appLocale.startsWith('cs') ? ' až ' : ' to ';
  return `${formatDate(start)}${separator}${formatDate(end)}`;
}

export function percent(value: number, total: number) {
  if (total <= 0) {
    return '0%';
  }
  return `${Math.round((value / total) * 100)}%`;
}

function parseDate(value: string | Date) {
  if (value instanceof Date) {
    return value;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}
