/**
 * Domain error types.
 *
 * The distinction matters at the HTTP boundary: a ValidationError is the
 * caller's fault (400), a BusinessRuleError is a legitimate request that the
 * business rules forbid (409), and anything else is our fault (500). Mapping
 * all three onto one generic Error would make real bugs indistinguishable
 * from a user typing a letter into a quantity box.
 */

/** Malformed input: wrong shape, wrong type, missing field. */
export class ValidationError extends Error {
  readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Well-formed input that a business rule refuses.
 * "Only 3 in stock, you asked for 10" is this, not a validation error.
 */
export class BusinessRuleError extends Error {
  readonly rule: string;
  readonly detail: Record<string, unknown> | undefined;

  constructor(rule: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = 'BusinessRuleError';
    this.rule = rule;
    this.detail = detail;
  }
}

/** The requested record does not exist. */
export class NotFoundError extends Error {
  constructor(entity: string, id: number | string) {
    super(`${entity} ${String(id)} not found`);
    this.name = 'NotFoundError';
  }
}
