export class AppError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
export class UnauthorizedError extends AppError { constructor(m='unauthorized') { super(m, 4003); } }
export class RegistrationError extends AppError { constructor(m='invalid registration') { super(m, 4001); } }
export class PayloadTooLargeError extends AppError { constructor(m='message too big') { super(m, 1009); } }
export class RateLimitError extends AppError { constructor(m='rate limit exceeded') { super(m, 4008); } }
