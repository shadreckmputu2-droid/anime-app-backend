import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function main() {
  await prisma.newsArticle.upsert({
    where: { slug: 'spring-2026-preview' },
    create: {
      title: 'Spring 2026 Anime Season Preview',
      slug: 'spring-2026-preview',
      summary: 'A look at the most anticipated shows debuting this spring.',
      body: 'This spring brings a wave of exciting new anime series across every genre, from high-stakes action to slice-of-life comfort watches. Studios have been teasing key visuals for months, and fans are already debating which titles will dominate discussion.',
      publishedAt: new Date(),
    },
    update: {},
  })

  await prisma.newsArticle.upsert({
    where: { slug: 'streaming-deal-announced' },
    create: {
      title: 'New Streaming Deal Announced',
      slug: 'streaming-deal-announced',
      summary: 'A major platform has secured exclusive rights to several upcoming titles.',
      body: 'In a move that shook up the streaming landscape, a major platform announced an exclusive licensing deal covering several highly anticipated series. Details on regional availability are still being finalized.',
      publishedAt: new Date(),
    },
    update: {},
  })

  console.log('Seeded 2 news articles.')
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})