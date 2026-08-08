import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { attributeMicroblogPost } from '../src/data/newsAttribution'
import type { AttributableTeam } from '../src/data/newsAttribution'
import type { TrustedMicroblogSource } from '../src/data/microblogSources'

type Snapshot = {
  season: number
  teams: Array<AttributableTeam & { logo: string }>
}

type FetchResult<T> = {
  ok: boolean
  url: string
  data?: T
  error?: string
}

const season = Number(process.env.CFB_SEASON ?? 2026)
const concurrency = Number(process.env.COLLECT_CONCURRENCY ?? 8)
const newsLimit = Number(process.env.NEWS_LIMIT ?? 4)
const siteBase = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football'

const espnNewsSource: TrustedMicroblogSource = {
  id: 'espn-cfb-news',
  platform: 'rss',
  handle: 'ESPN CFB News',
  displayName: 'ESPN College Football News',
  url: 'https://www.espn.com/college-football/',
  scope: 'publication',
  outlet: 'ESPN',
  trustTier: 'desk',
  confidence: 88,
  coverage: ['FBS'],
  routingPolicy: 'article_team_match',
  notes: 'Structured ESPN public news endpoint; team event creation still requires team attribution.',
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

async function getJson<T>(url: string): Promise<FetchResult<T>> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { ok: false, url, error: `${response.status} ${response.statusText}` }
    }
    return { ok: true, url, data: (await response.json()) as T }
  } catch (error) {
    return { ok: false, url, error: error instanceof Error ? error.message : String(error) }
  }
}

async function getText(url: string): Promise<FetchResult<string>> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { ok: false, url, error: `${response.status} ${response.statusText}` }
    }
    return { ok: true, url, data: await response.text() }
  } catch (error) {
    return { ok: false, url, error: error instanceof Error ? error.message : String(error) }
  }
}

async function mapConcurrent<T, R>(items: T[], worker: (item: T) => Promise<R>) {
  const results: R[] = []
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

function normalizeStatValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function flattenRoster(team: Snapshot['teams'][number], roster: any, sourceUrl: string) {
  return (roster.athletes ?? []).flatMap((group: any) =>
    (group.items ?? []).map((athlete: any) => ({
      teamId: team.id,
      team: team.displayName,
      sourceUrl,
      positionGroup: group.position,
      athleteId: athlete.id,
      name: athlete.displayName ?? athlete.fullName,
      firstName: athlete.firstName ?? '',
      lastName: athlete.lastName ?? '',
      jersey: athlete.jersey ?? '',
      position: athlete.position?.abbreviation ?? athlete.position?.displayName ?? '',
      year: athlete.experience?.displayValue ?? athlete.experience?.abbreviation ?? '',
      height: athlete.displayHeight ?? '',
      weight: athlete.displayWeight ?? '',
      hometown: athlete.birthPlace
        ? [athlete.birthPlace.city, athlete.birthPlace.state, athlete.birthPlace.country].filter(Boolean).join(', ')
        : '',
    })),
  )
}

function flattenStats(team: Snapshot['teams'][number], stats: any, sourceUrl: string) {
  return (stats.results?.stats?.categories ?? []).flatMap((category: any) =>
    (category.stats ?? []).map((stat: any) => ({
      teamId: team.id,
      team: team.displayName,
      sourceUrl,
      category: category.name,
      categoryDisplayName: category.displayName,
      name: stat.name,
      displayName: stat.displayName,
      shortDisplayName: stat.shortDisplayName,
      abbreviation: stat.abbreviation,
      description: stat.description,
      value: normalizeStatValue(stat.value),
      displayValue: stat.displayValue,
      perGameValue: normalizeStatValue(stat.perGameValue),
      perGameDisplayValue: stat.perGameDisplayValue,
      rank: stat.rank ?? null,
      rankDisplayValue: stat.rankDisplayValue ?? '',
    })),
  )
}

function flattenSchedule(team: Snapshot['teams'][number], schedule: any, sourceUrl: string) {
  return (schedule.events ?? []).map((event: any) => ({
    teamId: team.id,
    team: team.displayName,
    sourceUrl,
    eventId: event.id,
    date: event.date,
    name: event.name,
    shortName: event.shortName,
    seasonType: schedule.season?.name ?? '',
    week: event.week?.number ?? null,
    completed: Boolean(event.competitions?.[0]?.status?.type?.completed),
    neutralSite: Boolean(event.competitions?.[0]?.neutralSite),
    venue: event.competitions?.[0]?.venue?.fullName ?? '',
    competitors:
      event.competitions?.[0]?.competitors?.map((competitor: any) => ({
        homeAway: competitor.homeAway,
        winner: competitor.winner ?? false,
        teamId: competitor.team?.id,
        team: competitor.team?.displayName,
        score: competitor.score,
      })) ?? [],
  }))
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '))
}

function scrapeScheduleFromHtml(team: Snapshot['teams'][number], html: string, sourceUrl: string) {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*class="[^"]*Table__TR[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)).map((match) => match[1])
  return rows
    .map((row, index) => {
      const cells = Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)).map((match) => match[1])
      if (cells.length < 4 || /Table__Headers|Table__Title/.test(row)) {
        return null
      }
      const date = stripTags(cells[0])
      const opponentCell = cells[1]
      const opponentId = opponentCell.match(/\/team\/_\/id\/([^/"]+)/)?.[1] ?? ''
      const opponent = decodeHtml(opponentCell.match(/title="([^"]+)"/)?.[1] ?? stripTags(opponentCell).replace(/^(vs|@)\s+/i, ''))
      const homeAway = /\bvs\b/.test(stripTags(opponentCell)) ? 'home' : /\b@\b/.test(stripTags(opponentCell)) ? 'away' : ''
      const time = stripTags(cells[2])
      const tv = stripTags(cells[3])

      if (!date || !opponent) {
        return null
      }

      return {
        teamId: team.id,
        team: team.displayName,
        sourceUrl,
        eventId: `scraped-${team.id}-${season}-${index}`,
        date,
        name: `${team.shortDisplayName} ${homeAway === 'home' ? 'vs' : homeAway === 'away' ? 'at' : 'vs'} ${opponent}`,
        shortName: `${team.abbreviation} ${homeAway === 'home' ? 'vs' : homeAway === 'away' ? '@' : 'vs'} ${opponent}`,
        seasonType: 'Regular Season',
        week: null,
        completed: false,
        neutralSite: false,
        venue: '',
        time,
        tv,
        competitors: [
          {
            homeAway,
            winner: false,
            teamId: opponentId,
            team: opponent,
            score: '',
          },
        ],
        collectionMethod: 'html-scrape',
      }
    })
    .filter(Boolean)
}

function flattenInjuries(team: Snapshot['teams'][number], injuries: any, sourceUrl: string) {
  if (!injuries || !Object.keys(injuries).length) {
    return []
  }
  return (injuries.injuries ?? injuries.athletes ?? []).map((item: any) => ({
    teamId: team.id,
    team: team.displayName,
    sourceUrl,
    athleteId: item.athlete?.id ?? item.id ?? '',
    athlete: item.athlete?.displayName ?? item.displayName ?? '',
    status: item.status ?? item.type ?? '',
    detail: item.detail ?? item.description ?? '',
    date: item.date ?? '',
  }))
}

function flattenNews(team: Snapshot['teams'][number], news: any, sourceUrl: string) {
  return (news.articles ?? []).map((article: any) => {
    const attribution = attributeMicroblogPost(
      {
        id: String(article.id),
        sourceId: espnNewsSource.id,
        text: [article.headline, article.description].filter(Boolean).join(' '),
        url: article.links?.web?.href ?? article.link?.href ?? sourceUrl,
        postedAt: article.published ?? article.lastModified ?? '',
        linkedTitle: article.headline,
        linkedText: article.description,
      },
      espnNewsSource,
      [team],
    )
    return {
      teamId: team.id,
      team: team.displayName,
      sourceUrl,
      articleId: String(article.id),
      headline: article.headline,
      description: article.description ?? '',
      published: article.published ?? '',
      lastModified: article.lastModified ?? '',
      url: article.links?.web?.href ?? article.link?.href ?? '',
      images: article.images ?? [],
      attributed: attribution.accepted.length > 0,
      attributionEvidence: attribution.accepted[0]?.evidence ?? [],
    }
  })
}

async function collectTeam(team: Snapshot['teams'][number]) {
  const urls = {
    roster: `${siteBase}/teams/${team.id}/roster`,
    stats: `${siteBase}/teams/${team.id}/statistics`,
    schedule: `${siteBase}/teams/${team.id}/schedule?season=${season}`,
    scheduleHtml: `https://www.espn.com/college-football/team/schedule/_/id/${team.id}/season/${season}`,
    injuries: `${siteBase}/teams/${team.id}/injuries`,
    news: `${siteBase}/news?team=${team.id}&limit=${newsLimit}`,
  }
  const [roster, stats, schedule, injuries, news] = await Promise.all([
    getJson<any>(urls.roster),
    getJson<any>(urls.stats),
    getJson<any>(urls.schedule),
    getJson<any>(urls.injuries),
    getJson<any>(urls.news),
  ])

  let scheduleRows = schedule.ok && schedule.data ? flattenSchedule(team, schedule.data, urls.schedule) : []
  let scheduleStatus = schedule.ok ? 'ok:api' : schedule.error
  if (!scheduleRows.length) {
    const scheduleHtml = await getText(urls.scheduleHtml)
    if (scheduleHtml.ok && scheduleHtml.data) {
      scheduleRows = scrapeScheduleFromHtml(team, scheduleHtml.data, urls.scheduleHtml)
      scheduleStatus = scheduleRows.length ? 'ok:html-scrape' : 'empty:api-and-html'
    } else {
      scheduleStatus = `empty:api; html:${scheduleHtml.error}`
    }
  }

  return {
    teamId: team.id,
    team: team.displayName,
    roster: roster.ok && roster.data ? flattenRoster(team, roster.data, urls.roster) : [],
    stats: stats.ok && stats.data ? flattenStats(team, stats.data, urls.stats) : [],
    schedule: scheduleRows,
    injuries: injuries.ok && injuries.data ? flattenInjuries(team, injuries.data, urls.injuries) : [],
    news: news.ok && news.data ? flattenNews(team, news.data, urls.news) : [],
    sourceStatus: {
      roster: roster.ok ? 'ok' : roster.error,
      stats: stats.ok ? 'ok' : stats.error,
      schedule: scheduleStatus,
      injuries: injuries.ok ? 'ok' : injuries.error,
      news: news.ok ? 'ok' : news.error,
    },
  }
}

async function main() {
  const snapshot = await readJson<Snapshot>(path.resolve('public/data/fbs-snapshot.json'))
  const collected = await mapConcurrent(snapshot.teams, collectTeam)
  const rosterPlayers = collected.flatMap((team) => team.roster)
  const teamStats = collected.flatMap((team) => team.stats)
  const scheduleGames = collected.flatMap((team) => team.schedule)
  const injuries = collected.flatMap((team) => team.injuries)
  const news = collected.flatMap((team) => team.news)

  const mart = {
    generatedAt: new Date().toISOString(),
    season,
    sources: [
      {
        name: 'ESPN public college football endpoints',
        endpoints: ['team roster', 'team statistics', 'team schedule', 'team injuries', 'team news'],
        reliability: 'Licensed/public structured data',
      },
    ],
    rowCounts: {
      teams: snapshot.teams.length,
      rosterPlayers: rosterPlayers.length,
      teamStats: teamStats.length,
      scheduleGames: scheduleGames.length,
      injuries: injuries.length,
      news: news.length,
      attributedNews: news.filter((article) => article.attributed).length,
    },
    sourceStatus: collected.map(({ teamId, team, sourceStatus }) => ({ teamId, team, sourceStatus })),
    rosterPlayers,
    teamStats,
    scheduleGames,
    injuries,
    news,
  }

  const outPath = path.resolve('public/data/team-stat-marts.json')
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(mart, null, 2)}\n`)
  console.log(
    `Collected stats mart: ${rosterPlayers.length} roster rows, ${teamStats.length} stat rows, ${scheduleGames.length} schedule rows, ${injuries.length} injury rows, ${news.length} news rows`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
