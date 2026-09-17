import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { asyncHandler, ApiError } from '../middleware/errorHandler'

const router = Router()

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

// GET /api/news — latest first
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query)

    const [items, total] = await Promise.all([
      prisma.newsArticle.findMany({
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { publishedAt: 'desc' },
      }),
      prisma.newsArticle.count(),
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

// GET /api/news/:slug — single article, with related anime + comments
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const article = await prisma.newsArticle.findUnique({
            where: { slug: req.params.slug as string },
      include: {
        relatedAnime: { include: { anime: true } },
        comments: { include: { user: { select: { username: true, avatarUrl: true } } } },
      },
    })
    if (!article) throw new ApiError(404, 'Article not found')
    res.json(article)
  })
)

export default router