import { describe, expect, test } from 'vitest';
import { formatPace } from './format';

describe('formatPace', () => {
  test('formats normal minute and second pace values', () => {
    expect(formatPace(1000, 330)).toBe('5:30/km');
  });

  test('carries rounded seconds into the next minute', () => {
    expect(formatPace(1000, 419.999)).toBe('7:00/km');
  });
});
