/**
 * Base class for every error this library throws deliberately (as opposed to letting an
 * unexpected exception bubble up as-is). Lets consumers write one `catch (e) { if (e instanceof
 * AgenticOpenApiError) ... }` to distinguish "this library rejected in a documented way" from an
 * unrelated bug, then narrow further with `instanceof` on a specific subclass.
 */
export class AgenticOpenApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}
