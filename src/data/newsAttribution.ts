import type { TrustedMicroblogSource } from './microblogSources'

export type AttributableTeam = {
  id: string
  abbreviation: string
  displayName: string
  shortDisplayName: string
  location: string
  nickname: string
  conference: string
}

export type RawMicroblogPost = {
  id: string
  sourceId: string
  text: string
  url: string
  postedAt: string
  linkedTitle?: string
  linkedText?: string
}

export type TeamNewsEvent = {
  id: string
  sourceId: string
  teamId: string
  teamName: string
  postUrl: string
  postedAt: string
  evidence: string[]
  confidence: number
  reviewStatus: 'accepted' | 'needs_review'
  reason: string
}

export type AttributionResult = {
  accepted: TeamNewsEvent[]
  rejected: Array<{
    postId: string
    sourceId: string
    reason: string
  }>
}

const genericNicknames = new Set([
  'Aggies',
  'Bears',
  'Bobcats',
  'Broncos',
  'Bulldogs',
  'Cardinals',
  'Cougars',
  'Eagles',
  'Falcons',
  'Hawks',
  'Huskies',
  'Knights',
  'Lions',
  'Owls',
  'Panthers',
  'Raiders',
  'Rams',
  'Spartans',
  'Tigers',
  'Trojans',
  'Warriors',
  'Wildcats',
  'Wolfpack',
])

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9#@]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function aliasesForTeam(team: AttributableTeam) {
  const candidates = [
    team.displayName,
    team.shortDisplayName,
    team.location,
    team.abbreviation.length > 2 ? team.abbreviation : '',
    `#${team.abbreviation}`,
    team.nickname && !genericNicknames.has(team.nickname) ? team.nickname : '',
  ]

  return Array.from(new Set(candidates.map(normalize).filter((alias) => alias.length >= 3)))
}

function hasAlias(text: string, alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i').test(text)
}

function sourceAllowedTeams(source: TrustedMicroblogSource, teams: AttributableTeam[]) {
  if (source.scope !== 'conference') {
    return teams
  }
  return teams.filter((team) => source.coverage.includes(team.conference))
}

function evidenceText(post: RawMicroblogPost) {
  return normalize([post.text, post.linkedTitle ?? '', post.linkedText ?? ''].join(' '))
}

export function attributeMicroblogPost(
  post: RawMicroblogPost,
  source: TrustedMicroblogSource,
  teams: AttributableTeam[],
): AttributionResult {
  const text = evidenceText(post)
  const candidates = sourceAllowedTeams(source, teams)
    .map((team) => ({
      team,
      evidence: aliasesForTeam(team).filter((alias) => hasAlias(text, alias)),
    }))
    .filter((match) => match.evidence.length)

  if (!candidates.length) {
    return {
      accepted: [],
      rejected: [
        {
          postId: post.id,
          sourceId: source.id,
          reason: 'No FBS team alias matched the post text or linked article context.',
        },
      ],
    }
  }

  const accepted = candidates.map(({ team, evidence }) => {
    const confidencePenalty = candidates.length > 2 ? 12 : candidates.length === 2 ? 5 : 0
    const needsReview =
      source.routingPolicy !== 'direct_team' && (evidence.every((item) => item.startsWith('#')) || candidates.length > 4)

    return {
      id: `${post.id}-${team.id}`,
      sourceId: source.id,
      teamId: team.id,
      teamName: team.displayName,
      postUrl: post.url,
      postedAt: post.postedAt,
      evidence,
      confidence: Math.max(40, source.confidence - confidencePenalty),
      reviewStatus: needsReview ? 'needs_review' : 'accepted',
      reason:
        source.scope === 'conference'
          ? 'Post matched a team inside the source conference coverage boundary.'
          : 'Post matched explicit team evidence from text or linked article context.',
    } satisfies TeamNewsEvent
  })

  return { accepted, rejected: [] }
}

export function attributeMicroblogPosts(
  posts: RawMicroblogPost[],
  sources: TrustedMicroblogSource[],
  teams: AttributableTeam[],
): AttributionResult {
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const accepted: TeamNewsEvent[] = []
  const rejected: AttributionResult['rejected'] = []

  for (const post of posts) {
    const source = sourceById.get(post.sourceId)
    if (!source) {
      rejected.push({
        postId: post.id,
        sourceId: post.sourceId,
        reason: 'Post source is not in the trusted microblog registry.',
      })
      continue
    }

    const result = attributeMicroblogPost(post, source, teams)
    accepted.push(...result.accepted)
    rejected.push(...result.rejected)
  }

  return { accepted, rejected }
}
