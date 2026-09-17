// Syncs specific anime from Jikan by their MyAnimeList ID, one at a time.
//
// This is more reliable than paginated browsing (/anime?page=N), which
// times out often on Jikan's free tier. Single-anime lookups (/anime/{id})
// hit a much more stable endpoint.
//
// Usage:
//   npx ts-node src/scripts/syncJikanByIds.ts --start 1 --end 50
//   (syncs MAL IDs 1 through 50, one request every ~1.5s)

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { AnimeStatus } from '../generated/prisma/enums'

const JIKAN_BASE = 'https://api.jikan.moe/v4'
const DELAY_MS = 1500

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

async function fetchAnimeById(malId: number, attempt = 1): Promise<JikanAnime | null> {
  const res = await fetch(`${JIKAN_BASE}/anime/${malId}`)

  if (res.status === 404) {
    console.log(`  ID ${malId}: not found, skipping.`)
    return null
  }

  if (res.status === 429) {
    console.warn(`  ID ${malId}: rate limited, backing off 5s...`)
    await sleep(5000)
    return fetchAnimeById(malId, attempt)
  }

  if (res.status >= 500 && attempt <= 3) {
    console.warn(`  ID ${malId}: server error ${res.status}, retrying (${attempt}/3)...`)
    await sleep(3000)
    return fetchAnimeById(malId, attempt + 1)
  }

  if (!res.ok) {
    console.warn(`  ID ${malId}: failed (${res.status}), skipping.`)
    return null
  }

  const json = (await res.json()) as { data: JikanAnime }
  return json.data
}

async function upsertAnime(item: JikanAnime) {
  const anime = await prisma.anime.upsert({
    where: {
      externalSource_externalId: { externalSource: 'jikan', externalId: String(item.mal_id) },
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
  const startArg = process.argv.indexOf('--start')
  const endArg = process.argv.indexOf('--end')
  const start = startArg !== -1 ? Number(process.argv[startArg + 1]) : 1
  const end = endArg !== -1 ? Number(process.argv[endArg + 1]) : 30

  console.log(`Syncing MAL IDs ${start} to ${end}...`)

  let synced = 0
  for (let id = start; id <= end; id++) {
    const item = await fetchAnimeById(id)
    if (item) {
      await upsertAnime(item)
      console.log(`  synced: [${id}] ${item.title}`)
      synced++
    }
    if (id < end) await sleep(DELAY_MS)
  }

  console.log(`Done. Synced ${synced} anime.`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})