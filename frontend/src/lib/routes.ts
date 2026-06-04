export const APP_BASE_PATH = normalizeBasePath(import.meta.env.VITE_BASE_PATH ?? '/');

export function appPath(path: string) {
  if (APP_BASE_PATH === '/') {
    return path;
  }
  return `${APP_BASE_PATH.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function normalizeBasePath(value: string) {
  if (!value || value === '/') {
    return '/';
  }
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}
