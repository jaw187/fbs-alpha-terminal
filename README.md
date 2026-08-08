# LineVault Alpha

Premium FBS intelligence terminal for people trying to forecast upcoming college football games.

LineVault Alpha is built to compile relevant information about every Division I Football Bowl Subdivision program: schedules, rosters, stats, injuries, news, source confidence and matchup context. The first screen is the working scouting surface, not a landing page.

## Features

- FBS team universe sourced from ESPN's public 2026 FBS group.
- Searchable team rail with conference filtering.
- Team profile links for schedule, roster, stats and news/source pages.
- Source-confidence scoring for each team profile.
- War-room view showing many matchups at once.
- Matchup signal columns for edge, trend, availability risk, roster clarity and market-watch prompts.
- Source redundancy ledger that separates official, licensed and corroborating sources.
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
- ESPN source links for schedule, roster, stats and clubhouse/news pages

Optional future adapters are intentionally separated so paid keys and source-specific terms can be handled cleanly.

## Development

```bash
npm install
npm run data:refresh
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
- Add market history, open/current movement and number-shopping views.
- Add matchup pages with team-vs-team factor deltas and explainable edge cards.
