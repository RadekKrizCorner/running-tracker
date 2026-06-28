import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useOwnerToday } from './useOwnerToday';

describe('useOwnerToday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('rolls over when the owner-local date changes while the page stays open', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T09:59:30Z'));
    const { result, unmount } = renderHook(() => useOwnerToday('Pacific/Kiritimati'));

    expect(result.current).toBe('2026-06-28');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current).toBe('2026-06-29');
    unmount();
  });
});
