const fs = require('fs');
const src = fs.readFileSync('App.jsx', 'utf8');

// Extract ALL_PLAYERS_BASE
const startIdx = src.indexOf('const ALL_PLAYERS_BASE');
let braceCount = 0;
let foundStart = false;
let endIdx = startIdx;

for (let i = startIdx; i < src.length; i++) {
  if (src[i] === '{') braceCount++;
  if (src[i] === '}') {
    braceCount--;
    if (foundStart && braceCount === 0) {
      endIdx = i + 1;
      break;
    }
    foundStart = true;
  }
}

const jsonStr = src.substring(startIdx + 'const ALL_PLAYERS_BASE  = '.length, endIdx);
const data = eval('(' + jsonStr + ')');

console.log('Total players:', Object.keys(data).length);

let withDraftRound = 0;
let withDraftPick = 0;
let withBoth = 0;
let withEither = 0;
let filtered = 0;

for (const [name, p] of Object.entries(data)) {
  const hasDraftRound = p.draft_round != null && p.draft_round !== '';
  const hasDraftPick = p.draft_pick != null && p.draft_pick !== '';
  const notUdfa = p.draft_round !== 'UDFA';
  
  if (hasDraftRound) withDraftRound++;
  if (hasDraftPick) withDraftPick++;
  if (hasDraftRound && hasDraftPick) withBoth++;
  if (hasDraftRound || hasDraftPick) withEither++;
  if ((hasDraftRound || hasDraftPick) && notUdfa) filtered++;
}

console.log('With draft_round:', withDraftRound);
console.log('With draft_pick:', withDraftPick);
console.log('With both:', withBoth);
console.log('With either:', withEither);
console.log('Filter: (p.draft_round||p.draft_pick)&&p.draft_round!=="UDFA" =', filtered);
