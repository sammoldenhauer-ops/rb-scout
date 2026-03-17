import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourcePath = path.join(__dirname, '..', 'code');
const statsOutPath = path.join(__dirname, '..', 'data', 'seasonStatsBase.js');
const metaOutPath = path.join(__dirname, '..', 'data', 'seasonMetaBase.js');

const source = fs.readFileSync(sourcePath, 'utf8');
const statsStartMarker = 'const SEASON_STATS_BASE =';
const statsEndMarker = 'const TIER_STYLE =';

const statsStart = source.indexOf(statsStartMarker);
const statsEnd = source.indexOf(statsEndMarker, statsStart);

if (statsStart < 0 || statsEnd < 0) {
  throw new Error('Failed to locate SEASON_STATS_BASE block in embedded code file.');
}

const statsLiteral = source.slice(statsStart + statsStartMarker.length, statsEnd).trim().replace(/;\s*$/, '');
const statsOutput = `export const SEASON_STATS_BASE = ${statsLiteral};\n`;
fs.writeFileSync(statsOutPath, statsOutput, 'utf8');

const allStartMatch = source.match(/const ALL_PLAYERS_BASE\s*=\s*/);
if (!allStartMatch) {
  throw new Error('Failed to locate ALL_PLAYERS_BASE block in embedded code file.');
}

const allStart = allStartMatch.index + allStartMatch[0].length;
const allEnd = source.indexOf(statsStartMarker, allStart);
if (allEnd < 0) {
  throw new Error('Failed to locate end of ALL_PLAYERS_BASE block.');
}

const allPlayersLiteral = source.slice(allStart, allEnd).trim().replace(/;\s*$/, '');
const allPlayers = vm.runInNewContext(`(${allPlayersLiteral})`, {});

const seasonMeta = {};
for (const [playerName, pdata] of Object.entries(allPlayers)) {
  const seasons = (pdata.seasons || []).map((s) => ({
    n: s.n ?? null,
    yr: s.yr ?? null,
    sc: s.sc ?? s.school ?? null,
    conf: s.conf ?? null,
    school: s.school ?? s.sc ?? null,
    sos_label: s.sos_label ?? null,
    sos_rank: s.sos_rank ?? null,
    sos_mag: s.sos_mag ?? null,
    c: s.c ?? s.adj_score ?? s.total_score ?? null,
    r: s.r ?? s.rush_score ?? null,
    v: s.v ?? s.recv_score ?? null,
    rush_score: s.rush_score ?? s.r ?? null,
    recv_score: s.recv_score ?? s.v ?? null,
    adj_score: s.adj_score ?? s.c ?? null,
  }));

  if (seasons.length) {
    seasonMeta[playerName] = seasons;
  }
}

const metaOutput = `export const SEASON_META_BASE = ${JSON.stringify(seasonMeta, null, 2)};\n`;
fs.writeFileSync(metaOutPath, metaOutput, 'utf8');

console.log('Wrote data/seasonStatsBase.js');
console.log('Wrote data/seasonMetaBase.js');
