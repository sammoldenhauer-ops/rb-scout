import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ALL_PLAYERS_BASE } from '../data/playersBase.js';
import { SEASON_META_BASE } from '../data/seasonMetaBase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YEAR_WEIGHTS = { 1: 25, 2: 28, 3: 30, 4: 28, 5: 25 };
const SOS_SCORE_MAP = {
  Elite: 95,
  Strong: 80,
  Average: 60,
  Weak: 40,
  'Very Weak': 20,
  FCS: 10,
  'N/A': 60
};

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function scoreToTier(score) {
  if (score >= 90) return 'Elite';
  if (score >= 80) return 'Starter';
  if (score >= 70) return 'Rotational';
  if (score >= 60) return 'Developmental';
  return 'Fringe';
}

function weightedAverage(items) {
  const valid = items.filter(x => Number.isFinite(x.value) && Number.isFinite(x.weight) && x.weight > 0);
  if (!valid.length) return null;
  const wsum = valid.reduce((a, b) => a + b.weight, 0);
  if (!wsum) return null;
  const ssum = valid.reduce((a, b) => a + b.value * b.weight, 0);
  return ssum / wsum;
}

function stdDev(nums) {
  if (nums.length <= 1) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function slope(nums) {
  const n = nums.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = nums.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - xMean;
    num += dx * (nums[i] - yMean);
    den += dx * dx;
  }
  return den ? num / den : 0;
}

function normalizeSeason(s) {
  const n = Number(s?.n);
  if (!Number.isFinite(n)) return null;

  const rush = Number.isFinite(Number(s.rush_score)) ? Number(s.rush_score)
    : Number.isFinite(Number(s.r)) ? Number(s.r)
    : null;
  const recv = Number.isFinite(Number(s.recv_score)) ? Number(s.recv_score)
    : Number.isFinite(Number(s.v)) ? Number(s.v)
    : null;

  const raw = (Number.isFinite(rush) || Number.isFinite(recv))
    ? 0.65 * (Number.isFinite(rush) ? rush : 0) + 0.35 * (Number.isFinite(recv) ? recv : 0)
    : null;

  const sosLabel = s.sos_label || 'Average';
  const sosScore = SOS_SCORE_MAP[sosLabel] ?? 60;

  const adj = Number.isFinite(Number(s.adj_score))
    ? Number(s.adj_score)
    : Number.isFinite(raw)
      ? (0.95 * raw + 0.05 * sosScore)
      : (Number.isFinite(Number(s.c)) ? Number(s.c) : null);

  return {
    n,
    yr: s.yr ?? null,
    sc: s.sc ?? s.school ?? null,
    conf: s.conf ?? null,
    school: s.school ?? s.sc ?? null,
    sos_label: sosLabel,
    sos_rank: Number.isFinite(Number(s.sos_rank)) ? Number(s.sos_rank) : null,
    sos_mag: Number.isFinite(Number(s.sos_mag)) ? Number(s.sos_mag) : null,
    c: Number.isFinite(adj) ? round1(adj) : null,
    r: Number.isFinite(rush) ? round1(rush) : null,
    v: Number.isFinite(recv) ? round1(recv) : null,
    rush_score: Number.isFinite(rush) ? round1(rush) : null,
    recv_score: Number.isFinite(recv) ? round1(recv) : null,
    adj_score: Number.isFinite(adj) ? round1(adj) : null
  };
}

function uniqueBySeasonN(seasons) {
  const map = new Map();
  for (const s of seasons) {
    if (!s || !Number.isFinite(s.n)) continue;
    map.set(s.n, s);
  }
  return [...map.values()].sort((a, b) => a.n - b.n);
}

const updated = {};

for (const [name, player] of Object.entries(ALL_PLAYERS_BASE)) {
  const canonicalRaw = SEASON_META_BASE[name] || [];
  const seasons = uniqueBySeasonN(canonicalRaw.map(normalizeSeason).filter(Boolean));

  const weightedAdj = seasons.map(s => ({ value: s.adj_score, weight: YEAR_WEIGHTS[s.n] ?? 25 }));
  const weightedRush = seasons.map(s => ({ value: s.rush_score, weight: YEAR_WEIGHTS[s.n] ?? 25 }));
  const weightedRecv = seasons.map(s => ({ value: s.recv_score, weight: YEAR_WEIGHTS[s.n] ?? 25 }));

  const prod = weightedAverage(weightedAdj);
  const rushTraj = weightedAverage(weightedRush);
  const recvTraj = weightedAverage(weightedRecv);

  const adjSeries = seasons.map(s => s.adj_score).filter(v => Number.isFinite(v));
  const peak = adjSeries.length ? Math.max(...adjSeries) : null;
  const final = seasons.length ? seasons[seasons.length - 1].adj_score : null;
  const improv = adjSeries.length
    ? clamp(50 + slope(adjSeries) * 1.8, 0, 100)
    : null;
  const cons = adjSeries.length
    ? clamp(100 - stdDev(adjSeries) * 2.0, 0, 100)
    : null;

  const athl = Number.isFinite(Number(player.athl_score)) ? Number(player.athl_score) : 50;
  const pff = Number.isFinite(Number(player.bb_score)) ? Number(player.bb_score)
    : Number.isFinite(Number(player.pff_score)) ? Number(player.pff_score)
    : 50;

  const prodFinal = Number.isFinite(prod) ? prod : (Number.isFinite(Number(player.prod_score)) ? Number(player.prod_score) : 0);
  const finalScore = clamp(0.75 * prodFinal + 0.10 * athl + 0.15 * pff, 0, 100);

  updated[name] = {
    ...player,
    prospect_score: round1(finalScore),
    tier: scoreToTier(finalScore),
    prod_score: round1(prodFinal),
    prod_trajectory: round1(prodFinal),
    pff_score: round1(pff),
    rush_trajectory: Number.isFinite(rushTraj) ? round1(rushTraj) : player.rush_trajectory,
    recv_trajectory: Number.isFinite(recvTraj) ? round1(recvTraj) : player.recv_trajectory,
    traj_peak: Number.isFinite(peak) ? round1(peak) : player.traj_peak ?? null,
    traj_final: Number.isFinite(final) ? round1(final) : player.traj_final ?? null,
    traj_improvement: Number.isFinite(improv) ? round1(improv) : player.traj_improvement ?? null,
    traj_consistency: Number.isFinite(cons) ? round1(cons) : player.traj_consistency ?? null,
    num_seasons: seasons.length || player.num_seasons,
    seasons: seasons.length ? seasons : player.seasons
  };
}

const rankedNames = Object.keys(updated).sort((a, b) => {
  const sa = Number(updated[a].prospect_score) || 0;
  const sb = Number(updated[b].prospect_score) || 0;
  return sb - sa;
});

rankedNames.forEach((name, i) => {
  updated[name].rank = i + 1;
});

const playersFilePath = path.join(__dirname, '..', 'data', 'playersBase.js');
const original = fs.readFileSync(playersFilePath, 'utf8');
const marker = '\nexport const ALL_PLAYERS = ALL_PLAYERS_BASE;';
const markerIdx = original.indexOf(marker);
if (markerIdx < 0) {
  throw new Error('Could not locate ALL_PLAYERS export marker in playersBase.js');
}

const suffix = original.slice(markerIdx + 1);
const nextContent = `export const ALL_PLAYERS_BASE = ${JSON.stringify(updated, null, 2)};\n\n${suffix}`;
fs.writeFileSync(playersFilePath, nextContent, 'utf8');

console.log(`Recalculated scores for ${rankedNames.length} players.`);
console.log(`Top 5: ${rankedNames.slice(0, 5).map(n => `${n} (${updated[n].prospect_score})`).join(', ')}`);
