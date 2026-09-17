import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { ApiError } from './errorHandler'

export interface AuthedRequest extends Request {
  userId?: string
}

const JWT_SECRET = process.env.JWT_SECRET

export function requireAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
) {
  if (!JWT_SECRET) {
    return next(new ApiError(500, 'JWT_SECRET is not configured'))
  }

  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Missing or malformed Authorization header'))
  }

  const token = header.slice('Bearer '.length)

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
    req.userId = payload.sub
    next()
  } catch {
    next(new ApiError(401, 'Invalid or expired token'))
  }
}