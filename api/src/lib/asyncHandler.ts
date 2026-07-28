import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Forwards rejected promises to the error middleware. Express 5 does this on its
 * own, but wrapping keeps the behaviour explicit and version-independent.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
