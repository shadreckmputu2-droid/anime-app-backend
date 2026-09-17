import { Request, Response, NextFunction } from 'express'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Wraps async route handlers so thrown errors reach errorHandler
// instead of crashing the process (Express doesn't catch async errors
// automatically in versions before 5).
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message })
  }

  console.error(err)
  return res.status(500).json({ error: 'Internal server error' })
}