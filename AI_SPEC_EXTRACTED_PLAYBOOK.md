# AI Spec Extraction Playbook

This document consolidates the full Claude chat log into concrete, reusable project requirements and implementation rules.

## 1) Canonical Scoring Rules

### Season production construction
- Build one rushing season score from rushing stats using their existing per-stat weights.
- Build one receiving season score from receiving stats using their existing per-stat weights.
- Season raw production = `0.65 * rush + 0.35 * recv`.

### SOS adjustment
- Season adjusted score = `0.95 * season_raw + 0.05 * sos_score`.
- SOS labels/scores repeatedly referenced in the log:
	- Elite = 95
	- Strong = 80
	- Average = 60
	- Weak = 40
	- Very Weak = 20
	- FCS = 10

### Multi-season weighting
- Year weights:
	- YR1 = 25
	- YR2 = 28
	- YR3 = 30
	- YR4 = 28
	- YR5 = 25
- Missing seasons must be dropped and remaining year weights renormalized.

### Prospect composite
- Overall prospect score weights:
	- Production = 75%
	- Athletic = 10%
	- PFF Board = 15%

## 2) Data Population Requirements

### Seasons object contract
Each season object is expected to include:
- `n` (season number)
- `yr` (calendar year)
- `sc` (school)
- `conf` (conference)
- `sos_label`
- `sos_rank`
- `sos` / `sos_mag` equivalent magnitude
- `c` (combined season score)
- `r` (rushing score)
- `v` (receiving score)
- `rush_score`
- `recv_score`
- `adj_score`

### Athletic source precedence (from the log)
- Preferred source for athletic testing/ranks: `College RB Data Set - Athl Agg (1).csv`.
- Fallback discoveries discussed earlier in the log (less preferred):
	- `Fantasy_Finishes.csv` raw combine values (incomplete coverage)
	- `Prosp_Score.csv` multipliers/percentile-like fields (fuller coverage, not raw timings)

### YR5 integration
- YR5 should be incorporated when present.
- The log repeatedly references ~29 YR5 players being added.
- Any chart/table that assumes a fixed max year should derive from available season keys unless a view intentionally forces YR1-YR5 display.

## 3) UI/UX Requirements Captured

### Seasons tab
- Show rushing and receiving season scores above each year label.
- Show rank for both (rush/recv) against same-season peers.
- Rank denominator must be dynamic from actual season population (not fixed constants).
- Include SOS details and context text.

### Rank color scale (must match athletic palette)
- Top 10%: gold
- Top 20%: blue
- Top 40%: green
- Top 60%: yellow
- Top 80%: orange
- Bottom 20%: red

### Overview tab
- Include trajectory tile explanations written for non-experts.
- Peak tile should include the season number (e.g., YR2).
- Include a production-vs-all-prospects style graph (current player emphasized, others faint).

### Seasons trajectory graph
- Includes combined line + rushing dashed + receiving dashed.
- Receiving series visibility must be robust even when close to combined line.

### Comps tab
- Must not depend on precomputed `data.comps` only.
- Compute comps live if needed.
- Include top-3 overall comps plus rush/recv/athletic sections.

### Mobile QoL expectations repeatedly requested
- Player card modal usable full-screen on mobile.
- Scrollable tab bar.
- Sticky stat column in wide season table.
- Responsive athletic grid.

## 4) Environment/Packaging Lessons from Log

- Claude artifact viewer and CRA/Vite runtime requirements diverged repeatedly.
- For artifact-only rendering, self-contained inline data was required.
- For real project runtime, module imports/data files are preferred and cleaner.
- Avoid introducing environment-specific assumptions without confirming target runtime first.

## 5) Known Pitfalls Captured

- Data key mismatch caused missing athletics (`forty` vs `40T`, `ten_split` vs `10split`, `three_cone` vs `3cone`).
- `Prosp_Score.csv` may include concatenated sections and misleading header rows.
- Rescaling logic can collapse score spread if source percentiles are treated incorrectly.
- YR5 expectations changed over time; ensure charts/tables use intended behavior per tab.

## 6) Practical Validation Checklist

After any scoring/data refresh, verify:
- Year-denominator counts are dynamic by season key.
- Ashton Jeanty-style spot checks match known expected values where provided.
- Rush/recv rank color buckets follow percentile thresholds above.
- Overview and Seasons tabs show different chart intents as specified.
- Comps render for players without precomputed comp objects.
- Athletic panel has broad coverage from preferred source and valid rank totals.

## 7) Current Project Alignment Snapshot

From current workspace checks (post-log extraction):
- Formula signals in logic currently include 65/35, 95/5, and year weights 25/28/30/28/25.
- Season rank colors in season headers align to the 10/20/40/60/80 bucket model.
- Overview currently includes summary + production-vs-all graph; Seasons uses trajectory graph.
- Comps panel is wired and rendered from live data path in player card.

Use this playbook as the canonical intent layer when implementing or reviewing future changes.

## 8) Added Requirements From Newly Appended Log (Line 864+)

### Data hygiene and preprocessing rules
- Remove duplicate player rows before modeling (explicitly called out for Mike Washington across yearly files).
- Exclude non-player summary rows beyond Min/Max/Median (log also calls out `Average` and `4th Quartile` leakage).
- Treat class mapping in the PFF board source as authoritative only after manual year-boundary verification.

### Modeling intent clarifications
- Target remains Prospect Score for NFL success/productivity, not draft-position prediction.
- Trajectory should reward early dominance and early declare profiles without penalizing fewer seasons.
- Conference/SOS context should be represented per season and should reward stronger schedules over weaker ones.
- Breakaway yardage percentage handling was explicitly called out as inverse in one iteration; verify directionality each time this metric is displayed.

### Weighting-history caution
- The appended log includes multiple experimental weighting variants (for example 45/30/25 and 60/15/25) during exploration.
- Treat these as experiment states unless the repo explicitly switches to them.
- In this workspace, current runtime logic/header still references the established 75/10/15 blend.

## 9) UI/Product Requirements Added In Appended Log

### Archetypes
- Provide a dedicated Archetypes experience with definitions and filter actions.
- Each player should have exactly one rushing archetype and one receiving archetype (mutually exclusive assignment).
- Archetype filtering should stack with draft class and tier filters.

### Filtering and discoverability
- Prospect filtering moved toward dropdown-driven controls for draft class, tier, and archetypes.
- Draft class filtering must type-match consistently (string-vs-number mismatch caused prior no-results failures).

### Seasons and SOS display
- Seasons views should expose per-season SOS context (label/rank) tied to the player-season row.
- FCS is explicitly required as the weakest SOS category.
- Single-season players should receive explanatory messaging in card contexts.

### Athletic panel behavior
- Appended requests iterated between showing percentile and showing composite-rank displays.
- Current intent at end-state emphasizes per-metric rank from composite athletic columns in Athl Agg-derived data, with clear tie handling.

### Validation and NFL outcomes
- Validation table should report both Top-12 and Top-24 rate columns by tier.
- Denominator discussion evolved toward including the full non-projection pool (not only players with existing finish rows).
- NFL tab should avoid treating college FF stat blocks as NFL per-game stats.

## 10) Custom Player Workflow Requirements

- Add-player flow should support full identity/season/athletic/NFL-entry workflow.
- Draft class selection uses fixed year options (2017-2026); 2026 projection behavior hides draft-capital inputs.
- Archetypes should be auto-assigned from entered season data rather than manually selected.
- Custom entries should support export/import persistence (session-only state is insufficient).

## 11) Runtime/Packaging Lessons Added

- JSX runtime assumptions caused repeated failures (`React` import/runtime mismatch and transform-specific errors).
- Very large monolithic artifacts caused parse/transpile instability; chunking or alternate packaging was required.
- A plain HTML runtime path (CDN React/Babel) was used as a compatibility fallback when artifact JSX transpilation failed.
- For project runtime, keep module-based React app structure as primary and treat artifact-only constraints as separate concerns.
