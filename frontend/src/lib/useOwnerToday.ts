import { useEffect, useState } from 'react';
import { todayIso } from './date';

export function useOwnerToday(timeZone?: string) {
  const [today, setToday] = useState(() => todayIso(timeZone));

  useEffect(() => {
    const refreshToday = () => setToday(todayIso(timeZone));
    refreshToday();
    const intervalId = window.setInterval(refreshToday, 60_000);
    return () => window.clearInterval(intervalId);
  }, [timeZone]);

  return today;
}
