import { getFormatLocale } from './format';

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysIso(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return toIsoDate(value);
}

export function addDaysToIso(value: string, days: number) {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function addMonthsToIso(value: string, months: number) {
  const date = parseIsoDate(value);
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth() + months;
  const targetMonthLastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(date.getDate(), targetMonthLastDay);
  return toIsoDate(new Date(targetYear, targetMonth, targetDay));
}

export function weekStartIso(value = todayIso()) {
  const date = parseIsoDate(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toIsoDate(date);
}

export function weekdayLabel(value: string) {
  return new Intl.DateTimeFormat(getFormatLocale(), { weekday: 'short', day: 'numeric', month: 'numeric' }).format(
    parseIsoDate(value),
  );
}

export function monthRange() {
  const now = new Date();
  const start = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { start, end };
}
