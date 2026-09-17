// Syncs anime data from the Jikan API (https://jikan.moe) into our database.
//
// Jikan is a free, public REST wrapper around MyAnimeList — no API key needed.
// It rate-limits to ~60 requests/minute, so we deliberately pace requests
// with a delay and back off further if we ever get a 429.
//
// Usage:
//   npx ts-node src/scripts/syncJikan.ts            # syncs 5 pages (~125 anime)
//   npx ts-node src/scripts/syncJikan.ts --pages 20  # syncs a specific number of pages
//
// Each page = 25 anime. Re-running this script is safe — anime are upserted
// by (externalSource, externalId), so existing rows get updated, not duplicated.

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { AnimeStatus } from '../generated/prisma/enums'

const JIKAN_BASE = 'https://api.jikan.moe/v4'
const DELAY_MS = 1200 // ~50 req/min, safely under Jikan's ~60/min limit

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface JikanAnime {
  mal_id: number
  title: string
  title_english: string | null
  title_japanese: string | null
  synopsis: string | null
  episodes: number | null
  status: string
  aired: { from: string | null; to: string | null }
  season: string | null
  year: number | null
  studios: { name: string }[]
  source: string | null
  images: { jpg: { image_url: string | null; large_image_url: string | null } }
  score: number | null
  scored_by: number | null
  genres: { name: string }[]
}

interface JikanPageResponse {
  data: JikanAnime[]
  pagination: { has_next_page: boolean; current_page: number; last_visible_page: number }
}

function mapStatus(jikanStatus: string): AnimeStatus {
  switch (jikanStatus) {
    case 'Currently Airing':
      return AnimeStatus.AIRING
    case 'Finished Airing':
      return AnimeStatus.FINISHED
    case 'Not yet aired':
      return AnimeStatus.UPCOMING
    default:
      return AnimeStatus.UNKNOWN
  }
}

async function fetchPage(page: number, attempt = 1): Promise<JikanPageResponse> {
  const res = await fetch(`${JIKAN_BASE}/anime?page=${page}`)

  if (res.status === 429) {
    console.warn(`Rate limited on page ${page}, backing off 5s...`)
    await sleep(5000)
    return fetchPage(page, attempt)
  }

  if (res.status >= 500 && attempt <= 3) {
    console.warn(
      `Server error ${res.status} on page ${page}, retrying (attempt ${attempt}/5) in 3s...`
    )
    await sleep(3000)
    return fetchPage(page, attempt + 1)
  }

  if (!res.ok) {
    throw new Error(`Jikan request failed: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<JikanPageResponse>
}

async function upsertAnime(item: JikanAnime) {
  const anime = await prisma.anime.upsert({
    where: {
      externalSource_externalId: {
        externalSource: 'jikan',
        externalId: String(item.mal_id),
      },
    },
    create: {
      externalSource: 'jikan',
      externalId: String(item.mal_id),
      title: item.title,
      titleEnglish: item.title_english,
      titleJapanese: item.title_japanese,
      synopsis: item.synopsis,
      episodes: item.episodes,
      status: mapStatus(item.status),
      airedFrom: item.aired.from ? new Date(item.aired.from) : null,
      airedTo: item.aired.to ? new Date(item.aired.to) : null,
      season: item.season && item.year ? `${item.season} ${item.year}` : null,
      studio: item.studios[0]?.name ?? null,
      sourceMaterial: item.source,
      coverImageUrl: item.images.jpg.image_url,
      bannerImageUrl: item.images.jpg.large_image_url,
      externalRating: item.score,
      externalRatingCount: item.scored_by,
    },
    update: {
      title: item.title,
      titleEnglish: item.title_english,
      titleJapanese: item.title_japanese,
      synopsis: item.synopsis,
      episodes: item.episodes,
      status: mapStatus(item.status),
      airedFrom: item.aired.from ? new Date(item.aired.from) : null,
      airedTo: item.aired.to ? new Date(item.aired.to) : null,
      season: item.season && item.year ? `${item.season} ${item.year}` : null,
      studio: item.studios[0]?.name ?? null,
      sourceMaterial: item.source,
      coverImageUrl: item.images.jpg.image_url,
      bannerImageUrl: item.images.jpg.large_image_url,
      externalRating: item.score,
      externalRatingCount: item.scored_by,
    },
  })

  for (const g of item.genres) {
    const genre = await prisma.genre.upsert({
      where: { name: g.name },
      create: { name: g.name },
      update: {},
    })

    await prisma.animeGenre.upsert({
      where: { animeId_genreId: { animeId: anime.id, genreId: genre.id } },
      create: { animeId: anime.id, genreId: genre.id },
      update: {},
    })
  }

  return anime
}

async function main() {
  const pagesArgIndex = process.argv.indexOf('--pages')
  const maxPages = pagesArgIndex !== -1 ? Number(process.argv[pagesArgIndex + 1]) : 5

  console.log(`Syncing up to ${maxPages} page(s) from Jikan (25 anime/page)...`)

  let page = 1
  let totalSynced = 0

   while (page <= maxPages) {
    console.log(`Fetching page ${page}...`)

    try {
      const { data, pagination } = await fetchPage(page)

      for (const item of data) {
        await upsertAnime(item)
        totalSynced++
        process.stdout.write(`  synced: ${item.title}\n`)
      }

      if (!pagination.has_next_page) {
        console.log('No more pages available from Jikan.')
        break
      }
    } catch (err) {
      console.warn(`Skipping page ${page} after repeated failures:`, (err as Error).message)
    }

    page++
    if (page <= maxPages) await sleep(DELAY_MS)
  }

  console.log(`Done. Synced ${totalSynced} anime.`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})