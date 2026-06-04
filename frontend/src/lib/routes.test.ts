import { describe, expect, test } from 'vitest';
import { APP_BASE_PATH, appPath } from './routes';

describe('route helpers', () => {
  test('builds app paths for the configured basename', () => {
    expect(APP_BASE_PATH).toBe('/');
    expect(appPath('/login')).toBe('/login');
  });
});
