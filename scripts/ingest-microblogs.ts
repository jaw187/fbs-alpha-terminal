import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { attributeMicroblogPosts, type RawMicroblogPost } from '../src/data/newsAttribution'
import { trustedMicroblogSources } from '../src/data/microblogSources'

type SnapshotTeam = {
  id: string
  abbreviation: string
  displayName: string
  shortDisplayName: string
  location: string
  nickname: string
  conference: string
}

type Snapshot = {
  generatedAt: string
  season: number
  teams: SnapshotTeam[]
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback
    }
    throw error
  }
}

async function main() {
  const snapshotPath = path.resolve('public/data/fbs-snapshot.json')
  const rawPostsPath = path.resolve(process.env.MICROBLOG_POSTS_FILE ?? 'data/raw/microblog-posts.json')
  const outputPath = path.resolve('public/data/team-news-events.json')

  const snapshot = await readJson<Snapshot>(snapshotPath, { generatedAt: '', season: 0, teams: [] })
  const posts = await readJson<RawMicroblogPost[]>(rawPostsPath, [])
  const result = attributeMicroblogPosts(posts, trustedMicroblogSources, snapshot.teams)

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        season: snapshot.season,
        sourceCount: trustedMicroblogSources.length,
        rawPostCount: posts.length,
        acceptedCount: result.accepted.length,
        rejectedCount: result.rejected.length,
        routingRules: {
          broadFeeds: 'National/publication posts must match explicit team aliases in text or linked article context.',
          conferenceFeeds: 'Conference posts are constrained to member teams before alias matching.',
          teamFeeds: 'Official team feeds may route directly once team-owned handles are added.',
          unresolved: 'Posts with no team match are rejected from team news and kept for review.',
        },
        sources: trustedMicroblogSources,
        events: result.accepted,
        reviewQueue: result.rejected,
      },
      null,
      2,
    )}\n`,
  )

  console.log(
    `Processed ${posts.length} posts from ${trustedMicroblogSources.length} trusted sources: ${result.accepted.length} team events, ${result.rejected.length} review items`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
