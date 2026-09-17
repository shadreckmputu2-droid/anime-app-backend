import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { asyncHandler, ApiError } from '../middleware/errorHandler'

const router = Router()

const listQuerySchema = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  status: z.enum(['UNKNOWN', 'UPCOMING', 'AIRING', 'FINISHED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

// GET /api/anime — browse/search/filter
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query)

    const where = {
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: 'insensitive' as const } },
          { titleEnglish: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
      ...(q.status && { status: q.status }),
      ...(q.genre && {
        genres: { some: { genre: { name: { equals: q.genre, mode: 'insensitive' as const } } } },
      }),
    }

    const [items, total] = await Promise.all([
      prisma.anime.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { title: 'asc' },
        include: { genres: { include: { genre: true } } },
      }),
      prisma.anime.count({ where }),
    ])

    res.json({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    })
  })
)

// GET /api/anime/:id — single anime detail
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const anime = await prisma.anime.findUnique({
            where: { id: req.params.id as string },
      include: {
        genres: { include: { genre: true } },
        newsLinks: { include: { newsArticle: true } },
      },
    })
    if (!anime) throw new ApiError(404, 'Anime not found')
    res.json(anime)
  })
)

export default router