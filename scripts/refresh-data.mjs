import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const season = Number(process.env.CFB_SEASON ?? 2026)
const base = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${season}/types/1`

const sourceCatalog = [
  {
    name: 'ESPN public college football APIs',
    role: 'Team identity, schedules, rosters, stats links, scoreboard context, news headlines',
    reliability: 'Licensed',
    status: 'Live',
  },
  {
    name: 'NCAA statistics',
    role: 'Official team/player statistical leaderboards and opponent-adjusted checks',
    reliability: 'Official',
    status: 'Manual review',
  },
  {
    name: 'School athletic departments',
    role: 'Roster depth, participation notes, official injuries, transactions, press conferences',
    reliability: 'Primary',
    status: 'Manual review',
  },
  {
    name: 'CollegeFootballData',
    role: 'Advanced box scores, drives, play-by-play, returning production, SP+ style inputs',
    reliability: 'Corroborating',
    status: process.env.CFBD_API_KEY ? 'Live' : 'Key required',
  },
  {
    name: 'The Odds API / market feeds',
    role: 'Opening/current spread, total, moneyline and line-movement history',
    reliability: 'Licensed',
    status: process.env.ODDS_API_KEY ? 'Live' : 'Key required',
  },
]

async function getJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  }
  return response.json()
}

async function resolveRef(ref) {
  return getJson(ref.replace('http://', 'https://'))
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function mapConferences() {
  const fbs = await getJson(`${base}/groups/80?lang=en&region=us`)
  const children = await resolveRef(fbs.children.$ref)
  const conferenceRefs = children.items ?? []
  const conferenceMap = new Map()

  for (const conferenceRef of conferenceRefs) {
    const conference = await resolveRef(conferenceRef.$ref)
    const teams = await resolveRef(`${conference.teams.$ref}&limit=100`)
    for (const item of teams.items ?? []) {
      const id = item.$ref.match(/teams\/([^?]+)/)?.[1]
      if (id) {
        conferenceMap.set(id, {
          id: conference.id,
          name: conference.name,
        })
      }
    }
  }

  return conferenceMap
}

function linkRel(link) {
  return Array.isArray(link.rel) ? link.rel : []
}

function toTeam(team, conference) {
  const logo = team.logos?.find((item) => item.rel?.includes('default'))?.href ?? team.logos?.[0]?.href ?? ''
  const links = (team.links ?? []).map((link) => ({
    rel: linkRel(link),
    href: link.href,
    text: link.text ?? link.shortText ?? 'Source',
  }))
  const sourceConfidence = 72 + Number(Boolean(links.find((link) => link.rel.includes('schedule')))) * 7
    + Number(Boolean(links.find((link) => link.rel.includes('roster')))) * 7
    + Number(Boolean(links.find((link) => link.rel.includes('stats')))) * 7
    + Number(Boolean(logo)) * 4

  return {
    id: team.id,
    abbreviation: team.abbreviation ?? '',
    displayName: team.displayName,
    shortDisplayName: team.shortDisplayName ?? team.location ?? team.displayName,
    location: team.location ?? '',
    nickname: team.name ?? '',
    color: team.color ?? '234e52',
    alternateColor: team.alternateColor ?? 'fffdf5',
    logo,
    conference: conference?.name ?? 'FBS',
    conferenceId: conference?.id ?? '80',
    sourceConfidence: Math.min(99, sourceConfidence),
    links,
  }
}

async function main() {
  const conferenceMap = await mapConferences()
  const fbsTeams = await getJson(`${base}/groups/80/teams?lang=en&region=us&limit=200`)
  const teams = []

  for (const refs of chunk(fbsTeams.items ?? [], 12)) {
    const resolved = await Promise.all(refs.map((item) => resolveRef(item.$ref)))
    teams.push(...resolved.map((team) => toTeam(team, conferenceMap.get(team.id))))
  }

  teams.sort((a, b) => a.conference.localeCompare(b.conference) || a.displayName.localeCompare(b.displayName))

  const snapshot = {
    generatedAt: new Date().toISOString(),
    season,
    sourceNotes: [
      'FBS universe is sourced from ESPN core group 80 for the selected season.',
      'Roster, schedule, stats and news records are linked to their source pages until richer API adapters are configured.',
      'Availability/injury notes should not be promoted without official school confirmation or two reliable corroborating sources.',
    ],
    sources: sourceCatalog,
    teams,
  }

  const outDir = path.resolve('public/data')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'fbs-snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`Wrote ${teams.length} FBS teams for ${season} to public/data/fbs-snapshot.json`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
