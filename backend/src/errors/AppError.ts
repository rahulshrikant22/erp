/**
 * Base error class for the ERP API.
 *
 * Anything thrown in a route handler should ultimately be (or derive from)
 * `AppError`. The global error handler turns every `AppError` into the
 * standard error envelope; non-AppError exceptions become 500 INTERNAL_ERROR
 * with the stack only logged, never returned to the client.
 */

export type ErrorDetails = Record<string, unknown> | unknown[];

export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(args: {
    httpStatus: number;
    code: string;
    message: string;
    details?: ErrorDetails;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = new.target.name;
    this.httpStatus = args.httpStatus;
    this.code = args.code;
    this.details = args.details;
    if (args.cause !== undefined) {
      // Node 16+ supports Error.cause; preserve the chain for logging.
      (this as { cause?: unknown }).cause = args.cause;
    }
    // Ensure instanceof works across class extension and serialization.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
