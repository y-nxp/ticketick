/** Erreur renvoyée telle quelle à l'agent : code stable, message en anglais clair. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) =>
  new ApiError(404, "not_found", `${what} not found for this API key's organizer.`);
