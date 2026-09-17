import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { asyncHandler, ApiError } from '../middleware/errorHandler'
import { requireAuth, AuthedRequest } from '../middleware/auth'

const router = Router()

router.use(requireAuth)

// GET /api/watchlist — the logged-in user's full tracker
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const entries = await prisma.watchlistEntry.findMany({
      where: { userId: req.userId },
      include: { anime: true },
      orderBy: { updatedAt: 'desc' },
    })
    res.json(entries)
  })
)

const upsertSchema = z.object({
  animeId: z.string(),
  status: z
    .enum(['PLAN_TO_WATCH', 'WATCHING', 'COMPLETED', 'ON_HOLD', 'DROPPED'])
    .optional(),
  userRating: z.number().int().min(1).max(10).optional(),
  progress: z.number().int().min(0).optional(),
  notes: z.string().optional(),
})

// POST /api/watchlist — add or update a tracker entry (upsert by user+anime)
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = upsertSchema.parse(req.body)

    const animeExists = await prisma.anime.findUnique({ where: { id: body.animeId } })
    if (!animeExists) throw new ApiError(404, 'Anime not found')

    const entry = await prisma.watchlistEntry.upsert({
      where: { userId_animeId: { userId: req.userId!, animeId: body.animeId } },
      create: {
        userId: req.userId!,
        animeId: body.animeId,
        status: body.status,
        userRating: body.userRating,
        progress: body.progress,
        notes: body.notes,
      },
      update: {
        ...(body.status && { status: body.status }),
        ...(body.userRating !== undefined && { userRating: body.userRating }),
        ...(body.progress !== undefined && { progress: body.progress }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: { anime: true },
    })

    res.json(entry)
  })
)

// DELETE /api/watchlist/:animeId — remove from tracker
router.delete(
  '/:animeId',
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.watchlistEntry.deleteMany({
            where: { userId: req.userId, animeId: req.params.animeId as string },
    })
    res.status(204).send()
  })
)

export default router