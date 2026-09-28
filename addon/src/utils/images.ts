export function imageUrl(path: string | null | undefined, size: 'w342' | 'w500' | 'w1280' = 'w500'): string | undefined {
  return path && /^\/[A-Za-z0-9_.-]+$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}
