import {
  Activity,
  AlertTriangle,
  BarChart3,
  Crosshair,
  DatabaseZap,
  Filter,
  LineChart,
  Newspaper,
  ShieldCheck,
  Swords,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import { trustedMicroblogSources } from './data/microblogSources'

type TeamLink = {
  rel: string[]
  href: string
  text: string
}

type Team = {
  id: string
  abbreviation: string
  displayName: string
  shortDisplayName: string
  location: string
  nickname: string
  color: string
  alternateColor: string
  logo: string
  conference: string
  conferenceId: string
  sourceConfidence: number
  links: TeamLink[]
}

type Source = {
  name: string
  role: string
  reliability: 'Primary' | 'Official' | 'Licensed' | 'Corroborating'
  status: 'Live' | 'Key required' | 'Manual review'
}

type Snapshot = {
  generatedAt: string
  season: number
  teams: Team[]
  sources: Source[]
}

type StatsMart = {
  generatedAt: string
  rowCounts: {
    rosterPlayers: number
    teamStats: number
    scheduleGames: number
    injuries: number
    news: number
    attributedNews: number
  }
  rosterPlayers: Array<{
    teamId: string
    positionGroup: string
    name: string
    position: string
    year: string
    height: string
    weight: string
  }>
  teamStats: Array<{
    teamId: string
    category: string
    displayName: string
    abbreviation: string
    displayValue: string
    perGameDisplayValue: string
  }>
  scheduleGames: Array<{
    teamId: string
    date: string
    shortName: string
    venue: string
  }>
  injuries: Array<{
    teamId: string
    athlete: string
    status: string
    detail: string
  }>
  news: Array<{
    teamId: string
    headline: string
    description: string
    published: string
    attributed: boolean
  }>
}

type WarRoomRow = {
  id: string
  away: Team
  home: Team
  date: string
  edge: number
  trend: number
  injuryRisk: number
  rosterClarity: number
  marketWatch: string
  angle: string
}

const fallbackSnapshot: Snapshot = {
  generatedAt: '2026-08-08T00:00:00.000Z',
  season: 2026,
  teams: [
    {
      id: '333',
      abbreviation: 'ALA',
      displayName: 'Alabama Crimson Tide',
      shortDisplayName: 'Alabama',
      location: 'Alabama',
      nickname: 'Crimson Tide',
      color: '9e1b32',
      alternateColor: 'ffffff',
      logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png',
      conference: 'Southeastern Conference',
      conferenceId: '8',
      sourceConfidence: 92,
      links: [],
    },
    {
      id: '251',
      abbreviation: 'TEX',
      displayName: 'Texas Longhorns',
      shortDisplayName: 'Texas',
      location: 'Texas',
      nickname: 'Longhorns',
      color: 'bf5700',
      alternateColor: 'ffffff',
      logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png',
      conference: 'Southeastern Conference',
      conferenceId: '8',
      sourceConfidence: 91,
      links: [],
    },
    {
      id: '130',
      abbreviation: 'MICH',
      displayName: 'Michigan Wolverines',
      shortDisplayName: 'Michigan',
      location: 'Michigan',
      nickname: 'Wolverines',
      color: '00274c',
      alternateColor: 'ffcb05',
      logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/130.png',
      conference: 'Big Ten Conference',
      conferenceId: '5',
      sourceConfidence: 91,
      links: [],
    },
    {
      id: '2483',
      abbreviation: 'ORE',
      displayName: 'Oregon Ducks',
      shortDisplayName: 'Oregon',
      location: 'Oregon',
      nickname: 'Ducks',
      color: '154733',
      alternateColor: 'fee123',
      logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png',
      conference: 'Big Ten Conference',
      conferenceId: '5',
      sourceConfidence: 90,
      links: [],
    },
  ],
  sources: [],
}

const defaultSources: Source[] = [
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
    status: 'Key required',
  },
  {
    name: 'The Odds API / market feeds',
    role: 'Opening/current spread, total, moneyline and line-movement history',
    reliability: 'Licensed',
    status: 'Key required',
  },
]

const emptyStatsMart: StatsMart = {
  generatedAt: '',
  rowCounts: {
    rosterPlayers: 0,
    teamStats: 0,
    scheduleGames: 0,
    injuries: 0,
    news: 0,
    attributedNews: 0,
  },
  rosterPlayers: [],
  teamStats: [],
  scheduleGames: [],
  injuries: [],
  news: [],
}

const conferenceOrder = [
  'All',
  'Southeastern Conference',
  'Big Ten Conference',
  'Big 12 Conference',
  'Atlantic Coast Conference',
  'American Conference',
  'Conference USA',
  'Mid-American Conference',
  'Mountain West Conference',
  'Pac-12 Conference',
  'Sun Belt Conference',
  'FBS Independents',
]

function stableScore(seed: string, min: number, max: number) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973
  }
  return Math.round(min + (hash / 9973) * (max - min))
}

function buildRows(teams: Team[]): WarRoomRow[] {
  const ordered = [...teams].sort((a, b) => b.sourceConfidence - a.sourceConfidence || a.displayName.localeCompare(b.displayName))
  const rows: WarRoomRow[] = []
  for (let index = 0; index < Math.min(36, ordered.length - 1); index += 2) {
    const away = ordered[index]
    const home = ordered[index + 1]
    const base = stableScore(`${away.id}-${home.id}`, 31, 82)
    const trend = stableScore(`${home.id}-${away.id}-trend`, -13, 16)
    const injuryRisk = stableScore(`${away.abbreviation}-${home.abbreviation}-injury`, 8, 64)
    const rosterClarity = Math.round((away.sourceConfidence + home.sourceConfidence) / 2)
    rows.push({
      id: `${away.id}-${home.id}`,
      away,
      home,
      date: `Week ${1 + (index % 6)} window`,
      edge: base,
      trend,
      injuryRisk,
      rosterClarity,
      marketWatch: trend > 7 ? 'Steam check' : injuryRisk > 46 ? 'Wait for depth chart' : 'Playable if number holds',
      angle:
        trend > 8
          ? 'Recent movement and source depth point in the same direction.'
          : injuryRisk > 44
            ? 'Availability uncertainty is large enough to demand confirmation.'
            : 'Clean source picture; compare power rating before kickoff.',
    })
  }
  return rows
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(fallbackSnapshot)
  const [statsMart, setStatsMart] = useState<StatsMart>(emptyStatsMart)
  const [query, setQuery] = useState('')
  const [conference, setConference] = useState('All')
  const [selectedTeamId, setSelectedTeamId] = useState(fallbackSnapshot.teams[0].id)

  useEffect(() => {
    fetch('/data/fbs-snapshot.json')
      .then((response) => (response.ok ? response.json() : fallbackSnapshot))
      .then((data: Snapshot) => {
        if (data.teams?.length) {
          setSnapshot({ ...data, sources: data.sources?.length ? data.sources : defaultSources })
          setSelectedTeamId(data.teams[0].id)
        }
      })
      .catch(() => setSnapshot(fallbackSnapshot))
  }, [])

  useEffect(() => {
    fetch('/data/team-stat-marts.json')
      .then((response) => (response.ok ? response.json() : emptyStatsMart))
      .then((data: StatsMart) => setStatsMart(data.rowCounts ? data : emptyStatsMart))
      .catch(() => setStatsMart(emptyStatsMart))
  }, [])

  const sources = snapshot.sources?.length ? snapshot.sources : defaultSources
  const conferences = useMemo(() => {
    const present = new Set(snapshot.teams.map((team) => team.conference).filter(Boolean))
    return conferenceOrder.filter((item) => item === 'All' || present.has(item))
  }, [snapshot.teams])

  const filteredTeams = useMemo(
    () =>
      snapshot.teams.filter((team) => {
        const matchesConference = conference === 'All' || team.conference === conference
        const haystack = `${team.displayName} ${team.abbreviation} ${team.conference}`.toLowerCase()
        return matchesConference && haystack.includes(query.toLowerCase())
      }),
    [conference, query, snapshot.teams],
  )

  const warRoomRows = useMemo(() => buildRows(filteredTeams.length > 3 ? filteredTeams : snapshot.teams), [filteredTeams, snapshot.teams])
  const selectedTeam = snapshot.teams.find((team) => team.id === selectedTeamId) ?? snapshot.teams[0]
  const selectedStats = statsMart.teamStats.filter((stat) => stat.teamId === selectedTeam.id)
  const selectedRoster = statsMart.rosterPlayers.filter((player) => player.teamId === selectedTeam.id)
  const selectedNews = statsMart.news.filter((article) => article.teamId === selectedTeam.id)
  const selectedSchedule = statsMart.scheduleGames.filter((game) => game.teamId === selectedTeam.id)
  const rosterByGroup = Array.from(
    selectedRoster.reduce((map, player) => {
      map.set(player.positionGroup, (map.get(player.positionGroup) ?? 0) + 1)
      return map
    }, new Map<string, number>()),
  )
  const featuredStats = selectedStats
    .filter((stat) => ['passing', 'rushing', 'receiving', 'defensive', 'scoring'].includes(stat.category))
    .slice(0, 8)
  const conferenceCoverage = useMemo(
    () =>
      Array.from(
        snapshot.teams.reduce((map, team) => {
          map.set(team.conference, (map.get(team.conference) ?? 0) + 1)
          return map
        }, new Map<string, number>()),
      )
        .map(([name, count]) => ({ name: name.replace(' Conference', ''), count }))
        .sort((a, b) => b.count - a.count),
    [snapshot.teams],
  )
  const edgeTrend = warRoomRows.slice(0, 12).map((row) => ({
    name: row.home.abbreviation,
    edge: row.edge,
    volatility: row.injuryRisk,
  }))

  return (
    <main>
      <section className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Crosshair size={24} />
          </div>
          <div>
            <p className="eyebrow">FBS intelligence desk</p>
            <h1>LineVault Alpha</h1>
          </div>
        </div>
        <div className="freshness">
          <ShieldCheck size={18} />
          <span>Public-source build {new Date(snapshot.generatedAt).toLocaleString()}</span>
        </div>
      </section>

      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Premium college football prognostication terminal</p>
          <h2>Every FBS program, ranked by signal quality before the market notices.</h2>
          <p>
            LineVault Alpha brings team profiles, source confidence, opponent context, market-watch prompts, roster clarity and
            news risk into one board for upcoming-game forecasting.
          </p>
        </div>
        <div className="hero-visual" aria-label="LineVault field intelligence graphic">
          <div className="field-lines"></div>
          {snapshot.teams.slice(0, 10).map((team, index) => (
            <img
              key={team.id}
              src={team.logo}
              alt=""
              style={{ '--x': `${8 + index * 9}%`, '--y': `${20 + (index % 4) * 16}%` } as React.CSSProperties}
            />
          ))}
        </div>
      </section>

      <section className="metrics-strip">
        <div>
          <DatabaseZap size={20} />
          <strong>{snapshot.teams.length}</strong>
          <span>FBS teams indexed</span>
        </div>
        <div>
          <Swords size={20} />
          <strong>{statsMart.rowCounts.rosterPlayers}</strong>
          <span>roster rows collected</span>
        </div>
        <div>
          <Newspaper size={20} />
          <strong>{statsMart.rowCounts.teamStats}</strong>
          <span>stat rows collected</span>
        </div>
        <div>
          <Activity size={20} />
          <strong>{statsMart.rowCounts.news}</strong>
          <span>news rows collected</span>
        </div>
      </section>

      <section className="workbench">
        <aside className="team-rail">
          <div className="tool-row">
            <label>
              <Filter size={16} />
              <select value={conference} onChange={(event) => setConference(event.target.value)}>
                {conferences.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search team or conference"
            aria-label="Search team or conference"
          />
          <div className="team-list">
            {filteredTeams.slice(0, 80).map((team) => (
              <button
                className={team.id === selectedTeam.id ? 'team-button active' : 'team-button'}
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                type="button"
              >
                <img src={team.logo} alt="" />
                <span>{team.shortDisplayName}</span>
                <small>{team.abbreviation}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="profile-panel">
          <div className="profile-header">
            <img src={selectedTeam.logo} alt="" />
            <div>
              <p className="eyebrow">{selectedTeam.conference}</p>
              <h3>{selectedTeam.displayName}</h3>
              <p>
                Local mart contains {selectedRoster.length} roster rows, {selectedStats.length} stat rows, {selectedNews.length}{' '}
                news rows and {selectedSchedule.length} schedule rows for this team.
              </p>
            </div>
          </div>
          <div className="profile-grid">
            <div>
              <strong>{selectedRoster.length}</strong>
              <span>roster rows</span>
            </div>
            <div>
              <strong>{selectedStats.length}</strong>
              <span>stat rows</span>
            </div>
            <div>
              <strong>{selectedSchedule.length}</strong>
              <span>schedule rows</span>
            </div>
            <div>
              <strong>{selectedNews.length}</strong>
              <span>news rows</span>
            </div>
          </div>
          <div className="signal-grid">
            <div>
              <p className="eyebrow">Trend Pulse</p>
              <strong>{stableScore(`${selectedTeam.id}-trend`, 42, 88)}</strong>
              <span>momentum composite</span>
            </div>
            <div>
              <p className="eyebrow">Availability Drag</p>
              <strong>{stableScore(`${selectedTeam.id}-injury`, 5, 48)}</strong>
              <span>risk watch</span>
            </div>
            <div>
              <p className="eyebrow">Roster Read</p>
              <strong>{selectedTeam.sourceConfidence}</strong>
              <span>verified depth</span>
            </div>
          </div>
          <div className="local-data-grid">
            <div>
              <p className="eyebrow">Roster Composition</p>
              {rosterByGroup.slice(0, 5).map(([group, count]) => (
                <span key={group}>
                  {group}: {count}
                </span>
              ))}
              {!rosterByGroup.length && <span>No roster rows collected yet.</span>}
            </div>
            <div>
              <p className="eyebrow">Collected Stats</p>
              {featuredStats.slice(0, 5).map((stat) => (
                <span key={`${stat.category}-${stat.displayName}`}>
                  {stat.displayName}: {stat.displayValue}
                </span>
              ))}
              {!featuredStats.length && <span>No stat rows collected yet.</span>}
            </div>
            <div>
              <p className="eyebrow">Local News Rows</p>
              {selectedNews.slice(0, 3).map((article) => (
                <span key={article.headline}>{article.headline}</span>
              ))}
              {!selectedNews.length && <span>No news rows collected yet.</span>}
            </div>
          </div>
        </section>

        <section className="analytics-panel">
          <div className="section-title">
            <LineChart size={20} />
            <h3>Signal Shape</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={edgeTrend}>
              <defs>
                <linearGradient id="edge" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2f7d6d" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#2f7d6d" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#d6ddd8" strokeDasharray="3 6" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Area dataKey="edge" stroke="#2f7d6d" fill="url(#edge)" />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      </section>

      <section className="war-room">
        <div className="section-title">
          <BarChart3 size={20} />
          <h3>War Room: Multi-Matchup Board</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Matchup</th>
                <th>Window</th>
                <th>Edge</th>
                <th>Trend</th>
                <th>Availability</th>
                <th>Market Watch</th>
                <th>Angle</th>
              </tr>
            </thead>
            <tbody>
              {warRoomRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="matchup">
                      <img src={row.away.logo} alt="" />
                      <span>{row.away.abbreviation}</span>
                      <small>at</small>
                      <img src={row.home.logo} alt="" />
                      <span>{row.home.abbreviation}</span>
                    </div>
                  </td>
                  <td>{row.date}</td>
                  <td>
                    <meter min="0" max="100" value={row.edge} />
                    {row.edge}
                  </td>
                  <td className={row.trend >= 0 ? 'positive' : 'negative'}>{row.trend > 0 ? `+${row.trend}` : row.trend}</td>
                  <td>{row.injuryRisk > 45 ? 'High verify' : row.injuryRisk > 25 ? 'Monitor' : 'Low drag'}</td>
                  <td>{row.marketWatch}</td>
                  <td>{row.angle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="source-band">
        <div>
          <div className="section-title">
            <ShieldCheck size={20} />
            <h3>Source Redundancy Ledger</h3>
          </div>
          <p>
            The product treats source disagreement as a signal. Official/team data wins identity and roster disputes; licensed
            schedule/stat feeds corroborate; market and news feeds are isolated until cross-checked.
          </p>
        </div>
        <div className="source-list">
          {sources.map((source) => (
            <article key={source.name}>
              <strong>{source.name}</strong>
              <span>{source.role}</span>
              <small>
                {source.reliability} / {source.status}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="microblog-band">
        <div className="section-title">
          <Newspaper size={20} />
          <h3>Trusted Microblog Watchlist</h3>
        </div>
        <p>
          Broad national and publication feeds are not allowed to create team news by themselves. The ingestion layer must match
          each message to team aliases, conference boundaries, or linked-article text before it becomes a team event.
        </p>
        <div className="account-grid">
          {trustedMicroblogSources.map((source) => (
            <a href={source.url} key={source.id} target="_blank">
              <span>{source.handle}</span>
              <strong>{source.displayName}</strong>
              <small>
                {source.platform.toUpperCase()} / {source.trustTier} / {source.routingPolicy.replaceAll('_', ' ')}
              </small>
            </a>
          ))}
        </div>
      </section>

      <section className="coverage-band">
        <div className="section-title">
          <Users size={20} />
          <h3>Conference Coverage</h3>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={conferenceCoverage}>
            <CartesianGrid stroke="#d6ddd8" strokeDasharray="3 6" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#234e52" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="notice">
          <AlertTriangle size={16} />
          Injury and breaking-news signals are intentionally marked as verification-dependent until at least two reliable sources
          agree or an official school report resolves the note.
        </p>
      </section>
    </main>
  )
}

export default App
