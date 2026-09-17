import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { asyncHandler, ApiError } from '../middleware/errorHandler'

const router = Router()

const registerSchema = z.object({
  email: z.email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8),
  displayName: z.string().optional(),
})

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body)

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: body.email }, { username: body.username }] },
    })
    if (existing) {
      throw new ApiError(409, 'Email or username already in use')
    }

    const passwordHash = await bcrypt.hash(body.password, 12)

    const user = await prisma.user.create({
      data: {
        email: body.email,
        username: body.username,
        passwordHash,
        displayName: body.displayName,
      },
      select: { id: true, email: true, username: true, displayName: true },
    })

    res.status(201).json(user)
  })
)

const loginSchema = z.object({
  email: z.email(),
  password: z.string(),
})

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) throw new ApiError(401, 'Invalid credentials')

    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) throw new ApiError(401, 'Invalid credentials')

    const JWT_SECRET = process.env.JWT_SECRET
    if (!JWT_SECRET) throw new ApiError(500, 'JWT_SECRET is not configured')

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username },
    })
  })
)

export default router