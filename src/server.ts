import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import animeRoutes from './routes/anime.routes'
import newsRoutes from './routes/news.routes'
import watchlistRoutes from './routes/watchlist.routes'
import authRoutes from './routes/auth.routes'
import { errorHandler } from './middleware/errorHandler'

const app = express()

app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use('/api/auth', authRoutes)
app.use('/api/anime', animeRoutes)
app.use('/api/news', newsRoutes)
app.use('/api/watchlist', watchlistRoutes)

// Must be registered last — catches errors thrown/passed by any route above
app.use(errorHandler)

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})