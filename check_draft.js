const { ALL_PLAYERS_BASE } = require('./data/playersBase.js');

const all = Object.entries(ALL_PLAYERS_BASE);
const failFilter = all.filter(([name, x]) => 
  !(x.draft_round && x.draft_round !== '' && x.draft_round !== 'UDFA' && x.draft_pick && x.draft_pick !== '')
);

console.log('Total players:', all.length);
console.log('Players that FAIL the current filter:', failFilter.length);
console.log('\nExamples of failing players:');
failFilter.slice(0, 10).forEach(([name, x]) => {
  console.log(`  ${name}: draft_round="${x.draft_round}" (type: ${typeof x.draft_round}), draft_pick="${x.draft_pick}" (type: ${typeof x.draft_pick})`);
});
