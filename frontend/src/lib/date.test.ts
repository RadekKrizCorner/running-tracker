import { describe, expect, test } from 'vitest';
import { todayIso, weekStartIso } from './date';

describe('date helpers', () => {
  test('uses the owner timezone when UTC and local calendar dates differ', () => {
    const utcSunday = new Date('2026-06-28T22:30:00Z');

    expect(todayIso('Europe/Prague', utcSunday)).toBe('2026-06-29');
    expect(weekStartIso(todayIso('Europe/Prague', utcSunday))).toBe('2026-06-29');
  });
});
