// /logic/filters.js

export function applyFilters(allNames, filters) {
  const { classFilter, tierFilter, rushArchFilter, recvArchFilter, trajFilter, roundFilter, sortBy, sortDir, ALL_DATA } = filters;

  let names = allNames;
  if (classFilter)    names = names.filter(n=>ALL_DATA[n].draft_class===classFilter);
  if (tierFilter)     names = names.filter(n=>ALL_DATA[n].tier===tierFilter);
  if (rushArchFilter) names = names.filter(n=>ALL_DATA[n].rush_arch===rushArchFilter);
  if (recvArchFilter) names = names.filter(n=>ALL_DATA[n].recv_arch===recvArchFilter);
  if (roundFilter)    names = names.filter(n=>String(ALL_DATA[n].draft_round)===String(roundFilter));
  if (trajFilter==="breakout")     names = names.filter(n=>ALL_DATA[n].breakout_tag===true);
  if (trajFilter==="late_decline") names = names.filter(n=>ALL_DATA[n].late_decline===true);
  if (!tierFilter&&!classFilter&&!rushArchFilter&&!recvArchFilter&&!trajFilter&&!sortBy&&!roundFilter) names = names.slice(0,20);
  if (sortBy) {
    const invertSort = sortBy==="draft_round"||sortBy==="draft_pick";
    const key = sortBy==="consistency" ? "traj_consistency" : sortBy==="improvement" ? "traj_improvement" : sortBy==="rush_trajectory" ? "rush_trajectory" : sortBy==="recv_trajectory" ? "recv_trajectory" : sortBy==="proj_t12" ? "proj_t12" : sortBy==="proj_t24" ? "proj_t24" : sortBy==="athl_score" ? "athl_score" : sortBy==="draft_round" ? "draft_round" : "draft_pick";
    names = [...names].sort((a,b)=>{
      const va = ALL_DATA[a][key]??99999, vb = ALL_DATA[b][key]??99999;
      const dir = invertSort ? (sortDir==="desc" ? 1 : -1) : (sortDir==="desc" ? -1 : 1);
      return (va-vb)*dir;
    });
  }
  return names;
}