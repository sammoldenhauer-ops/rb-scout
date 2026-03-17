import { readFileSync } from 'fs';

const content = readFileSync('C:/Users/User/Downloads/App_3.jsx', 'utf8');

// Find ALL_PLAYERS = { ... } in the file (it's inlined)
const startIdx = content.indexOf('ALL_PLAYERS_BASE  = {');
if (startIdx < 0) {
  console.log('ERROR: Cannot find ALL_PLAYERS_BASE');
  process.exit(1);
}
const jsonStart = content.indexOf('{', startIdx);

// Find matching closing brace
let depth = 0, jsonEnd = jsonStart;
for (let i = jsonStart; i < content.length; i++) {
  if (content[i] === '{') depth++;
  else if (content[i] === '}') {
    depth--;
    if (depth === 0) { jsonEnd = i; break; }
  }
}

const jsonStr = content.substring(jsonStart, jsonEnd + 1);
let players;
try {
  players = JSON.parse(jsonStr);
} catch (e) {
  console.log('JSON parse error:', e.message.substring(0, 200));
  process.exit(1);
}

console.log('Total players:', Object.keys(players).length);

// Filter top24 > 0 (same as dynamicIdealModel)
const eligible = Object.entries(players).filter(([name, p]) => p.nfl && p.nfl.top24 > 0);
console.log('Eligible (top24>0):', eligible.length);
eligible.forEach(([name, p]) => {
  const w = (p.nfl.top24||0) + (p.nfl.top12||0);
  console.log(`  ${name}: top24=${p.nfl.top24}, top12=${p.nfl.top12}, weight=${w}`);
});

const metrics = ['height','weight','arm','hand','wing','forty','ten_split','vert','broad','three_cone','shuttle'];
const sums = {};
const wts = {};
metrics.forEach(m => { sums[m] = 0; wts[m] = 0; });

eligible.forEach(([name, p]) => {
  const w = (p.nfl.top24||0) + (p.nfl.top12||0);
  metrics.forEach(m => {
    const v = p.athletic?.[m]?.val;
    if (v !== null && v !== undefined && !isNaN(Number(v))) {
      sums[m] += Number(v) * w;
      wts[m] += w;
    }
  });
});

const DEFAULT_IDEALS = {
  height: 70.99, weight: 217.34, arm: 31.21, hand: 9.47,
  wing: 74.889, forty: 4.51, ten_split: 1.56,
  vert: 35.41, broad: 122.36, three_cone: 7.12, shuttle: 4.33
};

console.log('\nDynamic ideal values vs DEFAULT_IDEALS:');
metrics.forEach(m => {
  if (wts[m] > 0) {
    const v = Math.round((sums[m] / wts[m]) * 1000) / 1000;
    const diff = Math.abs(v - DEFAULT_IDEALS[m]);
    const flag = diff > 0.5 ? '  <<< SIGNIFICANT DIFF' : (diff > 0.1 ? '  < minor diff' : '');
    console.log(`  ${m.padEnd(12)}: dynamic=${v.toFixed(3)}  default=${DEFAULT_IDEALS[m]}${flag}`);
  } else {
    console.log(`  ${m.padEnd(12)}: no data (0 eligible)  default=${DEFAULT_IDEALS[m]}`);
  }
});
