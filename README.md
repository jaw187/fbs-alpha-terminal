# LineVault Alpha

Premium FBS intelligence terminal for people trying to forecast upcoming college football games.

LineVault Alpha is built to compile relevant information about every Division I Football Bowl Subdivision program: schedules, rosters, stats, injuries, news, source confidence and matchup context. The first screen is the working scouting surface, not a landing page.

## Features

- FBS team universe sourced from ESPN's public 2026 FBS group.
- Searchable team rail with conference filtering.
- Team profiles composed from local roster, stat, schedule and news rows.
- Local team-stat marts composed from public structured data.
- Source-confidence scoring for each team profile.
- War-room view showing many matchups at once.
- Matchup signal columns for edge, trend, availability risk, roster clarity and market-watch prompts.
- Source redundancy ledger that separates official, licensed and corroborating sources.
- Trusted microblog watchlist for X, Bluesky and publication feeds.
- Team attribution rules that reject broad-feed posts unless they resolve to a particular team.
- Static JSON snapshot so the site builds and runs without private API keys.

## Source Policy

Reliable sources only:

- ESPN public college football APIs: team identity, scoreboard context, schedule/roster/stat links and news headlines.
- NCAA statistics: official team and player statistical checks.
- School athletic departments: primary roster, depth, injury, press conference and participation information.
- CollegeFootballData: advanced game, drive and play-by-play data when `CFBD_API_KEY` is available.
- Licensed market feeds such as The Odds API when `ODDS_API_KEY` is available.

Injury and breaking-news information should stay in review until it is either official from the school or corroborated by at least two reliable sources. Rumor-only data should not drive an edge signal.

## Data Refresh

```bash
npm run data:refresh
```

This writes `public/data/fbs-snapshot.json`. The current adapter resolves:

- FBS group membership
- Conference membership
- Team display metadata
- Team logos
- ESPN source URL provenance for schedule, roster, stats and clubhouse/news rows

Optional future adapters are intentionally separated so paid keys and source-specific terms can be handled cleanly.

## Stats Collection

```bash
npm run stats:collect
```

This writes `public/data/team-stat-marts.json` and moves the app away from outbound source links as the primary data surface. Source URLs are still retained per row for provenance, but the UI reads local normalized rows.

The current public collection pass gathers:

- Roster players by team and position group
- Team stat rows by category
- Team schedule rows when the public endpoint returns them for the selected season
- Injury rows when the public endpoint returns structured injury data
- ESPN news rows with team attribution metadata
- Per-team source status for debugging endpoint gaps

Current caveat: because 2026 is still preseason, ESPN returns empty schedule rows for many teams and no useful structured injury rows on the probed endpoint. The mart schema is ready for those rows as soon as sources expose them.

## Microblog News Ingestion

Trusted accounts live in `src/data/microblogSources.ts`. The ingestion path uses that registry plus `src/data/newsAttribution.ts` so broad accounts are filtered into team-specific events before the site can treat them as news.

```bash
npm run news:ingest
```

By default the command reads `data/raw/microblog-posts.json` and writes `public/data/team-news-events.json`. Set `MICROBLOG_POSTS_FILE` to point at a connector export from X, Bluesky, RSS, Firehose, or any vendor-normalized feed.

Input shape:

```json
[
  {
    "id": "source-post-id",
    "sourceId": "x-pete-thamel",
    "text": "Post text",
    "url": "https://x.com/PeteThamel/status/...",
    "postedAt": "2026-08-08T17:00:00.000Z",
    "linkedTitle": "Optional article headline",
    "linkedText": "Optional fetched article excerpt"
  }
]
```

Routing policy:

- National reporters and publication feeds require explicit team aliases in the post or linked article.
- Conference feeds are first constrained to teams in that conference, then alias matched.
- Generic nicknames like Tigers, Bulldogs and Wildcats do not count unless paired with a school/location alias.
- Multi-team posts create one event per matched team with a confidence penalty.
- Unmatched posts go to the review queue instead of team news.

Initial trusted microblog sources include:

- X: `@PeteThamel`, `@Brett_McMurphy`, `@RossDellenger`, `@BruceFeldmanCFB`, `@NicoleAuerbach`, `@ESPNRittenberg`, `@ChrisVannini`, `@slmandel`, `@max_olson`, `@Andy_Staples`, `@ralphDrussoATH`, `@AP_Top25`
- X official/conference: `@ACCFootball`, `@B1Gfootball`, `@Big12Conference`, `@SEC`, `@American_Conf`, `@ConferenceUSA`, `@MACSports`, `@MountainWest`, `@SunBelt`, `@pac12`
- Bluesky: `@splitzoneduo.com`, `@theathletic.com`

## Development

```bash
npm install
npm run data:refresh
npm run stats:collect
npm run news:ingest
npm run dev
```

## Build

```bash
npm run build
```

## Roadmap

- Add persisted schedule snapshots and rest/travel calculations from ESPN scoreboard data.
- Add roster-depth ingestion from school pages with manual review flags.
- Add NCAA and CFBD stat normalizers for offensive, defensive and special teams trend windows.
- Add injury/news event history with source corroboration and stale-market detection.
- Add official team-owned X/Bluesky handles for all FBS programs as they are verified.
- Add market history, open/current movement and number-shopping views.
- Add matchup pages with team-vs-team factor deltas and explainable edge cards.
