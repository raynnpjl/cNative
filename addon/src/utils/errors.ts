export class InputError extends Error {}

export class TmdbError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 || status === 403
      ? 'TMDB rejected the credentials. Update them in General Settings.'
      : `TMDB request failed (${status}). Please retry later.`);
  }
}
