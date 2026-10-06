// An error the screens show as-is. `status` mirrors HTTP so the pages written for the server keep working.
export class ApiError extends Error {
  status: number;
  detail: unknown;
  queued = false;
  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}
