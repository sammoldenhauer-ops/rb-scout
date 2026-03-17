import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseNumeric(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function buildSeasonsFromYears(draftClass, yrSeries, rushSeries, recvSeries) {
  if (!yrSeries.length) return [];

  const lastYear = Number.isFinite(draftClass) ? draftClass - 1 : null;
  const firstYear = Number.isFinite(lastYear) ? lastYear - yrSeries.length + 1 : null;

  return yrSeries.map((total, idx) => {
    const rush = rushSeries[idx] ?? null;
    const recv = recvSeries[idx] ?? null;
    const totalScore = Number.isFinite(total) ? Math.round(clamp(total * 100, 0, 100)) : null;
    const rushScore = Number.isFinite(rush) ? Math.round(clamp(rush * 100, 0, 100)) : null;
    const recvScore = Number.isFinite(recv) ? Math.round(clamp(recv * 100, 0, 100)) : null;

    return {
      n: idx + 1,
      yr: Number.isFinite(firstYear) ? String(firstYear + idx) : null,
      sc: null,
      conf: null,
      gp: null,
      y: null,
      ypc: null,
      mso: null,
      tgt: null,
      ymrr: null,
      yptpa: null,
      pff: null,
      r: rushScore,
      c: recvScore,
      t: totalScore,
      rush_score: rushScore,
      recv_score: recvScore,
      total_score: totalScore
    };
  });
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function scoreToTier(score) {
  if (score >= 90) return 'Elite';
  if (score >= 80) return 'Starter';
  if (score >= 65) return 'Rotational';
  return 'Prospect';
}

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums) {
  if (!nums.length) return 0;
  const m = mean(nums);
  const v = mean(nums.map(n => (n - m) ** 2));
  return Math.sqrt(v);
}

// Linear slope over equally spaced x = 0..n-1.
function slope(nums) {
  const n = nums.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(nums);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - xMean;
    num += dx * (nums[i] - yMean);
    den += dx * dx;
  }
  return den ? num / den : 0;
}

const prospPath = path.join(__dirname, '..', 'data', 'College RB Data Set - Prosp Score (2).csv');
const prospLines = fs.readFileSync(prospPath, 'utf8').split(/\r?\n/);
const mainHeader = 'Round,Pick,Player,Score,Prod,Athl,BB,RushYR1,RecYR1,RushYR2,RecYR2,RushYR3,RecYR3,RushYR4,RecYR4,RushYR5,RecYR5,YR1,YR2,YR3,YR4,YR5';
const headerIdx = prospLines.findIndex(line => line.startsWith(mainHeader));
if (headerIdx < 0) {
  throw new Error('Could not locate canonical score section in prospect CSV.');
}

const fantasyPath = path.join(__dirname, '..', 'data', 'College RB Data Set - Fantasy Finishes (1).csv');
const fantasyLines = fs.readFileSync(fantasyPath, 'utf8').split(/\r?\n/).filter(line => line.trim());
const fantasyHeaderIndex = fantasyLines.findIndex(line => line.startsWith('Year,Rank,Player,'));
const fantasyHeaders = (fantasyLines[fantasyHeaderIndex] || '').split(',').map(s => s.trim());
const fantasyRows = fantasyLines.slice(fantasyHeaderIndex + 1).map(line => line.split(','));

const fantasyByName = new Map();
for (const row of fantasyRows) {
  const rec = {};
  fantasyHeaders.forEach((h, i) => {
    rec[h] = (row[i] || '').trim();
  });
  const name = (rec.Player || '').trim();
  if (!name) continue;
  const prev = fantasyByName.get(name);
  if (!prev) {
    fantasyByName.set(name, rec);
    continue;
  }
  const prevExp = parseNumeric(prev.Exp) || 0;
  const curExp = parseNumeric(rec.Exp) || 0;
  if (curExp > prevExp) fantasyByName.set(name, rec);
}

const canonicalRows = [];
const seen = new Set();
for (let i = headerIdx + 1; i < prospLines.length; i += 1) {
  const line = prospLines[i];
  if (!line || !line.trim()) continue;
  const c = line.split(',').map(s => s.trim());
  const name = c[2] || '';
  const roundVal = c[0] || '';
  const scoreVal = parseNumeric(c[3]);
  if (!name || !roundVal || scoreVal == null) continue;
  if (seen.has(name)) continue;
  seen.add(name);
  canonicalRows.push(c);
}

if (canonicalRows.length !== 194 && canonicalRows.length !== 195) {
  throw new Error(`Expected 194-195 canonical rows, found ${canonicalRows.length}.`);
}

const athlRaw = canonicalRows.map(r => parseNumeric(r[5]) || 0);
const athlMin = Math.min(...athlRaw);
const athlMax = Math.max(...athlRaw);

const players = {};
for (const c of canonicalRows) {
  const name = c[2];
  const score = parseNumeric(c[3]) || 0;
  const prod = parseNumeric(c[4]) || 0;
  const athl = parseNumeric(c[5]) || 0;
  const bb = parseNumeric(c[6]) || 0;
  const rushSeries = [parseNumeric(c[7]), parseNumeric(c[9]), parseNumeric(c[11]), parseNumeric(c[13]), parseNumeric(c[15])].filter(v => v != null);
  const recvSeries = [parseNumeric(c[8]), parseNumeric(c[10]), parseNumeric(c[12]), parseNumeric(c[14]), parseNumeric(c[16])].filter(v => v != null);
  const yrSeries = [parseNumeric(c[17]), parseNumeric(c[18]), parseNumeric(c[19]), parseNumeric(c[20]), parseNumeric(c[21])].filter(v => v != null);

  const rushTrajectory = Math.round(clamp(mean(rushSeries) * 100, 0, 100));
  const recvTrajectory = Math.round(clamp(mean(recvSeries) * 100, 0, 100));

  // Improvement is the slope of the year-series (centered at 50).
  const improvement = Math.round(clamp(50 + slope(yrSeries) * 180, 0, 100));
  // Consistency is inverse variability of the same year-series.
  const consistency = Math.round(clamp(100 - stdDev(yrSeries) * 220, 0, 100));

  // Athletic sub-score is min/max normalized from the canonical athletic component.
  const athlScore = Math.round(clamp(((athl - athlMin) / ((athlMax - athlMin) || 1)) * 100, 0, 100));

  const fantasy = fantasyByName.get(name);
  const draftClass = parseNumeric(fantasy?.['Draft Year']) || 2025;
  const forty = parseNumeric(fantasy?.['40 T']) || 0;
  const tenSplit = parseNumeric(fantasy?.['10 Splt']) || null;
  const vert = parseNumeric(fantasy?.Vert) || 0;
  const broad = parseNumeric(fantasy?.Broad) || null;
  const threeCone = parseNumeric(fantasy?.['3 Cone']) || null;
  const shuttle = parseNumeric(fantasy?.Shuttle) || null;
  const weight = parseNumeric(fantasy?.Weight) || null;
  const height = parseNumeric(fantasy?.Height) || null;
  const arm = parseNumeric(fantasy?.Arm) || null;
  const hand = parseNumeric(fantasy?.Hand) || null;
  const wing = parseNumeric(fantasy?.Wing) || null;
  const exp = parseNumeric(fantasy?.Exp) || 0;
  const seasons = buildSeasonsFromYears(draftClass, yrSeries, rushSeries, recvSeries);

  players[name] = {
    rank: 0,
    prospect_score: Math.round(score * 1000) / 10,
    tier: scoreToTier(score * 100),
    is_projection: !fantasy,
    draft_class: draftClass,
    draft_round: fantasy?.Round || c[0] || '',
    draft_pick: fantasy?.Pick || c[1] || '',
    rush_arch: '',
    recv_arch: '',
    breakout_tag: false,
    late_decline: false,
    num_seasons: yrSeries.length,
    rush_trajectory: rushTrajectory,
    recv_trajectory: recvTrajectory,
    traj_improvement: improvement,
    traj_consistency: consistency,
    athl_score: athlScore,
    prod_score: Math.round(prod * 100),
    bb_score: Math.round(bb * 100),
    proj_t12: 0,
    proj_t24: 0,
    proj_t12_rank: 0,
    proj_t24_rank: 0,
    bio: '',
    seasons,
    traj_peak: seasons.length ? Math.max(...seasons.map(s => s.total_score || 0)) : null,
    traj_final: seasons.length ? seasons[seasons.length - 1].total_score : null,
    athletic: {
      forty: { val: forty || null, rank: null, total: null },
      ten_split: { val: tenSplit, rank: null, total: null },
      vert: { val: vert || null, rank: null, total: null },
      broad: { val: broad, rank: null, total: null },
      three_cone: { val: threeCone, rank: null, total: null },
      shuttle: { val: shuttle, rank: null, total: null },
      weight: { val: weight, rank: null, total: null },
      height: { val: height, rank: null, total: null },
      arm: { val: arm, rank: null, total: null },
      hand: { val: hand, rank: null, total: null },
      wing: { val: wing, rank: null, total: null },
      '40T': { val: forty || null, rank: null, total: null }
    },
    recruiting: fantasy
      ? {
          school: fantasy.School || null,
          enrolled: fantasy.Years || null,
          national_rank: null,
          position_rank: null,
          state_rank: null,
          scout_strengths: null,
          scout_weaknesses: null
        }
      : null,
    nfl: fantasy
      ? {
          best_rank: 0,
          avg_rank: 0,
          top12: 0,
          top24: 0,
          seasons: exp
        }
      : null
  };
}

const athleticRankConfig = [
  ['forty', true],
  ['ten_split', true],
  ['vert', false],
  ['broad', false],
  ['three_cone', true],
  ['shuttle', true],
  ['weight', false],
  ['height', false],
  ['arm', false],
  ['hand', false],
  ['wing', false]
];

for (const [metric, lowerIsBetter] of athleticRankConfig) {
  const ranked = Object.values(players)
    .map(p => ({ p, val: p.athletic?.[metric]?.val }))
    .filter(x => Number.isFinite(x.val));

  if (!ranked.length) continue;
  ranked.sort((a, b) => (lowerIsBetter ? a.val - b.val : b.val - a.val));

  const total = ranked.length;
  ranked.forEach((entry, i) => {
    entry.p.athletic[metric].rank = i + 1;
    entry.p.athletic[metric].total = total;
  });
}

const sortedNames = Object.keys(players).sort((a, b) => players[b].prospect_score - players[a].prospect_score);
sortedNames.forEach((name, idx) => {
  players[name].rank = idx + 1;
});

const output = `export const ALL_PLAYERS_BASE = ${JSON.stringify(players, null, 2)};\n\n`
  + `export const ALL_PLAYERS = ALL_PLAYERS_BASE;\n`
  + `export const ARCHETYPE_DEFS = {}; // Placeholder\n\n`
  + `export const TIER_STYLE = {\n`
  + `  "Elite": { accent: "#f0c040" },\n`
  + `  "Starter": { accent: "#f0c040" },\n`
  + `  "Rotational": { accent: "#4da6ff" },\n`
  + `  "Prospect": { accent: "#5dbf6a" },\n`
  + `  "Fringe": { accent: "#888" }\n` 
  + `};\n\n`
  + `export const RUSH_ARCH_COLORS = {\n`
  + `  "Versatile": "#f0c040",\n`
  + `  "Power": "#4da6ff",\n`
  + `  "Speed": "#5dbf6a",\n`
  + `  "Elusive": "#ff6b6b"\n`
  + `};\n\n`
  + `export const RECV_ARCH_COLORS = {\n`
  + `  "Receiving Weapon": "#f0c040",\n`
  + `  "Checkdown": "#4da6ff",\n`
  + `  "Slot": "#5dbf6a",\n`
  + `  "Deep Threat": "#ff6b6b"\n`
  + `};\n\n`
  + `export const SOS_COLORS = {\n`
  + `  "Elite": "#f0c040",\n`
  + `  "Strong": "#4da6ff",\n`
  + `  "Average": "#888",\n`
  + `  "Weak": "#ff6b6b"\n`
  + `};\n\n`
  + `export const SEASON_STATS_BASE = {}; // Placeholder\n`
  + `export const IDEALS = {}; // Placeholder\n`
  + `export const STDEVS = {}; // Placeholder\n`
  + `export const CONF_LIST = []; // Placeholder\n`
  + `export const SOS_LOOKUP = {}; // Placeholder\n`
  + `export const EMPTY_FORM = {}; // Placeholder\n`;

const outputPath = path.join(__dirname, '..', 'data', 'playersBase.js');
fs.writeFileSync(outputPath, output, 'utf8');

console.log(`Imported ${Object.keys(players).length} players from canonical score section.`);