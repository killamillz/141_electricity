// An expected error with an HTTP status, e.g. `throw new AppError(404, "User not found")`.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
