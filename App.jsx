import React, { useState, useEffect, useMemo, useRef } from "react";
import { ALL_PLAYERS_BASE } from "./data/playersBase.js";

// ─── EMBEDDED DATA ──────────────────────────────────────────────────────────
const BALANCED_RECV_ARCH_BY_NAME = buildBalancedRecvArchetypeMap(ALL_PLAYERS_BASE);

function getRebalancedRecvArchetype(player, playerName){
  if (playerName && BALANCED_RECV_ARCH_BY_NAME[playerName]) {
    return BALANCED_RECV_ARCH_BY_NAME[playerName];
  }
  return getThresholdRecvArchetype(player);
}

const ALL_PLAYERS = ALL_PLAYERS_BASE;
const SEASON_STATS = SEASON_STATS_BASE;
const TIER_VAL = TIER_VAL_BASE;

// Pre-compute season rush/recv/adjusted score rankings.
// SEASON_SCORE_RANKS[n] = { rush:[{name,score}], recv:[{name,score}], adj:[{name,score}] }
const SEASON_SCORE_RANKS = (()=>{
  const byN = {};
  Object.entries(ALL_PLAYERS_BASE).forEach(([name,p])=>{
    (p.seasons||[]).forEach(s=>{
      const n=s.n;
      if(!byN[n]) byN[n]={rush:[],recv:[],adj:[]};
      if(s.rush_score!=null) byN[n].rush.push({name,score:s.rush_score});
      if(s.recv_score!=null) byN[n].recv.push({name,score:s.recv_score});
      const adjScore = s.adj_score != null ? s.adj_score : s.c;
      if(adjScore!=null) byN[n].adj.push({name,score:adjScore});
    });
  });
  Object.values(byN).forEach(d=>{
    d.rush.sort((a,b)=>b.score-a.score);
    d.recv.sort((a,b)=>b.score-a.score);
    d.adj.sort((a,b)=>b.score-a.score);
  });
  return byN;
})();

function getSeasonRankColor(rank, total) {
  if(!rank || !total) return "#555";
  const pct = (rank - 1) / total;
  if(pct <= 0.10) return "#f0c040";
  if(pct <= 0.20) return "#4da6ff";
  if(pct <= 0.40) return "#5dbf6a";
  if(pct <= 0.60) return "#f0e040";
  if(pct <= 0.80) return "#f0873a";
  return "#e05050";
}

function getSeasonScorePlacement(sn, scoreType, score, excludeName=null) {
  const n = Number(sn);
  const s = Number(score);
  if (!Number.isFinite(n) || !Number.isFinite(s)) return null;
  const entries = (SEASON_SCORE_RANKS[n] && SEASON_SCORE_RANKS[n][scoreType]) || [];
  const filtered = excludeName ? entries.filter((e) => e.name !== excludeName) : entries.slice();
  let rank = 1;
  while (rank <= filtered.length && filtered[rank - 1].score > s) rank += 1;
  const total = filtered.length + 1;
  return {
    rank,
    total,
    color: getSeasonRankColor(rank, total),
  };
}

// Build per-season, per-stat raw value lists so displayed percentiles are always consistent.
const SEASON_STAT_DISTS = (()=>{
  const byN = {};
  Object.values(SEASON_STATS_BASE).forEach((playerSeasons)=>{
    Object.entries(playerSeasons||{}).forEach(([sn,row])=>{
      if (!Array.isArray(row)) return;
      const n = Number(sn);
      if (!byN[n]) byN[n] = {};
      row.forEach((pair, idx)=>{
        const raw = Array.isArray(pair) ? pair[0] : null;
        if (raw==null || Number.isNaN(raw)) return;
        if (!byN[n][idx]) byN[n][idx] = [];
        byN[n][idx].push(raw);
      });
    });
  });
  return byN;
})();

// Derived raw stat distributions by season (for raw input fields in Add/Edit modals).
// Built from the canonical season stat table so percentiles stay aligned to YR1/YR2/etc.
const SEASON_RAW_DERIVED_DISTS = (() => {
  const byN = {};
  const push = (n, key, val) => {
    if (!Number.isFinite(val)) return;
    if (!byN[n]) byN[n] = {};
    if (!byN[n][key]) byN[n][key] = [];
    byN[n][key].push(val);
  };

  Object.values(SEASON_STATS_BASE).forEach((playerSeasons) => {
    Object.entries(playerSeasons || {}).forEach(([sn, row]) => {
      if (!Array.isArray(row)) return;
      const n = Number(sn);
      const get = (idx) => {
        const pair = row[idx];
        const v = Array.isArray(pair) ? pair[0] : null;
        return Number.isFinite(v) ? v : null;
      };

      const att = get(STAT_IDX["ATT"]);
      const yds = get(STAT_IDX["YDS"]);
      const rec = get(STAT_IDX["REC"]);

      const ycoA = get(STAT_IDX["YCO/A"]);
      const mtfA = get(STAT_IDX["MTF/A"]);
      const tenA = get(STAT_IDX["10+/A"]);
      const fifA = get(STAT_IDX["15+/A"]);
      const bayPct = get(STAT_IDX["BAY%"]);
      const fdA = get(STAT_IDX["1D/A"]);
      const yacRec = get(STAT_IDX["YAC/REC"]);
      const mtfRec = get(STAT_IDX["MTF/REC"]);

      if (att != null && ycoA != null) push(n, "raw_yco", ycoA * att);
      if (att != null && mtfA != null) push(n, "raw_mtf", mtfA * att);
      if (att != null && tenA != null) push(n, "raw_ten_plus", tenA * att);
      if (att != null && fifA != null) push(n, "raw_fif_plus", fifA * att);
      if (yds != null && bayPct != null) push(n, "raw_bay", (bayPct / 100) * yds);
      if (att != null && fdA != null) push(n, "raw_first_downs", fdA * att);
      if (rec != null && yacRec != null) push(n, "raw_yac", yacRec * rec);
      if (rec != null && mtfRec != null) push(n, "raw_mtf_recv", mtfRec * rec);
    });
  });

  return byN;
})();

const LOWER_BETTER_STATS = new Set(["FUM"]);

function getSeasonStatPercentile(sn, statIdx, rawVal, statKey){
  if (rawVal==null) return null;
  const vals = SEASON_STAT_DISTS[Number(sn)] && SEASON_STAT_DISTS[Number(sn)][statIdx];
  if (!vals || !vals.length) return null;
  if (LOWER_BETTER_STATS.has(statKey)) {
    const ge = vals.reduce((acc,v)=>acc + (v >= rawVal ? 1 : 0), 0);
    return (ge / vals.length) * 100;
  }
  const le = vals.reduce((acc,v)=>acc + (v <= rawVal ? 1 : 0), 0);
  return (le / vals.length) * 100;
}

function getModalStatPercentileMetaByStatKey(season, seasonNumber, statKey, rawVal) {
  const sn = Number(seasonNumber || season?.n);
  const n = Number(rawVal);
  if (!Number.isFinite(sn) || !Number.isFinite(n)) return null;
  const statIdx = STAT_IDX[statKey];
  if (statIdx == null) return null;
  const pct = getSeasonStatPercentile(sn, statIdx, n, statKey);
  if (pct == null) return null;
  return { pct, inverted: false };
}

function getModalInputPercentileMeta(season, fieldKey, seasonNumber) {
  const sn = Number(seasonNumber || season?.n);
  if (!Number.isFinite(sn)) return null;

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const attempts = num(season?.attempts);
  const rushYds = num(season?.rush_yds);
  const receptions = num(season?.receptions);

  let statKey = null;
  let rawVal = null;
  let rawDistKey = null;

  switch (fieldKey) {
    case "attempts": statKey = "ATT"; rawVal = num(season?.attempts); break;
    case "rush_yds": statKey = "YDS"; rawVal = num(season?.rush_yds); break;
    case "rush_tds": statKey = "RUSH TD"; rawVal = num(season?.rush_tds); break;
    case "fumbles": statKey = "FUM"; rawVal = num(season?.fumbles); break;
    case "run_grade": statKey = "RUN GRD"; rawVal = num(season?.run_grade); break;
    case "yco_a":
      rawDistKey = "raw_yco";
      rawVal = num(season?.yco_a);
      break;
    case "mtf":
      rawDistKey = "raw_mtf";
      rawVal = num(season?.mtf);
      break;
    case "ten_plus":
      rawDistKey = "raw_ten_plus";
      rawVal = num(season?.ten_plus);
      break;
    case "fif_plus":
      rawDistKey = "raw_fif_plus";
      rawVal = num(season?.fif_plus);
      break;
    case "bay":
      rawDistKey = "raw_bay";
      rawVal = num(season?.bay);
      break;
    case "first_downs":
      rawDistKey = "raw_first_downs";
      rawVal = num(season?.first_downs);
      break;
    case "elu": statKey = "ELU"; rawVal = num(season?.elu); break;
    case "ydom": statKey = "Y DOM%"; rawVal = num(season?.ydom); break;
    case "tddom": statKey = "TD DOM%"; rawVal = num(season?.tddom); break;

    case "targets": statKey = "TGT"; rawVal = num(season?.targets); break;
    case "receptions": statKey = "REC"; rawVal = num(season?.receptions); break;
    case "rec_yds": statKey = "REC YDS"; rawVal = num(season?.rec_yds); break;
    case "rec_tds": statKey = "REC TD"; rawVal = num(season?.rec_tds); break;
    case "recv_grade": statKey = "REC GRD"; rawVal = num(season?.recv_grade); break;
    case "recv_snaps": statKey = "RECV"; rawVal = num(season?.recv_snaps); break;
    case "yac_raw":
      rawDistKey = "raw_yac";
      rawVal = num(season?.yac_raw);
      break;
    case "adot": statKey = "ADOT"; rawVal = num(season?.adot); break;
    case "mtf_recv":
      rawDistKey = "raw_mtf_recv";
      rawVal = num(season?.mtf_recv);
      break;
    default:
      return null;
  }

  if (rawVal == null || !Number.isFinite(rawVal)) return null;
  if (rawDistKey) {
    const vals = SEASON_RAW_DERIVED_DISTS[sn] && SEASON_RAW_DERIVED_DISTS[sn][rawDistKey];
    if (!vals || !vals.length) return null;
    const le = vals.reduce((acc, v) => acc + (v <= rawVal ? 1 : 0), 0);
    return { pct: (le / vals.length) * 100, inverted: false };
  }
  return getModalStatPercentileMetaByStatKey(season, sn, statKey, rawVal);
}

function getSeasonRawDerivedPercentile(sn, rawDistKey, rawVal) {
  const seasonNumber = Number(sn);
  const value = Number(rawVal);
  if (!Number.isFinite(seasonNumber) || !Number.isFinite(value)) return null;
  const vals = SEASON_RAW_DERIVED_DISTS[seasonNumber] && SEASON_RAW_DERIVED_DISTS[seasonNumber][rawDistKey];
  if (!vals || !vals.length) return null;
  const le = vals.reduce((acc, v) => acc + (v <= value ? 1 : 0), 0);
  return (le / vals.length) * 100;
}

function MiniInputPctBar({pct, inverted=false}) {
  if (pct == null) return null;
  const display = Math.max(0, Math.min(100, inverted ? (100 - pct) : pct));
  const c = display >= 75 ? "#5dbf6a" : display >= 40 ? "#f0c040" : "#f0873a";
  return (
    <div style={{marginTop:3,display:"flex",alignItems:"center",gap:4}}>
      <div style={{height:3,flex:1,borderRadius:999,background:"rgba(255,255,255,0.08)",overflow:"hidden"}}>
        <div style={{height:"100%",width:display+"%",background:c,borderRadius:999}}/>
      </div>
      <span style={{fontSize:7,color:c,fontWeight:700,minWidth:24,textAlign:"right"}}>{toOrdinal(display)}</span>
    </div>
  );
}

function FormulaGeneratedPercentiles({season, seasonNumber}) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const att = num(season?.attempts);
  const rushYds = num(season?.rush_yds);
  const rec = num(season?.receptions);
  const recYds = num(season?.rec_yds);
  const recvSnaps = num(season?.recv_snaps);

  const rows = [
    { label: "Y/A", statKey: "Y/A", val: att && att > 0 && rushYds != null ? rushYds / att : null },
    { label: "YCO/A", statKey: "YCO/A", val: att && att > 0 ? num(season?.yco_a) / att : null },
    { label: "MTF/A", statKey: "MTF/A", val: att && att > 0 ? num(season?.mtf) / att : null },
    { label: "10+/A", statKey: "10+/A", val: att && att > 0 ? num(season?.ten_plus) / att : null },
    { label: "15+/A", statKey: "15+/A", val: att && att > 0 ? num(season?.fif_plus) / att : null },
    { label: "BAY%", statKey: "BAY%", val: rushYds && rushYds > 0 ? (num(season?.bay) / rushYds) * 100 : null },
    { label: "1D/A", statKey: "1D/A", val: att && att > 0 ? num(season?.first_downs) / att : null },
    { label: "REC%", statKey: "REC%", val: num(season?.targets) > 0 && rec != null ? (rec / num(season?.targets)) * 100 : null },
    { label: "Y/REC", statKey: "Y/REC", val: rec && rec > 0 && recYds != null ? recYds / rec : null },
    { label: "YAC/REC", statKey: "YAC/REC", val: rec && rec > 0 ? num(season?.yac_raw) / rec : null },
    { label: "Y/RR", statKey: "Y/RR", val: recvSnaps && recvSnaps > 0 && recYds != null ? recYds / recvSnaps : null },
    { label: "MTF/REC", statKey: "MTF/REC", val: rec && rec > 0 ? num(season?.mtf_recv) / rec : null },
  ];

  const normalized = rows.map((r) => {
    if (r.val == null || !Number.isFinite(r.val)) return null;
    const meta = getModalStatPercentileMetaByStatKey(season, seasonNumber, r.statKey, r.val);
    if (!meta) return null;
    return { ...r, ...meta };
  }).filter(Boolean);

  if (!normalized.length) return null;

  return (
    <div style={{marginBottom:10,padding:"7px 9px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7}}>
      <div style={{fontSize:8,color:"#555",letterSpacing:1,marginBottom:6}}>FORMULA STATS PERCENTILES</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:"5px 8px"}}>
        {normalized.map((r) => (
          <div key={r.statKey}>
            <div style={{fontSize:8,color:"#666",display:"flex",justifyContent:"space-between"}}>
              <span>{r.label}</span>
              <span>{r.val.toFixed(2)}</span>
            </div>
            <MiniInputPctBar pct={r.pct} inverted={r.inverted} />
          </div>
        ))}
      </div>
    </div>
  );
}

// SOS label helper
const SOS_COLORS = {
  "Elite":"#f0c040","Strong":"#5dbf6a","Average":"#4da6ff",
  "Weak":"#f0873a","Very Weak":"#888","FCS":"#5a3a3a","N/A":"#555",
};
const sosColor = label => SOS_COLORS[label]||"#555";

function ArchTag({label, colors}) {
  const color = colors[label]||"#888";
  return <span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,marginRight:4,marginBottom:3,fontSize:9,fontWeight:700,letterSpacing:1,background:color+"18",border:"1px solid "+color+"55",color}}>{label}</span>;
}

function Bar({label, value, max=100, color="#4da6ff"}) {
  const pct = Math.min(100,Math.max(0,(value||0)/max*100));
  return (
    <div style={{marginBottom:9}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:10,color:"#666"}}>{label}</span>
        <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{value!=null?value.toFixed(1):"—"}</span>
      </div>
      <div style={{height:5,borderRadius:3,background:"rgba(255,255,255,0.06)"}}>
        <div style={{height:"100%",width:pct+"%",background:color,borderRadius:3}}/>
      </div>
    </div>
  );
}

function Hex({values, color, size=200}) {
  const n=values.length;
  const cx=size/2,cy=size/2,r=size*0.38;
  const ang = i => (Math.PI*2*i/n)-Math.PI/2;
  const pt  = (val,i) => { const s=Math.min(1,(val||0)/100); return [cx+r*s*Math.cos(ang(i)),cy+r*s*Math.sin(ang(i))]; };
  const gpt = (sc,i) => [cx+r*sc*Math.cos(ang(i)),cy+r*sc*Math.sin(ang(i))];
  const poly= pts => pts.map(p=>p.join(",")).join(" ");
  const pts = values.map((v,i)=>pt(v.val,i));
  const RINGS = [0.25,0.5,0.75,1];
  const RING_LABELS = ["25","50","75","100"];
  return (
    <svg width={size} height={size} style={{display:"block",overflow:"visible"}}>
      {/* Axis spoke lines with faint dashes */}
      {values.map((_,i)=><line key={"ax"+i} x1={cx} y1={cy} x2={cx+r*Math.cos(ang(i))} y2={cy+r*Math.sin(ang(i))} stroke="rgba(255,255,255,0.10)" strokeWidth={1} strokeDasharray="3,4"/>)}
      {/* Ring polygons with faint dashes */}
      {RINGS.map((s,ri)=><polygon key={s} points={poly(values.map((_,i)=>gpt(s,i)))} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={1} strokeDasharray={ri<3?"3,4":"none"}/>)}
      {/* Y-axis tick labels on the first spoke (top) */}
      {RINGS.map((s,ri)=>{
        const tx=cx+r*s*Math.cos(ang(0))-14;
        const ty=cy+r*s*Math.sin(ang(0))-4;
        return <text key={"yt"+ri} x={tx} y={ty} fill="rgba(255,255,255,0.18)" fontSize={size*0.045} fontFamily="monospace" textAnchor="end">{RING_LABELS[ri]}</text>;
      })}
      {/* Data polygon */}
      <polygon points={poly(pts)} fill={color+"2a"} stroke={color} strokeWidth={1.5}/>
      {/* Data point dots */}
      {pts.map((p,i)=><circle key={"dot"+i} cx={p[0]} cy={p[1]} r={2.5} fill={color}/>)}
      {/* Axis labels */}
      {values.map(({label},i)=><text key={i} x={cx+(r+16)*Math.cos(ang(i))} y={cy+(r+16)*Math.sin(ang(i))} textAnchor="middle" dominantBaseline="middle" fill="#666" fontSize={size*0.058} fontFamily="monospace" fontWeight="700">{label}</text>)}
    </svg>
  );
}

function Sparkline({seasons, color, width=580, height=170}) {
  if (!seasons||seasons.length<2) return null;
  const valid=seasons.filter(s=>(s.c||0)>0);
  if (valid.length<2) return null;
  const padL=36, padR=14, padT=18, padB=28;
  const W=width, H=height;
  const xS=(W-padL-padR)/(valid.length-1||1);
  const xF=(_,i)=>padL+i*xS;
  // Dynamic scale with 10pt breathing room
  const allV=[...valid.map(s=>s.c),...valid.map(s=>s.r||0),...valid.map(s=>s.v||0)];
  const mn=Math.max(0,Math.floor((Math.min(...allV)-8)/10)*10);
  const mx=Math.min(100,Math.ceil((Math.max(...allV)+8)/10)*10);
  const yF=v=>padT+(1-(v-mn)/(mx-mn||1))*(H-padT-padB);
  // Dynamic ticks at rounded 10-unit intervals
  const tickStep = mx-mn<=30?5:10;
  const yTicks=[];
  for(let t=mn;t<=mx;t+=tickStep) yTicks.push(t);
  const path=pts=>"M"+pts.map(p=>p.join(",")).join(" L");
  const rPts=valid.map((s,i)=>[xF(s,i).toFixed(1),yF(s.r||0).toFixed(1)]);
  const vPts=valid.map((s,i)=>[xF(s,i).toFixed(1),yF(s.v||0).toFixed(1)]);
  const cPts=valid.map((s,i)=>[xF(s,i).toFixed(1),yF(s.c).toFixed(1)]);
  return (
    <svg width="100%" viewBox={"0 0 "+W+" "+H} preserveAspectRatio="xMidYMid meet" style={{display:"block",overflow:"visible"}}>
      {/* Y-axis dashed grid lines + labels */}
      {yTicks.map(v=>(
        <g key={v}>
          <line x1={padL} x2={W-padR} y1={yF(v)} y2={yF(v)}
            stroke={v===mn||v===mx?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.05)"}
            strokeWidth={1} strokeDasharray={v===mn||v===mx?"none":"4,5"}/>
          <text x={padL-5} y={yF(v)+3.5} textAnchor="end" fill="#3a3a3a" fontSize={8.5} fontFamily="monospace">{v}</text>
        </g>
      ))}
      {/* Rush and recv dashed lines */}
      <path d={path(rPts)} fill="none" stroke="#f0873a" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.65}/>
      <path d={path(vPts)} fill="none" stroke="#5dbf6a" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.65}/>
      {/* Combined solid line */}
      <path d={path(cPts)} fill="none" stroke={color} strokeWidth={2.5}/>
      {/* Combined dots + data labels */}
      {cPts.map(([x,y],i)=>{
        const val=valid[i].c;
        const labelY = parseFloat(y) < padT+16 ? parseFloat(y)+14 : parseFloat(y)-8;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={4} fill={color} stroke="#080c14" strokeWidth={1.5}/>
            <text x={x} y={labelY} textAnchor="middle" fill={color} fontSize={8.5} fontFamily="monospace" fontWeight="700">{val.toFixed(0)}</text>
            <text x={x} y={H-padB+14} textAnchor="middle" fill="#3a3a3a" fontSize={8} fontFamily="monospace">Y{valid[i].n}</text>
          </g>
        );
      })}
    </svg>
  );
}

function toOrdinal(value) {
  const n = Math.round(Number(value) || 0);
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function PctBar({pct, inverted=false}) {
  if (pct==null) return <span style={{color:"#333",fontSize:11}}>—</span>;
  const display = inverted ? (100-pct) : pct;
  const c = display>=75?"#5dbf6a":display>=40?"#f0c040":"#f0873a";
  return (
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      <div style={{width:56,height:11,borderRadius:4,background:"rgba(255,255,255,0.07)",flexShrink:0}}>
        <div style={{height:"100%",width:display+"%",background:c,borderRadius:4}}/>
      </div>
      <span style={{fontSize:11,color:c,fontWeight:700,minWidth:28}}>{toOrdinal(display)}</span>
    </div>
  );
}

function SOSBadge({season}) {
  const label = season.sos_label||"N/A";
  const color = sosColor(label);
  const rank  = season.sos_rank;
  const mag   = season.sos_mag != null ? season.sos_mag : null;
  const school= season.sc||season.school||season.conf||"";
  const yr    = season.yr ? "'"+String(season.yr).slice(-2) : "";
  return (
    <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",padding:"7px 14px",borderRadius:8,background:color+"18",border:"1px solid "+color+"44",minWidth:90,gap:2}}>
      <span style={{fontSize:10,color,fontWeight:800,letterSpacing:1.2}}>{label}</span>
      <span style={{fontSize:9,color:"#666",fontWeight:500}}>{school}{yr?" "+yr:""}</span>
      <span style={{fontSize:10,color,fontWeight:700}}>#{rank&&rank<900?rank:"—"} SOS</span>
      {mag!=null&&<span style={{fontSize:9,color:color,opacity:0.8,fontWeight:600,letterSpacing:0.5}}>mag {mag.toFixed(3)}</span>}
    </div>
  );
}

function SeasonStatTable({playerName, seasons, accent}) {
  const [group,setGroup] = useState("rush");
  const ssData = (_customSS&&_customSS[playerName]) || (SEASON_STATS&&SEASON_STATS[playerName]) || {};
  const seasonKeys = Object.keys(ssData).map(Number).sort();
  const metaByN = {};
  (seasons||[]).forEach(s=>{metaByN[s.n]=s;});
  const filtered = STAT_LABELS.filter(([,,g])=>g===group);
  const oneSeason = seasonKeys.length === 1;
  if (!seasonKeys.length) return <div style={{padding:"20px 0",textAlign:"center",color:"#444",fontSize:11}}>No season stat data available</div>;
  return (
    <div>
      {oneSeason && (
        <div style={{background:"rgba(240,192,64,0.08)",border:"1px solid rgba(240,192,64,0.25)",borderRadius:7,padding:"8px 12px",marginBottom:14,fontSize:10,color:"#f0c040"}}>
          ⚠ Single-season profile — trajectory metrics may not reflect true development arc
        </div>
      )}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["rush","Rushing","#f0873a"],["recv","Receiving","#5dbf6a"]].map(([g,lbl,c])=>(
          <button key={g} onClick={()=>setGroup(g)} style={{padding:"5px 14px",borderRadius:6,border:"1px solid "+(group===g?c:c+"33"),background:group===g?c+"18":"transparent",color:group===g?c:"#555",fontSize:9,letterSpacing:2,fontWeight:group===g?700:400}}>
            {lbl.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:"monospace"}}>
          <thead>
            <tr style={{borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
              <th style={{textAlign:"left",padding:"5px 8px",color:"#555",fontSize:11,minWidth:130,position:"sticky",left:0,background:"rgba(8,12,20,0.97)"}}>STAT</th>
              {seasonKeys.map(sn=>{
                const meta=metaByN[sn];
                const ranks=SEASON_SCORE_RANKS[sn]||{rush:[],recv:[]};
                const rushRank=(ranks.rush.findIndex(r=>r.name===playerName)+1)||null;
                const recvRank=(ranks.recv.findIndex(r=>r.name===playerName)+1)||null;
                const rushTotal=ranks.rush.length;
                const recvTotal=ranks.recv.length;
                const rushScore=meta?meta.rush_score:null;
                const recvScore=meta?meta.recv_score:null;
                return (
                  <th key={sn} style={{textAlign:"center",padding:"4px 10px",color:accent,fontSize:12,minWidth:120}}>
                    {/* Rush score + rank */}
                    <div style={{marginBottom:3,padding:"4px 6px",borderRadius:5,background:"rgba(240,135,58,0.08)",border:"1px solid rgba(240,135,58,0.15)"}}>
                      <div style={{fontSize:7,color:"#f0873a",letterSpacing:1,marginBottom:1}}>RUSH</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        <span style={{fontSize:13,fontWeight:800,color:"#f0873a"}}>{rushScore!=null?rushScore.toFixed(1):"—"}</span>
                        {rushRank&&<span style={{fontSize:8,color:getSeasonRankColor(rushRank,rushTotal),fontWeight:700}}>{"#"+rushRank+"/"+rushTotal}</span>}
                      </div>
                    </div>
                    {/* Recv score + rank */}
                    <div style={{marginBottom:4,padding:"4px 6px",borderRadius:5,background:"rgba(93,191,106,0.08)",border:"1px solid rgba(93,191,106,0.15)"}}>
                      <div style={{fontSize:7,color:"#5dbf6a",letterSpacing:1,marginBottom:1}}>RECV</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        <span style={{fontSize:13,fontWeight:800,color:"#5dbf6a"}}>{recvScore!=null?recvScore.toFixed(1):"—"}</span>
                        {recvRank&&<span style={{fontSize:8,color:getSeasonRankColor(recvRank,recvTotal),fontWeight:700}}>{"#"+recvRank+"/"+recvTotal}</span>}
                      </div>
                    </div>
                    {/* Year label + school */}
                    <div style={{fontSize:11,color:accent,fontWeight:700}}>{"YR "+sn}</div>
                    {meta&&<div style={{color:"#444",fontWeight:400,fontSize:8}}>{meta.sc||""} {meta.yr?("'"+meta.yr.toString().slice(-2)):""}</div>}
                    {meta&&meta.sos_label&&meta.sos_label!=="N/A"&&(
                      <div style={{marginTop:2}}>
                        <span style={{fontSize:7,color:sosColor(meta.sos_label),background:sosColor(meta.sos_label)+"14",border:"1px solid "+sosColor(meta.sos_label)+"33",borderRadius:3,padding:"1px 4px",fontWeight:600,letterSpacing:0.5}}>
                          {meta.sos_label} {"#"+(meta.sos_rank&&meta.sos_rank<900?meta.sos_rank:"—")}
                        </span>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map(([key,label,g,lb],ri)=>{
              const idx=STAT_IDX[key];
              return (
                <tr key={key} style={{background:ri%2===0?"rgba(255,255,255,0.015)":"transparent",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                  <td style={{padding:"8px 8px",color:"#999",fontSize:11,position:"sticky",left:0,background:ri%2===0?"rgba(9,14,24,0.97)":"rgba(8,12,20,0.97)",zIndex:1}}>
                    {label}
                    {lb&&<span style={{color:"#555",fontSize:8,marginLeft:3}}>(↓)</span>}
                  </td>
                  {seasonKeys.map(sn=>{
                    const row=(ssData[sn]||[]);
                    const pair=row[idx];
                    const pct = pair ? getSeasonStatPercentile(sn, idx, pair[0], key) : null;
                    return (
                      <td key={sn} style={{padding:"5px 10px",verticalAlign:"middle"}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,justifyContent:"flex-start"}}>
                          <span style={{fontSize:14,fontWeight:800,color:"#e0e0e0",minWidth:38,textAlign:"right",flexShrink:0}}>{pair&&pair[0]!=null?(Number.isInteger(pair[0])?pair[0]:pair[0].toFixed(2)):"—"}</span>
                          <PctBar pct={pct} inverted={false}/>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:8,fontSize:9,color:"#333"}}>Percentile vs all RBs in draft season · 100th = best · (↓) = lower is better</div>
    </div>
  );
}

function AthleticPanel({data, accent, playerName}) {
  const athl = data.athletic;
  const rasScore = getPlayerRasScore(data, playerName);
  const rasMultiplier = getRasMultiplier(rasScore);
  const baseScore = data.athl_score;
  const score = getAdjustedAthlScore(data, playerName);
  if (!athl) return <div style={{padding:"20px 0",textAlign:"center",color:"#444",fontSize:11}}>No athletic testing data available</div>;

  const METRICS = [
    {key:"forty",      label:"40-Yard Dash",  unit:"sec", hexLabel:"40T"},
    {key:"ten_split",  label:"10-Yd Split",   unit:"sec", hexLabel:"10YD"},
    {key:"vert",       label:"Vertical Jump", unit:"in",  hexLabel:"VERT"},
    {key:"broad",      label:"Broad Jump",    unit:"in",  hexLabel:"BROD"},
    {key:"three_cone", label:"3-Cone Drill",  unit:"sec", hexLabel:"CONE"},
    {key:"shuttle",    label:"Shuttle",       unit:"sec", hexLabel:"SHTL"},
    {key:"weight",     label:"Weight",        unit:"lbs", hexLabel:"WT"},
    {key:"height",     label:"Height",        unit:"in",  hexLabel:"HT"},
    {key:"arm",        label:"Arm Length",    unit:"in",  hexLabel:"ARM"},
    {key:"hand",       label:"Hand Size",     unit:"in",  hexLabel:"HAND"},
    {key:"wing",       label:"Wingspan",      unit:"in",  hexLabel:"WING"},
  ];
  const available = METRICS.filter(m=>athl[m.key]&&athl[m.key].val!=null);
  // Hex uses inverse rank → higher comp score = better → map rank to 0-100
  const hexVals = available.slice(0,6).map(m=>{
    const info = athl[m.key];
    const rankScore = info.total ? Math.round((1 - (info.rank-1)/info.total)*100) : 50;
    return {label:m.hexLabel, val:rankScore};
  });
  const rankColor = (rank, total) => {
    if(!rank||!total) return "#555";
    const pct = (rank-1)/total;
    if(pct <= 0.10) return "#f0c040";   // gold   top 10%
    if(pct <= 0.20) return "#4da6ff";   // blue   top 20%
    if(pct <= 0.40) return "#5dbf6a";   // green  top 40%
    if(pct <= 0.60) return "#f0e040";   // yellow top 60%
    if(pct <= 0.80) return "#f0873a";   // orange top 80%
    return "#e05050";                    // red    bottom 20%
  };

  return (
    <div>
      <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.15)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:10,color:"#6ab4e8",lineHeight:1.65}}>
        These rankings measure each player's closeness to the <span style={{color:"#4da6ff",fontWeight:700}}>ideal RB athletic profile</span> — a composite target derived from positional scouting standards. A #1 rank does not mean the largest or fastest — it means closest to optimal for the position at that measurement.
      </div>
      <div style={{display:"flex",gap:16,alignItems:"flex-start",marginBottom:18}}>
        <div style={{flexShrink:0}}>
          <Hex size={240} color="#4da6ff" values={hexVals}/>
        </div>
        <div style={{flex:1}}>
          <Bar label="ATHLETIC COMPOSITE" value={score} color="#4da6ff"/>
          <div style={{fontSize:9,color:"#444",marginBottom:6}}>Athletic weight: 15% of prospect score · validation r=+0.020 vs fantasy</div>
          <div style={{fontSize:9,color:"#333"}}>Rank = position among {available[0]&&athl[available[0].key]&&athl[available[0].key].total||198} prospects by composite score · #1 = best</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(180px,1fr))",gap:12,marginBottom:18}}>
        <div style={{background:"rgba(77,166,255,0.10)",border:"1px solid rgba(77,166,255,0.35)",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#7fc9ff",letterSpacing:2,marginBottom:8}}>RAS SCORE</div>
          <div style={{fontSize:48,fontWeight:900,color:"#4da6ff",lineHeight:1}}>{rasScore!=null?rasScore.toFixed(2):"N/A"}</div>
          <div style={{fontSize:12,color:"#5f8aa8",marginTop:6}}>{rasScore!=null?"Relative Athletic Score / 10":"No RAS available"}</div>
        </div>
        <div style={{background:"rgba(93,191,106,0.10)",border:"1px solid rgba(93,191,106,0.35)",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#87d492",letterSpacing:2,marginBottom:8}}>MULTIPLIER</div>
          <div style={{fontSize:44,fontWeight:900,color:"#5dbf6a",lineHeight:1}}>x{(rasScore!=null?rasMultiplier:1).toFixed(3)}</div>
          <div style={{fontSize:12,color:"#84a88a",marginTop:6}}>Base ATH {baseScore!=null?baseScore.toFixed(1):"—"} → Adjusted {score!=null?score.toFixed(1):"—"}</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:5}}>
        {available.map(({key,label,unit})=>{
          const info = athl[key];
          const rank  = info.rank;
          const total = info.total;
          const c = rankColor(rank, total);
          return (
            <div key={key} style={{background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 11px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,color:"#777",letterSpacing:1,marginBottom:4}}>{label.toUpperCase()}</div>
                <div style={{fontSize:16,fontWeight:700,color:"#4da6ff"}}>
                  {info.val} <span style={{fontSize:9,color:"#555",fontWeight:400}}>{unit}</span>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                {rank!=null
                  ? <>
                      <div style={{fontSize:15,fontWeight:800,color:c}}>
                        {info.tied&&<span style={{fontSize:9,fontWeight:600,color:"#777"}}>T-</span>}
                        <span style={{fontSize:10,fontWeight:400,color:"#555"}}>{!info.tied&&"#"}</span>{rank}
                      </div>
                      <div style={{fontSize:8,color:"#444"}}>of {total}{info.tied&&info.tie_count>1?<span style={{color:"#666"}}> (T)</span>:""}</div>
                    </>
                  : <div style={{fontSize:12,color:"#444"}}>—</div>
                }
              </div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:8,fontSize:9,color:"#333",lineHeight:1.7}}>
        <span style={{color:"#f0c040"}}>■</span> Top 10%&nbsp;
        <span style={{color:"#4da6ff"}}>■</span> Top 20%&nbsp;
        <span style={{color:"#5dbf6a"}}>■</span> Top 40%&nbsp;
        <span style={{color:"#f0e040"}}>■</span> Top 60%&nbsp;
        <span style={{color:"#f0873a"}}>■</span> Top 80%&nbsp;
        <span style={{color:"#e05050"}}>■</span> Bottom 20%
      </div>
    </div>
  );
}

function getRasMultiplier(rasScore) {
  const n = Number(rasScore);
  if (!Number.isFinite(n) || n === 0) return 1;
  if (n >= 9.75) return 1.1;
  if (n >= 9.5 && n <= 9.74) return 1.05;
  if (n >= 9.25 && n <= 9.49) return 1;
  if (n >= 9 && n <= 9.24) return 0.975;
  if (n >= 8.5 && n <= 8.99) return 0.95;
  if (n >= 8 && n <= 8.49) return 0.9;
  if (n >= 7 && n <= 7.99) return 0.85;
  if (n >= 6 && n <= 6.99) return 0.8;
  if (n >= 5 && n <= 5.99) return 0.8;
  if (n < 5) return 0.75;
  return 1;
}

// Paste your full mapping here: "Player Name": RAS
const RAS_BY_PLAYER = {
  "A.J. Dillon": 9.15,
  "Aaron Jones": 9.21,
  "Alexander Mattison": 6.81,
  "Alvin Kamara": 8.08,
  "Anthony McFarland": 4.4,
  "Antonio Gibson": 9.29,
  "Audric Estime": 6.57,
  "Benny Snell Jr.": 3.41,
  "Bhayshul Tuten": 9.56,
  "Bijan Robinson": 9.85,
  "Blake Corum": 8.29,
  "Bo Scarbrough": 9.25,
  "Boston Scott": 8.85,
  "Brashard Smith": 7.21,
  "Breece Hall": 9.96,
  "Brian Hill": 7.4,
  "Brian Robinson": 6.58,
  "Brittain Brown": 4.75,
  "Bucky Irving": 2.22,
  "Cam Akers": 8.79,
  "Cam Skattebo": 7.45,
  "Chase Brown": 9.81,
  "Chris Carson": 7.91,
  "Chris Evans": 9.84,
  "Chris Rodriguez": 7.7,
  "Christian McCaffrey": 8.52,
  "Chuba Hubbard": 8.43,
  "Clyde Edwards-Helaire": 5.41,
  "D'Andre Swift": 7.55,
  "D'Onta Foreman": 7.82,
  "D.J. Giddens": 9.78,
  "Dalvin Cook": 4.65,
  "Dameon Pierce": 7.09,
  "Damien Harris": 6.36,
  "Damien Martinez": 8.19,
  "Darrell Henderson": 7.68,
  "Darrynton Evans": 9.11,
  "Darwin Thompson": 7.99,
  "David Montgomery": 5.15,
  "David Williams": 4.76,
  "De'Von Achane": 5.72,
  "Deejay Dallas": 5.06,
  "Demond Claiborne": 7.98,
  "Derrius Guice": 7.37,
  "Deuce Vaughn": 4.32,
  "Devante Mays": 7.66,
  "Devin Neal": 6.66,
  "Devin Singletary": 1.65,
  "Dexter Williams": 8.13,
  "Donnel Pumphrey": 4.01,
  "Dylan Laube": 8.78,
  "Dylan Sampson": 6.6,
  "Elijah Hood": 5.69,
  "Elijah McGuire": 4.62,
  "Elijah Mitchell": 9.5,
  "Emmett Johnson": 5.78,
  "Eno Benjamin": 5.76,
  "Eric Gray": 6.56,
  "Evan Hull": 9.33,
  "Gary Brightwell": 4.57,
  "Gerrid Doaks": 8.3,
  "Isaac Guerendo": 9.9,
  "Isaiah Davis": 8.86,
  "Isaiah Spiller": 5.66,
  "Isiah Pacheco": 8.85,
  "Israel Abanikanda": 9.63,
  "Ito Smith": 6.26,
  "Jadarian Price": 8.37,
  "Jahmyr Gibbs": 8.06,
  "Jake Funk": 9.76,
  "Jamaal Williams": 4.55,
  "James Conner": 4.33,
  "James Cook": 8.75,
  "Jarquez Hunter": 7.17,
  "Jason Huntley": 8.08,
  "Javonte Williams": 8.79,
  "Jawhar Jordan": 4.6,
  "Jaydon Blue": 6.34,
  "Jaylen Wright": 9.81,
  "Jeremy McNichols": 8.39,
  "Jermar Jefferson": 2.22,
  "Jerome Ford": 6.91,
  "Joe Mixon": 9.46,
  "Joe Williams": 7.78,
  "John Kelly": 4.43,
  "Jonathan Taylor": 9.53,
  "Jordan James": 4.65,
  "Jordan Scarlett": 4.71,
  "Jordan Wilkins": 7.74,
  "Josh Jacobs": 5.65,
  "Joshua Kelley": 7.59,
  "Justice Hill": 9.33,
  "Justin Jackson": 8.84,
  "Kalen Ballage": 9.12,
  "Kareem Hunt": 5.15,
  "Ke'Shawn Vaughn": 5.17,
  "Keaontay Ingram": 8.67,
  "Keilan Robinson": 7.32,
  "Kene Nwangwu": 9.88,
  "Kenneth Gainwell": 5.66,
  "Kenneth Walker": 9.24,
  "Kenny McIntosh": 4.08,
  "Kerrith Whyte Jr.": 8.58,
  "Kerryon Johnson": 7.09,
  "Kevin Harris": 7.13,
  "Khalfani Muhammad": 7.52,
  "Khalil Herbert": 6.14,
  "Kimani Vidal": 8.88,
  "Kyle Monangai": 4.03,
  "Kylin Hill": 7.28,
  "Kyren Williams": 3.46,
  "La'Mical Perine": 5.25,
  "Larry Rountree": 2.01,
  "Leonard Fournette": 8.04,
  "Malcolm Perry": 1.88,
  "MarShawn Lloyd": 8.62,
  "Mark Walton": 4.55,
  "Marlon Mack": 8.78,
  "Matthew Dayes": 1.74,
  "Michael Carter": 6.2,
  "Mike Washington": 10,
  "Mike Weber": 7.01,
  "Miles Sanders": 9.48,
  "Myles Gaskin": 5.93,
  "Nick Chubb": 9.15,
  "Nyheim Miller-Hines": 5.68,
  "Ollie Gordon": 6.21,
  "Omarion Hampton": 9.7,
  "Pierre Strong": 9.34,
  "Qadree Ollison": 4.43,
  "Quinshon Judkins": 9.9,
  "RJ Harvey": 8.49,
  "Rachaad White": 9.87,
  "Rashaad Penny": 7.26,
  "Ray Davis": 5.41,
  "Raymond Calais": 7.6,
  "Rhamondre Stevenson": 3.98,
  "Roschon Johnson": 8.67,
  "Royce Freeman": 8.26,
  "Ryquell Armstead": 7.71,
  "Samaje Perine": 4.94,
  "Saquon Barkley": 9.97,
  "Snoop Conner": 7.03,
  "Sony Michel": 8.95,
  "T.J. Logan": 7.56,
  "Tahj Brooks": 8.58,
  "Tank Bigsby": 8.32,
  "Tarik Cohen": 3.92,
  "Tony Pollard": 7.17,
  "Travis Etienne": 9.12,
  "Travis Homer": 8.34,
  "Trayveon Williams": 4.6,
  "TreVeyon Henderson": 8.87,
  "Trestan Ebner": 4.77,
  "Trevor Etienne": 6.94,
  "Trey Benson": 9.76,
  "Trey Sermon": 9.67,
  "Ty Chandler": 6.35,
  "Ty Johnson": 9.74,
  "Tyjae Spears": 7.51,
  "Tyler Allgeier": 7.4,
  "Tyler Badie": 6.38,
  "Tyrion Davis-Price": 6.65,
  "Wayne Gallman": 6.28,
  "Will Shipley": 9.57,
  "Woody Marks": 6.66,
  "Zach Charbonnet": 8.71,
  "Zach Evans": 8.75,
  "Zack Moss": 2.8,
  "Zamir White": 9.81
};

function normalizePlayerName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const RAS_LOOKUP_NORMALIZED = Object.fromEntries(
  Object.entries(RAS_BY_PLAYER).map(([name, ras]) => [normalizePlayerName(name), Number(ras)])
);

function lookupRasByName(playerName) {
  const n = normalizePlayerName(playerName);
  if (!n) return null;
  const v = RAS_LOOKUP_NORMALIZED[n];
  return Number.isFinite(v) && v > 0 ? v : null;
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= breakpoint;
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function getPlayerRasScore(data, playerName=null) {
  const candidates = [
    lookupRasByName(playerName),
    lookupRasByName(data?.name),
    data?.ras,
    data?.ras_score,
    data?.athletic?.ras?.val,
    data?.athletic?.ras,
    data?.athletic?.RAS?.val,
    data?.athletic?.RAS,
    data?.athletic?.relative_athletic_score,
    data?.recruiting?.ras,
    data?.recruiting?.ras_score,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function getAdjustedAthlScore(data, playerName=null) {
  const base = Number(data?.athl_score);
  if (!Number.isFinite(base)) return null;
  if (data?.athl_ras_applied) return base;
  const mult = getRasMultiplier(getPlayerRasScore(data, playerName));
  return Math.max(0, Math.min(100, Math.round(base * mult * 10) / 10));
}

function getAdjustedProspectScore(data, playerName=null) {
  const baseProspect = Number(data?.prospect_score);
  if (!Number.isFinite(baseProspect)) return null;
  if (data?.athl_ras_applied) return baseProspect;

  const baseAthl = Number(data?.athl_score);
  const adjAthl = getAdjustedAthlScore(data, playerName);
  if (!Number.isFinite(baseAthl) || !Number.isFinite(adjAthl)) return baseProspect;

  // Prospect formula sensitivity to athletic is 0.10 * 0.85 = 0.085.
  const delta = (adjAthl - baseAthl) * 0.085;
  return Math.min(100, Math.round((baseProspect + delta) * 10) / 10);
}

function applySeasonFinishUpdates(playersByName, finishUpdatesByYear) {
  const hasUpdates = finishUpdatesByYear && Object.keys(finishUpdatesByYear).length > 0;
  if (!hasUpdates) return playersByName;

  const out = {};
  const normalizedToName = {};

  Object.entries(playersByName || {}).forEach(([name, data]) => {
    const nfl = data?.nfl ? { ...data.nfl } : {};
    const seasonRanks = Array.isArray(nfl.season_ranks)
      ? nfl.season_ranks
          .map((r) => ({ year: Number(r?.year), rank: Number(r?.rank) }))
          .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.rank) && r.rank >= 1 && r.rank <= 24)
      : [];
    out[name] = {
      ...data,
      nfl: {
        ...nfl,
        season_ranks: seasonRanks,
      },
    };
    normalizedToName[normalizePlayerName(name)] = name;
  });

  const resolveName = (rawName) => {
    const raw = String(rawName || "").trim();
    if (!raw) return null;
    if (out[raw]) return raw;
    return normalizedToName[normalizePlayerName(raw)] || null;
  };

  Object.entries(finishUpdatesByYear).forEach(([yearKey, payload]) => {
    const year = Number(yearKey);
    if (!Number.isFinite(year)) return;

    const rankByName = new Map();
    const addRecord = (rec, fallbackRank) => {
      const name = String(rec?.name || "").trim();
      const norm = normalizePlayerName(name);
      if (!norm) return;
      const rank = Number(rec?.rank ?? fallbackRank);
      if (!Number.isFinite(rank) || rank < 1 || rank > 24) return;
      const prev = rankByName.get(norm);
      if (!prev || rank < prev.rank) rankByName.set(norm, { name, rank });
    };

    const top24 = Array.isArray(payload?.top24) ? payload.top24 : [];
    const top12 = Array.isArray(payload?.top12) ? payload.top12 : [];

    top24.forEach((rec, idx) => addRecord(rec, idx + 1));
    top12.forEach((rec, idx) => {
      const rank = Math.min(12, Number(rec?.rank ?? idx + 1));
      addRecord({ ...rec, rank }, idx + 1);
    });

    rankByName.forEach((rec) => {
      const playerName = resolveName(rec.name);
      if (!playerName) return;
      const curr = out[playerName] || {};
      const currNfl = curr.nfl || {};
      const rows = Array.isArray(currNfl.season_ranks) ? [...currNfl.season_ranks] : [];
      const withoutYear = rows.filter((r) => Number(r.year) !== year);
      withoutYear.push({ year, rank: rec.rank });
      withoutYear.sort((a, b) => (a.year - b.year) || (a.rank - b.rank));

      out[playerName] = {
        ...curr,
        nfl: {
          ...currNfl,
          season_ranks: withoutYear,
        },
      };
    });
  });

  Object.entries(out).forEach(([name, data]) => {
    const nfl = data?.nfl || {};
    const ranks = Array.isArray(nfl.season_ranks)
      ? nfl.season_ranks
          .map((r) => ({ year: Number(r?.year), rank: Number(r?.rank) }))
          .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.rank) && r.rank >= 1 && r.rank <= 24)
      : [];
    if (!ranks.length) return;

    const top24 = ranks.length;
    const top12 = ranks.filter((r) => r.rank <= 12).length;
    const bestRank = Math.min(...ranks.map((r) => r.rank));
    const avgRank = Math.round((ranks.reduce((sum, r) => sum + r.rank, 0) / top24) * 10) / 10;
    const existingCareer = Number(nfl.career_seasons);
    const uniqueYears = new Set(ranks.map((r) => r.year)).size;
    const careerSeasons = Number.isFinite(existingCareer) && existingCareer > 0
      ? Math.max(existingCareer, uniqueYears)
      : uniqueYears;

    out[name] = {
      ...data,
      nfl: {
        ...nfl,
        season_ranks: ranks,
        top12,
        top24,
        seasons: top24,
        best_rank: bestRank,
        avg_rank: avgRank,
        career_seasons: careerSeasons,
      },
    };
  });

  return out;
}

function applySeasonsPlayedUpdates(playersByName, seasonsPlayedByYear) {
  const hasUpdates = seasonsPlayedByYear && Object.keys(seasonsPlayedByYear).length > 0;
  if (!hasUpdates) return playersByName;

  const out = {};
  const normalizedToName = {};

  Object.entries(playersByName || {}).forEach(([name, data]) => {
    out[name] = {
      ...data,
      nfl: data?.nfl ? { ...data.nfl } : {},
    };
    normalizedToName[normalizePlayerName(name)] = name;
  });

  const resolveName = (rawName) => {
    const raw = String(rawName || "").trim();
    if (!raw) return null;
    if (out[raw]) return raw;
    return normalizedToName[normalizePlayerName(raw)] || null;
  };

  Object.values(seasonsPlayedByYear).forEach((payload) => {
    const rawPlayers = Array.isArray(payload?.players) ? payload.players : [];
    const touched = new Set();

    rawPlayers.forEach((rawName) => {
      const resolved = resolveName(rawName);
      if (resolved) touched.add(resolved);
    });

    touched.forEach((name) => {
      const curr = out[name] || {};
      const currNfl = curr.nfl || {};
      const existingCareer = Number(currNfl.career_seasons);
      const nextCareer = Number.isFinite(existingCareer) ? (existingCareer + 1) : 1;
      out[name] = {
        ...curr,
        nfl: {
          ...currNfl,
          career_seasons: nextCareer,
        },
      };
    });
  });

  return out;
}

const PROJECTED_MULTI_BASELINES = (() => {
  const historical = Object.values(ALL_PLAYERS || {}).filter((p) => {
    const nflData = p?.nfl || {};
    const hasSeasons = (Number(nflData.career_seasons) || 0) > 0
      || (Array.isArray(nflData.season_ranks) && nflData.season_ranks.length > 0);
    return !p?.is_projection && hasSeasons;
  });

  // Use ALL historical players (not just multi-hit cohort) for unbiased base rates.
  const top12Eligible = historical.filter((p) => (Number(p?.nfl?.top12) || 0) >= 1);
  const top24Eligible = historical.filter((p) => (Number(p?.nfl?.top24) || 0) >= 1);

  const multi12Rate = top12Eligible.length
    ? top12Eligible.filter((p) => (Number(p?.nfl?.top12) || 0) >= 2).length / top12Eligible.length
    : 0;
  const multi24Rate = top24Eligible.length
    ? top24Eligible.filter((p) => (Number(p?.nfl?.top24) || 0) >= 2).length / top24Eligible.length
    : 0;

  const avgTop12Seasons = top12Eligible.length
    ? top12Eligible.reduce((sum, p) => sum + (Number(p?.nfl?.top12) || 0), 0) / top12Eligible.length
    : 0;
  const avgTop24Seasons = top24Eligible.length
    ? top24Eligible.reduce((sum, p) => sum + (Number(p?.nfl?.top24) || 0), 0) / top24Eligible.length
    : 0;

  const avgCareerSeasons = historical.length
    ? historical.reduce((sum, p) => sum + (Number(p?.nfl?.career_seasons) || Number(p?.nfl?.seasons) || 0), 0) / historical.length
    : 5;

  return {
    multi12Rate,
    multi24Rate,
    avgTop12Seasons,
    avgTop24Seasons,
    avgCareerSeasons,
  };
})();

function computeProjectedMultiMetricsFromTargets(target12Raw, target24Raw, playerData = null, isDraftClass = false) {
  const p12 = Number(target12Raw);
  const p24 = Number(target24Raw);
  const hasT12 = Number.isFinite(p12);
  const hasT24 = Number.isFinite(p24);

  if (!hasT12 && !hasT24) {
    return {
      top12PerSeason: null,
      top24PerSeason: null,
      projMultiT12Pct: null,
      projMultiT24Pct: null,
      projTop12Seasons: null,
      projTop24Seasons: null,
    };
  }

  let target12 = hasT12 ? Math.max(0, Math.min(99, p12)) : null;
  let target24 = hasT24 ? Math.max(0, Math.min(99, p24)) : null;

  const projTop12Seasons = target12 != null
    ? Math.max(0, target12 / 100 * PROJECTED_MULTI_BASELINES.avgCareerSeasons)
    : null;
  const projTop24Seasons = target24 != null
    ? Math.max(0, target24 / 100 * PROJECTED_MULTI_BASELINES.avgCareerSeasons)
    : null;

  const poissonAtLeastTwoPct = (expectedSeasons) => {
    if (!Number.isFinite(expectedSeasons) || expectedSeasons <= 0) return 0;
    const l = Math.max(0, expectedSeasons);
    return (1 - Math.exp(-l) * (1 + l)) * 100;
  };

  const linearMulti12 = target12 != null
    ? Math.max(0, Math.min(100, target12 * PROJECTED_MULTI_BASELINES.multi12Rate))
    : null;
  const linearMulti24 = target24 != null
    ? Math.max(0, Math.min(100, target24 * PROJECTED_MULTI_BASELINES.multi24Rate))
    : null;

  const poissonMulti12 = projTop12Seasons != null ? poissonAtLeastTwoPct(projTop12Seasons) : null;
  const poissonMulti24 = projTop24Seasons != null ? poissonAtLeastTwoPct(projTop24Seasons) : null;

  const lowEndDampen = (targetPct, multiPct, isTop24 = false) => {
    if (!Number.isFinite(targetPct) || !Number.isFinite(multiPct)) return multiPct;
    if (targetPct <= 1) return 0;
    if (!isTop24) {
      if (targetPct < 5) return multiPct * 0.25;
      if (targetPct < 10) return multiPct * 0.45;
      if (targetPct < 18) return multiPct * 0.65;
      if (targetPct < 28) return multiPct * 0.82;
      return multiPct;
    }
    if (targetPct < 8) return multiPct * 0.35;
    if (targetPct < 15) return multiPct * 0.55;
    if (targetPct < 25) return multiPct * 0.72;
    if (targetPct < 35) return multiPct * 0.88;
    return multiPct;
  };

  let projMultiT12Pct = linearMulti12 != null && poissonMulti12 != null
    ? Math.max(linearMulti12, 0.55 * poissonMulti12 + 0.45 * linearMulti12)
    : linearMulti12;
  let projMultiT24Pct = linearMulti24 != null && poissonMulti24 != null
    ? Math.max(linearMulti24, 0.55 * poissonMulti24 + 0.45 * linearMulti24)
    : linearMulti24;

  projMultiT12Pct = target12 != null ? lowEndDampen(target12, projMultiT12Pct, false) : projMultiT12Pct;
  projMultiT24Pct = target24 != null ? lowEndDampen(target24, projMultiT24Pct, true) : projMultiT24Pct;

  if (isDraftClass && playerData) {
    const eliteComposite = 0.5 * (Number(playerData?.prospect_score) || 0)
      + 0.25 * (Number(playerData?.prod_trajectory) || 0)
      + 0.1 * (Number(playerData?.athl_score) || 0)
      + 0.15 * (Number(playerData?.pff_score) || 0);
    const eliteFactor = Math.max(0, Math.min(1, (eliteComposite - 82) / 12));
    projMultiT12Pct = projMultiT12Pct != null ? Math.min(100, projMultiT12Pct * (1 + 0.28 * eliteFactor)) : null;
    projMultiT24Pct = projMultiT24Pct != null ? Math.min(100, projMultiT24Pct * (1 + 0.22 * eliteFactor)) : null;
  }

  return {
    top12PerSeason: target12,
    top24PerSeason: target24,
    projMultiT12Pct,
    projMultiT24Pct,
    projTop12Seasons,
    projTop24Seasons,
  };
}

function NFLPanel({nfl, accent, isDraftClass, projT12, projT24, projT12Rank, projT24Rank, totalPlayers, draftClass, playerData, allData}) {
  const [projChartMode, setProjChartMode] = React.useState("line");

  const projectionCalibration = React.useMemo(() => {
    const base12 = Number(projT12);
    const base24 = Number(projT24);
    if (!isDraftClass) {
      // Historical players: apply a prospect-score curve to pull back over-inflated
      // projections for low-profile prospects. Players at ps >= 70 are unaffected.
      const ps = Number(playerData?.prospect_score);
      const psDampen = !Number.isFinite(ps) ? 1.0
        : ps < 30 ? 0.20
        : ps < 40 ? 0.30
        : ps < 50 ? 0.50
        : ps < 60 ? 0.70
        : ps < 70 ? 0.88
        : 1.0;
      // Draft-capital correction for players not yet established in the NFL
      const careerSeasonsHist = Number(playerData?.nfl?.career_seasons) || 0;
      const draftRoundHist = Number(playerData?.draft_round);
      const roundMult = careerSeasonsHist > 0 || !Number.isFinite(draftRoundHist) ? 1.0
        : draftRoundHist <= 1 ? 1.25
        : draftRoundHist <= 2 ? 1.12
        : draftRoundHist <= 3 ? 1.05
        : draftRoundHist <= 4 ? 1.00
        : draftRoundHist <= 5 ? 0.90
        : draftRoundHist <= 6 ? 0.78
        : 0.60;
      return {
        t12: Number.isFinite(base12) ? base12 * psDampen * roundMult : null,
        t24: Number.isFinite(base24) ? base24 * psDampen * roundMult : null,
      };
    }
    if (!playerData || !Number.isFinite(base12) || !Number.isFinite(base24)) {
      return {
        t12: Number.isFinite(base12) ? base12 : null,
        t24: Number.isFinite(base24) ? base24 : null,
      };
    }

    const metricsOk = [
      Number(playerData?.prospect_score),
      Number(playerData?.prod_trajectory),
      Number(playerData?.athl_score),
      Number(playerData?.pff_score),
    ].every((v) => Number.isFinite(v));

    if (!metricsOk) {
      return { t12: base12, t24: base24 };
    }

    const historical = Object.values(ALL_PLAYERS).filter((p) => {
      if (p?.is_projection) return false;
      const nflData = p?.nfl || {};
      const hasOutcome = (Number(nflData?.top12) || 0) > 0 || (Number(nflData?.top24) || 0) > 0 || (Number(nflData?.career_seasons) || 0) > 0;
      const hasMetrics = [
        Number(p?.prospect_score),
        Number(p?.prod_trajectory),
        Number(p?.athl_score),
        Number(p?.pff_score),
      ].every((v) => Number.isFinite(v));
      return hasOutcome && hasMetrics;
    });

    if (!historical.length) {
      return { t12: base12, t24: base24 };
    }

    const tierKey = String(playerData?.tier || "").toLowerCase();
    // Conservative tier caps apply to all projection-class players regardless of year
    const tierCfg = tierKey === "elite"
      ? { compN: 28, blendComp: 0.40, uplift12: 0, uplift24: 0, floor12: 0, floor24: 0, cap12: 72, cap24: 84 }
      : tierKey === "starter"
        ? { compN: 35, blendComp: 0.38, uplift12: 0, uplift24: 0, floor12: 0, floor24: 0, cap12: 62, cap24: 76 }
        : tierKey === "rotational"
          ? { compN: 42, blendComp: 0.36, uplift12: 0, uplift24: 0, floor12: 0, floor24: 0, cap12: 52, cap24: 68 }
          : { compN: 50, blendComp: 0.35, uplift12: 0, uplift24: 0, floor12: 0, floor24: 0, cap12: 44, cap24: 60 };

    const dist = (p) => {
      const dPros = Math.abs(Number(p.prospect_score) - Number(playerData.prospect_score)) / 18;
      const dProd = Math.abs(Number(p.prod_trajectory) - Number(playerData.prod_trajectory)) / 18;
      const dAth = Math.abs(Number(p.athl_score) - Number(playerData.athl_score)) / 20;
      const dPff = Math.abs(Number(p.pff_score) - Number(playerData.pff_score)) / 18;
      return Math.sqrt(0.5 * dPros * dPros + 0.25 * dProd * dProd + 0.1 * dAth * dAth + 0.15 * dPff * dPff);
    };

    const similar = [...historical]
      .map((p) => ({ p, d: dist(p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, tierCfg.compN);

    const weightedRate = (predicate) => {
      if (!similar.length) return null;
      let wSum = 0;
      let hitSum = 0;
      similar.forEach(({ p, d }) => {
        const w = 1 / (0.06 + d);
        wSum += w;
        if (predicate(p)) hitSum += w;
      });
      return wSum > 0 ? (hitSum / wSum) * 100 : null;
    };

    const compAny12 = weightedRate((p) => (Number(p?.nfl?.top12) || 0) >= 1);
    const compAny24 = weightedRate((p) => (Number(p?.nfl?.top24) || 0) >= 1);

    const eliteComposite = 0.5 * (Number(playerData?.prospect_score) || 0)
      + 0.25 * (Number(playerData?.prod_trajectory) || 0)
      + 0.1 * (Number(playerData?.athl_score) || 0)
      + 0.15 * (Number(playerData?.pff_score) || 0);
    const eliteFactor = Math.max(0, Math.min(1, (eliteComposite - 74) / 18));

    const blended12 = compAny12 != null ? ((1 - tierCfg.blendComp) * base12 + tierCfg.blendComp * compAny12) : base12;
    const blended24 = compAny24 != null ? ((1 - tierCfg.blendComp) * base24 + tierCfg.blendComp * compAny24) : base24;

    let t12 = blended12 * (1 + tierCfg.uplift12 * eliteFactor);
    let t24 = blended24 * (1 + tierCfg.uplift24 * eliteFactor);

    t12 = Math.max(t12, base12 + tierCfg.floor12 * eliteFactor);
    t24 = Math.max(t24, base24 + tierCfg.floor24 * eliteFactor);

    t12 = Math.max(base12, Math.min(tierCfg.cap12, t12));
    t24 = Math.max(base24, Math.min(tierCfg.cap24, t24));
    t24 = Math.max(t24, t12 + 8);

    return {
      t12: Math.max(0, Math.min(99, t12)),
      t24: Math.max(0, Math.min(99, t24)),
    };
  }, [isDraftClass, playerData, projT12, projT24]);

  const calibratedProjT12 = projectionCalibration.t12;
  const calibratedProjT24 = projectionCalibration.t24;

  const buildProjectedMultiHitSummary = () => {
    const p12 = Number(calibratedProjT12);
    const p24 = Number(calibratedProjT24);
    const hasT12 = Number.isFinite(p12);
    const hasT24 = Number.isFinite(p24);
    if (!hasT12 && !hasT24) return null;

    const allHistorical = Object.values(ALL_PLAYERS).filter((p) => {
      const nflData = p?.nfl || {};
      const hasSeasons = (Number(nflData.career_seasons) || 0) > 0 || (Array.isArray(nflData.season_ranks) && nflData.season_ranks.length > 0);
      return !p?.is_projection && hasSeasons;
    });

    let cohort = allHistorical.filter((p) => {
      const nflData = p?.nfl || {};
      const t12 = Number(nflData.top12) || 0;
      const t24 = Number(nflData.top24) || 0;
      return t12 >= 2 || t24 >= 2;
    });

    // For projection-class players, re-anchor to similarly-profiled historical RBs
    // so elite profile outliers are not over-shrunk by global averages.
    if (isDraftClass && playerData) {
      const hasMetrics = [
        Number(playerData?.prospect_score),
        Number(playerData?.prod_trajectory),
        Number(playerData?.athl_score),
        Number(playerData?.pff_score),
      ].every((v) => Number.isFinite(v));

      if (hasMetrics) {
        const similarityPool = allHistorical.filter((p) => {
          return [
            Number(p?.prospect_score),
            Number(p?.prod_trajectory),
            Number(p?.athl_score),
            Number(p?.pff_score),
          ].every((v) => Number.isFinite(v));
        });

        const dist = (p) => {
          const dPros = Math.abs(Number(p.prospect_score) - Number(playerData.prospect_score)) / 20;
          const dProd = Math.abs(Number(p.prod_trajectory) - Number(playerData.prod_trajectory)) / 20;
          const dAth = Math.abs(Number(p.athl_score) - Number(playerData.athl_score)) / 20;
          const dPff = Math.abs(Number(p.pff_score) - Number(playerData.pff_score)) / 20;
          return Math.sqrt(0.45 * dPros * dPros + 0.25 * dProd * dProd + 0.15 * dAth * dAth + 0.15 * dPff * dPff);
        };

        const tierKey = String(playerData?.tier || "").toLowerCase();
        const compN = tierKey === "elite" ? 24 : tierKey === "starter" ? 32 : tierKey === "rotational" ? 40 : 48;
        const similar = [...similarityPool].sort((a, b) => dist(a) - dist(b)).slice(0, compN);
        const similarMulti = similar.filter((p) => {
          const t12 = Number(p?.nfl?.top12) || 0;
          const t24 = Number(p?.nfl?.top24) || 0;
          return t12 >= 2 || t24 >= 2;
        });

        if (similarMulti.length >= 14) {
          cohort = similarMulti;
        }
      }
    }

    if (!cohort.length) return null;

    // Use ALL historical players for unbiased multi-hit rates and career-length estimate.
    const allEligible12 = allHistorical.filter((p) => (Number(p?.nfl?.top12) || 0) >= 1);
    const allEligible24 = allHistorical.filter((p) => (Number(p?.nfl?.top24) || 0) >= 1);

    const multi12Rate = allEligible12.length
      ? allEligible12.filter((p) => (Number(p?.nfl?.top12) || 0) >= 2).length / allEligible12.length
      : 0;
    const multi24Rate = allEligible24.length
      ? allEligible24.filter((p) => (Number(p?.nfl?.top24) || 0) >= 2).length / allEligible24.length
      : 0;

    const avgCareerSeasons = allHistorical.length
      ? allHistorical.reduce((sum, p) => sum + (Number(p?.nfl?.career_seasons) || Number(p?.nfl?.seasons) || 0), 0) / allHistorical.length
      : 5;

    let target12 = hasT12 ? Math.max(0, Math.min(99, p12)) : null;
    let target24 = hasT24 ? Math.max(0, Math.min(99, p24)) : null;

    const projTop12Seasons = target12 != null ? Math.max(0, target12 / 100 * avgCareerSeasons) : null;
    const projTop24Seasons = target24 != null ? Math.max(0, target24 / 100 * avgCareerSeasons) : null;

    const poissonAtLeastTwoPct = (expectedSeasons) => {
      if (!Number.isFinite(expectedSeasons) || expectedSeasons <= 0) return 0;
      const l = Math.max(0, expectedSeasons);
      return (1 - Math.exp(-l) * (1 + l)) * 100;
    };

    const linearMulti12 = target12 != null ? Math.max(0, Math.min(100, target12 * multi12Rate)) : null;
    const linearMulti24 = target24 != null ? Math.max(0, Math.min(100, target24 * multi24Rate)) : null;
    const poissonMulti12 = projTop12Seasons != null ? poissonAtLeastTwoPct(projTop12Seasons) : null;
    const poissonMulti24 = projTop24Seasons != null ? poissonAtLeastTwoPct(projTop24Seasons) : null;

    const lowEndDampen = (targetPct, multiPct, isTop24 = false) => {
      if (!Number.isFinite(targetPct) || !Number.isFinite(multiPct)) return multiPct;
      if (targetPct <= 1) return 0;
      if (!isTop24) {
        if (targetPct < 5) return multiPct * 0.25;
        if (targetPct < 10) return multiPct * 0.45;
        if (targetPct < 18) return multiPct * 0.65;
        if (targetPct < 28) return multiPct * 0.82;
        return multiPct;
      }
      if (targetPct < 8) return multiPct * 0.35;
      if (targetPct < 15) return multiPct * 0.55;
      if (targetPct < 25) return multiPct * 0.72;
      if (targetPct < 35) return multiPct * 0.88;
      return multiPct;
    };

    let projMultiT12Pct = linearMulti12 != null && poissonMulti12 != null
      ? Math.max(linearMulti12, 0.55 * poissonMulti12 + 0.45 * linearMulti12)
      : linearMulti12;
    let projMultiT24Pct = linearMulti24 != null && poissonMulti24 != null
      ? Math.max(linearMulti24, 0.55 * poissonMulti24 + 0.45 * linearMulti24)
      : linearMulti24;

    projMultiT12Pct = target12 != null ? lowEndDampen(target12, projMultiT12Pct, false) : projMultiT12Pct;
    projMultiT24Pct = target24 != null ? lowEndDampen(target24, projMultiT24Pct, true) : projMultiT24Pct;

    // Elite projection profiles get a modest data-backed upside correction.
    if (isDraftClass && playerData) {
      const eliteComposite = 0.5 * (Number(playerData?.prospect_score) || 0)
        + 0.25 * (Number(playerData?.prod_trajectory) || 0)
        + 0.1 * (Number(playerData?.athl_score) || 0)
        + 0.15 * (Number(playerData?.pff_score) || 0);
      const eliteFactor = Math.max(0, Math.min(1, (eliteComposite - 82) / 12));
      projMultiT12Pct = projMultiT12Pct != null ? Math.min(100, projMultiT12Pct * (1 + 0.10 * eliteFactor)) : null;
      projMultiT24Pct = projMultiT24Pct != null ? Math.min(100, projMultiT24Pct * (1 + 0.08 * eliteFactor)) : null;
    }

    const dist12 = Array.from({ length: 10 }, () => 0);
    const dist24 = Array.from({ length: 10 }, () => 0);
    cohort.forEach((p) => {
      const draftYear = Number(p?.draft_class);
      if (!Number.isFinite(draftYear)) return;
      const ranks = Array.isArray(p?.nfl?.season_ranks) ? p.nfl.season_ranks : [];
      ranks.forEach((row) => {
        const yr = Number(row?.year);
        const rk = Number(row?.rank);
        if (!Number.isFinite(yr) || !Number.isFinite(rk)) return;
        const idx = yr - draftYear;
        if (idx < 0 || idx > 9) return;
        if (rk <= 24) dist24[idx] += 1;
        if (rk <= 12) dist12[idx] += 1;
      });
    });

    const sum12 = dist12.reduce((a, b) => a + b, 0);
    const sum24 = dist24.reduce((a, b) => a + b, 0);
    const fallbackShares = [0.17, 0.20, 0.17, 0.13, 0.10, 0.08, 0.06, 0.04, 0.03, 0.02];

    const stabilizeShares = (rawShares) => {
      // Blend with fallback curve and smooth to avoid noisy tail spikes from sparse seasons.
      const blended = rawShares.map((v, i) => 0.7 * v + 0.3 * fallbackShares[i]);
      const smoothed = blended.map((_, i) => {
        const a = blended[Math.max(0, i - 1)];
        const b = blended[i];
        const c = blended[Math.min(9, i + 1)];
        return (a + b + c) / 3;
      });

      // Force a realistic aging curve in the back half: once past year 5,
      // yearly mass should not jump up versus the previous year.
      const tapered = [...smoothed];
      for (let i = 5; i < tapered.length; i += 1) {
        const maxAllowed = tapered[i - 1] * 0.95;
        tapered[i] = Math.min(tapered[i], maxAllowed);
      }

      const total = tapered.reduce((s, v) => s + v, 0);
      return total > 0 ? tapered.map((v) => v / total) : fallbackShares;
    };

    const rawShares12 = dist12.map((v, i) => sum12 > 0 ? v / sum12 : fallbackShares[i]);
    const rawShares24 = dist24.map((v, i) => sum24 > 0 ? v / sum24 : fallbackShares[i]);
    const shares12 = stabilizeShares(rawShares12);
    const shares24 = stabilizeShares(rawShares24);

    // Convert career-level any-season hit probability into per-year probabilities
    // using a calibrated hazard curve rather than a simple linear split.
    const solveYearlyHazards = (targetPct, weights) => {
      if (targetPct == null) return Array.from({ length: 10 }, () => null);
      const target = Math.max(0, Math.min(0.99, targetPct / 100));
      if (target <= 0) return Array.from({ length: 10 }, () => 0);

      const hitProb = (k) => {
        const miss = weights.reduce((prod, w) => {
          const h = Math.max(0, Math.min(0.95, k * w));
          return prod * (1 - h);
        }, 1);
        return 1 - miss;
      };

      let lo = 0;
      let hi = 8;
      while (hitProb(hi) < target && hi < 128) hi *= 2;
      for (let i = 0; i < 36; i += 1) {
        const mid = (lo + hi) / 2;
        if (hitProb(mid) < target) lo = mid;
        else hi = mid;
      }

      const k = (lo + hi) / 2;
      return weights.map((w) => Math.max(0, Math.min(95, (Math.max(0, Math.min(0.95, k * w))) * 100)));
    };

    const yearlyTop12raw = solveYearlyHazards(target12, shares12);
    const yearlyTop24raw = solveYearlyHazards(target24, shares24);

    // Low-end curve: depress per-season hit %s for lower-rated profiles.
    // Players with target >= 28% are unaffected; the multiplier steepens as target drops toward 0.
    const perSeasonDampen = (targetPct, v) => {
      if (v == null || !Number.isFinite(v)) return v;
      if (!Number.isFinite(targetPct) || targetPct <= 0) return 0;
      if (targetPct < 5) return v * 0.35;
      if (targetPct < 10) return v * 0.55;
      if (targetPct < 18) return v * 0.72;
      if (targetPct < 28) return v * 0.87;
      return v;
    };

    // Keep Top-24 above Top-12 without forcing unrealistic floors for low-end profiles.
    const yearlyTop12 = yearlyTop12raw.map((v) => perSeasonDampen(target12, v));
    const yearlyTop24dampened = yearlyTop24raw.map((v) => perSeasonDampen(target24, v));
    const yearlyTop24 = yearlyTop24dampened.map((v24, i) => {
      const v12 = yearlyTop12[i];
      if (v12 == null || v24 == null) return v24;
      const perYearMinGap = Math.max(0.1, 0.08 * Number(v12));
      return Math.max(Number(v24), Number(v12) + perYearMinGap);
    });

    const baseDraftYear = Number(draftClass);
    const startYear = Number.isFinite(baseDraftYear) ? baseDraftYear : new Date().getFullYear();
    const yearly = Array.from({ length: 10 }, (_, i) => ({
      year: startYear + i,
      top12: yearlyTop12[i],
      top24: yearlyTop24[i],
    }));

    const playerAvgTop12Yearly = yearly.filter((d) => d.top12 != null).reduce((s, d) => s + (d.top12 || 0), 0) / 10;
    const playerAvgTop24Yearly = yearly.filter((d) => d.top24 != null).reduce((s, d) => s + (d.top24 || 0), 0) / 10;

    const historical = Object.values(ALL_PLAYERS).filter((p) => {
      const draftYr = Number(p?.draft_class);
      if (p?.is_projection || !Number.isFinite(draftYr)) return false;
      const nflData = p?.nfl || {};
      const career = Number(nflData?.career_seasons);
      const ranks = Array.isArray(nflData?.season_ranks) ? nflData.season_ranks : [];
      return (Number.isFinite(career) && career > 0) || ranks.length > 0;
    });

    const buildYearHitMap = (p) => {
      const draftYr = Number(p?.draft_class);
      const ranks = Array.isArray(p?.nfl?.season_ranks) ? p.nfl.season_ranks : [];
      const map = new Map();
      ranks.forEach((r) => {
        const yr = Number(r?.year);
        const rk = Number(r?.rank);
        if (!Number.isFinite(yr) || !Number.isFinite(rk)) return;
        const idx = yr - draftYr;
        if (idx < 0 || idx > 9) return;
        map.set(idx, Math.min(map.get(idx) ?? 999, rk));
      });
      return map;
    };

    const inferCareerSeasons = (p, hitMap) => {
      const explicitCareer = Number(p?.nfl?.career_seasons);
      if (Number.isFinite(explicitCareer) && explicitCareer > 0) return explicitCareer;
      if (!hitMap.size) return 0;
      return Math.max(...Array.from(hitMap.keys())) + 1;
    };

    const yearStats12 = Array.from({ length: 10 }, (_, i) => {
      let eligible = 0;
      let hits = 0;
      historical.forEach((p) => {
        const hitMap = buildYearHitMap(p);
        const careerSeasons = inferCareerSeasons(p, hitMap);
        if (careerSeasons <= i) return;
        eligible += 1;
        const bestRank = hitMap.get(i);
        if (Number.isFinite(bestRank) && bestRank <= 12) hits += 1;
      });
      return { eligible, hits, rate: eligible > 0 ? (hits / eligible) * 100 : null };
    });

    const yearStats24 = Array.from({ length: 10 }, (_, i) => {
      let eligible = 0;
      let hits = 0;
      historical.forEach((p) => {
        const hitMap = buildYearHitMap(p);
        const careerSeasons = inferCareerSeasons(p, hitMap);
        if (careerSeasons <= i) return;
        eligible += 1;
        const bestRank = hitMap.get(i);
        if (Number.isFinite(bestRank) && bestRank <= 24) hits += 1;
      });
      return { eligible, hits, rate: eligible > 0 ? (hits / eligible) * 100 : null };
    });

    const yearRate12 = yearStats12.map((s) => s.rate);
    const yearRate24 = yearStats24.map((s) => s.rate);
    const yearEligible12 = yearStats12.map((s) => s.eligible);
    const yearEligible24 = yearStats24.map((s) => s.eligible);

    const validDb12 = yearRate12.filter((v) => v != null);
    const validDb24 = yearRate24.filter((v) => v != null);
    const dbAvgTop12Yearly = validDb12.length ? validDb12.reduce((s, v) => s + v, 0) / validDb12.length : 0;
    const dbAvgTop24Yearly = validDb24.length ? validDb24.reduce((s, v) => s + v, 0) / validDb24.length : 0;

    const fillSeriesForPlot = (arr) => {
      const out = [...arr];
      const firstIdx = out.findIndex((v) => v != null);
      if (firstIdx === -1) return Array.from({ length: 10 }, () => 0);
      for (let i = 0; i < firstIdx; i += 1) out[i] = out[firstIdx];
      for (let i = firstIdx + 1; i < out.length; i += 1) {
        if (out[i] == null) out[i] = out[i - 1];
      }
      return out.map((v) => Number(v) || 0);
    };

    const buildMonotoneDbTrend = (rates, eligibles) => {
      const filled = fillSeriesForPlot(rates);
      const smooth = filled.map((_, i) => {
        const a = filled[Math.max(0, i - 1)];
        const b = filled[i];
        const c = filled[Math.min(9, i + 1)];
        return 0.2 * a + 0.6 * b + 0.2 * c;
      });

      const out = [...smooth];
      const baseEligible = Math.max(1, Number(eligibles?.[0]) || 1);

      // Very strict tail control: no re-acceleration and increasing shrinkage as sample thins.
      for (let i = 1; i < out.length; i += 1) {
        const rel = Math.max(0.05, Math.min(1, (Number(eligibles?.[i]) || 0) / baseEligible));
        const blended = rel * out[i] + (1 - rel) * (out[i - 1] * 0.96);
        const cap = out[i - 1] * (i < 3 ? 1.01 : 0.98);
        out[i] = Math.min(blended, cap);
      }

      return out.map((v) => Math.max(0, v));
    };

    const dbYearRate12Plot = buildMonotoneDbTrend(yearRate12, yearEligible12);
    const dbYearRate24Plot = buildMonotoneDbTrend(yearRate24, yearEligible24);

    return {
      cohortN: cohort.length,
      projMultiT12Pct,
      projMultiT24Pct,
      projTop12Seasons,
      projTop24Seasons,
      playerAvgTop12Yearly,
      playerAvgTop24Yearly,
      dbYearRate12Plot,
      dbYearRate24Plot,
      dbAvgTop12Yearly,
      dbAvgTop24Yearly,
      yearly,
    };
  };

  const projectionSummary = buildProjectedMultiHitSummary();

  const projectionPeerContext = React.useMemo(() => {
    if (!projectionSummary) return null;

    const source = allData && Object.keys(allData).length ? allData : ALL_PLAYERS;
    const computed = Object.values(source || {})
      .map((p) => computeProjectedMultiMetricsFromTargets(p?.proj_t12, p?.proj_t24, p, !!p?.is_projection));

    const vals12 = computed.map((m) => Number(m.projMultiT12Pct)).filter((v) => Number.isFinite(v));
    const vals24 = computed.map((m) => Number(m.projMultiT24Pct)).filter((v) => Number.isFinite(v));

    const percentile = (arr, val) => {
      const n = Number(val);
      if (!arr.length || !Number.isFinite(n)) return null;
      const ltCount = arr.filter((x) => x < n).length;
      const eqCount = arr.filter((x) => x === n).length;
      const rank = ltCount + 0.5 * eqCount;
      return (rank / arr.length) * 100;
    };

    const quality = (p) => {
      if (!Number.isFinite(p)) return "unrated";
      if (p >= 90) return "elite";
      if (p >= 75) return "strong";
      if (p >= 45) return "average";
      if (p >= 25) return "below average";
      return "low";
    };

    const p12Pct = percentile(vals12, projectionSummary.projMultiT12Pct);
    const p24Pct = percentile(vals24, projectionSummary.projMultiT24Pct);
    const seasons12Vals = computed.map((m) => Number(m.projTop12Seasons)).filter((v) => Number.isFinite(v));
    const seasons24Vals = computed.map((m) => Number(m.projTop24Seasons)).filter((v) => Number.isFinite(v));
    const p12SeasonsPct = percentile(seasons12Vals, projectionSummary.projTop12Seasons);
    const p24SeasonsPct = percentile(seasons24Vals, projectionSummary.projTop24Seasons);

    return {
      p12Pct,
      p24Pct,
      p12Quality: quality(p12Pct),
      p24Quality: quality(p24Pct),
      p12SeasonsPct,
      p24SeasonsPct,
      p12SeasonsQuality: quality(p12SeasonsPct),
      p24SeasonsQuality: quality(p24SeasonsPct),
    };
  }, [projectionSummary, allData]);

  const peerProjectionLines = React.useMemo(() => {
    const fallbackShares = [0.17, 0.20, 0.17, 0.13, 0.10, 0.08, 0.06, 0.04, 0.03, 0.02];
    const source = allData && Object.keys(allData).length ? allData : ALL_PLAYERS;
    return Object.values(source || {})
      .filter((p) => p !== playerData && Number.isFinite(Number(p?.proj_t12)))
      .map((p) => ({
        t12: fallbackShares.map((s) => (Number(p.proj_t12) || 0) * s),
        t24: fallbackShares.map((s) => (Number(p.proj_t24) || 0) * s),
      }));
  }, [allData, playerData]);

  const projectionMultiBlock = projectionSummary && (
    <div style={{marginTop:10,padding:"10px 10px 12px",background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.06)"}}>
      <div style={{fontSize:9,color:"#666",letterSpacing:1.2,marginBottom:6}}>PROJECTED MULTI-FINISH MODEL (10-YEAR)</div>
      <div style={{fontSize:10,color:"#555",lineHeight:1.5,marginBottom:8}}>
        Uses historical RBs with multiple top finishes (2+ top-12 or 2+ top-24) to convert projected hit rates into projected multi-hit odds, projected total hit seasons, and year-by-year probabilities.
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"8px 9px",textAlign:"center"}}>
          <div style={{fontSize:9,color:"#666"}}>Projected Multi Top-12 Chance</div>
          <div style={{fontSize:18,fontWeight:800,color:"#f0c040"}}>{projectionSummary.projMultiT12Pct!=null?projectionSummary.projMultiT12Pct.toFixed(1)+"%":"-"}</div>
          <details style={{marginTop:6,textAlign:"left"}}>
            <summary style={{fontSize:8,color:"#888",cursor:"pointer",listStylePosition:"inside"}}>What this means</summary>
            <div style={{fontSize:8,color:"#777",lineHeight:1.45,marginTop:5}}>
              This is the modeled chance that the player records at least two top-12 fantasy seasons over the first 10 NFL seasons.
              {projectionPeerContext?.p12Pct != null
                ? ` At ${projectionSummary.projMultiT12Pct.toFixed(1)}%, he grades around the ${toOrdinal(projectionPeerContext.p12Pct)} percentile in this database, which is ${projectionPeerContext.p12Quality}.`
                : " Database-relative percentile is unavailable for this profile."}
            </div>
          </details>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"8px 9px",textAlign:"center"}}>
          <div style={{fontSize:9,color:"#666"}}>Projected Multi Top-24 Chance</div>
          <div style={{fontSize:18,fontWeight:800,color:"#5dbf6a"}}>{projectionSummary.projMultiT24Pct!=null?projectionSummary.projMultiT24Pct.toFixed(1)+"%":"-"}</div>
          <details style={{marginTop:6,textAlign:"left"}}>
            <summary style={{fontSize:8,color:"#888",cursor:"pointer",listStylePosition:"inside"}}>What this means</summary>
            <div style={{fontSize:8,color:"#777",lineHeight:1.45,marginTop:5}}>
              This is the modeled chance that the player records at least two top-24 fantasy seasons over the first 10 NFL seasons.
              {projectionPeerContext?.p24Pct != null
                ? ` At ${projectionSummary.projMultiT24Pct.toFixed(1)}%, he grades around the ${toOrdinal(projectionPeerContext.p24Pct)} percentile in this database, which is ${projectionPeerContext.p24Quality}.`
                : " Database-relative percentile is unavailable for this profile."}
            </div>
          </details>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"8px 9px",textAlign:"center"}}>
          <div style={{fontSize:9,color:"#666"}}>Projected Top-12 Seasons</div>
          <div style={{fontSize:18,fontWeight:800,color:"#f0c040"}}>{projectionSummary.projTop12Seasons!=null?projectionSummary.projTop12Seasons.toFixed(2):"-"}</div>
          <details style={{marginTop:6,textAlign:"left"}}>
            <summary style={{fontSize:8,color:"#888",cursor:"pointer",listStylePosition:"inside"}}>What this means</summary>
            <div style={{fontSize:8,color:"#777",lineHeight:1.45,marginTop:5}}>
              This is the model's expected total number of top-12 seasons across a 10-year career window.
              {projectionPeerContext?.p12SeasonsPct != null
                ? ` Compared with the database, this profile's projected top-12 seasons sits around the ${toOrdinal(projectionPeerContext.p12SeasonsPct)} percentile (${projectionPeerContext.p12SeasonsQuality}).`
                : " Database-relative percentile is unavailable for this profile."}
            </div>
          </details>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"8px 9px",textAlign:"center"}}>
          <div style={{fontSize:9,color:"#666"}}>Projected Top-24 Seasons</div>
          <div style={{fontSize:18,fontWeight:800,color:"#5dbf6a"}}>{projectionSummary.projTop24Seasons!=null?projectionSummary.projTop24Seasons.toFixed(2):"-"}</div>
          <details style={{marginTop:6,textAlign:"left"}}>
            <summary style={{fontSize:8,color:"#888",cursor:"pointer",listStylePosition:"inside"}}>What this means</summary>
            <div style={{fontSize:8,color:"#777",lineHeight:1.45,marginTop:5}}>
              This is the model's expected total number of top-24 seasons across a 10-year career window.
              {projectionPeerContext?.p24SeasonsPct != null
                ? ` Compared with the database, this profile's projected top-24 seasons sits around the ${toOrdinal(projectionPeerContext.p24SeasonsPct)} percentile (${projectionPeerContext.p24SeasonsQuality}).`
                : " Database-relative percentile is unavailable for this profile."}
            </div>
          </details>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:9,color:"#666"}}>10-year projected per-season hit percentages (starting at draft year)</div>
        <div style={{display:"flex",gap:6}}>
          <button
            onClick={() => setProjChartMode("line")}
            style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.14)",background:projChartMode==="line"?"rgba(93,191,106,0.18)":"rgba(255,255,255,0.04)",color:projChartMode==="line"?"#d7f1db":"#888",cursor:"pointer"}}
          >Line</button>
          <button
            onClick={() => setProjChartMode("bar")}
            style={{fontSize:9,padding:"3px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.14)",background:projChartMode==="bar"?"rgba(240,192,64,0.16)":"rgba(255,255,255,0.04)",color:projChartMode==="bar"?"#f7dd96":"#888",cursor:"pointer"}}
          >Bar</button>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        {(() => {
          const w = 620;
          const h = 220;
          const padL = 34;
          const padR = 10;
          const padT = 12;
          const padB = 34;
          const years = projectionSummary.yearly;
          const maxVal = Math.max(
            5,
            ...years.map((d) => Math.max(Number(d.top12) || 0, Number(d.top24) || 0)),
          );
          const xAt = (i) => padL + (i * (w - padL - padR)) / Math.max(1, years.length - 1);
          const yAt = (v) => padT + (1 - (v / maxVal)) * (h - padT - padB);
          const p12 = years.map((d, i) => `${xAt(i)},${yAt(Number(d.top12) || 0)}`).join(" ");
          const p24 = years.map((d, i) => `${xAt(i)},${yAt(Number(d.top24) || 0)}`).join(" ");

          const step = (w - padL - padR) / Math.max(1, years.length - 1);
          const barW = Math.max(8, step * 0.28);

          return (
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <rect x="0" y="0" width={w} height={h} fill="rgba(0,0,0,0.18)" rx="8" />
              {[0, 0.25, 0.5, 0.75, 1].map((k) => {
                const y = padT + k * (h - padT - padB);
                const val = ((1 - k) * maxVal).toFixed(1) + "%";
                return (
                  <g key={k}>
                    <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                    <text x={4} y={y + 3} fill="#666" fontSize="8">{val}</text>
                  </g>
                );
              })}



              {projChartMode === "line" ? (
                <>
                  {peerProjectionLines.map((peer, pi) => {
                    const pp12 = peer.t12.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
                    const pp24 = peer.t24.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
                    return (
                      <g key={pi}>
                        <polyline points={pp24} fill="none" stroke="#5dbf6a" strokeWidth="0.7" opacity="0.07" />
                        <polyline points={pp12} fill="none" stroke="#f0c040" strokeWidth="0.7" opacity="0.07" />
                      </g>
                    );
                  })}
                  <polyline points={p24} fill="none" stroke="#5dbf6a" strokeWidth="2" />
                  <polyline points={p12} fill="none" stroke="#f0c040" strokeWidth="2" />
                  {years.map((d, i) => {
                    const t12 = Number(d.top12) || 0;
                    const t24 = Number(d.top24) || 0;
                    return (
                      <g key={d.year}>
                        <circle cx={xAt(i)} cy={yAt(t24)} r="2" fill="#5dbf6a" />
                        <circle cx={xAt(i)} cy={yAt(t12)} r="2" fill="#f0c040" />
                        <text x={xAt(i)} y={yAt(t24) - 6} fill="#5dbf6a" fontSize="7" textAnchor="middle">{t24.toFixed(1)}%</text>
                        <text x={xAt(i)} y={yAt(t12) - 6} fill="#f0c040" fontSize="7" textAnchor="middle">{t12.toFixed(1)}%</text>
                      </g>
                    );
                  })}
                </>
              ) : (
                <>
                  {years.map((d, i) => {
                    const x = xAt(i);
                    const t12 = Number(d.top12) || 0;
                    const t24 = Number(d.top24) || 0;
                    const y12 = yAt(t12);
                    const y24 = yAt(t24);
                    return (
                      <g key={d.year}>
                        <rect x={x - barW - 1} y={y12} width={barW} height={Math.max(1, h - padB - y12)} fill="#f0c040cc" rx="2" />
                        <rect x={x + 1} y={y24} width={barW} height={Math.max(1, h - padB - y24)} fill="#5dbf6acc" rx="2" />
                        <text x={x - barW * 0.5 - 1} y={y12 - 4} fill="#f0c040" fontSize="7" textAnchor="middle">{t12.toFixed(1)}%</text>
                        <text x={x + barW * 0.5 + 1} y={y24 - 4} fill="#5dbf6a" fontSize="7" textAnchor="middle">{t24.toFixed(1)}%</text>
                      </g>
                    );
                  })}
                </>
              )}

              {years.map((d, i) => (
                <text key={"x" + d.year} x={xAt(i)} y={h - 10} fill="#666" fontSize="8" textAnchor="middle">{String(d.year).slice(-2)}</text>
              ))}

            </svg>
          );
        })()}
      </div>

      <div style={{display:"flex",gap:12,marginTop:4,fontSize:9,color:"#666"}}>
        <span><span style={{color:"#f0c040",fontWeight:700}}>Top-12</span> yearly %</span>
        <span><span style={{color:"#5dbf6a",fontWeight:700}}>Top-24</span> yearly %</span>

        <span style={{marginLeft:"auto"}}>Cohort n={projectionSummary.cohortN} · Calibrated to any-season hit rates</span>
      </div>
      <details style={{marginTop:8,borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:6}}>
        <summary style={{fontSize:8,color:"#888",cursor:"pointer",listStylePosition:"inside",userSelect:"none"}}>What do the percentages per year mean?</summary>
        <div style={{fontSize:8,color:"#777",lineHeight:1.55,marginTop:6}}>
          <div style={{marginBottom:5}}>Each bar/point shows the <strong style={{color:"#aaa"}}>modeled probability</strong> that this player finishes as a <span style={{color:"#f0c040",fontWeight:700}}>top-12</span> or <span style={{color:"#5dbf6a",fontWeight:700}}>top-24</span> fantasy RB <em>in that specific season year</em> of their NFL career (Year 1 = draft year).</div>
          <div style={{marginBottom:5}}>For example, a <strong style={{color:"#aaa"}}>15% top-12 probability in Year 3</strong> means the model estimates roughly a 1-in-7 chance the player lands as a top-12 fantasy RB in their third NFL season. Each year is an independent estimate — they are not cumulative.</div>
          <div>Probabilities are derived by distributing the player's overall career hit rate across a realistic RB aging curve, calibrated from historical outcomes of similarly-profiled players. Peak likelihood typically falls in years 2–4; the curve naturally tapers in later seasons as career attrition rises.</div>
        </div>
      </details>
    </div>
  );

  if (isDraftClass) {
    const hasDraftInfo = !!(playerData?.draft_round && playerData.draft_round !== '' && playerData.draft_round !== 'UDFA') ||
      !!(playerData?.draft_pick && playerData.draft_pick !== '');
    return (
      <div style={{padding:"10px 0"}}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:26,marginBottom:8}}>★</div>
          <div style={{fontSize:13,color:"#00838f",fontWeight:700}}>{draftClass || "Draft"} Projection Class</div>
          <div style={{fontSize:11,color:"#555",marginTop:5}}>
            {hasDraftInfo
              ? `Rd ${playerData.draft_round}, Pick #${playerData.draft_pick || "—"} · No NFL data yet`
              : "Not yet drafted"}
          </div>
        </div>
        {hasDraftInfo&&(
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[["Draft Round",playerData.draft_round==="UDFA"?"UDFA":"Rd "+playerData.draft_round,accent],
              ["Draft Pick",playerData.draft_pick==="UDFA"?"UDFA":"#"+playerData.draft_pick,"#aaa"]
            ].map(([l,v,c])=>(
              <div key={l} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 12px",textAlign:"center"}}>
                <div style={{fontSize:9,color:"#555",marginBottom:1}}>{l}</div>
                <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        )}
        {(calibratedProjT12!=null||calibratedProjT24!=null)&&(
          <div>
            <div style={{fontSize:10,color:"#555",letterSpacing:2,marginBottom:8}}>PROJECTED HIT RATES</div>
            <div style={{fontSize:11,color:"#555",lineHeight:1.65,marginBottom:10}}>
              Based on historical outcomes of similarly-scored RBs (prospect score ±5, production ±5, athletic ±5, PFF board ±5).{hasDraftInfo ? " Draft capital factored in." : " Draft capital excluded — not yet drafted."} These percentages reflect the projected likelihood that the player hits top-12 or top-24 <em>in any season of their NFL career</em>, not specifically in year one.
            </div>
            <div style={{display:"flex",gap:8}}>
              {[[calibratedProjT12,projT12Rank,"TOP-12","#f0c040"],[calibratedProjT24,projT24Rank,"TOP-24","#5dbf6a"]].map(([val,rank,lbl,c])=>(
                <div key={lbl} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"12px 10px",textAlign:"center",border:"1px solid "+c+"22"}}>
                  <div style={{fontSize:9,color:"#555",letterSpacing:1,marginBottom:4}}>{lbl} / SEASON</div>
                  <div style={{fontSize:28,fontWeight:900,color:val>=40?"#f0c040":val>=20?"#5dbf6a":val>=10?"#4da6ff":"#888",lineHeight:1}}>
                    {val!=null?val.toFixed(1)+"%":"—"}
                  </div>
                  <div style={{fontSize:9,color:"#555",marginTop:4}}>
                    {rank!=null?"#"+rank+" of "+(totalPlayers||194)+" players":""}
                  </div>
                  <div style={{fontSize:9,color:"#444",marginTop:2}}>
                    {val>=40?"Strong likelihood":val>=20?"Moderate likelihood":val>=10?"Below avg likelihood":"Low likelihood"}
                  </div>
                </div>
              ))}
            </div>
            {projectionMultiBlock}
          </div>
        )}
      </div>
    );
  }
  const hasDraftData = !!(playerData?.draft_round && playerData.draft_round !== '' && playerData.draft_round !== 'UDFA') ||
    !!(playerData?.draft_pick && playerData.draft_pick !== '');
  if (!nfl && !hasDraftData) return <div style={{padding:"20px 0",color:"#444",fontSize:11,textAlign:"center"}}>No fantasy data available</div>;

  if (hasDraftData && !nfl) {
    return (
      <div style={{padding:"10px 0"}}>
        <div style={{fontSize:11,color:"#555",marginBottom:14}}>
          <strong>Drafted {draftClass || "2025"}:</strong> No fantasy data available yet. Projections below based on scouting profile.
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[["Draft Round",playerData.draft_round==="UDFA"?"UDFA":"Rd "+playerData.draft_round,"#00838f"],
            ["Draft Pick",playerData.draft_pick==="UDFA"?"UDFA":"#"+playerData.draft_pick,"#aaa"]
          ].map(([l,v,c])=>(
            <div key={l} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#555",marginBottom:1}}>{l}</div>
              <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        {(calibratedProjT12!=null||calibratedProjT24!=null)&&(
          <div>
            <div style={{fontSize:10,color:"#555",letterSpacing:2,marginBottom:8}}>PROJECTED HIT RATES</div>
            <div style={{fontSize:11,color:"#555",lineHeight:1.65,marginBottom:10}}>
              Based on historical outcomes of similarly-scored RBs with this profile (prospect score ±5, production ±5, athletic ±5, PFF board ±5) and draft capital. These percentages reflect the projected likelihood that the player hits top-12 or top-24 <em>in any season of their NFL career</em>.
            </div>
            <div style={{display:"flex",gap:8}}>
              {[[calibratedProjT12,projT12Rank,"TOP-12","#f0c040"],[calibratedProjT24,projT24Rank,"TOP-24","#5dbf6a"]].map(([val,rank,lbl,c])=>(
                <div key={lbl} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"12px 10px",textAlign:"center",border:"1px solid "+c+"22"}}>
                  <div style={{fontSize:9,color:"#555",letterSpacing:1,marginBottom:4}}>{lbl} / SEASON</div>
                  <div style={{fontSize:28,fontWeight:900,color:val>=40?"#f0c040":val>=20?"#5dbf6a":val>=10?"#4da6ff":"#888",lineHeight:1}}>
                    {val!=null?val.toFixed(1)+"%":"—"}
                  </div>
                  <div style={{fontSize:9,color:"#555",marginTop:4}}>
                    {rank!=null?"#"+rank+" of "+(totalPlayers||194)+" players":""}
                  </div>
                  <div style={{fontSize:9,color:"#444",marginTop:2}}>
                    {val>=40?"Strong likelihood":val>=20?"Moderate likelihood":val>=10?"Below avg likelihood":"Low likelihood"}
                  </div>
                </div>
              ))}
            </div>
            {projectionMultiBlock}
          </div>
        )}
      </div>
    );
  }
  const rc=r=>r<=3?"#f0c040":r<=12?"#5dbf6a":r<=24?"#4da6ff":"#888";
  return (
    <div>
      {(calibratedProjT12!=null||calibratedProjT24!=null)&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"#555",letterSpacing:2,marginBottom:8}}>PROJECTED HIT RATES</div>
          <div style={{fontSize:11,color:"#555",lineHeight:1.65,marginBottom:10}}>
            Based on historical outcomes of similarly-scored and drafted RBs (prospect score ±5, production ±5, athletic ±5, PFF board ±5, draft pick ±15). Draft capital weighted 65%. These percentages reflect the projected likelihood that the player hits top-12 or top-24 <em>in any season of their NFL career</em>, not specifically in year one.
          </div>
          <div style={{display:"flex",gap:8,marginBottom:4}}>
            {[[calibratedProjT12,projT12Rank,"TOP-12","#f0c040"],[calibratedProjT24,projT24Rank,"TOP-24","#5dbf6a"]].map(([val,rank,lbl,c])=>(
              <div key={lbl} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"12px 10px",textAlign:"center",border:"1px solid "+c+"22"}}>
                <div style={{fontSize:9,color:"#555",letterSpacing:1,marginBottom:4}}>{lbl} / SEASON</div>
                <div style={{fontSize:28,fontWeight:900,color:val>=40?"#f0c040":val>=20?"#5dbf6a":val>=10?"#4da6ff":"#888",lineHeight:1}}>
                  {val!=null?val.toFixed(1)+"%":"—"}
                </div>
                <div style={{fontSize:9,color:"#555",marginTop:4}}>
                  {rank!=null?"#"+rank+" of "+(totalPlayers||194)+" players":""}
                </div>
                <div style={{fontSize:9,color:"#444",marginTop:2}}>
                  {val>=40?"Strong likelihood":val>=20?"Moderate likelihood":val>=10?"Below avg likelihood":"Low likelihood"}
                </div>
              </div>
            ))}
          </div>
          {projectionMultiBlock}
        </div>
      )}
      {(nfl.draft_round||nfl.draft_pick)&&(
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[["Draft Round",nfl.draft_round==="UDFA"?"UDFA":"Rd "+nfl.draft_round,accent],
            ["Draft Pick",nfl.draft_pick==="UDFA"?"UDFA":"#"+nfl.draft_pick,"#aaa"]
          ].map(([l,v,c])=>(
            <div key={l} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#555",marginBottom:1}}>{l}</div>
              <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        {[["Best Finish",nfl.best_rank?"#"+nfl.best_rank:"—",rc(nfl.best_rank||99)],
          ["Avg Finish",nfl.avg_rank?"#"+nfl.avg_rank:"—",accent],
          ["Seasons Played",nfl.career_seasons||nfl.seasons||"—","#aaa"],
          ["Top-24 Seasons",nfl.top24>0?nfl.top24+"x":"0x","#4da6ff"],
          ["Top-12",nfl.top12+"x","#f0c040"],[("Top-24 Rate"),(nfl.career_seasons||nfl.seasons)>0?Math.round((nfl.top24||0)/(nfl.career_seasons||nfl.seasons)*100)+"%":"—","#5dbf6a"],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
            <div style={{fontSize:9,color:"#555",marginBottom:1}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>
      {nfl.season_ranks&&nfl.season_ranks.length>0&&(
        <div>
          <div style={{fontSize:10,color:"#555",letterSpacing:2,marginBottom:8}}>SEASON FINISHES</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {nfl.season_ranks.map(({year,rank})=>(
              <div key={year} style={{background:"rgba(255,255,255,0.05)",borderRadius:6,padding:"5px 12px",textAlign:"center",border:"1px solid "+rc(rank)+"22"}}>
                <div style={{fontSize:9,color:"#555"}}>{year}</div>
                <div style={{fontSize:16,fontWeight:700,color:rc(rank)}}>#{rank}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompsPanel({playerName, data, accent, onSelectPlayer}) {
  // ── Live similarity engine ──────────────────────────────────────────────────
  const comps = useMemo(()=>{
    const others = Object.entries(ALL_PLAYERS).filter(([n])=>n!==playerName);
    if(!others.length) return null;

    // Normalise a value 0-100 given a key across all players
    const allVals = key => Object.values(ALL_PLAYERS).map(p=>p[key]).filter(v=>v!=null);
    const norm = (v, key) => {
      const vals = allVals(key);
      const mn = Math.min(...vals), mx = Math.max(...vals);
      return mx===mn ? 50 : ((v-mn)/(mx-mn))*100;
    };

    // Weighted Euclidean distance between two feature vectors
    const dist = (vecA, vecB, weights) => {
      let sum=0, wsum=0;
      weights.forEach(([a,b,w])=>{
        if(a==null||b==null) return;
        sum += w*Math.pow(a-b,2);
        wsum += w;
      });
      return wsum>0 ? Math.sqrt(sum/wsum) : 999;
    };

    // Feature extractors
    const rushVec = p => [
      norm(p.rush_trajectory,   'rush_trajectory'),
      norm(p.traj_peak,         'traj_peak'),
      norm(p.traj_improvement,  'traj_improvement'),
      norm(p.traj_consistency,  'traj_consistency'),
      norm(p.prod_trajectory,   'prod_trajectory'),
    ];
    const recvVec = p => [
      norm(p.recv_trajectory,   'recv_trajectory'),
      norm(p.traj_peak,         'traj_peak'),
      norm(p.traj_consistency,  'traj_consistency'),
      norm(p.prod_trajectory,   'prod_trajectory'),
    ];
    const athlRaw = p => {
      const a = p.athletic||{};
      return [
        a.forty?.val, a.vert?.val, a.broad?.val,
        a.weight?.val, a.height?.val, a.shuttle?.val,
      ];
    };
    // Normalise athl across players that have data
    const athlPlayers = Object.values(ALL_PLAYERS).filter(p=>p.athletic);
    const athlNorm = (v,i) => {
      const vals = athlPlayers.map(p=>athlRaw(p)[i]).filter(x=>x!=null);
      const mn=Math.min(...vals), mx=Math.max(...vals);
      return v==null||mx===mn ? null : ((v-mn)/(mx-mn))*100;
    };
    const athlVec = p => athlRaw(p).map((v,i)=>athlNorm(v,i));

    const RUSH_W  = [3,2.5,1.5,1.5,2];
    const RECV_W  = [3,2,1.5,2];
    const ATHL_W  = [3,2,2,1.5,1,1];
    const OVRL_W  = [2,2,1.5,2,1.5]; // rush,recv,athl,peak,consistency

    const me = data;
    const myRush = rushVec(me);
    const myRecv = recvVec(me);
    const myAthl = athlVec(me);

    const rushDist = n => {
      const p=ALL_PLAYERS[n]; const v=rushVec(p);
      return dist(null,null, RUSH_W.map((w,i)=>[myRush[i],v[i],w]));
    };
    const recvDist = n => {
      const p=ALL_PLAYERS[n]; const v=recvVec(p);
      return dist(null,null, RECV_W.map((w,i)=>[myRecv[i],v[i],w]));
    };
    const athlDist = n => {
      const p=ALL_PLAYERS[n]; if(!p.athletic||!me.athletic) return 999;
      const v=athlVec(p);
      return dist(null,null, ATHL_W.map((w,i)=>[myAthl[i],v[i],w]));
    };
    const ovrlDist = n => {
      const p=ALL_PLAYERS[n];
      const rd=rushDist(n), rcd=recvDist(n), ad=athlDist(n);
      const pPeak=norm(p.traj_peak,'traj_peak'), mPeak=norm(me.traj_peak,'traj_peak');
      const pCons=norm(p.traj_consistency,'traj_consistency'), mCons=norm(me.traj_consistency,'traj_consistency');
      const pAthl=ad<900?100-Math.min(ad,100):null;
      const mAthl=pAthl!=null?50:null;
      return dist(null,null,[
        [rd, 0, 2], [rcd, 0, 2], [ad<900?ad:null,0,1.5],
        [mPeak, pPeak, 2], [mCons, pCons, 1.5],
      ]);
    };

    const rank = (scoreFn, n=3) =>
      others
        .map(([nm])=>({nm, d:scoreFn(nm)}))
        .filter(x=>x.d<900)
        .sort((a,b)=>a.d-b.d)
        .slice(0,n)
        .map(({nm,d})=>({
          name:nm, d,
          tier: ALL_PLAYERS[nm]?.tier,
          score: ALL_PLAYERS[nm]?.prospect_score,
          draft_class: ALL_PLAYERS[nm]?.draft_class,
          rush_arch: ALL_PLAYERS[nm]?.rush_arch,
          recv_arch: ALL_PLAYERS[nm]?.recv_arch,
        }));

    return {
      overall: rank(ovrlDist, 3),
      rush:    rank(rushDist,  3),
      recv:    rank(recvDist,  3),
      athl:    me.athletic ? rank(athlDist, 3) : [],
    };
  },[playerName]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const simPct = (d, scale=28) => Math.max(0, Math.round(100 - d*scale/10));

  const CompRow = ({item, color, rank, showScore=false}) => {
    const ts = TIER_STYLE[item.tier]||TIER_STYLE.Fringe;
    const sim = simPct(item.d, showScore?22:28);
    return (
      <div onClick={()=>onSelectPlayer(item.name)}
        style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"rgba(255,255,255,0.03)",borderRadius:8,marginBottom:5,border:"1px solid "+ts.accent+"22",cursor:"pointer"}}
        onMouseEnter={e=>e.currentTarget.style.background=ts.accent+"0f"}
        onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}>
        <div style={{fontSize:14,fontWeight:700,color:color,minWidth:22}}>#{rank}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:"#fff"}}>{item.name}</div>
          <div style={{fontSize:10,color:"#555",marginTop:1}}>
            {item.draft_class} · <span style={{color:ts.accent}}>{item.tier}</span>
            {showScore&&item.score!=null&&<span style={{color:"#777"}}> · {item.score.toFixed(1)} score</span>}
          </div>
          <div style={{marginTop:4,display:"flex",gap:4,flexWrap:"wrap"}}>
            {item.rush_arch&&<ArchTag label={item.rush_arch} colors={RUSH_ARCH_COLORS}/>}
            {item.recv_arch&&<ArchTag label={item.recv_arch} colors={RECV_ARCH_COLORS}/>}
          </div>
        </div>
        <div style={{textAlign:"right",minWidth:52}}>
          <div style={{fontSize:13,color:color,fontWeight:700}}>{sim}%</div>
          <div style={{fontSize:8,color:"#444",marginBottom:3}}>match</div>
          <div style={{width:44,height:3,borderRadius:2,background:"rgba(255,255,255,0.07)"}}>
            <div style={{height:"100%",width:Math.min(sim,100)+"%",background:color,borderRadius:2}}/>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({title, color, items, showScore}) => (
    <div style={{marginBottom:20}}>
      <div style={{fontSize:10,color,letterSpacing:2,fontWeight:700,marginBottom:8}}>{title}</div>
      {!items||!items.length
        ? <div style={{color:"#333",fontSize:11,padding:"8px 0"}}>Not enough data for this comparison</div>
        : items.map((item,i)=><CompRow key={item.name} item={item} color={color} rank={i+1} showScore={showScore}/>)
      }
    </div>
  );

  if(!comps) return <div style={{color:"#444",fontSize:12,textAlign:"center",padding:"20px 0"}}>No comps available</div>;

  return (
    <div>
      <div style={{background:"rgba(255,255,255,0.03)",borderRadius:7,padding:"9px 12px",marginBottom:16,fontSize:10,color:"#555"}}>
        Similarity scores via weighted Euclidean distance across production, trajectory, and athletic profiles · Click any player to open their card
      </div>

      {/* Overall top 3 */}
      <div style={{background:"rgba(240,192,64,0.05)",border:"1px solid rgba(240,192,64,0.2)",borderRadius:9,padding:"14px 14px 10px",marginBottom:20}}>
        <div style={{fontSize:10,color:"#f0c040",letterSpacing:2,fontWeight:700,marginBottom:4}}>CLOSEST OVERALL COMPS</div>
        <div style={{fontSize:9,color:"#555",marginBottom:12}}>Combined rush profile · receiving profile · athletic testing · career trajectory</div>
        {comps.overall.map((item,i)=><CompRow key={item.name} item={item} color="#f0c040" rank={i+1} showScore/>)}
      </div>

      <Section title="RUSH PROFILE COMPS"    color="#f0873a" items={comps.rush} showScore={false}/>
      <Section title="RECEIVING PROFILE COMPS" color="#5dbf6a" items={comps.recv} showScore={false}/>
      {data.athletic
        ? <Section title="ATHLETIC PROFILE COMPS" color="#4da6ff" items={comps.athl} showScore={false}/>
        : <div style={{background:"rgba(255,255,255,0.02)",borderRadius:7,padding:"12px",marginBottom:16,fontSize:10,color:"#444"}}>
            No combine data available for athletic comps
          </div>
      }
    </div>
  );
}

function TrajectoryTiles({data, accent, recruiting}) {
  const peakSeason = data.seasons&&data.seasons.length
    ? data.seasons.reduce((best,s)=>s.adj_score>best.adj_score?s:best, data.seasons[0])
    : null;
  const peakLabel = peakSeason
    ? (peakSeason.sc||"")+(peakSeason.yr?" '"+String(peakSeason.yr).slice(-2):"")
    : null;
  const finalSeason = data.seasons&&data.seasons.length
    ? data.seasons[data.seasons.length-1] : null;
  const [expanded, setExpanded] = useState(null);

  const tiles = [
    {
      label:"PEAK SEASON", value:data.traj_peak, color:accent,
      sublabel: peakLabel
        ? "YR"+(peakSeason.n||"?")+" · "+peakLabel
        : "Best single season",
      desc: "This is the single best season this player produced in college, adjusted for the difficulty of their schedule. Think of it as their proven ceiling — the highest level they've shown they can perform at. A score of 80+ means they dominated their conference at their best; under 60 means even their peak was modest relative to the class."
    },
    {
      label:"FINAL SEASON", value:data.traj_final, color:"#4da6ff",
      sublabel: finalSeason ? "Season "+finalSeason.n+" · last year" : "Last college season",
      desc: "This score reflects how the player was performing right before they left for the NFL. It matters because a player who was still getting better in their final year is more likely to keep developing as a pro. If this number is higher than their Peak Season score, it means they may not have even hit their ceiling yet when they declared."
    },
    {
      label:"IMPROVEMENT", value:data.traj_improvement, color:"#5dbf6a",
      sublabel: data.traj_improvement>=62?"Rising arc ↑":data.traj_improvement>=45?"Relatively flat →":"Declined late ↓",
      desc: "This measures how much a player grew from their first college season to their last. A score above 60 means they were on a clear upward arc — getting better every year. Around 50 means they were relatively flat, while below 40 means production dropped off late, which can signal injury history, a scheme change, or that they peaked early."
    },
    {
      label:"CONSISTENCY", value:data.traj_consistency, color:"#c084fc",
      sublabel: data.traj_consistency>=75?"Reliable year-to-year":data.traj_consistency>=55?"Some variance":"High variance profile",
      desc: "This measures how stable a player's production was from season to season. A high score means they put up similar numbers every year — a reliable, predictable producer. A low score means big swings up and down, which could indicate an injury-prone player, a backup role in early years, or a boom/bust profile that's harder to project at the next level."
    },
  ];

  const [scoutOpen, setScoutOpen] = React.useState(null); // "strengths" | "weaknesses" | null
  const strengths  = recruiting&&recruiting.scout_strengths;
  const weaknesses = recruiting&&recruiting.scout_weaknesses;

  return (
    <div style={{marginBottom:14}}>
      {/* 2×2 tile grid — order preserved: Peak | Final / Improvement | Consistency */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:8}}>
        {tiles.map(({label,value,color,sublabel,desc})=>(
          <div key={label}
            onClick={()=>setExpanded(expanded===label?null:label)}
            style={{background:"rgba(255,255,255,0.03)",borderRadius:7,padding:"10px 12px",border:"1px solid "+(expanded===label?color+"55":color+"18"),cursor:"pointer",transition:"border-color 0.15s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{fontSize:9,color:"#555",letterSpacing:1}}>{label}</div>
              <div style={{fontSize:8,color:color+"88"}}>{expanded===label?"▲":"▼"}</div>
            </div>
            <div style={{fontSize:20,fontWeight:800,color,margin:"3px 0"}}>{value!=null?value.toFixed(1):"—"}</div>
            <div style={{fontSize:9,color:"#444",lineHeight:1.4}}>{sublabel}</div>
            {expanded===label&&(
              <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid "+color+"22",fontSize:9,color:"#888",lineHeight:1.6}}>
                {desc}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Scout note dropdowns — below the tile grid, aligned to their respective columns */}
      {(strengths||weaknesses)&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
          <div>
            {strengths&&(
              <>
                <button onClick={()=>setScoutOpen(scoutOpen==="strengths"?null:"strengths")}
                  style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(93,191,106,0.06)",border:"1px solid rgba(93,191,106,0.2)",borderRadius:scoutOpen==="strengths"?"7px 7px 0 0":7,padding:"7px 12px",cursor:"pointer",fontFamily:"monospace"}}>
                  <span style={{fontSize:9,color:"#5dbf6a",letterSpacing:1.5}}>✓ STRENGTHS</span>
                  <span style={{fontSize:9,color:"#5dbf6a55"}}>{scoutOpen==="strengths"?"▲":"▼"}</span>
                </button>
                {scoutOpen==="strengths"&&(
                  <div style={{background:"rgba(93,191,106,0.04)",border:"1px solid rgba(93,191,106,0.2)",borderTop:"none",borderRadius:"0 0 7px 7px",padding:"10px 12px"}}>
                    {strengths.map((s,i)=>(
                      <div key={i} style={{display:"flex",gap:8,marginBottom:i<strengths.length-1?10:0,alignItems:"flex-start"}}>
                        <span style={{color:"#5dbf6a",fontSize:10,flexShrink:0,marginTop:1}}>✓</span>
                        <span style={{fontSize:10,color:"#ccc",lineHeight:1.6}}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            {weaknesses&&(
              <>
                <button onClick={()=>setScoutOpen(scoutOpen==="weaknesses"?null:"weaknesses")}
                  style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(240,135,58,0.06)",border:"1px solid rgba(240,135,58,0.2)",borderRadius:scoutOpen==="weaknesses"?"7px 7px 0 0":7,padding:"7px 12px",cursor:"pointer",fontFamily:"monospace"}}>
                  <span style={{fontSize:9,color:"#f0873a",letterSpacing:1.5}}>⚠ CONCERNS</span>
                  <span style={{fontSize:9,color:"#f0873a55"}}>{scoutOpen==="weaknesses"?"▲":"▼"}</span>
                </button>
                {scoutOpen==="weaknesses"&&(
                  <div style={{background:"rgba(240,135,58,0.04)",border:"1px solid rgba(240,135,58,0.2)",borderTop:"none",borderRadius:"0 0 7px 7px",padding:"10px 12px"}}>
                    {weaknesses.map((w,i)=>(
                      <div key={i} style={{display:"flex",gap:8,marginBottom:i<weaknesses.length-1?10:0,alignItems:"flex-start"}}>
                        <span style={{color:"#f0873a",fontSize:10,flexShrink:0,marginTop:1}}>⚠</span>
                        <span style={{fontSize:10,color:"#ccc",lineHeight:1.6}}>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductionChart({data, accent}) {
  const currentPts = (data.seasons||[]).filter(s=>s.c!=null).sort((a,b)=>a.n-b.n);
  if(!currentPts.length) return null;
  const otherPaths = useMemo(()=>{
    const paths = [];
    Object.entries(ALL_PLAYERS).forEach(([name,p])=>{
      if(name===data.name) return;
      const pts=(p.seasons||[]).filter(s=>s.c!=null).sort((a,b)=>a.n-b.n);
      if(pts.length>=2) paths.push(pts);
    });
    return paths;
  },[data.name,ALL_PLAYERS]);
  const maxN = Math.max(5, ...currentPts.map(p=>p.n));
  const W=500, H=160, padL=34, padR=12, padT=14, padB=28;
  const xS=(W-padL-padR)/(maxN-1||1);
  const xF=n=>padL+(n-1)*xS;
  const yF=v=>padT+(1-(v/100))*(H-padT-padB);
  const mkPath=pts=>"M"+pts.map(p=>xF(p.n).toFixed(1)+","+yF(p.c).toFixed(1)).join(" L");
  const Y_TICKS = [0,25,50,75,100];
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:6}}>PRODUCTION VS ALL PROSPECTS</div>
      <div style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"12px 10px 6px",border:"1px solid rgba(255,255,255,0.05)"}}>
        <svg width="100%" viewBox={"0 0 "+W+" "+H} preserveAspectRatio="xMidYMid meet" style={{display:"block"}}>
          {/* Y-axis grid lines with labels */}
          {Y_TICKS.map(v=>(
            <g key={v}>
              <line x1={padL} x2={W-padR} y1={yF(v)} y2={yF(v)}
                stroke={v===0||v===100?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.05)"}
                strokeWidth={1} strokeDasharray={v===0||v===100?"none":"4,5"}/>
              <text x={padL-5} y={yF(v)+3.5} textAnchor="end" fill="#3a3a3a" fontSize={8} fontFamily="monospace">{v}</text>
            </g>
          ))}
          {/* X-axis year labels */}
          {Array.from({length:maxN},(_,i)=>i+1).map(n=>(
            <text key={n} x={xF(n)} y={H-padB+14} textAnchor="middle" fill="#3a3a3a" fontSize={8} fontFamily="monospace">{"Y"+n}</text>
          ))}
          {/* All other players */}
          {otherPaths.map((pts,i)=>(
            <path key={i} d={mkPath(pts)} fill="none" stroke={accent} strokeWidth={0.7} opacity={0.07}/>
          ))}
          {/* This player */}
          <path d={mkPath(currentPts)} fill="none" stroke={accent} strokeWidth={2.5} opacity={0.95}/>
          {currentPts.map((p,i)=>(
            <g key={i}>
              <circle cx={xF(p.n)} cy={yF(p.c)} r={4} fill={accent} stroke="#06080f" strokeWidth={1.5}/>
              <text x={xF(p.n)} y={yF(p.c)-8} textAnchor="middle" fill={accent} fontSize={8} fontFamily="monospace" fontWeight="700">{p.c.toFixed(0)}</text>
            </g>
          ))}
        </svg>
        <div style={{display:"flex",gap:12,paddingLeft:padL,marginTop:3}}>
          <span style={{fontSize:8,color:accent,opacity:0.4}}>{"── all prospects"}</span>
          <span style={{fontSize:8,color:accent}}>{"── this player"}</span>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({player, data, onClose, onSelectPlayer, onBack, allData}) {
  const ts = TIER_STYLE[data.tier]||TIER_STYLE.Fringe;
  const accent = ts.accent;
  const displayAthlScore = getAdjustedAthlScore(data, player);
  const [tab,setTab] = useState("overview");
  const ssSeasonCount = Object.keys(((_customSS && _customSS[player]) || (SEASON_STATS && SEASON_STATS[player]) || {})).length;
  const numSeasons = ssSeasonCount || data.num_seasons||(data.seasons&&data.seasons.length)||0;
  const oneSeason = numSeasons<=2;
  const tooFewForSparkline = numSeasons<2;
  const projT12Rank = useMemo(()=>{const vals=Object.values(ALL_PLAYERS).map(p=>p.proj_t12).filter(v=>v!=null).sort((a,b)=>b-a);return data.proj_t12!=null?vals.indexOf(data.proj_t12)+1:null;},[data.name,ALL_PLAYERS]);
  const projT24Rank = useMemo(()=>{const vals=Object.values(ALL_PLAYERS).map(p=>p.proj_t24).filter(v=>v!=null).sort((a,b)=>b-a);return data.proj_t24!=null?vals.indexOf(data.proj_t24)+1:null;},[data.name,ALL_PLAYERS]);
  const totalPlayers = Object.keys(ALL_PLAYERS).length;
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"0",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:ts.bg,borderRadius:"0 0 16px 16px",border:"1.5px solid "+accent+"44",boxShadow:"0 0 60px "+accent+"12,0 20px 50px rgba(0,0,0,0.8)",width:"100%",maxWidth:700,minHeight:"100vh",fontFamily:"monospace",position:"relative"}}>
        {/* Header */}
        <div style={{padding:"16px 16px 12px",background:"linear-gradient(135deg,"+ts.bg+" 60%,"+accent+"0d)",borderBottom:"1px solid "+accent+"18",position:"sticky",top:0,zIndex:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0,paddingRight:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{background:accent+"18",border:"1px solid "+accent+"55",color:accent,fontSize:8,letterSpacing:1.5,padding:"2px 7px",borderRadius:4,fontWeight:700}}>
                  {(data.tier||"").toUpperCase()}{data.is_projection?` · ★ ${data.draft_class||""}`:""}
                </span>
                <span style={{color:"#444",fontSize:9}}>#{data.rank} overall</span>
                {oneSeason&&<span style={{background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.3)",color:"#f0c040",fontSize:7,padding:"2px 5px",borderRadius:4,fontWeight:600}}>{numSeasons===1?"1-SEASON SAMPLE":"2-SEASON SAMPLE"}</span>}
                {data.breakout_tag&&<span style={{background:"rgba(0,230,130,0.08)",border:"1px solid rgba(0,230,130,0.3)",color:"#00e682",fontSize:7,padding:"2px 5px",borderRadius:4,fontWeight:600}}>⚡ BREAKOUT YR{data.breakout_yr}{data.breakout_delta?` +${data.breakout_delta}`:""}</span>}
                {data.late_decline&&<span style={{background:"rgba(224,80,80,0.08)",border:"1px solid rgba(224,80,80,0.3)",color:"#e05050",fontSize:7,padding:"2px 5px",borderRadius:4,fontWeight:600}}>↘ LATE DECLINE {data.late_decline_delta?`-${data.late_decline_delta}`:""}</span>}
              </div>
              <div style={{fontSize:18,fontWeight:900,color:"#fff",letterSpacing:-0.5,lineHeight:1.1,wordBreak:"break-word"}}>{player}</div>
              <div style={{color:"#555",fontSize:9,marginTop:2}}>
                {data.draft_class?data.draft_class+" class":""}
                {data.came_out_as&&data.came_out_as!="nan"?" · "+data.came_out_as:""}
                {data.transfer_to&&data.transfer_to!="nan"?" · → "+data.transfer_to:""}
              </div>
              {(data.draft_round||data.draft_pick)&&!data.is_projection&&(
                <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:4,padding:"2px 8px",borderRadius:5,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
                  <span style={{fontSize:8,color:"#444",letterSpacing:1}}>DRAFTED</span>
                  {data.draft_round==="UDFA"
                    ? <span style={{fontSize:9,fontWeight:700,color:"#f0873a"}}>UDFA</span>
                    : <>
                        <span style={{fontSize:9,fontWeight:700,color:"#f0c040"}}>Rd {data.draft_round}</span>
                        {data.draft_pick&&<span style={{fontSize:9,color:"#777"}}>· Pick #{data.draft_pick}</span>}
                      </>
                  }
                </div>
              )}
              {data.is_projection&&(
                <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:4,padding:"2px 8px",borderRadius:5,background:"rgba(0,131,143,0.1)",border:"1px solid rgba(0,131,143,0.25)"}}>
                  <span style={{fontSize:8,color:"#00838f",letterSpacing:1,fontWeight:700}}>2026 PROJECTION</span>
                </div>
              )}
              <div style={{marginTop:5,display:"flex",gap:3,flexWrap:"wrap"}}>
                {data.rush_arch&&<ArchTag label={data.rush_arch} colors={RUSH_ARCH_COLORS}/>}
                {data.recv_arch&&<ArchTag label={data.recv_arch} colors={RECV_ARCH_COLORS}/>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              {onBack && (
                <button
                  onClick={onBack}
                  style={{display:"block",marginLeft:"auto",marginBottom:6,background:"rgba(77,166,255,0.10)",border:"1px solid rgba(77,166,255,0.30)",borderRadius:6,color:"#4da6ff",height:24,padding:"0 8px",fontSize:8,letterSpacing:1.2,cursor:"pointer",fontWeight:700}}
                >
                  BACK TO COMPARE
                </button>
              )}
              <button onClick={onClose} style={{display:"block",marginLeft:"auto",marginBottom:6,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,color:"#666",width:28,height:28,fontSize:14,lineHeight:"28px",textAlign:"center",padding:0,cursor:"pointer"}}>✕</button>
              <div style={{fontSize:38,fontWeight:900,color:accent,lineHeight:1}}>{data.prospect_score!=null?data.prospect_score.toFixed(1):"—"}</div>
              <div style={{fontSize:8,color:"#444",letterSpacing:1.5,marginTop:1}}>PROSPECT SCORE</div>
              {data.nfl&&!data.is_projection&&(data.nfl.top12>0||data.nfl.top24>0)&&(
                <div style={{display:"flex",gap:4,justifyContent:"flex-end",marginTop:5}}>
                  {data.nfl.top12>0&&(
                    <div style={{background:"rgba(240,192,64,0.12)",border:"1px solid rgba(240,192,64,0.35)",borderRadius:5,padding:"3px 7px",textAlign:"center"}}>
                      <div style={{fontSize:12,fontWeight:800,color:"#f0c040",lineHeight:1}}>{data.nfl.top12}x</div>
                      <div style={{fontSize:7,color:"#f0c04088",letterSpacing:0.5}}>TOP-12</div>
                    </div>
                  )}
                  {data.nfl.top24>0&&(
                    <div style={{background:"rgba(77,166,255,0.10)",border:"1px solid rgba(77,166,255,0.30)",borderRadius:5,padding:"3px 7px",textAlign:"center"}}>
                      <div style={{fontSize:12,fontWeight:800,color:"#4da6ff",lineHeight:1}}>{data.nfl.top24}x</div>
                      <div style={{fontSize:7,color:"#4da6ff88",letterSpacing:0.5}}>TOP-24</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{height:3,borderRadius:2,background:"rgba(255,255,255,0.05)",marginTop:10}}>
            <div style={{height:"100%",width:(data.prospect_score||0)+"%",background:"linear-gradient(90deg,"+accent+"66,"+accent+")",borderRadius:2}}/>
          </div>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid "+accent+"18",background:ts.bg,position:"sticky",top:118,zIndex:9,overflowX:"auto"}}>
          {["overview","seasons","athletic","nfl","comps","recruiting"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:"0 0 auto",minWidth:0,padding:"10px 14px",border:"none",background:tab===t?accent+"12":"transparent",color:tab===t?accent:"#555",fontSize:8,letterSpacing:1.5,fontFamily:"monospace",borderBottom:tab===t?"2px solid "+accent:"2px solid transparent",fontWeight:tab===t?700:400,whiteSpace:"nowrap"}}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{padding:"14px 14px 32px"}}>
          {tab==="overview"&&(
            <div>
              {tooFewForSparkline&&(
                <div style={{background:"rgba(240,192,64,0.07)",border:"1px solid rgba(240,192,64,0.2)",borderRadius:7,padding:"8px 12px",marginBottom:14,fontSize:10,color:"#f0c040"}}>
                  ⚠ Single-season data — trajectory scores (improvement/consistency) reflect limited sample
                </div>
              )}
              <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:18,flexWrap:"wrap"}}>
                <div style={{flexShrink:0,margin:"0 auto"}}>
                  <Hex size={240} color={accent} values={[
                    {label:"PROD",val:data.prod_trajectory},{label:"RUSH",val:data.rush_trajectory},
                    {label:"RECV",val:data.recv_trajectory},{label:"ATHL",val:displayAthlScore},
                    {label:"PFF",val:data.pff_score},{label:"PEAK",val:data.traj_peak},
                  ]}/>
                </div>
                <div style={{flex:1,minWidth:180}}>
                  <Bar label="PRODUCTION" value={data.prod_trajectory} color={accent}/>
                  <Bar label="RUSH TRAJ" value={data.rush_trajectory} color="#f0873a"/>
                  <Bar label="RECV TRAJ" value={data.recv_trajectory} color="#5dbf6a"/>
                  <Bar label="ATHLETIC" value={displayAthlScore} color="#4da6ff"/>
                  <Bar label="PFF BOARD" value={data.pff_score} color="#c084fc"/>
                </div>
              </div>
              <TrajectoryTiles data={data} accent={accent} recruiting={data.recruiting}/>
              <ProductionChart data={data} accent={accent}/>
            </div>
          )}
          {tab==="seasons"&&(
            <div>
              <div style={{marginBottom:18}}>
                <div style={{fontSize:10,color:"#555",letterSpacing:2,marginBottom:8}}>PRODUCTION TRAJECTORY</div>
                {tooFewForSparkline
                  ? <div style={{background:"rgba(240,192,64,0.07)",border:"1px solid rgba(240,192,64,0.2)",borderRadius:7,padding:"10px 14px",fontSize:10,color:"#f0c040",marginBottom:8}}>⚠ Only one season on record — sparkline requires 2+ seasons</div>
                  : <Sparkline seasons={data.seasons} color={accent}/>
                }
                {!tooFewForSparkline&&(
                  <div style={{display:"flex",gap:14,marginTop:5}}>
                    {[["— Combined",accent],["- - Rush","#f0873a"],["- - Recv","#5dbf6a"]].map(([l,c])=>(
                      <span key={l} style={{fontSize:9,color:c}}>{l}</span>
                    ))}
                  </div>
                )}
                {data.seasons&&data.seasons.length>0&&(
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:9,color:"#555",letterSpacing:2,marginBottom:6}}>STRENGTH OF SCHEDULE</div>
                    <div style={{fontSize:11,color:"#444",lineHeight:1.6,marginBottom:8,maxWidth:540}}>
                      Each season is rated by the strength of that school's schedule for that year. <span style={{color:"#666"}}>Rank</span> is the team's national SoS position (1 = toughest schedule in the country). <span style={{color:"#666"}}>Mag</span> is a normalized 0–1 score representing schedule difficulty relative to all teams that season — higher values reward production against elite competition and lower values apply a modest discount for weak-schedule environments.
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {data.seasons.map(s=>(<SOSBadge key={s.n} season={s}/>))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{height:1,background:"rgba(255,255,255,0.05)",marginBottom:16}}/>
              <SeasonStatTable playerName={player} seasons={data.seasons} accent={accent}/>
            </div>
          )}
          {tab==="athletic"&&<AthleticPanel data={data} accent={accent} playerName={player}/>}
          {tab==="nfl"&&<NFLPanel nfl={data.nfl} accent={accent} isDraftClass={data.is_projection} projT12={data.proj_t12} projT24={data.proj_t24} projT12Rank={projT12Rank} projT24Rank={projT24Rank} totalPlayers={totalPlayers} draftClass={data.draft_class} playerData={data} allData={allData}/>} 
          {tab==="comps"&&<CompsPanel playerName={player} data={data} accent={accent} onSelectPlayer={onSelectPlayer}/>}
          {tab==="recruiting"&&<RecruitingPanel data={data} accent={accent}/>}
        </div>
      </div>
    </div>
  );
}

function RecruitingPanel({data, accent}) {
  const rec = data.recruiting;
  if (!rec) return <div style={{padding:"20px 0",textAlign:"center",color:"#444",fontSize:11}}>No recruiting data available</div>;

  const stars = rec.recruit_stars ?? 0;
  const rating = rec.recruit_rating;
  const starColor = stars>=5?"#f0c040":stars>=4?"#5dbf6a":stars>=3?"#4da6ff":stars>=2?"#c084fc":"#555";
  const starDisplay = "★".repeat(stars) + "☆".repeat(Math.max(0,5-stars));

  return (
    <div style={{fontFamily:"monospace"}}>

      {/* Star rating hero */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{textAlign:"center",flexShrink:0}}>
          <div style={{fontSize:22,letterSpacing:2,color:starColor,lineHeight:1}}>{starDisplay}</div>
          <div style={{fontSize:9,color:"#555",marginTop:4,letterSpacing:1}}>{stars}-STAR RECRUIT</div>
        </div>
        {rating&&(
          <div style={{textAlign:"center",flexShrink:0,borderLeft:"1px solid rgba(255,255,255,0.07)",paddingLeft:14}}>
            <div style={{fontSize:28,fontWeight:900,color:rating>=95?accent:rating>=88?"#5dbf6a":rating>=80?"#4da6ff":"#888",lineHeight:1}}>{rating}</div>
            <div style={{fontSize:9,color:"#555",marginTop:4,letterSpacing:1}}>RECRUIT RATING</div>
          </div>
        )}
        <div style={{flex:1}}>
          {rec.recruit_school&&<div style={{fontSize:12,color:"#fff",fontWeight:700}}>{rec.recruit_school}</div>}
          {rec.recruit_year&&<div style={{fontSize:10,color:"#555",marginTop:3}}>Enrolled {rec.recruit_year}</div>}
          {rec.redshirt&&<div style={{fontSize:9,color:"#f0c040",marginTop:3}}>✅ Redshirt season</div>}
        </div>
      </div>

      {/* National / Position / State rankings */}
      {(rec.recruit_nat||rec.recruit_pos||rec.recruit_state)&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,color:"#555",letterSpacing:2,marginBottom:8}}>RECRUITING RANKINGS</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {[[rec.recruit_nat,"National"],
              [rec.recruit_pos,"Position (RB)"],
              [rec.recruit_state,"In-State"],
            ].map(([val,lbl])=>val!=null&&(
              <div key={lbl} style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:9,color:"#555",marginBottom:3}}>{lbl}</div>
                <div style={{fontSize:20,fontWeight:800,color:accent}}>#{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scout notes moved to Overview tab */}
      <div style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"10px 14px",fontSize:10,color:"#555",textAlign:"center",marginTop:4}}>
        Strengths &amp; concerns are available on the Overview tab
      </div>
    </div>
  );
}

function SoSUploadModal({onClose, onSave, existing}) {
  const [year, setYear]         = React.useState(new Date().getFullYear() + 1);
  const [rawText, setRawText]   = React.useState('');
  const [parsed, setParsed]     = React.useState(null);
  const [error, setError]       = React.useState('');
  const [saved, setSaved]       = React.useState(false);

  // Normalise rating → 0–1 mag, then → label
  function magFromRating(rating, allRatings) {
    const mn = Math.min(...allRatings), mx = Math.max(...allRatings);
    if (mx === mn) return 0.5;
    return (rating - mn) / (mx - mn);
  }
  function labelFromMag(mag) {
    if (mag >= 0.60) return 'Elite';
    if (mag >= 0.38) return 'Strong';
    if (mag >= 0.10) return 'Average';
    if (mag >= 0.01) return 'Weak';
    return 'Very Weak';
  }
  // Strip record like "(12-1)" from team names
  function cleanTeam(t) {
    return t.replace(/\s*\([\d\-]+\)\s*$/, '').trim();
  }

  function parseCSV() {
    setError(''); setParsed(null);
    const lines = rawText.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { setError('No data found.'); return; }

    // Auto-detect separator
    const sep = lines[0].includes('\t') ? '\t' : ',';

    // Parse all rows
    const rows = lines.map(l => l.split(sep).map(c => c.trim().replace(/^["']|["']$/g, '')));

    // Find header row
    const headerIdx = rows.findIndex(r =>
      r.some(c => /^(team|school|name)/i.test(c)) &&
      r.some(c => /^(rank|rk|#)/i.test(c) || /^(rating|sos|score)/i.test(c))
    );
    const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows;
    const header   = headerIdx >= 0 ? rows[headerIdx].map(c => c.toLowerCase()) : null;

    // Column indices
    let teamCol = 1, rankCol = 0, ratingCol = 2;
    if (header) {
      const ti = header.findIndex(h => /team|school|name/i.test(h));
      const ri = header.findIndex(h => /^rank|^rk|^#/i.test(h));
      const vi = header.findIndex(h => /rating|sos|score|value/i.test(h));
      if (ti >= 0) teamCol   = ti;
      if (ri >= 0) rankCol   = ri;
      if (vi >= 0) ratingCol = vi;
    }

    const teams = [];
    for (const row of dataRows) {
      const maxCol = Math.max(teamCol, rankCol, ratingCol);
      if (row.length <= maxCol) continue;
      const rawTeam  = row[teamCol] || '';
      const teamName = cleanTeam(rawTeam);
      const rank     = parseInt(row[rankCol]) || null;
      const rating   = parseFloat(row[ratingCol]);
      if (!teamName || isNaN(rating)) continue;
      teams.push({ team: teamName, rank, rating });
    }

    if (!teams.length) { setError('Could not parse any rows. Check your CSV format.'); return; }

    const allRatings = teams.map(t => t.rating);
    const result = teams.map(t => ({
      ...t,
      mag:   parseFloat(magFromRating(t.rating, allRatings).toFixed(3)),
      label: labelFromMag(magFromRating(t.rating, allRatings)),
    }));

    setParsed(result);
  }

  function handleSave() {
    if (!parsed) return;
    const lookup = {};
    parsed.forEach(({ team, rank, mag, label }) => {
      lookup[team.toLowerCase()] = { rank, mag, label, team };
    });
    onSave(String(year), lookup);
    setSaved(true);
  }

  const labelColor = l => l==='Elite'?'#f0c040':l==='Strong'?'#5dbf6a':l==='Average'?'#4da6ff':l==='Weak'?'#f0873a':'#e05050';

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#0d1117',border:'1px solid rgba(77,166,255,0.3)',borderRadius:12,width:'100%',maxWidth:640,maxHeight:'90vh',overflowY:'auto',padding:24,fontFamily:'monospace'}}>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#4da6ff',letterSpacing:1}}>UPLOAD STRENGTH OF SCHEDULE</div>
            <div style={{fontSize:10,color:'#555',marginTop:3}}>Paste or upload a CSV for a new season</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#555',fontSize:18,cursor:'pointer'}}>✕</button>
        </div>

        {/* Year */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>SEASON YEAR</label>
          <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(77,166,255,0.3)',borderRadius:7,color:'#4da6ff',fontSize:13,padding:'8px 12px',fontFamily:'monospace',width:120,outline:'none'}}/>
          {existing[String(year)] && <span style={{fontSize:10,color:'#f0873a',marginLeft:10}}>⚠ Will overwrite existing {String(year)} data ({Object.keys(existing[String(year)]).length} teams)</span>}
        </div>

        {/* Instructions */}
        <div style={{background:'rgba(77,166,255,0.05)',border:'1px solid rgba(77,166,255,0.15)',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:10,color:'#666',lineHeight:1.7}}>
          <strong style={{color:'#4da6ff'}}>Accepted format (CSV or tab-separated):</strong><br/>
          Copy your spreadsheet data and paste below, or upload a .csv file. The app expects columns for <strong>Rank</strong>, <strong>Team</strong>, and <strong>Rating</strong> — in any order with any header names. Extra columns are ignored. Team records like "(12-1)" are stripped automatically.<br/><br/>
          <strong style={{color:'#aaa'}}>Example:</strong> <span style={{color:'#555'}}>Rank, Team, Rating<br/>1, Alabama (14-1), 20.6<br/>2, Georgia (13-0), 18.4</span>
        </div>

        {/* Paste area */}
        <div style={{marginBottom:12}}>
          <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>PASTE DATA OR UPLOAD FILE</label>
          <textarea value={rawText} onChange={e=>{setRawText(e.target.value);setParsed(null);setSaved(false);}}
            placeholder={"Rank\tTeam\tRating\n1\tAlabama (14-1)\t20.6\n2\tGeorgia (13-0)\t18.4\n..."}
            style={{width:'100%',height:120,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:'#ccc',fontSize:10,padding:'10px 12px',fontFamily:'monospace',resize:'vertical',outline:'none',boxSizing:'border-box'}}/>
          <label style={{display:'inline-block',marginTop:6,padding:'5px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,fontSize:9,color:'#666',cursor:'pointer',letterSpacing:1}}>
            ↑ UPLOAD CSV FILE
            <input type="file" accept=".csv,.txt,.tsv" style={{display:'none'}} onChange={e=>{
              const file=e.target.files[0]; if(!file) return;
              const reader=new FileReader();
              reader.onload=ev=>{setRawText(ev.target.result);setParsed(null);setSaved(false);};
              reader.readAsText(file);
            }}/>
          </label>
        </div>

        <button onClick={parseCSV}
          style={{padding:'8px 18px',borderRadius:7,border:'1px solid rgba(77,166,255,0.4)',background:'rgba(77,166,255,0.1)',color:'#4da6ff',fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1,marginBottom:16}}>
          PARSE →
        </button>

        {error && <div style={{color:'#e05050',fontSize:10,marginBottom:12}}>⚠ {error}</div>}

        {/* Preview */}
        {parsed && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:9,color:'#555',letterSpacing:2,marginBottom:8}}>PREVIEW — {parsed.length} TEAMS PARSED</div>
            <div style={{maxHeight:220,overflowY:'auto',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
                <thead>
                  <tr style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                    {['Rank','Team','Rating','Mag','Label'].map(h=>(
                      <th key={h} style={{padding:'6px 10px',color:'#555',fontWeight:400,textAlign:'left',letterSpacing:1,fontSize:9}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0,10).map((row,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'5px 10px',color:'#777'}}>{row.rank}</td>
                      <td style={{padding:'5px 10px',color:'#fff'}}>{row.team}</td>
                      <td style={{padding:'5px 10px',color:'#aaa'}}>{row.rating}</td>
                      <td style={{padding:'5px 10px',color:'#aaa'}}>{row.mag.toFixed(3)}</td>
                      <td style={{padding:'5px 10px'}}><span style={{color:labelColor(row.label),fontWeight:600}}>{row.label}</span></td>
                    </tr>
                  ))}
                  {parsed.length>10&&<tr><td colSpan={5} style={{padding:'5px 10px',color:'#444',fontSize:9}}>...and {parsed.length-10} more</td></tr>}
                </tbody>
              </table>
            </div>
            {!saved
              ? <button onClick={handleSave}
                  style={{marginTop:10,padding:'8px 20px',borderRadius:7,border:'1px solid rgba(93,191,106,0.4)',background:'rgba(93,191,106,0.1)',color:'#5dbf6a',fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1}}>
                  SAVE {parsed.length} TEAMS FOR {year} ✓
                </button>
              : <div style={{marginTop:10,color:'#5dbf6a',fontSize:11}}>✓ Saved {parsed.length} teams for {year}. When adding a new player, their school's SoS will be auto-filled.</div>
            }
          </div>
        )}

        {/* Existing seasons */}
        {Object.keys(existing).length > 0 && (
          <div style={{marginTop:16,borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:14}}>
            <div style={{fontSize:9,color:'#555',letterSpacing:2,marginBottom:8}}>UPLOADED SEASONS</div>
            {Object.entries(existing).sort(([a],[b])=>Number(b)-Number(a)).map(([yr, data])=>(
              <div key={yr} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <span style={{fontSize:11,color:'#aaa'}}>{yr} — {Object.keys(data).length} teams</span>
                <button onClick={()=>{const n={...existing};delete n[yr];onSave(null,null,n);}}
                  style={{background:'none',border:'none',color:'#e05050',fontSize:10,cursor:'pointer'}}>remove</button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

function FinishSeasonsModal({onClose, onSave, existing, players}) {
  const isMobile = useIsMobile(768);
  const [year, setYear] = React.useState(() => {
    const now = new Date().getFullYear();
    return Math.max(2015, Math.min(2050, now));
  });
  const blankNames = Array.from({length:12}, () => "");
  const [top12Names, setTop12Names] = React.useState(() => blankNames);
  const [next12Names, setNext12Names] = React.useState(() => blankNames);
  const [pasteText, setPasteText] = React.useState("");
  const [parsed, setParsed] = React.useState(null);
  const [error, setError] = React.useState("");

  const normalizedPlayers = React.useMemo(() => {
    const idx = {};
    Object.keys(players || {}).forEach((name) => {
      idx[normalizePlayerName(name)] = name;
    });
    return idx;
  }, [players]);

  React.useEffect(() => {
    const y = String(year);
    const data = existing && existing[y] ? existing[y] : null;
    const t12 = [...blankNames];
    const n12 = [...blankNames];
    if (!data) {
      setTop12Names(blankNames);
      setNext12Names(blankNames);
      setParsed(null);
      setError("");
      return;
    }
    (Array.isArray(data.top12) ? data.top12 : []).forEach((r) => {
      const rank = Number(r?.rank);
      const name = String(r?.name || "").trim();
      if (Number.isFinite(rank) && rank >= 1 && rank <= 12 && name) t12[rank - 1] = name;
    });
    (Array.isArray(data.top24) ? data.top24 : []).forEach((r) => {
      const rank = Number(r?.rank);
      const name = String(r?.name || "").trim();
      if (Number.isFinite(rank) && rank >= 13 && rank <= 24 && name) n12[rank - 13] = name;
    });

    setTop12Names(t12);
    setNext12Names(n12);
    setParsed(null);
    setError("");
  }, [year, existing, blankNames]);

  function updateName(setter, idx, value) {
    setter((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
    setParsed(null);
    setError("");
  }

  function extractRank(text) {
    const s = String(text || "").trim();
    if (!s) return null;
    const m = s.match(/^#?\s*(\d{1,2})(?:\b|[.)\-:])/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > 24) return null;
    return n;
  }

  function parsePastedRows(text) {
    const lines = String(text || "").split(/\r?\n/);
    const byRank = new Map();

    lines.forEach((line) => {
      const raw = String(line || "").trim();
      if (!raw) return;

      const tabCells = raw.includes("\t") ? raw.split("\t").map((c) => c.trim()).filter(Boolean) : null;
      const csvCells = !tabCells && raw.includes(",") ? raw.split(",").map((c) => c.trim()).filter(Boolean) : null;
      const cells = tabCells || csvCells || [raw];

      let rank = null;
      for (const c of cells) {
        rank = extractRank(c);
        if (rank != null) break;
      }
      if (rank == null) return;

      let name = "";
      if (cells.length >= 2) {
        const cands = cells.filter((c) => extractRank(c) == null && /[a-zA-Z]/.test(c));
        if (cands.length) name = cands[0];
      }
      if (!name) {
        name = raw.replace(/^#?\s*\d{1,2}\s*[.)\-:]?\s*/, "");
      }

      name = String(name || "")
        .replace(/\s*\(.*?\)\s*$/, "")
        .replace(/\s{2,}.*/, "")
        .trim();

      if (!name || !/[a-zA-Z]/.test(name)) return;
      if (!byRank.has(rank)) byRank.set(rank, name);
    });

    return Array.from(byRank.entries())
      .map(([rank, name]) => ({ rank, name }))
      .sort((a, b) => a.rank - b.rank);
  }

  function applyPastedRows(rows) {
    const t12 = Array.from({length:12}, () => "");
    const n12 = Array.from({length:12}, () => "");
    rows.forEach((r) => {
      if (r.rank >= 1 && r.rank <= 12) t12[r.rank - 1] = r.name;
      else if (r.rank >= 13 && r.rank <= 24) n12[r.rank - 13] = r.name;
    });
    setTop12Names(t12);
    setNext12Names(n12);
    setParsed(null);
    setError("");
  }

  function handleParsePaste() {
    const rows = parsePastedRows(pasteText);
    if (!rows.length) {
      setError("Could not parse any rank/name rows. Paste lines containing rank (1-24) and player name.");
      return;
    }
    applyPastedRows(rows);
  }

  function buildRankedRows(names, startRank) {
    return names
      .map((name, idx) => ({ rank: startRank + idx, name: String(name || "").trim() }))
      .filter((r) => r.name);
  }

  function parseInput() {
    setError("");

    const top12 = buildRankedRows(top12Names, 1);
    const next12 = buildRankedRows(next12Names, 13);
    const top24 = [...top12, ...next12];

    if (!top24.length) {
      setParsed(null);
      setError("Enter at least one player in ranks 1-24.");
      return;
    }

    const unmatched = top24
      .map((r) => r.name)
      .filter((name) => !normalizedPlayers[normalizePlayerName(name)]);

    const matched = top24.length - unmatched.length;
    setParsed({ top12, top24, unmatched, matched });
  }

  function handleSave() {
    if (!parsed) return;
    onSave(String(year), { top12: parsed.top12, top24: parsed.top24, unmatched: parsed.unmatched });
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#0d1117',border:'1px solid rgba(240,192,64,0.28)',borderRadius:12,width:'100%',maxWidth:700,maxHeight:'90vh',overflowY:'auto',padding:isMobile?14:24,fontFamily:'monospace'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#f0c040',letterSpacing:1}}>UPLOAD NFL FINISH SEASON</div>
            <div style={{fontSize:10,color:'#555',marginTop:3}}>Type player names into fixed ranks 1-12 and 13-24 (no rank typing needed)</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#555',fontSize:18,cursor:'pointer'}}>✕</button>
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>SEASON YEAR</label>
          <div style={{position:'relative',display:'inline-block'}}>
            <select value={String(year)} onChange={e=>setYear(Number(e.target.value))}
              style={{appearance:'none',WebkitAppearance:'none',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(240,192,64,0.3)',borderRadius:7,color:'#f0c040',fontSize:13,padding:'8px 30px 8px 12px',fontFamily:'monospace',width:140,outline:'none',cursor:'pointer'}}>
              {Array.from({length:2050-2015+1},(_,i)=>2015+i).map((yr)=>(
                <option key={yr} value={String(yr)}>{yr}</option>
              ))}
            </select>
            <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',color:'#777',fontSize:9,pointerEvents:'none'}}>v</span>
          </div>
          {existing[String(year)] && <span style={{fontSize:10,color:'#f0873a',marginLeft:10}}>⚠ Will overwrite saved finish data for {String(year)}</span>}
        </div>

        <div style={{background:'rgba(240,192,64,0.05)',border:'1px solid rgba(240,192,64,0.15)',borderRadius:8,padding:'10px 12px',fontSize:9,color:'#777',lineHeight:1.6,marginBottom:12}}>
          Left column ranks 1-12 powers Top-12 data. Right column ranks 13-24 extends Top-24 data.
        </div>

        <div style={{marginBottom:12}}>
          <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>QUICK PASTE (RANK + PLAYER NAME)</label>
          <textarea
            value={pasteText}
            onChange={(e)=>{ setPasteText(e.target.value); setError(""); }}
            placeholder={"Paste rows from website/Excel (tab, comma, or text). Example:\n1\tSaquon Barkley\n2\tChristian McCaffrey\n..."}
            style={{width:'100%',minHeight:95,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#ccc',fontSize:10,padding:'10px 11px',fontFamily:'monospace',lineHeight:1.45,resize:'vertical',outline:'none'}}
          />
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:7}}>
            <div style={{fontSize:9,color:'#666'}}>Parses ranks 1-24 and fills the form below automatically.</div>
            <button onClick={handleParsePaste}
              style={{padding:'6px 12px',borderRadius:7,border:'1px solid rgba(77,166,255,0.35)',background:'rgba(77,166,255,0.1)',color:'#4da6ff',fontSize:9,cursor:'pointer',fontFamily:'monospace',letterSpacing:1}}>
              PARSE PASTE →
            </button>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12,marginBottom:12}}>
          <div>
            <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>RANKS 1-12 (TOP-12)</label>
            <div style={{display:'grid',gap:6}}>
              {Array.from({length:12}, (_, i) => (
                <div key={`t12-${i}`} style={{display:'grid',gridTemplateColumns:'38px 1fr',gap:6,alignItems:'center'}}>
                  <div style={{fontSize:10,color:'#f0c040',textAlign:'right'}}>#{i + 1}</div>
                  <input
                    type="text"
                    value={top12Names[i]}
                    onChange={e=>updateName(setTop12Names, i, e.target.value)}
                    placeholder="Player name"
                    style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:'#ccc',fontSize:10,padding:'7px 9px',fontFamily:'monospace',outline:'none'}}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>RANKS 13-24 (TOP-24 EXTENSION)</label>
            <div style={{display:'grid',gap:6}}>
              {Array.from({length:12}, (_, i) => (
                <div key={`t24-${i}`} style={{display:'grid',gridTemplateColumns:'38px 1fr',gap:6,alignItems:'center'}}>
                  <div style={{fontSize:10,color:'#4da6ff',textAlign:'right'}}>#{i + 13}</div>
                  <input
                    type="text"
                    value={next12Names[i]}
                    onChange={e=>updateName(setNext12Names, i, e.target.value)}
                    placeholder="Player name"
                    style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:'#ccc',fontSize:10,padding:'7px 9px',fontFamily:'monospace',outline:'none'}}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <button onClick={parseInput}
          style={{padding:'8px 18px',borderRadius:7,border:'1px solid rgba(240,192,64,0.4)',background:'rgba(240,192,64,0.1)',color:'#f0c040',fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1,marginBottom:14}}>
          PREVIEW →
        </button>

        {error && <div style={{color:'#e05050',fontSize:10,marginBottom:10}}>⚠ {error}</div>}

        {parsed && (
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
            <div style={{fontSize:9,color:'#555',letterSpacing:2,marginBottom:8}}>
              PREVIEW · Top-12 {parsed.top12.length} players · Top-24 {parsed.top24.length} players
            </div>
            <div style={{fontSize:10,color:'#aaa',marginBottom:6}}>
              Matched players in database: <span style={{color:'#5dbf6a'}}>{parsed.matched}</span> / {parsed.top24.length}
            </div>
            {parsed.unmatched.length > 0 && (
              <div style={{fontSize:9,color:'#f0873a',lineHeight:1.6}}>
                Unmatched names (will be ignored until player exists): {parsed.unmatched.join(', ')}
              </div>
            )}
            <button onClick={handleSave}
              style={{marginTop:10,padding:'8px 20px',borderRadius:7,border:'1px solid rgba(93,191,106,0.4)',background:'rgba(93,191,106,0.1)',color:'#5dbf6a',fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1}}>
              SAVE FINISH DATA FOR {year} ✓
            </button>
          </div>
        )}

        {Object.keys(existing || {}).length > 0 && (
          <div style={{marginTop:16,borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:14}}>
            <div style={{fontSize:9,color:'#555',letterSpacing:2,marginBottom:8}}>UPLOADED FINISH SEASONS</div>
            {Object.entries(existing).sort(([a],[b])=>Number(b)-Number(a)).map(([yr, data])=>{
              const t12 = Array.isArray(data?.top12) ? data.top12.length : 0;
              const t24 = Array.isArray(data?.top24) ? data.top24.length : 0;
              return (
                <div key={yr} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <span style={{fontSize:11,color:'#aaa'}}>{yr} — Top-12: {t12} · Top-24: {t24}</span>
                  <button onClick={()=>{const n={...existing};delete n[yr];onSave(null,null,n);}}
                    style={{background:'none',border:'none',color:'#e05050',fontSize:10,cursor:'pointer'}}>remove</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SeasonsPlayedModal({onClose, onSave, existing, players}) {
  const isMobile = useIsMobile(768);
  const [year, setYear] = React.useState(() => {
    const now = new Date().getFullYear();
    return Math.max(2015, Math.min(2050, now));
  });
  const [pasteText, setPasteText] = React.useState("");
  const [parsed, setParsed] = React.useState(null);
  const [error, setError] = React.useState("");

  const normalizedPlayers = React.useMemo(() => {
    const idx = {};
    Object.keys(players || {}).forEach((name) => {
      idx[normalizePlayerName(name)] = name;
    });
    return idx;
  }, [players]);

  function splitCells(line) {
    const raw = String(line || "").trim();
    if (!raw) return [];
    if (raw.includes("\t")) return raw.split("\t").map((c) => c.trim());
    if (raw.includes(",")) return raw.split(",").map((c) => c.trim());
    return [raw];
  }

  function parseAttempts(value) {
    const cleaned = String(value == null ? "" : value)
      .replace(/,/g, "")
      .replace(/\s+/g, "")
      .trim();
    if (!cleaned) return null;
    if (!/^[-+]?\d+(?:\.\d+)?$/.test(cleaned)) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function detectColumns(headerRow) {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const cells = (headerRow || []).map(norm);
    let nameCol = -1;
    let attCol = -1;

    for (let i = 0; i < cells.length; i += 1) {
      const h = cells[i];
      if (nameCol < 0 && (h.includes("player") || h === "name" || h.includes("athlete"))) nameCol = i;
      if (attCol < 0 && (h.includes("rushattempt") || h.includes("rushingattempt") || h.includes("rushatt") || h === "att" || h === "attempts" || h === "carries")) attCol = i;
    }

    if (nameCol < 0 || attCol < 0) return null;
    return { nameCol, attCol };
  }

  function isLikelyNameCell(value) {
    const s = String(value || "").trim();
    if (!s) return false;
    if (!/[a-zA-Z]/.test(s)) return false;
    if (/^\d+$/.test(s)) return false;
    const compact = s.replace(/[^A-Za-z]/g, "");
    if (!compact) return false;
    if (compact.length <= 3 && s === s.toUpperCase()) return false;
    return true;
  }

  function inferHeaderlessNameAndAttempts(row) {
    if (!Array.isArray(row) || !row.length) return null;

    const nameIdx = row.findIndex((cell) => isLikelyNameCell(cell));
    if (nameIdx < 0) return null;
    const rawName = String(row[nameIdx] || "").trim();
    if (!rawName) return null;

    // Common headerless layouts:
    // 1) Name, RushAtt, ...
    // 2) Rank, Name, RushAtt, ...
    let attempts = null;

    if (nameIdx === 0 && row.length > 1) {
      const cand = parseAttempts(row[1]);
      if (cand != null) attempts = cand;
    }
    if (attempts == null && nameIdx === 1 && row.length > 2) {
      const cand = parseAttempts(row[2]);
      if (cand != null) attempts = cand;
    }

    // Fallback: pick the first numeric cell after name that can reasonably be rush attempts.
    if (attempts == null) {
      for (let i = nameIdx + 1; i < row.length; i += 1) {
        const cand = parseAttempts(row[i]);
        if (cand == null) continue;
        if (cand >= 0 && cand <= 500) {
          attempts = cand;
          break;
        }
      }
    }

    if (attempts == null) return null;
    return { rawName, attempts };
  }

  function parseInput() {
    setError("");
    const lines = String(pasteText || "").split(/\r?\n/).filter((l) => String(l || "").trim());
    if (!lines.length) {
      setParsed(null);
      setError("Paste your table first.");
      return;
    }

    const rows = lines.map(splitCells).filter((r) => r.length > 0);
    let headerIndex = -1;
    let columns = null;

    for (let i = 0; i < rows.length; i += 1) {
      const found = detectColumns(rows[i]);
      if (found) {
        headerIndex = i;
        columns = found;
        break;
      }
    }

    const dataRows = columns ? rows.slice(headerIndex + 1) : rows;
    const matchedSet = new Set();
    const unmatchedSet = new Set();
    const dedupByInputName = new Map();
    let parsedRows = 0;
    let positiveRushRows = 0;

    const addParsedRow = (rawName, attempts) => {
      const name = String(rawName || "").trim();
      if (!name || attempts == null) return;
      parsedRows += 1;

      const norm = normalizePlayerName(name);
      if (!norm) return;
      const prev = dedupByInputName.get(norm) || { name, hasPositiveRush: false };
      const hasPositiveRush = prev.hasPositiveRush || attempts > 0;
      dedupByInputName.set(norm, { name: prev.name || name, hasPositiveRush });
      if (attempts > 0) positiveRushRows += 1;
    };

    dataRows.forEach((row) => {
      if (columns) {
        if (row.length <= Math.max(columns.nameCol, columns.attCol)) return;
        const rawName = String(row[columns.nameCol] || "").trim();
        const attempts = parseAttempts(row[columns.attCol]);
        addParsedRow(rawName, attempts);
        return;
      }

      const inferred = inferHeaderlessNameAndAttempts(row);
      if (!inferred) return;
      addParsedRow(inferred.rawName, inferred.attempts);
    });

    dedupByInputName.forEach((entry, inputNormName) => {
      if (!entry?.hasPositiveRush) return;
      const resolved = normalizedPlayers[inputNormName];
      if (resolved) matchedSet.add(resolved);
      else unmatchedSet.add(entry.name);
    });

    const matchedPlayers = Array.from(matchedSet).sort((a, b) => a.localeCompare(b));
    const unmatchedPlayers = Array.from(unmatchedSet).sort((a, b) => a.localeCompare(b));

    if (!parsedRows) {
      setParsed(null);
      setError("No valid player rows were parsed from the table.");
      return;
    }

    setParsed({
      parsedRows,
      positiveRushRows,
      uniqueInputNames: dedupByInputName.size,
      matchedPlayers,
      unmatchedPlayers,
      parseMode: columns ? "header" : "headerless",
    });
  }

  function handleSave() {
    if (!parsed) return;
    onSave(String(year), {
      players: parsed.matchedPlayers,
      unmatched: parsed.unmatchedPlayers,
    });
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#0d1117',border:'1px solid rgba(93,191,106,0.3)',borderRadius:12,width:'100%',maxWidth:720,maxHeight:'90vh',overflowY:'auto',padding:isMobile?14:24,fontFamily:'monospace'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#5dbf6a',letterSpacing:1}}>UPLOAD SEASONS PLAYED</div>
            <div style={{fontSize:10,color:'#555',marginTop:3}}>Paste full table, parse player + rush attempts, add +1 season for matched players with attempts &gt; 0</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#555',fontSize:18,cursor:'pointer'}}>✕</button>
        </div>

        <div style={{marginBottom:12}}>
          <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>SEASON YEAR</label>
          <div style={{position:'relative',display:'inline-block'}}>
            <select value={String(year)} onChange={e=>setYear(Number(e.target.value))}
              style={{appearance:'none',WebkitAppearance:'none',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(93,191,106,0.35)',borderRadius:7,color:'#5dbf6a',fontSize:13,padding:'8px 30px 8px 12px',fontFamily:'monospace',width:140,outline:'none',cursor:'pointer'}}>
              {Array.from({length:2050-2015+1},(_,i)=>2015+i).map((yr)=>(
                <option key={yr} value={String(yr)}>{yr}</option>
              ))}
            </select>
            <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',color:'#777',fontSize:9,pointerEvents:'none'}}>v</span>
          </div>
          {existing[String(year)] && <span style={{fontSize:10,color:'#f0873a',marginLeft:10}}>⚠ Will overwrite saved seasons-played update for {String(year)}</span>}
        </div>

        <div style={{background:'rgba(93,191,106,0.06)',border:'1px solid rgba(93,191,106,0.18)',borderRadius:8,padding:'10px 12px',fontSize:9,color:'#777',lineHeight:1.6,marginBottom:12}}>
          Paste the full source table. The parser only uses two columns: <strong>player name</strong> and <strong>rush attempts</strong>.<br/>
          Rules: attempts must be numeric, players with attempts 0 are ignored, matched players get +1 to NFL career seasons.<br/>
          Duplicate names are counted once per upload year. If any duplicate row has rush attempts &gt; 0, that player is counted; if all duplicate rows are 0, that player is filtered out.
        </div>

        <div style={{marginBottom:12}}>
          <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>PASTE TABLE</label>
          <textarea
            value={pasteText}
            onChange={(e)=>{ setPasteText(e.target.value); setParsed(null); setError(''); }}
            placeholder={'Player, Team, Rush Att, Rush Yds, ...\nSaquon Barkley, PHI, 295, 1430, ...'}
            style={{width:'100%',minHeight:150,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#ccc',fontSize:10,padding:'10px 11px',fontFamily:'monospace',lineHeight:1.45,resize:'vertical',outline:'none'}}
          />
        </div>

        <button onClick={parseInput}
          style={{padding:'8px 18px',borderRadius:7,border:'1px solid rgba(93,191,106,0.45)',background:'rgba(93,191,106,0.12)',color:'#5dbf6a',fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1,marginBottom:14}}>
          PARSE →
        </button>

        {error && <div style={{color:'#e05050',fontSize:10,marginBottom:10}}>⚠ {error}</div>}

        {parsed && (
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
            <div style={{fontSize:9,color:'#555',letterSpacing:2,marginBottom:8}}>PREVIEW</div>
            <div style={{fontSize:10,color:'#aaa',lineHeight:1.8}}>
              Parse mode: <span style={{color:'#fff'}}>{parsed.parseMode === 'header' ? 'Header columns detected' : 'Headerless fallback'}</span><br/>
              Parsed rows: <span style={{color:'#fff'}}>{parsed.parsedRows}</span><br/>
              Rows with rush attempts &gt; 0: <span style={{color:'#fff'}}>{parsed.positiveRushRows}</span><br/>
              Unique input names (deduped): <span style={{color:'#fff'}}>{parsed.uniqueInputNames}</span><br/>
              Matched players (+1 season): <span style={{color:'#5dbf6a'}}>{parsed.matchedPlayers.length}</span><br/>
              Unmatched players: <span style={{color:'#f0873a'}}>{parsed.unmatchedPlayers.length}</span>
            </div>

            {parsed.unmatchedPlayers.length > 0 && (
              <div style={{fontSize:9,color:'#f0873a',lineHeight:1.6,marginTop:8}}>
                Unmatched names (ignored): {parsed.unmatchedPlayers.join(', ')}
              </div>
            )}

            <button onClick={handleSave}
              style={{marginTop:10,padding:'8px 20px',borderRadius:7,border:'1px solid rgba(93,191,106,0.4)',background:'rgba(93,191,106,0.1)',color:'#5dbf6a',fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1}}>
              SAVE SEASONS PLAYED FOR {year} ✓
            </button>
          </div>
        )}

        {Object.keys(existing || {}).length > 0 && (
          <div style={{marginTop:16,borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:14}}>
            <div style={{fontSize:9,color:'#555',letterSpacing:2,marginBottom:8}}>UPLOADED SEASONS PLAYED UPDATES</div>
            {Object.entries(existing).sort(([a],[b])=>Number(b)-Number(a)).map(([yr, data])=>{
              const cnt = Array.isArray(data?.players) ? data.players.length : 0;
              return (
                <div key={yr} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <span style={{fontSize:11,color:'#aaa'}}>{yr} — +1 season applied to {cnt} players</span>
                  <button onClick={()=>{const n={...existing};delete n[yr];onSave(null,null,n);}}
                    style={{background:'none',border:'none',color:'#e05050',fontSize:10,cursor:'pointer'}}>remove</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PasscodeModal({onSuccess, onClose}) {
  const CORRECT = '098989';
  const isMobile = useIsMobile(520);
  const [digits, setDigits] = React.useState(['','','','','','']);
  const [error,  setError]  = React.useState(false);
  const [shake,  setShake]  = React.useState(false);
  const refs = Array.from({length:6}, ()=>React.useRef(null));

  React.useEffect(()=>{ refs[0].current&&refs[0].current.focus(); },[]);

  function handleChange(i, val) {
    const v = val.replace(/\D/,'').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError(false);
    if(v && i < 5) {
      refs[i+1].current&&refs[i+1].current.focus();
    }
    // Check if complete
    const code = next.join('');
    if(code.length === 6 && !next.includes('')) {
      if(code === CORRECT) {
        onSuccess();
      } else {
        setShake(true);
        setError(true);
        setTimeout(()=>{
          setDigits(['','','','','','']);
          setShake(false);
          refs[0].current&&refs[0].current.focus();
        }, 800);
      }
    }
  }

  function handleKeyDown(i, e) {
    if(e.key==='Backspace') {
      if(digits[i]) {
        const next=[...digits]; next[i]=''; setDigits(next);
      } else if(i>0) {
        refs[i-1].current&&refs[i-1].current.focus();
        const next=[...digits]; next[i-1]=''; setDigits(next);
      }
      setError(false);
    } else if(e.key==='ArrowLeft'&&i>0) {
      refs[i-1].current&&refs[i-1].current.focus();
    } else if(e.key==='ArrowRight'&&i<5) {
      refs[i+1].current&&refs[i+1].current.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);
    if(!text) return;
    const next = ['','','','','',''];
    text.split('').forEach((c,i)=>{ if(i<6) next[i]=c; });
    setDigits(next);
    const lastFilled = Math.min(text.length, 5);
    refs[lastFilled].current&&refs[lastFilled].current.focus();
    if(text.length===6) {
      if(text===CORRECT) onSuccess();
      else { setShake(true); setError(true); setTimeout(()=>{ setDigits(['','','','','','']); setShake(false); refs[0].current&&refs[0].current.focus(); },800); }
    }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:isMobile?10:20}}>
      <div style={{
        background:'linear-gradient(145deg,#0d1117,#111827)',
        border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:16,
        padding:isMobile?'16px 8px':'32px 28px',
        width:'100%',
        maxWidth:isMobile?280:360,
        textAlign:'center',
        fontFamily:'monospace',
      }}>
        {/* Lock icon */}
        <div style={{fontSize:isMobile?30:36,marginBottom:isMobile?10:16}}>🔐</div>

        {/* Title */}
        <div style={{fontSize:isMobile?14:15,fontWeight:700,color:'#fff',marginBottom:isMobile?6:8,letterSpacing:-0.3}}>
          Developer Access
        </div>

        {/* Prompt */}
        <div style={{fontSize:isMobile?10:11,color:'#666',lineHeight:isMobile?1.55:1.7,marginBottom:isMobile?14:24}}>
          Enter passcode to access this feature.<br/>
          <em style={{color:'#555'}}>Only developer(s) will have this code.</em>
        </div>

        {/* 6-digit boxes */}
        <div style={{
          display:'flex',
          gap:isMobile?3:10,
          justifyContent:'center',
          marginBottom:isMobile?12:20,
          animation: shake ? 'passShake 0.4s ease' : 'none',
        }}>
          <style>{`
            @keyframes passShake {
              0%,100%{transform:translateX(0)}
              20%{transform:translateX(-8px)}
              40%{transform:translateX(8px)}
              60%{transform:translateX(-6px)}
              80%{transform:translateX(6px)}
            }
            .passbox:focus { border-color: #f0c040 !important; box-shadow: 0 0 0 2px rgba(240,192,64,0.2); }
          `}</style>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              className="passbox"
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e=>handleChange(i,e.target.value)}
              onKeyDown={e=>handleKeyDown(i,e)}
              onPaste={handlePaste}
              style={{
                width:isMobile?26:44,
                height:isMobile?36:54,
                textAlign:'center',
                fontSize:isMobile?14:22,
                fontWeight:700,
                fontFamily:'monospace',
                background: d ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.06)',
                border: `2px solid ${error?'rgba(224,80,80,0.6)': d?'rgba(240,192,64,0.4)':'rgba(255,255,255,0.15)'}`,
                borderRadius:10,
                color: error ? '#e05050' : '#f0c040',
                outline:'none',
                caretColor:'transparent',
                transition:'border-color 0.15s, background 0.15s',
              }}
            />
          ))}
        </div>

        {/* Error */}
        <div style={{
          height:18,
          fontSize:isMobile?10:11,
          color:'#e05050',
          marginBottom:isMobile?10:16,
          transition:'opacity 0.2s',
          opacity: error ? 1 : 0,
        }}>
          Incorrect passcode. Try again.
        </div>

        {/* Cancel */}
        <button onClick={onClose}
          style={{background:'none',border:'1px solid rgba(255,255,255,0.1)',color:'#555',padding:'7px 20px',borderRadius:8,fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1}}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

function DeletePlayerModal({
  onClose,
  onDelete,
  allNames,
  allData,
  customPlayers,
  playerOverrides,
  customSeasons,
  customFinishSeasons,
  customSeasonsPlayed,
  deletedPlayers,
}) {
  const isMobile = useIsMobile(760);
  const [query, setQuery] = React.useState("");
  const [selectedName, setSelectedName] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(-1);
  const [error, setError] = React.useState("");
  const [scope, setScope] = React.useState({
    all: false,
    customProfile: true,
    overrides: true,
    seasonStats: true,
    finishRefs: true,
    seasonsPlayedRefs: true,
    databaseDelete: true,
  });

  const candidateNames = React.useMemo(() => {
    const set = new Set([...(Array.isArray(allNames) ? allNames : []), ...Object.keys(deletedPlayers || {})]);
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
  }, [allNames, deletedPlayers]);

  const selectedData = selectedName ? (allData?.[selectedName] || null) : null;
  const hasCustomProfile = !!(selectedName && customPlayers && customPlayers[selectedName]);
  const hasOverrides = !!(selectedName && playerOverrides && playerOverrides[selectedName]);
  const hasSeasonStats = !!(selectedName && customSeasons && customSeasons[selectedName]);
  const hasFinishRefs = React.useMemo(() => {
    if (!selectedName) return false;
    return Object.values(customFinishSeasons || {}).some((row) => {
      const top12 = Array.isArray(row?.top12) ? row.top12 : [];
      const top24 = Array.isArray(row?.top24) ? row.top24 : [];
      return top12.some((x) => String(x?.name || "") === selectedName) || top24.some((x) => String(x?.name || "") === selectedName);
    });
  }, [selectedName, customFinishSeasons]);
  const hasSeasonsPlayedRefs = React.useMemo(() => {
    if (!selectedName) return false;
    return Object.values(customSeasonsPlayed || {}).some((row) => {
      const players = Array.isArray(row?.players) ? row.players : [];
      return players.some((x) => String(x || "") === selectedName);
    });
  }, [selectedName, customSeasonsPlayed]);
  const isDeleted = !!(selectedName && deletedPlayers && deletedPlayers[selectedName]);

  const suggestions = React.useMemo(() => {
    const q = String(query || "").toLowerCase().trim();
    if (!q) return [];
    return candidateNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 10);
  }, [query, candidateNames]);

  const choosePlayer = (name) => {
    setSelectedName(name);
    setQuery(name);
    setActiveIdx(-1);
    setError("");
  };

  const toggleAll = () => {
    setScope((prev) => {
      const nextAll = !prev.all;
      if (!nextAll) return { ...prev, all: false };
      return {
        all: true,
        customProfile: true,
        overrides: true,
        seasonStats: true,
        finishRefs: true,
        seasonsPlayedRefs: true,
        databaseDelete: true,
      };
    });
  };

  const handleDelete = () => {
    if (!selectedName) {
      setError("Pick a player first.");
      return;
    }
    const hasAnyScope = scope.all || scope.customProfile || scope.overrides || scope.seasonStats || scope.finishRefs || scope.seasonsPlayedRefs || scope.databaseDelete;
    if (!hasAnyScope) {
      setError("Select at least one delete option.");
      return;
    }
    onDelete(selectedName, scope);
    onClose();
  };

  const Opt = ({label, keyName, enabled = true, note}) => (
    <label style={{display:"block",opacity:enabled?1:0.45,padding:"7px 9px",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,background:"rgba(255,255,255,0.02)",cursor:enabled?"pointer":"not-allowed"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input
          type="checkbox"
          checked={!!scope[keyName] || !!scope.all}
          disabled={!enabled || !!scope.all}
          onChange={() => setScope((prev) => ({ ...prev, [keyName]: !prev[keyName], all: false }))}
          style={{accentColor:"#e05050"}}
        />
        <span style={{fontSize:11,color:"#ddd"}}>{label}</span>
      </div>
      {note ? <div style={{fontSize:9,color:"#666",marginTop:4,paddingLeft:22}}>{note}</div> : null}
    </label>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:2300,display:"flex",alignItems:"center",justifyContent:"center",padding:isMobile?10:20}}>
      <div style={{background:"#0f1521",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,width:"100%",maxWidth:820,maxHeight:"92vh",overflow:"auto",padding:isMobile?12:18,fontFamily:"monospace"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:14,color:"#e05050",fontWeight:800,letterSpacing:0.4}}>DELETE PLAYER DATA</div>
            <div style={{fontSize:10,color:"#666",marginTop:3}}>Passcode-protected destructive actions</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:7,color:"#aaa",padding:"6px 10px",fontSize:10,cursor:"pointer"}}>CLOSE</button>
        </div>

        <div style={{position:"relative",marginBottom:10}}>
          <label style={{display:"block",fontSize:9,color:"#555",letterSpacing:1.5,marginBottom:4}}>PLAYER TYPEAHEAD</label>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
            onKeyDown={(e) => {
              if (!suggestions.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") {
                if (activeIdx >= 0 && activeIdx < suggestions.length) {
                  e.preventDefault();
                  choosePlayer(suggestions[activeIdx]);
                }
              }
              else if (e.key === "Escape") setActiveIdx(-1);
            }}
            placeholder="Start typing a player name"
            style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#ddd",padding:"9px 11px",fontSize:11,outline:"none"}}
          />
          {suggestions.length > 0 && query !== selectedName && (
            <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"#121a27",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"0 0 8px 8px",maxHeight:220,overflowY:"auto"}}>
              {suggestions.map((name, i) => (
                <button key={name} onMouseDown={(e)=>{e.preventDefault();choosePlayer(name);}} style={{display:"block",width:"100%",textAlign:"left",padding:"8px 10px",background:i===activeIdx?"rgba(240,192,64,0.1)":"transparent",border:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",color:"#ddd",fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>{name}</button>
              ))}
            </div>
          )}
        </div>

        {selectedName && (
          <div style={{marginBottom:10,padding:"8px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8}}>
            <div style={{fontSize:12,color:"#fff",fontWeight:700}}>{selectedName}</div>
            <div style={{fontSize:9,color:"#666",marginTop:3}}>
              Rank: {selectedData?.rank ?? "-"} · Class: {selectedData?.draft_class || "-"} · {isDeleted ? "Already deleted from database view" : "Visible in database view"}
            </div>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:8,marginBottom:10}}>
          <label style={{display:"block",padding:"8px 10px",border:"1px solid rgba(224,80,80,0.35)",borderRadius:7,background:"rgba(224,80,80,0.08)",cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="checkbox" checked={!!scope.all} onChange={toggleAll} style={{accentColor:"#e05050"}} />
              <span style={{fontSize:11,color:"#ffb3b3",fontWeight:700}}>ALL (Full wipe)</span>
            </div>
            <div style={{fontSize:9,color:"#d78b8b",marginTop:4,paddingLeft:22}}>Deletes profile data, all related custom stats, and removes player from database view.</div>
          </label>

          <Opt keyName="databaseDelete" label="Delete from database view" enabled={!!selectedName} note="Hides this player from rankings/search/results (used for complete delete behavior)." />
          <Opt keyName="customProfile" label="Delete custom player profile" enabled={!!selectedName && hasCustomProfile} note={hasCustomProfile?"Custom player record will be removed.":"No custom player record found for this player."} />
          <Opt keyName="overrides" label="Delete edit overrides" enabled={!!selectedName && hasOverrides} note={hasOverrides?"Manual edit overrides will be removed.":"No edit overrides found."} />
          <Opt keyName="seasonStats" label="Delete custom season stats" enabled={!!selectedName && hasSeasonStats} note={hasSeasonStats?"Custom season rows will be removed.":"No custom season stats found."} />
          <Opt keyName="finishRefs" label="Delete NFL finish refs" enabled={!!selectedName && hasFinishRefs} note={hasFinishRefs?"Removes player from custom top-12/top-24 year lists.":"No custom finish references found."} />
          <Opt keyName="seasonsPlayedRefs" label="Delete seasons played refs" enabled={!!selectedName && hasSeasonsPlayedRefs} note={hasSeasonsPlayedRefs?"Removes player from custom seasons-played year lists.":"No custom seasons-played references found."} />
        </div>

        {error ? <div style={{marginBottom:8,fontSize:10,color:"#e05050"}}>{error}</div> : null}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
          <div style={{fontSize:9,color:"#666"}}>Tip: Use ALL for a complete wipe, or pick individual scopes.</div>
          <button onClick={handleDelete} style={{background:"rgba(224,80,80,0.15)",border:"1px solid rgba(224,80,80,0.4)",borderRadius:8,color:"#e05050",padding:"8px 14px",fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",fontFamily:"monospace"}}>DELETE SELECTED DATA</button>
        </div>
      </div>
    </div>
  );
}

function RScoreNote() {
  const [open,setOpen] = React.useState(false);
  return (
    <div style={{marginBottom:16,borderRadius:8,border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"none",padding:"9px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:"#aaa",fontFamily:"monospace"}}>
        <span style={{fontSize:10,letterSpacing:1,color:"#888"}}>❓ ARE THESE R SCORES STRONG? — click to expand</span>
        <span style={{fontSize:12,color:"#555",transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▾</span>
      </button>
      {open&&(
        <div style={{padding:"14px 16px",background:"rgba(0,0,0,0.3)",fontSize:10,color:"#888",lineHeight:1.7}}>
          <p style={{margin:"0 0 10px",color:"#bbb",fontWeight:700}}>Short answer: moderate for draft capital and production metrics, weak for athleticism.</p>
          <p style={{margin:"0 0 10px"}}>
            Pearson r is interpreted as: <span style={{color:"#5dbf6a"}}>0.70+ strong</span> · <span style={{color:"#f0c040"}}>0.50–0.69 moderate</span> · <span style={{color:"#f0873a"}}>0.30–0.49 weak-to-moderate</span> · <span style={{color:"#e05050"}}>below 0.30 weak</span>.
            Our best scores — Draft Round (r = 0.532) and Draft Pick (r = 0.522) predicting T24 rate — both land in the moderate tier. Prospect Score follows at r = 0.465. Production and trajectory metrics cluster in the weak-to-moderate range (r = 0.26–0.43), and athletic metrics are genuinely weak (r ≈ 0.14–0.16).
          </p>
          <p style={{margin:"0 0 10px"}}>
            <span style={{color:"#ccc",fontWeight:600}}>Why this isn't surprising:</span> NFL career outcomes are shaped by factors no college model can see — offensive line quality, coaching scheme, injuries, opportunity, and depth chart. Even elite NFL front offices struggle to exceed r ≈ 0.55 on individual career predictions. For context, draft position predicting career success in academic literature typically produces r ≈ 0.45–0.55 — our r = 0.532 sits squarely in that range. Combine metrics alone rarely exceed r = 0.20.
          </p>
          <p style={{margin:"0 0 10px"}}>
            <span style={{color:"#ccc",fontWeight:600}}>What the scores mean practically:</span> r = 0.532 means draft round explains about <span style={{color:"#4da6ff"}}>28% of the variance</span> in top-24 finish rates (r² = 0.28). The Prospect Score at r = 0.465 explains <span style={{color:"#4da6ff"}}>22%</span> (r² = 0.22). That sounds modest, but these are real, actionable signals — meaningfully better than chance and far better than athleticism alone (which explains less than 3%).
          </p>
          <p style={{margin:0,color:"#666"}}>
            <span style={{color:"#888",fontWeight:600}}>Honest framing:</span> this model is best understood as a <em>prospect grading tool</em> (ranking relative college quality) rather than a <em>career outcome predictor</em>. The r scores confirm it has real predictive validity — just not the kind that guarantees top-12 outcomes. That's true of virtually every pre-draft model in existence.
          </p>
        </div>
      )}
    </div>
  );
}

function ValModal({onClose}) {
  const isMobile = useIsMobile(768);
  const tc={Elite:"#f0c040",Starter:"#5dbf6a",Rotational:"#4da6ff",Developmental:"#c084fc",Fringe:"#888"};

  // Live-computed correlations (Pearson r, per-season basis, n=166)
  const TOP12_METRICS = [
    {label:"Draft Round",       r:0.421, note:"Earlier draft round is the strongest single predictor of top-12 seasons"},
    {label:"Draft Pick",        r:0.415, note:"Pick number directly reflects team valuation and opportunity"},
    {label:"Prospect Score",    r:0.387, note:"Overall model score correlates strongly with T12 rate"},
    {label:"Recv Trajectory",   r:0.366, note:"Pass-catching profile — a key differentiator for elite usage"},
    {label:"Prod Trajectory",   r:0.358, note:"Sustained college production volume translates to NFL starter usage"},
    {label:"PFF Board",         r:0.337, note:"Draft-day evaluation quality signal"},
    {label:"Traj Peak",         r:0.280, note:"College ceiling predicts NFL ceiling"},
    {label:"Traj Final",        r:0.280, note:"Most recent season quality carries forward"},
    {label:"Rush Trajectory",   r:0.260, note:"Core rushing profile still matters for elite usage"},
    {label:"40-Yard Dash Rank", r:0.144, note:"Speed matters less than production and draft capital for T12 outcomes"},
  ];
  const TOP24_METRICS = [
    {label:"Draft Round",       r:0.532, note:"The strongest predictor — earlier round means more opportunity and team investment"},
    {label:"Draft Pick",        r:0.522, note:"Pick number reflects team commitment and role clarity"},
    {label:"Prospect Score",    r:0.465, note:"Best single production-based predictor of any top-24 season"},
    {label:"Prod Trajectory",   r:0.429, note:"Sustained college production volume translates directly"},
    {label:"PFF Board",         r:0.409, note:"PFF evaluation quality predicts NFL role attainment"},
    {label:"Recv Trajectory",   r:0.363, note:"Receiving versatility extends fantasy relevance"},
    {label:"Traj Peak",         r:0.354, note:"College peak season predicts NFL breakout potential"},
    {label:"Rush Trajectory",   r:0.348, note:"Core rushing production ensures RB usage share"},
    {label:"Traj Final",        r:0.340, note:"Final college season momentum carries into rookie year"},
    {label:"40-Yard Dash Rank", r:0.156, note:"Speed modestly predicts top-24 reach across career"},
  ];

  // Tier rates — per-season basis
  const tierOrder=["Elite","Starter","Rotational","Developmental","Fringe"];
  const tiers = tierOrder.map(tier=>{
    const inTier = Object.values(ALL_PLAYERS).filter(p=>p.tier===tier&&p.nfl&&(p.nfl.career_seasons||0)>0);
    const n = inTier.length;
    if(!n) return null;
    const totalCareer = inTier.reduce((s,p)=>s+(p.nfl.career_seasons||0),0);
    const totalT12    = inTier.reduce((s,p)=>s+(p.nfl.top12||0),0);
    const totalT24    = inTier.reduce((s,p)=>s+(p.nfl.top24||0),0);
    return {tier, n, career:totalCareer,
      top12_rate: totalCareer>0 ? Math.round(totalT12/totalCareer*100) : 0,
      top24_rate: totalCareer>0 ? Math.round(totalT24/totalCareer*100) : 0,
    };
  }).filter(Boolean);

  const RBar=({label,r,note,color})=>{
    const pct=Math.abs(r)/0.50*100;
    return (
      <div style={{marginBottom:11}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <span style={{fontSize:11,color:"#ccc",fontWeight:600}}>{label}</span>
          <span style={{fontSize:11,fontWeight:800,color:color}}>r = +{r.toFixed(3)}</span>
        </div>
        <div style={{height:5,borderRadius:3,background:"rgba(255,255,255,0.05)"}}>
          <div style={{height:"100%",width:Math.min(pct,100)+"%",background:`linear-gradient(90deg,${color}88,${color})`,borderRadius:3}}/>
        </div>
        <div style={{fontSize:9,color:"#555",marginTop:3,lineHeight:1.4}}>{note}</div>
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1001,background:"rgba(0,0,0,0.9)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#080e18",borderRadius:16,border:"1.5px solid #f0c04044",width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto",padding:isMobile?"14px 12px 16px":"24px 26px 30px",fontFamily:"monospace"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <div style={{fontSize:9,color:"#555",letterSpacing:3}}>MODEL VALIDATION</div>
            <div style={{fontSize:18,fontWeight:800,color:"#fff",marginTop:3}}>NFL Outcome Correlations</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:7,padding:"8px 12px",marginBottom:14,fontSize:10,color:"#555"}}>
          Pearson r correlations · n=166 evaluable players (2017–2025 classes with NFL career data) · per-season T12/T24 rates
        </div>
        <div style={{fontSize:12,color:"#666",lineHeight:1.65,marginBottom:10,padding:"0 2px"}}>
          Pearson r measures the linear correlation between two variables on a scale from −1 to +1. A value of +1 means a perfect positive relationship, 0 means no relationship, and −1 means a perfect inverse relationship — so a higher r means the metric is a stronger predictor of NFL success.
        </div>
        <RScoreNote/>

        {/* Two-column layout for T12 and T24 */}
        <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>

          {/* TOP-12 */}
          <div style={{flex:1,minWidth:isMobile?"100%":260}}>
            <div style={{fontSize:9,color:"#f0c040",letterSpacing:2,marginBottom:12,fontWeight:700}}>
              ★ TOP 10 PREDICTORS — TOP-12 RATE
            </div>
            {TOP12_METRICS.map((d,i)=>(
              <div key={d.label} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10}}>
                <span style={{fontSize:10,color:"rgba(240,192,64,0.35)",minWidth:16,marginTop:1,fontWeight:700}}>#{i+1}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:11,color:"#ccc",fontWeight:600}}>{d.label}</span>
                    <span style={{fontSize:11,fontWeight:800,color:"#f0c040"}}>r = +{d.r.toFixed(3)}</span>
                  </div>
                  <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.05)"}}>
                    <div style={{height:"100%",width:Math.min(d.r/0.50*100,100)+"%",background:"linear-gradient(90deg,#f0c04066,#f0c040)",borderRadius:2}}/>
                  </div>
                  <div style={{fontSize:8.5,color:"#555",marginTop:2,lineHeight:1.35}}>{d.note}</div>
                </div>
              </div>
            ))}
          </div>

          {/* TOP-24 */}
          <div style={{flex:1,minWidth:isMobile?"100%":260}}>
            <div style={{fontSize:9,color:"#5dbf6a",letterSpacing:2,marginBottom:12,fontWeight:700}}>
              ✓ TOP 10 PREDICTORS — TOP-24 RATE
            </div>
            {TOP24_METRICS.map((d,i)=>(
              <div key={d.label} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10}}>
                <span style={{fontSize:10,color:"rgba(93,191,106,0.35)",minWidth:16,marginTop:1,fontWeight:700}}>#{i+1}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:11,color:"#ccc",fontWeight:600}}>{d.label}</span>
                    <span style={{fontSize:11,fontWeight:800,color:"#5dbf6a"}}>r = +{d.r.toFixed(3)}</span>
                  </div>
                  <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.05)"}}>
                    <div style={{height:"100%",width:Math.min(d.r/0.50*100,100)+"%",background:"linear-gradient(90deg,#5dbf6a66,#5dbf6a)",borderRadius:2}}/>
                  </div>
                  <div style={{fontSize:8.5,color:"#555",marginTop:2,lineHeight:1.35}}>{d.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{height:1,background:"rgba(255,255,255,0.05)",margin:"18px 0"}}/>

        {/* Tier finish rates */}
        <div style={{fontSize:9,color:"#4da6ff",letterSpacing:2,marginBottom:6,fontWeight:700}}>FINISH RATES BY TIER</div>
        <div style={{fontSize:9,color:"#555",marginBottom:8}}>Per-season basis: top-finish seasons ÷ total career seasons (n=166)</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
          <thead><tr style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            {["Tier","Players","Career Yrs","T12 Rate","T24 Rate"].map(h=><th key={h} style={{textAlign:h==="Tier"?"left":"center",padding:"5px 8px",color:"#444",fontSize:9}}>{h}</th>)}
          </tr></thead>
          <tbody>{tiers.map(row=>(
            <tr key={row.tier} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <td style={{padding:"7px 8px"}}><span style={{color:tc[row.tier]||"#888",fontWeight:700}}>{row.tier}</span></td>
              <td style={{padding:"7px 8px",textAlign:"center",color:"#555"}}>{row.n}</td>
              <td style={{padding:"7px 8px",textAlign:"center",color:"#555"}}>{row.career}</td>
              <td style={{padding:"7px 8px",textAlign:"center"}}><span style={{color:row.top12_rate>=50?"#5dbf6a":row.top12_rate>=25?"#f0c040":"#f0873a",fontWeight:700}}>{row.top12_rate}%</span></td>
              <td style={{padding:"7px 8px",textAlign:"center"}}><span style={{color:row.top24_rate>=60?"#5dbf6a":row.top24_rate>=40?"#f0c040":"#f0873a",fontWeight:700}}>{row.top24_rate}%</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function CompareModal({onClose, allNames, allData, selections, onChangeSelections, onOpenPlayer}) {
  const isMobile = useIsMobile(768);
  const [inputs, setInputs] = useState(["", "", ""]);
  const [openSlot, setOpenSlot] = useState(null);

  useEffect(() => {
    setInputs(selections.map((n) => n || ""));
  }, [selections]);

  const setSlot = (idx, name) => {
    const next = [...selections];
    next[idx] = name;
    onChangeSelections(next);
    const nextInputs = [...inputs];
    nextInputs[idx] = name;
    setInputs(nextInputs);
    setOpenSlot(null);
  };

  const clearSlot = (idx) => {
    const next = [...selections];
    next[idx] = "";
    onChangeSelections(next);
    const nextInputs = [...inputs];
    nextInputs[idx] = "";
    setInputs(nextInputs);
  };

  const getMatches = (idx) => {
    const q = (inputs[idx] || "").trim().toLowerCase();
    const picked = new Set(selections.filter(Boolean));
    if (selections[idx]) picked.delete(selections[idx]);
    return allNames
      .filter((name) => !picked.has(name))
      .filter((name) => !q || name.toLowerCase().includes(q))
      .slice(0, 8);
  };

  const toAthVal = (player, key, alias = null) => {
    const src = player?.athletic?.[key] ?? (alias ? player?.athletic?.[alias] : null);
    if (src == null) return null;
    if (typeof src === "object" && src.val != null) {
      const n = Number(src.val);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(src);
    return Number.isFinite(n) ? n : null;
  };

  const recruitVal = (player, key) => {
    const r = player?.recruiting || {};
    const direct = r[key];
    if (direct != null && direct !== "") return direct;
    const prefixed = r["recruit_" + key];
    if (prefixed != null && prefixed !== "") return prefixed;
    return null;
  };

  const getRasVal = (player, playerName = null) => {
    const n = Number(getPlayerRasScore(player, playerName));
    return Number.isFinite(n) ? n : null;
  };

  const recruitNum = (player, key, options = {}) => {
    const {zeroIsMissing = false} = options;
    const raw = recruitVal(player, key);
    if (raw == null) return null;
    if (typeof raw === "string") {
      const t = raw.trim().toLowerCase();
      if (!t || t === "-" || t === "--" || t === "nan" || t === "null" || t === "na" || t === "n/a") return null;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (zeroIsMissing && n <= 0) return null;
    return n;
  };

  const draftedFromSchool = (player) => {
    if (!player) return "-";
    const seasons = Array.isArray(player.seasons) ? [...player.seasons] : [];
    if (seasons.length) {
      seasons.sort((a, b) => (Number(a?.n) || 0) - (Number(b?.n) || 0));
      const last = seasons[seasons.length - 1] || {};
      const school = last.school || last.sc;
      if (school) return school;
    }
    return player.school || "-";
  };

  const picks = selections
    .filter((name) => name && allData[name])
    .map((name) => ({name, data: allData[name]}));

  const valueCell = (v, digits = 0) => {
    if (v == null) return "-";
    const n = Number(v);
    if (!Number.isFinite(n)) return "-";
    return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
  };

  const rankMarkersForRow = (row) => {
    if (typeof row.rankValue !== "function") return {};

    const MISSING_WORST_HIGH = 1e12;
    const MISSING_WORST_LOW = -1e12;

    const byName = {};
    picks.forEach(({name, data}) => {
      const raw = row.rankValue(data, name);
      const n = raw == null
        ? NaN
        : (typeof raw === "string" && (raw.trim() === "" || raw.trim() === "-" || raw.trim() === "--")
          ? NaN
          : Number(raw));
      if (Number.isFinite(n)) {
        byName[name] = n;
      } else if (row.missingWorst) {
        byName[name] = row.rankOrder === "asc" ? MISSING_WORST_HIGH : MISSING_WORST_LOW;
      } else {
        byName[name] = null;
      }
    });

    const vals = Object.values(byName).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return {};

    const uniq = [...new Set(vals)].sort((a, b) => a - b);
    const low = uniq[0];
    const high = uniq[uniq.length - 1];
    if (low === high) return {};

    const bestVal = row.rankOrder === "asc" ? low : high;
    const worstVal = row.rankOrder === "asc" ? high : low;

    const hasMiddle = uniq.length === 3;
    const mid = hasMiddle ? uniq[1] : null;

    const out = {};
    Object.entries(byName).forEach(([name, v]) => {
      if (!Number.isFinite(v)) return;
      if (v === bestVal) {
        out[name] = {shape:"up", color:"#5dbf6a"};
      } else if (v === worstVal) {
        out[name] = {shape:"down", color:"#e05050"};
      } else if (hasMiddle && v === mid) {
        out[name] = {shape:"mid", color:"#f0c040"};
      }
    });
    return out;
  };

  const markerGlyph = (shape) => {
    if (shape === "up") return "▲";
    if (shape === "down") return "▼";
    return "■";
  };

  const renderMetricTable = (rows) => (
    <div style={{overflowX:"auto",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,minWidth:560}}>
        <thead>
          <tr style={{borderBottom:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.02)"}}>
            <th style={{textAlign:"left",padding:"8px 10px",color:"#555",letterSpacing:1}}>METRIC</th>
            {picks.map(({name, data}) => {
              const accent = (TIER_STYLE[data.tier] || TIER_STYLE.Fringe).accent;
              return (
                <th key={name} style={{textAlign:"center",padding:"8px 10px"}}>
                  <button
                    onClick={() => onOpenPlayer(name)}
                    style={{background:"transparent",border:"none",cursor:"pointer",color:accent,fontSize:10,fontWeight:700,letterSpacing:0.3}}
                  >
                    {name}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const markers = rankMarkersForRow(row);
            return (
              <tr key={row.label} style={{borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <td style={{padding:"7px 10px",color:"#888",fontWeight:600}}>{row.label}</td>
                {picks.map(({name, data}) => {
                  const marker = markers[name];
                  return (
                    <td key={name + row.label} style={{padding:"7px 10px",textAlign:"center",color:"#ddd"}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:5,justifyContent:"center"}}>
                        {marker && (
                          <span title={marker.shape === "up" ? "Best" : marker.shape === "down" ? "Worst" : "Middle"} style={{color:marker.color,fontSize:9,lineHeight:1,fontWeight:800}}>
                            {markerGlyph(marker.shape)}
                          </span>
                        )}
                        <span>{row.render(data, name)}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1002,background:"rgba(0,0,0,0.9)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
      <div onClick={(e)=>e.stopPropagation()} style={{width:"100%",maxWidth:980,maxHeight:"90vh",overflowY:"auto",background:"#080e18",border:"1.5px solid rgba(77,166,255,0.25)",borderRadius:14,padding:isMobile?"12px":"16px 16px 18px",fontFamily:"monospace"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:9,color:"#4da6ff",letterSpacing:2}}>COMPARE PLAYERS</div>
            <div style={{fontSize:17,fontWeight:800,color:"#fff",marginTop:2}}>Side-by-side view (up to 3)</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#666",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:8,marginBottom:12}}>
          {[0,1,2].map((idx) => {
            const matches = getMatches(idx);
            return (
              <div key={idx} style={{position:"relative",background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:8}}>
                <div style={{fontSize:8,color:"#555",letterSpacing:1.6,marginBottom:6}}>PLAYER {idx + 1}</div>
                <input
                  value={inputs[idx] || ""}
                  autoFocus={idx === 0}
                  onChange={(e)=>{
                    const next = [...inputs];
                    next[idx] = e.target.value;
                    setInputs(next);
                    setOpenSlot(idx);
                  }}
                  onFocus={()=>setOpenSlot(idx)}
                  placeholder="Type player name..."
                  style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:7,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#fff",fontSize:11,outline:"none"}}
                />
                <div style={{display:"flex",justifyContent:"space-between",marginTop:7}}>
                  <span style={{fontSize:8,color:selections[idx]?"#4da6ff":"#444"}}>{selections[idx] || "No player selected"}</span>
                  {selections[idx] && (
                    <button onClick={()=>clearSlot(idx)} style={{border:"none",background:"transparent",color:"#888",fontSize:8,cursor:"pointer",letterSpacing:1}}>CLEAR</button>
                  )}
                </div>
                {openSlot===idx && matches.length>0 && (
                  <div style={{position:"absolute",left:8,right:8,top:64,zIndex:20,background:"#111724",border:"1px solid rgba(255,255,255,0.09)",borderRadius:7,overflow:"hidden",maxHeight:220,overflowY:"auto"}}>
                    {matches.map((name)=>{
                      const d = allData[name];
                      const accent = (TIER_STYLE[d.tier] || TIER_STYLE.Fringe).accent;
                      return (
                        <button
                          key={name}
                          onClick={()=>setSlot(idx, name)}
                          style={{display:"flex",width:"100%",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:"transparent",border:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",textAlign:"left"}}
                        >
                          <span style={{fontSize:10,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",paddingRight:8}}>{name}</span>
                          <span style={{fontSize:9,color:accent,fontWeight:700}}>{d.prospect_score!=null?d.prospect_score.toFixed(1):"-"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!picks.length && (
          <div style={{fontSize:11,color:"#666",padding:"10px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8}}>
            Select at least one player to start comparison.
          </div>
        )}

        {picks.length > 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:2}}>
              {picks.map(({name, data}) => {
                const accent = (TIER_STYLE[data.tier] || TIER_STYLE.Fringe).accent;
                return (
                  <div key={name + "-drafted-from"} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"5px 8px",fontSize:9,color:"#888"}}>
                    <span style={{color:accent,fontWeight:700}}>{name}</span>
                    <span style={{color:"#555"}}> drafted from </span>
                    <span style={{color:"#ddd",fontWeight:700}}>{draftedFromSchool(data)}</span>
                  </div>
                );
              })}
            </div>

            <details open>
              <summary style={{cursor:"pointer",fontSize:10,color:"#f0c040",letterSpacing:1.6,fontWeight:700,marginBottom:7}}>CORE SCORES</summary>
              {renderMetricTable([
                {label:"Prospect Score", rankValue:(d)=>Number(d.prospect_score), render:(d)=>valueCell(d.prospect_score, 1)},
                {label:"Tier", render:(d)=>{
                  const t = d.tier || "Fringe";
                  const accent = (TIER_STYLE[t] || TIER_STYLE.Fringe).accent;
                  return <span style={{color:accent,fontWeight:700}}>{t}</span>;
                }},
                {label:"Production", rankValue:(d)=>Number(d.prod_trajectory), render:(d)=>valueCell(d.prod_trajectory, 0)},
                {label:"Rushing Traj", rankValue:(d)=>Number(d.rush_trajectory), render:(d)=>valueCell(d.rush_trajectory, 0)},
                {label:"Receiving Traj", rankValue:(d)=>Number(d.recv_trajectory), render:(d)=>valueCell(d.recv_trajectory, 0)},
                {label:"Athletic", rankValue:(d, name)=>Number(getAdjustedAthlScore(d, name)), render:(d, name)=>valueCell(getAdjustedAthlScore(d, name), 0)},
                {label:"PFF Board", rankValue:(d)=>Number(d.pff_score), render:(d)=>valueCell(d.pff_score, 0)},
              ])}
            </details>

            <details>
              <summary style={{cursor:"pointer",fontSize:10,color:"#4da6ff",letterSpacing:1.6,fontWeight:700,marginBottom:7}}>TRAJECTORY + DRAFT</summary>
              {renderMetricTable([
                {label:"Seasons", rankValue:(d)=>Number(d.num_seasons), render:(d)=>valueCell(d.num_seasons, 0)},
                {label:"Trajectory Peak", rankValue:(d)=>Number(d.traj_peak), render:(d)=>valueCell(d.traj_peak, 0)},
                {label:"Trajectory Final", rankValue:(d)=>Number(d.traj_final), render:(d)=>valueCell(d.traj_final, 0)},
                {label:"Improvement", rankValue:(d)=>Number(d.traj_improvement), render:(d)=>valueCell(d.traj_improvement, 0)},
                {label:"Consistency", rankValue:(d)=>Number(d.traj_consistency), render:(d)=>valueCell(d.traj_consistency, 0)},
                {label:"Draft Round", rankValue:(d)=>Number(d.draft_round), rankOrder:"asc", render:(d)=>d.draft_round!=null?String(d.draft_round):"-"},
                {label:"Draft Pick", rankValue:(d)=>Number(d.draft_pick), rankOrder:"asc", render:(d)=>d.draft_pick!=null?String(d.draft_pick):"-"},
              ])}
            </details>

            <details>
              <summary style={{cursor:"pointer",fontSize:10,color:"#5dbf6a",letterSpacing:1.6,fontWeight:700,marginBottom:7}}>ATHLETIC + RECRUITING</summary>
              {renderMetricTable([
                {label:"Height", rankValue:(d)=>Number(toAthVal(d, "height")), render:(d)=>valueCell(toAthVal(d, "height"), 1)},
                {label:"40 Time", rankValue:(d)=>Number(toAthVal(d, "40T", "forty")), rankOrder:"asc", render:(d)=>valueCell(toAthVal(d, "40T", "forty"), 2)},
                {label:"10 Split", rankValue:(d)=>Number(toAthVal(d, "10split", "ten_split")), rankOrder:"asc", render:(d)=>valueCell(toAthVal(d, "10split", "ten_split"), 2)},
                {label:"Weight", rankValue:(d)=>Number(toAthVal(d, "weight")), render:(d)=>valueCell(toAthVal(d, "weight"), 0)},
                {label:"Vertical", rankValue:(d)=>Number(toAthVal(d, "vert")), render:(d)=>valueCell(toAthVal(d, "vert"), 1)},
                {label:"Broad", rankValue:(d)=>Number(toAthVal(d, "broad")), render:(d)=>valueCell(toAthVal(d, "broad"), 0)},
                {label:"3 Cone", rankValue:(d)=>Number(toAthVal(d, "3cone", "three_cone")), rankOrder:"asc", render:(d)=>valueCell(toAthVal(d, "3cone", "three_cone"), 2)},
                {label:"Shuttle", rankValue:(d)=>Number(toAthVal(d, "shuttle")), rankOrder:"asc", render:(d)=>valueCell(toAthVal(d, "shuttle"), 2)},
                {label:"Arm", rankValue:(d)=>Number(toAthVal(d, "arm")), render:(d)=>valueCell(toAthVal(d, "arm"), 2)},
                {label:"Hand", rankValue:(d)=>Number(toAthVal(d, "hand")), render:(d)=>valueCell(toAthVal(d, "hand"), 2)},
                {label:"Wing", rankValue:(d)=>Number(toAthVal(d, "wing")), render:(d)=>valueCell(toAthVal(d, "wing"), 2)},
                {label:"RAS", rankValue:(d, name)=>getRasVal(d, name), render:(d, name)=>valueCell(getRasVal(d, name), 2)},
                {label:"Recruit Stars", rankValue:(d)=>recruitNum(d, "stars", {zeroIsMissing:true}), missingWorst:true, render:(d)=>valueCell(recruitNum(d, "stars", {zeroIsMissing:true}), 0)},
                {label:"Recruit Rating", rankValue:(d)=>recruitNum(d, "rating", {zeroIsMissing:true}), missingWorst:true, render:(d)=>valueCell(recruitNum(d, "rating", {zeroIsMissing:true}), 0)},
                {label:"National Rating", rankValue:(d)=>recruitNum(d, "nat", {zeroIsMissing:true}), rankOrder:"asc", missingWorst:true, render:(d)=>valueCell(recruitNum(d, "nat", {zeroIsMissing:true}), 0)},
                {label:"Position Rating", rankValue:(d)=>recruitNum(d, "pos", {zeroIsMissing:true}), rankOrder:"asc", missingWorst:true, render:(d)=>valueCell(recruitNum(d, "pos", {zeroIsMissing:true}), 0)},
                {label:"State Rating", rankValue:(d)=>recruitNum(d, "state", {zeroIsMissing:true}), rankOrder:"asc", missingWorst:true, render:(d)=>valueCell(recruitNum(d, "state", {zeroIsMissing:true}), 0)},
              ])}
            </details>
          </div>
        )}
      </div>
    </div>
  );
}


function ArchetypeCard({arch, side, onFilter, activeFilter, allData}) {
  const color = arch.color;
  const isActive = activeFilter === arch.key;
  const playerCount = Object.values(allData || {}).filter(p=>
    side==="rush" ? p.rush_arch===arch.key : p.recv_arch===arch.key
  ).length;
  return (
    <div style={{background:"rgba(255,255,255,0.025)",border:"1.5px solid "+(isActive?color:color+"2a"),borderRadius:12,overflow:"hidden",transition:"border-color 0.15s"}}>
      {/* Card header */}
      <div style={{background:"linear-gradient(135deg,"+color+"18,"+color+"08)",borderBottom:"1px solid "+color+"22",padding:"16px 18px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:20}}>{arch.icon}</div>
            <div style={{fontSize:15,fontWeight:800,color:"#fff",marginTop:6,letterSpacing:-0.3}}>{arch.key}</div>
            <div style={{fontSize:10,color,marginTop:2,fontWeight:600,letterSpacing:0.5}}>{arch.tagline}</div>
          </div>
          <button onClick={()=>onFilter(isActive?null:arch.key)}
            style={{padding:"5px 12px",borderRadius:20,border:"1px solid "+(isActive?color:color+"55"),background:isActive?color+"28":"transparent",color:isActive?color:color+"aa",fontSize:8,letterSpacing:2,fontWeight:700,whiteSpace:"nowrap",marginTop:2}}>
            {isActive?"✓ FILTERED":"FILTER"} · {playerCount}
          </button>
        </div>
      </div>
      {/* Card body */}
      <div style={{padding:"14px 18px 16px"}}>
        <p style={{fontSize:10.5,color:"#aaa",lineHeight:1.65,marginBottom:12}}>{arch.desc}</p>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:8,color:"#444",letterSpacing:2,marginBottom:5}}>KEY SIGNALS</div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {arch.signals.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:5}}>
                <span style={{color,fontSize:9,marginTop:1,flexShrink:0}}>▸</span>
                <span style={{fontSize:9.5,color:"#777"}}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"9px 11px",marginBottom:10}}>
          <div style={{fontSize:8,color:"#444",letterSpacing:2,marginBottom:4}}>NFL OUTLOOK</div>
          <p style={{fontSize:9.5,color:"#666",lineHeight:1.55}}>{arch.nfl}</p>
        </div>
        <div>
          <div style={{fontSize:8,color:"#444",letterSpacing:2,marginBottom:5}}>PROTOTYPE COMPS</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {arch.examples.map(ex=>(
              <span key={ex} style={{fontSize:8,padding:"2px 8px",borderRadius:4,background:color+"14",border:"1px solid "+color+"33",color}}>{ex}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchetypePage({onFilter, rushFilter, recvFilter, onOpenPlayer, allData}) {
  const [side,setSide] = useState("rush");
  const archs = NORMALIZED_ARCHETYPE_DEFS[side];

  // Players matching active archetype filter
  const filteredPlayers = useMemo(()=>{
    const activeKey = side==="rush" ? rushFilter : recvFilter;
    if (!activeKey) return [];
    return Object.entries(allData || {})
      .filter(([,d])=> side==="rush" ? d.rush_arch===activeKey : d.recv_arch===activeKey)
      .sort(([,a],[,b])=>a.rank-b.rank)
      .slice(0,24);
  },[allData, side, rushFilter, recvFilter]);

  const activeFilter = side==="rush" ? rushFilter : recvFilter;

  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"16px 10px 48px"}}>
      {/* Page header */}
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9,color:"#333",letterSpacing:4,marginBottom:4}}>POSITIONAL ARCHETYPES</div>
        <div style={{fontSize:20,fontWeight:800,color:"#fff",marginBottom:6}}>
          RB <span style={{color:"#f0c040"}}>Archetype</span> Guide
        </div>
        <div style={{fontSize:10,color:"#555",maxWidth:580,lineHeight:1.6}}>
          Every player is assigned a mutually exclusive archetype for both rushing and receiving, derived from career-weighted averages across all college seasons — not just their peak year. Each metric is weighted by attempts so that heavier-workload seasons carry more influence. Archetypes reflect how a back consistently creates value throughout their college career, not just how much.
        </div>
      </div>

      {/* Rush / Receiving toggle */}
      <div style={{display:"flex",gap:0,marginBottom:22,borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)",width:"fit-content"}}>
        {[["rush","Rushing Archetypes","#f0873a"],["recv","Receiving Archetypes","#5dbf6a"]].map(([s,lbl,c])=>(
          <button key={s} onClick={()=>setSide(s)}
            style={{padding:"9px 22px",border:"none",background:side===s?c+"18":"transparent",color:side===s?c:"#555",fontSize:9,letterSpacing:2,fontWeight:side===s?700:400,borderRight:s==="rush"?"1px solid rgba(255,255,255,0.08)":"none"}}>
            {lbl.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Archetype cards grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12,marginBottom:28}}>
        {archs.map(arch=>(
          <ArchetypeCard key={arch.key} arch={arch} side={side}
            onFilter={key=>onFilter(side,key)}
            activeFilter={activeFilter}
            allData={allData}/>
        ))}
      </div>

      {/* Filtered player results */}
      {activeFilter&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{fontSize:9,color:"#444",letterSpacing:3}}>PLAYERS ·</div>
            <span style={{fontSize:10,color:(side==="rush"?RUSH_ARCH_COLORS:RECV_ARCH_COLORS)[activeFilter]||"#fff",fontWeight:700}}>
              {activeFilter.toUpperCase()}
            </span>
            <span style={{fontSize:9,color:"#444"}}>· {filteredPlayers.length} shown</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:6}}>
            {filteredPlayers.map(([name,d])=>{
              const ts=TIER_STYLE[d.tier]||TIER_STYLE.Fringe;
              const archColor=(side==="rush"?RUSH_ARCH_COLORS:RECV_ARCH_COLORS)[activeFilter]||"#fff";
              return (
                <div key={name} onClick={()=>onOpenPlayer(name)}
                  style={{background:"rgba(255,255,255,0.025)",border:"1px solid "+archColor+"22",borderRadius:8,padding:"10px 12px",cursor:"pointer"}}
                  onMouseEnter={e=>{e.currentTarget.style.background=archColor+"0d";e.currentTarget.style.borderColor=archColor+"44";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.025)";e.currentTarget.style.borderColor=archColor+"22";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:8,color:"#444",marginBottom:1}}>#{d.rank} · {d.tier}{d.is_projection?" ★":""}</div>
                      <div style={{fontSize:12,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
                      <div style={{fontSize:8,color:"#555",marginTop:1}}>{d.draft_class}</div>
                      <div style={{marginTop:4,display:"flex",gap:3,flexWrap:"wrap"}}>
                        {d.rush_arch&&<ArchTag label={d.rush_arch} colors={RUSH_ARCH_COLORS}/>}
                        {d.recv_arch&&<ArchTag label={d.recv_arch} colors={RECV_ARCH_COLORS}/>}
                        {d.breakout_tag&&<span style={{background:"rgba(0,230,130,0.08)",border:"1px solid rgba(0,230,130,0.3)",color:"#00e682",fontSize:7,padding:"1px 4px",borderRadius:3,fontWeight:600}}>⚡ BREAKOUT</span>}
                        {d.late_decline&&<span style={{background:"rgba(224,80,80,0.08)",border:"1px solid rgba(224,80,80,0.3)",color:"#e05050",fontSize:7,padding:"1px 4px",borderRadius:3,fontWeight:600}}>↘ DECLINE</span>}
                        {(d.num_seasons||0)<=2&&<span style={{background:"rgba(240,192,64,0.08)",border:"1px solid rgba(240,192,64,0.25)",color:"#f0c040",fontSize:7,padding:"1px 4px",borderRadius:3,fontWeight:600}}>{(d.num_seasons||0)===1?"1-YR":"2-YR"}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"right",marginLeft:8,flexShrink:0}}>
                      <div style={{fontSize:17,fontWeight:900,color:ts.accent}}>{d.prospect_score!=null?d.prospect_score.toFixed(1):"—"}</div>
                      <div style={{fontSize:8,color:"#f0873a",marginTop:1}}>R:{d.rush_trajectory!=null?d.rush_trajectory.toFixed(0):"—"}</div>
                      <div style={{fontSize:8,color:"#5dbf6a"}}>C:{d.recv_trajectory!=null?d.recv_trajectory.toFixed(0):"—"}</div>
                    </div>
                  </div>
                  <div style={{marginTop:7,height:2,borderRadius:1,background:"rgba(255,255,255,0.05)"}}>
                    <div style={{height:"100%",width:(d.prospect_score||0)+"%",background:ts.accent,borderRadius:1}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ADD PLAYER MODAL ────────────────────────────────────────────────────────
const CONF_LIST = [
  "SEC","Big Ten","ACC","Big 12","Pac-12","AAC","MWC","Independent","MAC","Sun Belt","C-USA","FCS","Other"
];
const CONF_MULT_MAP = {
  "SEC":1.12,"Big Ten":1.10,"ACC":1.06,"Big 12":1.06,"Pac-12":1.05,
  "AAC":1.02,"MWC":1.00,"Independent":0.98,"MAC":0.95,"Sun Belt":0.95,
  "C-USA":0.93,"FCS":0.88,"Other":1.00
};
const RUSH_ARCH_DEFS = ["Speed/Breakaway","Elusive Runner","Power Back","North-South Runner","Balanced Runner"];
const RECV_ARCH_DEFS = ["Receiving Weapon","Dual-Threat","YAC Machine","Pass-Catching Back","Run-First Back"];
const TIER_ORDER_VAL = ["Elite","Starter","Rotational","Developmental","Fringe"];


function autoArchetype(form) {
  // Compute career-weighted averages (weighted by attempts)
  const seasons = (form.seasons||[]).filter(s=>parseFloat(s.att||s.rush_att||0)>=10);
  if(!seasons.length) return {rush_arch:"Balanced Runner",recv_arch:"Run-First Back"};
  const totalAtt = seasons.reduce((s,x)=>s+(parseFloat(x.att||x.rush_att)||0),0);
  const w=(key)=>seasons.reduce((s,x)=>s+(parseFloat(x[key])||0)*(parseFloat(x.att||x.rush_att)||0),0)/totalAtt;
  const mtfA=w("mtf_a"); const ycoA=w("yco_a"); const ydom=w("ydom");
  const nS=seasons.length;
  const totalRecYds=seasons.reduce((s,x)=>s+(parseFloat(x.rec_yds)||0),0);
  const recYdsPerS=totalRecYds/nS;
  const bestRecGrd=Math.max(...seasons.map(x=>parseFloat(x.recv_grade)||0));
  const bestYac=Math.max(...seasons.map(x=>parseFloat(x.yac_rec)||0));
  const avgTgts=seasons.reduce((s,x)=>s+(parseFloat(x.targets)||0),0)/nS;

  // Note: full percentile-rank thresholds require the whole dataset.
  // These absolute thresholds approximate the same p-rank cutoffs used in the embedded data.
  const seasons2 = (form.seasons||[]).filter(s=>parseFloat(s.att||s.rush_att||0)>=10);
  const fifteenA = seasons2.length ? seasons2.reduce((s,x)=>s+(parseFloat(x.fifteen_plus_a)||0)*(parseFloat(x.att||x.rush_att)||0),0)/Math.max(1,totalAtt) : 0;
  const bayPctRaw = seasons2.length ? seasons2.reduce((s,x)=>s+(parseFloat(x.bay_pct)||0)*(parseFloat(x.att||x.rush_att)||0),0)/Math.max(1,totalAtt) : 0;
  const explosive = fifteenA>=0.100 || bayPctRaw>=45.3;  // approx p72 thresholds
  let rush_arch="Balanced Runner";
  if      (explosive && mtfA>=0.244)    rush_arch="Speed/Breakaway";
  else if (mtfA>=0.238)                 rush_arch="Elusive Runner";
  else if (ycoA>=3.74  && mtfA<0.225)  rush_arch="Power Back";
  else if (ycoA>=3.44  && mtfA<0.238)  rush_arch="North-South Runner";

  // Trajectory proxies keep add-player auto labels aligned with archetype-page thresholds.
  const rushTrajProxy = Math.max(0, Math.min(100,
    ((mtfA / 0.24) * 38) + ((ycoA / 3.6) * 34) + ((ydom / 30) * 28)
  ));
  const recvTrajProxy = Math.max(0, Math.min(100,
    ((bestRecGrd / 90) * 48) + ((recYdsPerS / 260) * 34) + ((avgTgts / 40) * 18)
  ));

  const recv_arch = getRebalancedRecvArchetype({
    rush_trajectory: rushTrajProxy,
    recv_trajectory: recvTrajProxy,
  });
  return {rush_arch,recv_arch};
}


function scoreToTier(s) {
  if (s >= 90) return "Elite";
  if (s >= 80) return "Starter";
  if (s >= 70) return "Rotational";
  if (s >= 60) return "Developmental";
  return "Fringe";
}

// ─── SCORING CONSTANTS ───────────────────────────────────────────────────────
// Rushing stat weights (from CSV model — sum=106, normalized internally)
const RUSH_STAT_WEIGHTS = {
  attempts:8, rush_yds:8, ypa:4, rush_tds:6, fumbles:1,
  run_grade:10, yco:1, yco_a:11, mtf:1, mtf_a:16,
  ten_plus:1, ten_plus_a:1, fifteen_plus:1, fifteen_plus_a:1,
  bay:1, bay_pct:2, first_downs:1, first_downs_a:4,
  elu:6, ydom:8, tddom:8
};
// Receiving stat weights (from CSV model — sum=100, normalized internally)
const RECV_STAT_WEIGHTS = {
  targets:10, receptions:10, rec_pct:6, rec_yds:9, yds_per_rec:9,
  rec_tds:3, recv_grade:12, recv_snaps:5,
  yac:3, yac_rec:7, y_rr:8, adot:7, mtf_recv:5, mtf_rec:6
};
// Year weights: YR1=25, YR2=28, YR3=30, YR4=28, YR5=25
const YEAR_WEIGHTS = [25, 28, 30, 28, 25];
// SOS label → numeric score (0–100)
const SOS_SCORE_MAP = {
  "Elite":95,"Strong":80,"Average":60,"Weak":40,"Very Weak":20,"FCS":10,"N/A":60
};

function calcSeasonProdBreakdown(season, conference) {
  const toNum = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const seasonNumber = Number(season?.n);
  
  // If unchanged season with stored scores, return them directly
  if (season.rush_score != null && season.recv_score != null && season.adj_score != null) {
    const rushScore = toNum(season.rush_score);
    const recvScore = toNum(season.recv_score);
    const adjScore = toNum(season.adj_score);
    if (Number.isFinite(rushScore) && Number.isFinite(recvScore) && Number.isFinite(adjScore)) {
      return {
        rushScore,
        recvScore,
        rawProd: rushScore * 0.65 + recvScore * 0.35,
        adjProd: adjScore,
        sosScore: SOS_SCORE_MAP[season.sos_label || "Average"] ?? 60,
        hasAny: true,
      };
    }
  }

  const attemptsVal = toNum(season.attempts);
  const rushYdsVal = toNum(season.rush_yds);
  const recVal = toNum(season.receptions);
  const targetsVal = toNum(season.targets);
  const recYdsVal = toNum(season.rec_yds);

  const weightedAverage = (entries) => {
    let totalWeight = 0;
    let totalScore = 0;
    entries.forEach(({ weight, pct }) => {
      if (!Number.isFinite(weight) || weight <= 0 || pct == null || !Number.isFinite(pct)) return;
      totalWeight += weight;
      totalScore += pct * weight;
    });
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  };

  const statPct = (statKey, rawVal) => {
    if (!Number.isFinite(seasonNumber)) return null;
    return getSeasonStatPercentile(seasonNumber, STAT_IDX[statKey], rawVal, statKey);
  };

  const rushScore = weightedAverage([
    { weight: RUSH_STAT_WEIGHTS.attempts, pct: statPct("ATT", attemptsVal) },
    { weight: RUSH_STAT_WEIGHTS.rush_yds, pct: statPct("YDS", rushYdsVal) },
    { weight: RUSH_STAT_WEIGHTS.ypa, pct: statPct("Y/A", toNum(season.ypa)) },
    { weight: RUSH_STAT_WEIGHTS.rush_tds, pct: statPct("RUSH TD", toNum(season.rush_tds)) },
    { weight: RUSH_STAT_WEIGHTS.fumbles, pct: statPct("FUM", toNum(season.fumbles)) },
    { weight: RUSH_STAT_WEIGHTS.run_grade, pct: statPct("RUN GRD", toNum(season.run_grade)) },
    { weight: RUSH_STAT_WEIGHTS.yco_a, pct: statPct("YCO/A", toNum(season.yco_a)) },
    { weight: RUSH_STAT_WEIGHTS.mtf_a, pct: statPct("MTF/A", toNum(season.mtf_a)) },
    { weight: RUSH_STAT_WEIGHTS.ten_plus_a, pct: statPct("10+/A", toNum(season.ten_plus_a)) },
    { weight: RUSH_STAT_WEIGHTS.fifteen_plus_a, pct: statPct("15+/A", toNum(season.fifteen_plus_a)) },
    { weight: RUSH_STAT_WEIGHTS.bay_pct, pct: statPct("BAY%", toNum(season.bay_pct)) },
    { weight: RUSH_STAT_WEIGHTS.first_downs_a, pct: statPct("1D/A", toNum(season.first_downs_a)) },
    { weight: RUSH_STAT_WEIGHTS.elu, pct: statPct("ELU", toNum(season.elu)) },
    { weight: RUSH_STAT_WEIGHTS.ydom, pct: statPct("Y DOM%", toNum(season.ydom)) },
    { weight: RUSH_STAT_WEIGHTS.tddom, pct: statPct("TD DOM%", toNum(season.tddom)) },
  ]);

  const recvScore = weightedAverage([
    { weight: RECV_STAT_WEIGHTS.targets, pct: statPct("TGT", targetsVal) },
    { weight: RECV_STAT_WEIGHTS.receptions, pct: statPct("REC", recVal) },
    { weight: RECV_STAT_WEIGHTS.rec_pct, pct: statPct("REC%", toNum(season.rec_pct)) },
    { weight: RECV_STAT_WEIGHTS.rec_yds, pct: statPct("REC YDS", recYdsVal) },
    { weight: RECV_STAT_WEIGHTS.yds_per_rec, pct: statPct("Y/REC", toNum(season.yds_per_rec)) },
    { weight: RECV_STAT_WEIGHTS.rec_tds, pct: statPct("REC TD", toNum(season.rec_tds)) },
    { weight: RECV_STAT_WEIGHTS.recv_grade, pct: statPct("REC GRD", toNum(season.recv_grade)) },
    { weight: RECV_STAT_WEIGHTS.recv_snaps, pct: statPct("RECV", toNum(season.recv_snaps)) },
    { weight: RECV_STAT_WEIGHTS.yac_rec, pct: statPct("YAC/REC", toNum(season.yac_rec)) },
    { weight: RECV_STAT_WEIGHTS.y_rr, pct: statPct("Y/RR", toNum(season.y_rr)) },
    { weight: RECV_STAT_WEIGHTS.adot, pct: statPct("ADOT", toNum(season.adot)) },
    { weight: RECV_STAT_WEIGHTS.mtf_rec, pct: statPct("MTF/REC", toNum(season.mtf_rec)) },
  ]);

  const rawProd = rushScore * 0.65 + recvScore * 0.35;
  const sosLabel = season.sos_label || "Average";
  const sosScore = SOS_SCORE_MAP[sosLabel] ?? 60;
  const confMult = CONF_MULT_MAP[season.conference || conference || "Other"] || 1.0;
  const confAdj  = rawProd * (0.85 + 0.15 * confMult);
  const adjProd  = confAdj * 0.95 + sosScore * 0.05;

  return {
    rushScore,
    recvScore,
    rawProd,
    adjProd: Math.min(adjProd, 100),
    sosScore,
    hasAny: attemptsVal != null || targetsVal != null,
  };
}

function calcSeasonProdScore(season, conference) {
  return calcSeasonProdBreakdown(season, conference).adjProd;
}

function buildProspectScore(formOrSeasons, isMultiSeason = false, athleticInputs = null) {
  // Support both old single-fields call and new multi-season call
  const seasons = isMultiSeason ? formOrSeasons : [formOrSeasons];
  const fields  = isMultiSeason ? (athleticInputs || {}) : formOrSeasons;

  // Step 3: multi-year weighted composite (YR1=25,YR2=28,YR3=30,YR4=28,YR5=25)
  const seasonScores = seasons.map((s, i) => ({
    score: calcSeasonProdScore(s, s.conference || fields.conference),
    yearWeight: YEAR_WEIGHTS[i] || 25,
    n: i + 1
  })).filter(s => s.score > 0);

  let prodScore = 0;
  if (seasonScores.length > 0) {
    const totalWeight = seasonScores.reduce((a, b) => a + b.yearWeight, 0);
    prodScore = seasonScores.reduce((a, b) => a + b.score * b.yearWeight, 0) / totalWeight;
  }

  // Athletic score from available combine metrics
  const athl40   = parseFloat(fields.forty)||0;
  const athlVert = parseFloat(fields.vert)||0;
  const athlWt   = parseFloat(fields.weight)||200;
  const athl40Score   = athl40  > 0 ? Math.max(0, Math.min(100, (4.80 - athl40)  / 0.40 * 50 + 50)) : 50;
  const athlVertScore = athlVert > 0 ? Math.max(0, Math.min(100, (athlVert - 25) / 18  * 100))       : 50;
  const athlWtScore   = Math.max(0, Math.min(100, (athlWt - 170) / 60 * 100));
  const athlScoreBase = athl40 > 0 ? (athl40Score*0.5 + athlVertScore*0.3 + athlWtScore*0.2) : 50;
  const rasScore = parseFloat(fields.ras);
  const rasMultiplier = getRasMultiplier(!Number.isNaN(rasScore) ? rasScore : null);
  const athlScore = Math.max(0, Math.min(100, athlScoreBase * rasMultiplier));

  const pffScore = Math.min((parseFloat(fields.pff_grade)||0) / 90 * 100, 100);

  // Step 4: Overall — Prod 75%, Athl 10%, PFF 15%
  const raw   = prodScore * 0.75 + athlScore * 0.10 + pffScore * 0.15;
  const final = Math.min(100, raw * 0.85 + 12);

  return {
    prospect_score:  Math.round(final * 10) / 10,
    prod_trajectory: Math.round(prodScore * 10) / 10,
    athl_score:      Math.round(athlScore * 10) / 10,
    pff_score:       Math.round(pffScore  * 10) / 10,
    tier: scoreToTier(final)
  };
}

const EMPTY_FORM = {
  // Identity
  name:"", draft_class:"2026", school:"", conference:"SEC", came_out_as:"",
  draft_round:"1", draft_pick:"", is_projection:false,
  // Season stats (up to 4 seasons)
  seasons: [
    {n:1, yr:"", school:"", conf_mult:"", attempts:"", rush_yds:"", ypa:"", rush_tds:"",
     fumbles:"", mtf:"", ten_plus:"", fif_plus:"", bay:"", bay_pct:"",
     first_downs:"", elu:"",
     targets:"", receptions:"", rec_yds:"", rec_tds:"",
     run_grade:"", recv_grade:"", recv_snaps:"", yac_raw:"", adot:"", mtf_recv:"",
     yco_a:"", mtf_a:"", yac_rec:"", mtf_rec:"",
      ydom:"", tddom:"", sos_label:"Average", sos_rank:"", sos_mag:"", school_other:"", redshirt:false}
  ],
  // Athletic
  height:"", weight:"", forty:"", ten_split:"", vert:"", broad:"",
  three_cone:"", shuttle:"", arm:"", hand:"", wing:"", ras:"",
  // PFF
  pff_grade:"",
  pff_board_rank:"",
  // NFL (optional)
  nfl_best:"", nfl_avg:"", nfl_top12:"", nfl_top24:"", nfl_seasons:"",
  // Recruiting
  recruit_stars:"", recruit_rating:"", recruit_nat:"", recruit_pos:"", recruit_state:"",
  recruit_school:"", recruit_school_other:"", recruit_year:"", transfer_to:"", transfer_year:"",
};

function buildEmptyForm(projectionClass = "2026") {
  return {
    ...EMPTY_FORM,
    draft_class: String(projectionClass),
    draft_round: "",
    draft_pick: "",
    is_projection: true,
    seasons: (EMPTY_FORM.seasons || []).map((season, idx) => ({
      ...season,
      n: season?.n || idx + 1,
    })),
  };
}

function getDraftClassOptions(currentProjectionClass = "2026") {
  const minYear = 2017;
  const maxYear = Math.max(minYear, Number(currentProjectionClass) || 2026);
  return Array.from({ length: maxYear - minYear + 1 }, (_, idx) => String(minYear + idx));
}

const SOS_LOOKUP={"2025":[{"team":"Indiana","rank":1,"mag":1.0,"label":"Elite"},{"team":"Oregon","rank":2,"mag":0.888,"label":"Elite"},{"team":"Ohio St","rank":3,"mag":0.84,"label":"Elite"},{"team":"Alabama","rank":4,"mag":0.811,"label":"Elite"},{"team":"Miami","rank":5,"mag":0.811,"label":"Elite"},{"team":"Georgia","rank":6,"mag":0.68,"label":"Elite"},{"team":"Texas","rank":7,"mag":0.67,"label":"Elite"},{"team":"Iowa","rank":8,"mag":0.665,"label":"Elite"},{"team":"Texas A&M","rank":9,"mag":0.66,"label":"Elite"},{"team":"Florida","rank":10,"mag":0.655,"label":"Elite"},{"team":"Oklahoma","rank":11,"mag":0.646,"label":"Elite"},{"team":"Penn St","rank":12,"mag":0.641,"label":"Elite"},{"team":"Texas Tech","rank":13,"mag":0.636,"label":"Elite"},{"team":"Notre Dame","rank":14,"mag":0.626,"label":"Elite"},{"team":"USC","rank":15,"mag":0.597,"label":"Strong"},{"team":"Mississippi","rank":16,"mag":0.592,"label":"Strong"},{"team":"Vanderbilt","rank":17,"mag":0.568,"label":"Strong"},{"team":"Michigan","rank":18,"mag":0.553,"label":"Strong"},{"team":"LSU","rank":19,"mag":0.553,"label":"Strong"},{"team":"BYU","rank":20,"mag":0.539,"label":"Strong"},{"team":"Auburn","rank":21,"mag":0.534,"label":"Strong"},{"team":"South Carolina","rank":22,"mag":0.524,"label":"Strong"},{"team":"Arkansas","rank":23,"mag":0.519,"label":"Strong"},{"team":"Wisconsin","rank":24,"mag":0.515,"label":"Strong"},{"team":"Illinois","rank":25,"mag":0.5,"label":"Strong"},{"team":"Missouri","rank":26,"mag":0.49,"label":"Strong"},{"team":"Tennessee","rank":27,"mag":0.476,"label":"Strong"},{"team":"Utah","rank":28,"mag":0.471,"label":"Strong"},{"team":"Kentucky","rank":29,"mag":0.461,"label":"Strong"},{"team":"Washington","rank":30,"mag":0.461,"label":"Strong"},{"team":"UCLA","rank":31,"mag":0.427,"label":"Strong"},{"team":"Florida St","rank":32,"mag":0.413,"label":"Strong"},{"team":"Mississippi St","rank":33,"mag":0.393,"label":"Strong"},{"team":"Nebraska","rank":34,"mag":0.379,"label":"Average"},{"team":"Clemson","rank":35,"mag":0.345,"label":"Average"},{"team":"TCU","rank":36,"mag":0.34,"label":"Average"},{"team":"Arizona St","rank":37,"mag":0.34,"label":"Average"},{"team":"NC State","rank":38,"mag":0.34,"label":"Average"},{"team":"Rutgers","rank":39,"mag":0.33,"label":"Average"},{"team":"Kansas St","rank":40,"mag":0.33,"label":"Average"},{"team":"Baylor","rank":41,"mag":0.32,"label":"Average"},{"team":"Pittsburgh","rank":42,"mag":0.311,"label":"Average"},{"team":"Michigan St","rank":43,"mag":0.306,"label":"Average"},{"team":"Louisville","rank":44,"mag":0.306,"label":"Average"},{"team":"SMU","rank":45,"mag":0.301,"label":"Average"},{"team":"Arizona","rank":46,"mag":0.296,"label":"Average"},{"team":"Kansas","rank":47,"mag":0.296,"label":"Average"},{"team":"Iowa St","rank":48,"mag":0.291,"label":"Average"},{"team":"Virginia Tech","rank":49,"mag":0.277,"label":"Average"},{"team":"Purdue","rank":50,"mag":0.272,"label":"Average"},{"team":"Northwestern","rank":51,"mag":0.267,"label":"Average"},{"team":"Georgia Tech","rank":52,"mag":0.267,"label":"Average"},{"team":"West Virginia","rank":53,"mag":0.248,"label":"Average"},{"team":"Cincinnati","rank":54,"mag":0.243,"label":"Average"},{"team":"Colorado","rank":55,"mag":0.223,"label":"Average"},{"team":"Duke","rank":56,"mag":0.214,"label":"Average"},{"team":"Minnesota","rank":57,"mag":0.189,"label":"Average"},{"team":"Stanford","rank":58,"mag":0.184,"label":"Average"},{"team":"Virginia","rank":59,"mag":0.184,"label":"Average"},{"team":"Houston","rank":60,"mag":0.146,"label":"Average"},{"team":"South Florida","rank":61,"mag":0.146,"label":"Average"},{"team":"Maryland","rank":62,"mag":0.146,"label":"Average"},{"team":"Boston College","rank":63,"mag":0.117,"label":"Average"},{"team":"Syracuse","rank":64,"mag":0.117,"label":"Average"},{"team":"UCF","rank":65,"mag":0.087,"label":"Weak"},{"team":"Wake Forest","rank":66,"mag":0.083,"label":"Weak"},{"team":"Tulane","rank":67,"mag":0.049,"label":"Weak"},{"team":"Washington St","rank":68,"mag":0.034,"label":"Weak"},{"team":"California","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Oklahoma St","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"North Carolina","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"James Madison","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Boise St","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"Navy","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Oregon St","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Kennesaw St","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Liberty","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Missouri St","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"Delaware","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Jacksonville St","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Sam Houston","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":128,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":129,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":130,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":131,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":132,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":133,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":134,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":135,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":136,"mag":0.001,"label":"Very Weak"}],"2024":[{"team":"Georgia","rank":1,"mag":1.0,"label":"Elite"},{"team":"Ohio St","rank":2,"mag":0.989,"label":"Elite"},{"team":"Texas","rank":3,"mag":0.847,"label":"Elite"},{"team":"Notre Dame","rank":4,"mag":0.818,"label":"Elite"},{"team":"Alabama","rank":5,"mag":0.75,"label":"Elite"},{"team":"Florida","rank":6,"mag":0.75,"label":"Elite"},{"team":"Tennessee","rank":7,"mag":0.733,"label":"Elite"},{"team":"Penn St","rank":8,"mag":0.71,"label":"Elite"},{"team":"LSU","rank":9,"mag":0.71,"label":"Elite"},{"team":"Oregon","rank":10,"mag":0.682,"label":"Elite"},{"team":"Michigan","rank":11,"mag":0.676,"label":"Elite"},{"team":"South Carolina","rank":12,"mag":0.676,"label":"Elite"},{"team":"Oklahoma","rank":13,"mag":0.676,"label":"Elite"},{"team":"Texas A&M","rank":14,"mag":0.665,"label":"Elite"},{"team":"Mississippi","rank":15,"mag":0.659,"label":"Elite"},{"team":"USC","rank":16,"mag":0.631,"label":"Elite"},{"team":"Kentucky","rank":17,"mag":0.574,"label":"Strong"},{"team":"Indiana","rank":18,"mag":0.534,"label":"Strong"},{"team":"UCLA","rank":19,"mag":0.528,"label":"Strong"},{"team":"Louisville","rank":20,"mag":0.517,"label":"Strong"},{"team":"Vanderbilt","rank":21,"mag":0.511,"label":"Strong"},{"team":"Clemson","rank":22,"mag":0.506,"label":"Strong"},{"team":"Arkansas","rank":23,"mag":0.5,"label":"Strong"},{"team":"Kansas","rank":24,"mag":0.483,"label":"Strong"},{"team":"Missouri","rank":25,"mag":0.46,"label":"Strong"},{"team":"Arizona St","rank":26,"mag":0.449,"label":"Strong"},{"team":"Iowa St","rank":27,"mag":0.438,"label":"Strong"},{"team":"Washington","rank":28,"mag":0.432,"label":"Strong"},{"team":"Auburn","rank":29,"mag":0.432,"label":"Strong"},{"team":"Minnesota","rank":30,"mag":0.426,"label":"Strong"},{"team":"Wisconsin","rank":31,"mag":0.409,"label":"Strong"},{"team":"Miami","rank":32,"mag":0.409,"label":"Strong"},{"team":"SMU","rank":33,"mag":0.398,"label":"Strong"},{"team":"BYU","rank":34,"mag":0.398,"label":"Strong"},{"team":"Georgia Tech","rank":35,"mag":0.398,"label":"Strong"},{"team":"Kansas St","rank":36,"mag":0.398,"label":"Strong"},{"team":"Iowa","rank":37,"mag":0.386,"label":"Strong"},{"team":"Baylor","rank":38,"mag":0.386,"label":"Strong"},{"team":"Mississippi St","rank":39,"mag":0.381,"label":"Strong"},{"team":"Nebraska","rank":40,"mag":0.375,"label":"Average"},{"team":"Houston","rank":41,"mag":0.369,"label":"Average"},{"team":"UCF","rank":42,"mag":0.364,"label":"Average"},{"team":"Illinois","rank":43,"mag":0.352,"label":"Average"},{"team":"Virginia Tech","rank":44,"mag":0.347,"label":"Average"},{"team":"Colorado","rank":45,"mag":0.341,"label":"Average"},{"team":"Cincinnati","rank":46,"mag":0.324,"label":"Average"},{"team":"West Virginia","rank":47,"mag":0.307,"label":"Average"},{"team":"Utah","rank":48,"mag":0.301,"label":"Average"},{"team":"Florida St","rank":49,"mag":0.29,"label":"Average"},{"team":"TCU","rank":50,"mag":0.261,"label":"Average"},{"team":"Rutgers","rank":51,"mag":0.261,"label":"Average"},{"team":"Texas Tech","rank":52,"mag":0.256,"label":"Average"},{"team":"Maryland","rank":53,"mag":0.256,"label":"Average"},{"team":"Oklahoma St","rank":54,"mag":0.233,"label":"Average"},{"team":"Boston College","rank":55,"mag":0.205,"label":"Average"},{"team":"Michigan St","rank":56,"mag":0.182,"label":"Average"},{"team":"Virginia","rank":57,"mag":0.176,"label":"Average"},{"team":"Northwestern","rank":58,"mag":0.165,"label":"Average"},{"team":"Syracuse","rank":59,"mag":0.153,"label":"Average"},{"team":"Stanford","rank":60,"mag":0.153,"label":"Average"},{"team":"Arizona","rank":61,"mag":0.148,"label":"Average"},{"team":"Pittsburgh","rank":62,"mag":0.142,"label":"Average"},{"team":"Duke","rank":63,"mag":0.125,"label":"Average"},{"team":"Tulane","rank":64,"mag":0.091,"label":"Weak"},{"team":"California","rank":65,"mag":0.057,"label":"Weak"},{"team":"Boise St","rank":66,"mag":0.034,"label":"Weak"},{"team":"Wake Forest","rank":67,"mag":0.023,"label":"Weak"},{"team":"NC State","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Purdue","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"North Carolina","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"Navy","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Washington St","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Oregon St","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"James Madison","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"Sam Houston","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Jacksonville St","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Kennesaw St","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":128,"mag":0.001,"label":"Very Weak"},{"team":"Liberty","rank":129,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":130,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":131,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":132,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":133,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":134,"mag":0.001,"label":"Very Weak"}],"2023":[{"team":"Alabama","rank":1,"mag":1.0,"label":"Elite"},{"team":"Ohio St","rank":2,"mag":0.888,"label":"Elite"},{"team":"Michigan","rank":3,"mag":0.882,"label":"Elite"},{"team":"Georgia","rank":4,"mag":0.836,"label":"Elite"},{"team":"Washington","rank":5,"mag":0.822,"label":"Elite"},{"team":"Texas","rank":6,"mag":0.77,"label":"Elite"},{"team":"LSU","rank":7,"mag":0.77,"label":"Elite"},{"team":"Missouri","rank":8,"mag":0.75,"label":"Elite"},{"team":"Penn St","rank":9,"mag":0.743,"label":"Elite"},{"team":"Mississippi","rank":10,"mag":0.743,"label":"Elite"},{"team":"Notre Dame","rank":11,"mag":0.638,"label":"Elite"},{"team":"Oregon","rank":12,"mag":0.625,"label":"Elite"},{"team":"Tennessee","rank":13,"mag":0.625,"label":"Elite"},{"team":"Kansas St","rank":14,"mag":0.605,"label":"Elite"},{"team":"Florida St","rank":15,"mag":0.605,"label":"Elite"},{"team":"Texas A&M","rank":16,"mag":0.592,"label":"Strong"},{"team":"Oklahoma","rank":17,"mag":0.559,"label":"Strong"},{"team":"USC","rank":18,"mag":0.553,"label":"Strong"},{"team":"Florida","rank":19,"mag":0.546,"label":"Strong"},{"team":"Oregon St","rank":20,"mag":0.513,"label":"Strong"},{"team":"Clemson","rank":21,"mag":0.48,"label":"Strong"},{"team":"Auburn","rank":22,"mag":0.454,"label":"Strong"},{"team":"South Carolina","rank":23,"mag":0.454,"label":"Strong"},{"team":"Kentucky","rank":24,"mag":0.447,"label":"Strong"},{"team":"Utah","rank":25,"mag":0.441,"label":"Strong"},{"team":"TCU","rank":26,"mag":0.441,"label":"Strong"},{"team":"Arizona","rank":27,"mag":0.408,"label":"Strong"},{"team":"Louisville","rank":28,"mag":0.408,"label":"Strong"},{"team":"Texas Tech","rank":29,"mag":0.408,"label":"Strong"},{"team":"Iowa St","rank":30,"mag":0.388,"label":"Strong"},{"team":"Oklahoma St","rank":31,"mag":0.382,"label":"Strong"},{"team":"Kansas","rank":32,"mag":0.355,"label":"Average"},{"team":"Duke","rank":33,"mag":0.349,"label":"Average"},{"team":"NC State","rank":34,"mag":0.336,"label":"Average"},{"team":"Maryland","rank":35,"mag":0.329,"label":"Average"},{"team":"Miami","rank":36,"mag":0.309,"label":"Average"},{"team":"Rutgers","rank":37,"mag":0.303,"label":"Average"},{"team":"California","rank":38,"mag":0.296,"label":"Average"},{"team":"Mississippi St","rank":39,"mag":0.289,"label":"Average"},{"team":"West Virginia","rank":40,"mag":0.289,"label":"Average"},{"team":"Georgia Tech","rank":41,"mag":0.25,"label":"Average"},{"team":"Arkansas","rank":42,"mag":0.25,"label":"Average"},{"team":"UCF","rank":43,"mag":0.25,"label":"Average"},{"team":"Colorado","rank":44,"mag":0.243,"label":"Average"},{"team":"Washington St","rank":45,"mag":0.243,"label":"Average"},{"team":"Iowa","rank":46,"mag":0.237,"label":"Average"},{"team":"Wisconsin","rank":47,"mag":0.211,"label":"Average"},{"team":"BYU","rank":48,"mag":0.204,"label":"Average"},{"team":"North Carolina","rank":49,"mag":0.204,"label":"Average"},{"team":"Virginia","rank":50,"mag":0.197,"label":"Average"},{"team":"UCLA","rank":51,"mag":0.178,"label":"Average"},{"team":"Purdue","rank":52,"mag":0.171,"label":"Average"},{"team":"Illinois","rank":53,"mag":0.164,"label":"Average"},{"team":"Arizona St","rank":54,"mag":0.158,"label":"Average"},{"team":"Pittsburgh","rank":55,"mag":0.151,"label":"Average"},{"team":"Northwestern","rank":56,"mag":0.151,"label":"Average"},{"team":"Houston","rank":57,"mag":0.145,"label":"Average"},{"team":"Baylor","rank":58,"mag":0.125,"label":"Average"},{"team":"Michigan St","rank":59,"mag":0.118,"label":"Average"},{"team":"Indiana","rank":60,"mag":0.092,"label":"Weak"},{"team":"Wake Forest","rank":61,"mag":0.092,"label":"Weak"},{"team":"Vanderbilt","rank":62,"mag":0.086,"label":"Weak"},{"team":"Minnesota","rank":63,"mag":0.079,"label":"Weak"},{"team":"Virginia Tech","rank":64,"mag":0.079,"label":"Weak"},{"team":"Stanford","rank":65,"mag":0.066,"label":"Weak"},{"team":"Nebraska","rank":66,"mag":0.053,"label":"Weak"},{"team":"Cincinnati","rank":67,"mag":0.039,"label":"Weak"},{"team":"SMU","rank":68,"mag":0.013,"label":"Weak"},{"team":"Boise St","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Boston College","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Tulane","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Syracuse","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"James Madison","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"Liberty","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"Navy","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Jacksonville St","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"Sam Houston","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":128,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":129,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":130,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":131,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":132,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":133,"mag":0.001,"label":"Very Weak"}],"2022":[{"team":"Georgia","rank":1,"mag":1.0,"label":"Elite"},{"team":"Alabama","rank":2,"mag":0.949,"label":"Elite"},{"team":"Ohio St","rank":3,"mag":0.942,"label":"Elite"},{"team":"Tennessee","rank":4,"mag":0.917,"label":"Elite"},{"team":"LSU","rank":5,"mag":0.821,"label":"Elite"},{"team":"TCU","rank":6,"mag":0.788,"label":"Elite"},{"team":"Kansas St","rank":7,"mag":0.769,"label":"Elite"},{"team":"Texas","rank":8,"mag":0.756,"label":"Elite"},{"team":"Michigan","rank":9,"mag":0.692,"label":"Elite"},{"team":"Penn St","rank":10,"mag":0.686,"label":"Elite"},{"team":"Mississippi St","rank":11,"mag":0.66,"label":"Elite"},{"team":"Texas Tech","rank":12,"mag":0.596,"label":"Strong"},{"team":"Oklahoma","rank":13,"mag":0.571,"label":"Strong"},{"team":"Florida","rank":14,"mag":0.571,"label":"Strong"},{"team":"Auburn","rank":15,"mag":0.545,"label":"Strong"},{"team":"Kansas","rank":16,"mag":0.532,"label":"Strong"},{"team":"Utah","rank":17,"mag":0.532,"label":"Strong"},{"team":"Iowa St","rank":18,"mag":0.513,"label":"Strong"},{"team":"Baylor","rank":19,"mag":0.506,"label":"Strong"},{"team":"West Virginia","rank":20,"mag":0.5,"label":"Strong"},{"team":"Clemson","rank":21,"mag":0.487,"label":"Strong"},{"team":"Oklahoma St","rank":22,"mag":0.481,"label":"Strong"},{"team":"Arkansas","rank":23,"mag":0.474,"label":"Strong"},{"team":"Florida St","rank":24,"mag":0.468,"label":"Strong"},{"team":"Mississippi","rank":25,"mag":0.462,"label":"Strong"},{"team":"Michigan St","rank":26,"mag":0.455,"label":"Strong"},{"team":"Oregon","rank":27,"mag":0.449,"label":"Strong"},{"team":"South Carolina","rank":28,"mag":0.442,"label":"Strong"},{"team":"Texas A&M","rank":29,"mag":0.423,"label":"Strong"},{"team":"Louisville","rank":30,"mag":0.423,"label":"Strong"},{"team":"USC","rank":31,"mag":0.423,"label":"Strong"},{"team":"Kentucky","rank":32,"mag":0.404,"label":"Strong"},{"team":"Notre Dame","rank":33,"mag":0.404,"label":"Strong"},{"team":"Purdue","rank":34,"mag":0.397,"label":"Strong"},{"team":"Iowa","rank":35,"mag":0.378,"label":"Average"},{"team":"Maryland","rank":36,"mag":0.359,"label":"Average"},{"team":"Wisconsin","rank":37,"mag":0.353,"label":"Average"},{"team":"Oregon St","rank":38,"mag":0.353,"label":"Average"},{"team":"Illinois","rank":39,"mag":0.321,"label":"Average"},{"team":"Syracuse","rank":40,"mag":0.314,"label":"Average"},{"team":"NC State","rank":41,"mag":0.308,"label":"Average"},{"team":"Missouri","rank":42,"mag":0.295,"label":"Average"},{"team":"Minnesota","rank":43,"mag":0.276,"label":"Average"},{"team":"Washington","rank":44,"mag":0.269,"label":"Average"},{"team":"Indiana","rank":45,"mag":0.256,"label":"Average"},{"team":"Wake Forest","rank":46,"mag":0.256,"label":"Average"},{"team":"Stanford","rank":47,"mag":0.237,"label":"Average"},{"team":"Washington St","rank":48,"mag":0.237,"label":"Average"},{"team":"North Carolina","rank":49,"mag":0.231,"label":"Average"},{"team":"Colorado","rank":50,"mag":0.212,"label":"Average"},{"team":"Tulane","rank":51,"mag":0.212,"label":"Average"},{"team":"Pittsburgh","rank":52,"mag":0.192,"label":"Average"},{"team":"Northwestern","rank":53,"mag":0.167,"label":"Average"},{"team":"UCLA","rank":54,"mag":0.167,"label":"Average"},{"team":"Georgia Tech","rank":55,"mag":0.154,"label":"Average"},{"team":"SMU","rank":56,"mag":0.147,"label":"Average"},{"team":"Nebraska","rank":57,"mag":0.128,"label":"Average"},{"team":"UCF","rank":58,"mag":0.122,"label":"Average"},{"team":"Vanderbilt","rank":59,"mag":0.083,"label":"Weak"},{"team":"Arizona","rank":60,"mag":0.083,"label":"Weak"},{"team":"Arizona St","rank":61,"mag":0.051,"label":"Weak"},{"team":"Houston","rank":62,"mag":0.045,"label":"Weak"},{"team":"Cincinnati","rank":63,"mag":0.032,"label":"Weak"},{"team":"Navy","rank":64,"mag":0.026,"label":"Weak"},{"team":"BYU","rank":65,"mag":0.026,"label":"Weak"},{"team":"California","rank":66,"mag":0.026,"label":"Weak"},{"team":"Rutgers","rank":67,"mag":0.026,"label":"Weak"},{"team":"Miami","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Virginia","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Boston College","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Duke","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"Virginia Tech","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"James Madison","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Boise St","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"Liberty","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":128,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":129,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":130,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":131,"mag":0.001,"label":"Very Weak"}],"2021":[{"team":"Georgia","rank":1,"mag":1.0,"label":"Elite"},{"team":"Alabama","rank":2,"mag":0.975,"label":"Elite"},{"team":"Michigan","rank":3,"mag":0.79,"label":"Elite"},{"team":"Ohio St","rank":4,"mag":0.713,"label":"Elite"},{"team":"Auburn","rank":5,"mag":0.599,"label":"Strong"},{"team":"Nebraska","rank":6,"mag":0.592,"label":"Strong"},{"team":"Oklahoma St","rank":7,"mag":0.567,"label":"Strong"},{"team":"Arkansas","rank":8,"mag":0.561,"label":"Strong"},{"team":"Penn St","rank":9,"mag":0.554,"label":"Strong"},{"team":"Wisconsin","rank":10,"mag":0.548,"label":"Strong"},{"team":"Clemson","rank":11,"mag":0.516,"label":"Strong"},{"team":"Mississippi","rank":12,"mag":0.51,"label":"Strong"},{"team":"Purdue","rank":13,"mag":0.51,"label":"Strong"},{"team":"Iowa St","rank":14,"mag":0.51,"label":"Strong"},{"team":"Michigan St","rank":15,"mag":0.484,"label":"Strong"},{"team":"Oklahoma","rank":16,"mag":0.471,"label":"Strong"},{"team":"Baylor","rank":17,"mag":0.465,"label":"Strong"},{"team":"Texas","rank":18,"mag":0.459,"label":"Strong"},{"team":"LSU","rank":19,"mag":0.446,"label":"Strong"},{"team":"Iowa","rank":20,"mag":0.439,"label":"Strong"},{"team":"Notre Dame","rank":21,"mag":0.439,"label":"Strong"},{"team":"Tennessee","rank":22,"mag":0.395,"label":"Strong"},{"team":"Texas A&M","rank":23,"mag":0.382,"label":"Strong"},{"team":"Indiana","rank":24,"mag":0.344,"label":"Average"},{"team":"Utah","rank":25,"mag":0.344,"label":"Average"},{"team":"Mississippi St","rank":26,"mag":0.344,"label":"Average"},{"team":"West Virginia","rank":27,"mag":0.338,"label":"Average"},{"team":"Minnesota","rank":28,"mag":0.325,"label":"Average"},{"team":"Cincinnati","rank":29,"mag":0.325,"label":"Average"},{"team":"Oregon","rank":30,"mag":0.318,"label":"Average"},{"team":"Kansas St","rank":31,"mag":0.318,"label":"Average"},{"team":"Miami","rank":32,"mag":0.293,"label":"Average"},{"team":"Florida","rank":33,"mag":0.274,"label":"Average"},{"team":"Florida St","rank":34,"mag":0.268,"label":"Average"},{"team":"NC State","rank":35,"mag":0.255,"label":"Average"},{"team":"Wake Forest","rank":36,"mag":0.248,"label":"Average"},{"team":"Texas Tech","rank":37,"mag":0.248,"label":"Average"},{"team":"Maryland","rank":38,"mag":0.242,"label":"Average"},{"team":"Pittsburgh","rank":39,"mag":0.236,"label":"Average"},{"team":"TCU","rank":40,"mag":0.236,"label":"Average"},{"team":"Illinois","rank":41,"mag":0.229,"label":"Average"},{"team":"Louisville","rank":42,"mag":0.223,"label":"Average"},{"team":"Kentucky","rank":43,"mag":0.21,"label":"Average"},{"team":"South Carolina","rank":44,"mag":0.204,"label":"Average"},{"team":"Virginia","rank":45,"mag":0.204,"label":"Average"},{"team":"Stanford","rank":46,"mag":0.191,"label":"Average"},{"team":"North Carolina","rank":47,"mag":0.191,"label":"Average"},{"team":"UCLA","rank":48,"mag":0.134,"label":"Average"},{"team":"Arizona St","rank":49,"mag":0.127,"label":"Average"},{"team":"USC","rank":50,"mag":0.121,"label":"Average"},{"team":"Rutgers","rank":51,"mag":0.096,"label":"Weak"},{"team":"Colorado","rank":52,"mag":0.089,"label":"Weak"},{"team":"Oregon St","rank":53,"mag":0.083,"label":"Weak"},{"team":"BYU","rank":54,"mag":0.076,"label":"Weak"},{"team":"Syracuse","rank":55,"mag":0.076,"label":"Weak"},{"team":"Missouri","rank":56,"mag":0.057,"label":"Weak"},{"team":"Tulane","rank":57,"mag":0.057,"label":"Weak"},{"team":"Boise St","rank":58,"mag":0.038,"label":"Weak"},{"team":"Navy","rank":59,"mag":0.032,"label":"Weak"},{"team":"Washington St","rank":60,"mag":0.032,"label":"Weak"},{"team":"Georgia Tech","rank":61,"mag":0.025,"label":"Weak"},{"team":"Virginia Tech","rank":62,"mag":0.019,"label":"Weak"},{"team":"Washington","rank":63,"mag":0.001,"label":"Very Weak"},{"team":"California","rank":64,"mag":0.001,"label":"Very Weak"},{"team":"Arizona","rank":65,"mag":0.001,"label":"Very Weak"},{"team":"Northwestern","rank":66,"mag":0.001,"label":"Very Weak"},{"team":"Houston","rank":67,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"SMU","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"UCF","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Boston College","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Kansas","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Liberty","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"Vanderbilt","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"Duke","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":128,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":129,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":130,"mag":0.001,"label":"Very Weak"}],"2020":[{"team":"Ohio St","rank":1,"mag":1.0,"label":"Elite"},{"team":"Alabama","rank":2,"mag":0.934,"label":"Elite"},{"team":"Clemson","rank":3,"mag":0.731,"label":"Elite"},{"team":"Georgia","rank":4,"mag":0.703,"label":"Elite"},{"team":"Florida","rank":5,"mag":0.665,"label":"Elite"},{"team":"Oklahoma","rank":6,"mag":0.665,"label":"Elite"},{"team":"Notre Dame","rank":7,"mag":0.654,"label":"Elite"},{"team":"Texas A&M","rank":8,"mag":0.615,"label":"Elite"},{"team":"Iowa St","rank":9,"mag":0.61,"label":"Elite"},{"team":"Arkansas","rank":10,"mag":0.577,"label":"Strong"},{"team":"Auburn","rank":11,"mag":0.571,"label":"Strong"},{"team":"Wisconsin","rank":12,"mag":0.555,"label":"Strong"},{"team":"Oklahoma St","rank":13,"mag":0.516,"label":"Strong"},{"team":"Indiana","rank":14,"mag":0.505,"label":"Strong"},{"team":"Texas","rank":15,"mag":0.495,"label":"Strong"},{"team":"Northwestern","rank":16,"mag":0.484,"label":"Strong"},{"team":"LSU","rank":17,"mag":0.473,"label":"Strong"},{"team":"Michigan St","rank":18,"mag":0.467,"label":"Strong"},{"team":"Mississippi","rank":19,"mag":0.434,"label":"Strong"},{"team":"Mississippi St","rank":20,"mag":0.418,"label":"Strong"},{"team":"Baylor","rank":21,"mag":0.418,"label":"Strong"},{"team":"Tennessee","rank":22,"mag":0.418,"label":"Strong"},{"team":"Iowa","rank":23,"mag":0.412,"label":"Strong"},{"team":"Nebraska","rank":24,"mag":0.407,"label":"Strong"},{"team":"TCU","rank":25,"mag":0.396,"label":"Strong"},{"team":"Penn St","rank":26,"mag":0.39,"label":"Strong"},{"team":"Miami","rank":27,"mag":0.385,"label":"Strong"},{"team":"Kentucky","rank":28,"mag":0.374,"label":"Average"},{"team":"Oregon","rank":29,"mag":0.374,"label":"Average"},{"team":"Maryland","rank":30,"mag":0.363,"label":"Average"},{"team":"Michigan","rank":31,"mag":0.363,"label":"Average"},{"team":"Wake Forest","rank":32,"mag":0.357,"label":"Average"},{"team":"Washington St","rank":33,"mag":0.352,"label":"Average"},{"team":"Illinois","rank":34,"mag":0.352,"label":"Average"},{"team":"Virginia Tech","rank":35,"mag":0.335,"label":"Average"},{"team":"South Carolina","rank":36,"mag":0.33,"label":"Average"},{"team":"USC","rank":37,"mag":0.319,"label":"Average"},{"team":"Missouri","rank":38,"mag":0.313,"label":"Average"},{"team":"North Carolina","rank":39,"mag":0.308,"label":"Average"},{"team":"Kansas St","rank":40,"mag":0.302,"label":"Average"},{"team":"Minnesota","rank":41,"mag":0.302,"label":"Average"},{"team":"Kansas","rank":42,"mag":0.291,"label":"Average"},{"team":"Arizona St","rank":43,"mag":0.28,"label":"Average"},{"team":"Virginia","rank":44,"mag":0.247,"label":"Average"},{"team":"UCLA","rank":45,"mag":0.247,"label":"Average"},{"team":"Stanford","rank":46,"mag":0.247,"label":"Average"},{"team":"California","rank":47,"mag":0.231,"label":"Average"},{"team":"West Virginia","rank":48,"mag":0.231,"label":"Average"},{"team":"Purdue","rank":49,"mag":0.225,"label":"Average"},{"team":"Cincinnati","rank":50,"mag":0.22,"label":"Average"},{"team":"Pittsburgh","rank":51,"mag":0.203,"label":"Average"},{"team":"Texas Tech","rank":52,"mag":0.192,"label":"Average"},{"team":"Tulsa","rank":53,"mag":0.187,"label":"Average"},{"team":"Rutgers","rank":54,"mag":0.187,"label":"Average"},{"team":"Oregon St","rank":55,"mag":0.181,"label":"Average"},{"team":"Arizona","rank":56,"mag":0.181,"label":"Average"},{"team":"Boston College","rank":57,"mag":0.181,"label":"Average"},{"team":"Vanderbilt","rank":58,"mag":0.181,"label":"Average"},{"team":"Louisville","rank":59,"mag":0.165,"label":"Average"},{"team":"UCF","rank":60,"mag":0.148,"label":"Average"},{"team":"Utah","rank":61,"mag":0.132,"label":"Average"},{"team":"NC State","rank":62,"mag":0.115,"label":"Average"},{"team":"Colorado","rank":63,"mag":0.104,"label":"Average"},{"team":"Syracuse","rank":64,"mag":0.099,"label":"Weak"},{"team":"Georgia Tech","rank":65,"mag":0.099,"label":"Weak"},{"team":"Houston","rank":66,"mag":0.06,"label":"Weak"},{"team":"BYU","rank":67,"mag":0.038,"label":"Weak"},{"team":"Duke","rank":68,"mag":0.0,"label":"Very Weak"},{"team":"Florida St","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Boise St","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"Navy","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Washington","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Tulane","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"SMU","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Liberty","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":127,"mag":0.001,"label":"Very Weak"}],"2019":[{"team":"Ohio St","rank":1,"mag":1.0,"label":"Elite"},{"team":"LSU","rank":2,"mag":0.958,"label":"Elite"},{"team":"Clemson","rank":3,"mag":0.821,"label":"Elite"},{"team":"Michigan","rank":4,"mag":0.795,"label":"Elite"},{"team":"Wisconsin","rank":5,"mag":0.795,"label":"Elite"},{"team":"Auburn","rank":6,"mag":0.768,"label":"Elite"},{"team":"Alabama","rank":7,"mag":0.758,"label":"Elite"},{"team":"Georgia","rank":8,"mag":0.668,"label":"Elite"},{"team":"Penn St","rank":9,"mag":0.642,"label":"Elite"},{"team":"Florida","rank":10,"mag":0.574,"label":"Strong"},{"team":"Texas A&M","rank":11,"mag":0.547,"label":"Strong"},{"team":"Oregon","rank":12,"mag":0.521,"label":"Strong"},{"team":"Iowa","rank":13,"mag":0.484,"label":"Strong"},{"team":"Oklahoma","rank":14,"mag":0.474,"label":"Strong"},{"team":"South Carolina","rank":15,"mag":0.468,"label":"Strong"},{"team":"Notre Dame","rank":16,"mag":0.453,"label":"Strong"},{"team":"Texas","rank":17,"mag":0.437,"label":"Strong"},{"team":"USC","rank":18,"mag":0.384,"label":"Strong"},{"team":"Baylor","rank":19,"mag":0.353,"label":"Average"},{"team":"Utah","rank":20,"mag":0.342,"label":"Average"},{"team":"Iowa St","rank":21,"mag":0.342,"label":"Average"},{"team":"Minnesota","rank":22,"mag":0.332,"label":"Average"},{"team":"Mississippi St","rank":23,"mag":0.321,"label":"Average"},{"team":"Michigan St","rank":24,"mag":0.305,"label":"Average"},{"team":"Oklahoma St","rank":25,"mag":0.274,"label":"Average"},{"team":"TCU","rank":26,"mag":0.268,"label":"Average"},{"team":"Nebraska","rank":27,"mag":0.263,"label":"Average"},{"team":"Washington","rank":28,"mag":0.258,"label":"Average"},{"team":"Indiana","rank":29,"mag":0.258,"label":"Average"},{"team":"Stanford","rank":30,"mag":0.253,"label":"Average"},{"team":"Mississippi","rank":31,"mag":0.237,"label":"Average"},{"team":"Kansas St","rank":32,"mag":0.216,"label":"Average"},{"team":"Tennessee","rank":33,"mag":0.205,"label":"Average"},{"team":"Washington St","rank":34,"mag":0.2,"label":"Average"},{"team":"UCLA","rank":35,"mag":0.189,"label":"Average"},{"team":"Colorado","rank":36,"mag":0.189,"label":"Average"},{"team":"Northwestern","rank":37,"mag":0.184,"label":"Average"},{"team":"California","rank":38,"mag":0.174,"label":"Average"},{"team":"Purdue","rank":39,"mag":0.168,"label":"Average"},{"team":"Virginia","rank":40,"mag":0.163,"label":"Average"},{"team":"Oregon St","rank":41,"mag":0.163,"label":"Average"},{"team":"Cincinnati","rank":42,"mag":0.147,"label":"Average"},{"team":"Arizona St","rank":43,"mag":0.147,"label":"Average"},{"team":"Memphis","rank":44,"mag":0.137,"label":"Average"},{"team":"Tulsa","rank":45,"mag":0.132,"label":"Average"},{"team":"North Carolina","rank":46,"mag":0.126,"label":"Average"},{"team":"Louisville","rank":47,"mag":0.111,"label":"Average"},{"team":"Maryland","rank":48,"mag":0.111,"label":"Average"},{"team":"Houston","rank":49,"mag":0.1,"label":"Average"},{"team":"Navy","rank":50,"mag":0.1,"label":"Average"},{"team":"Kentucky","rank":51,"mag":0.1,"label":"Average"},{"team":"Missouri","rank":52,"mag":0.095,"label":"Weak"},{"team":"West Virginia","rank":53,"mag":0.084,"label":"Weak"},{"team":"Arizona","rank":54,"mag":0.074,"label":"Weak"},{"team":"Texas Tech","rank":55,"mag":0.074,"label":"Weak"},{"team":"Florida St","rank":56,"mag":0.068,"label":"Weak"},{"team":"Tulane","rank":57,"mag":0.058,"label":"Weak"},{"team":"UCF","rank":58,"mag":0.042,"label":"Weak"},{"team":"Duke","rank":59,"mag":0.037,"label":"Weak"},{"team":"Illinois","rank":60,"mag":0.037,"label":"Weak"},{"team":"SMU","rank":61,"mag":0.001,"label":"Very Weak"},{"team":"Miami","rank":62,"mag":0.001,"label":"Very Weak"},{"team":"Pittsburgh","rank":63,"mag":0.001,"label":"Very Weak"},{"team":"Virginia Tech","rank":64,"mag":0.001,"label":"Very Weak"},{"team":"Wake Forest","rank":65,"mag":0.001,"label":"Very Weak"},{"team":"Boston College","rank":66,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas","rank":67,"mag":0.001,"label":"Very Weak"},{"team":"Vanderbilt","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Kansas","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"BYU","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Syracuse","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Boise St","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Tech","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"Rutgers","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"NC State","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"Liberty","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":128,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":129,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":130,"mag":0.001,"label":"Very Weak"}],"2018":[{"team":"Alabama","rank":1,"mag":1.0,"label":"Elite"},{"team":"Clemson","rank":2,"mag":0.854,"label":"Elite"},{"team":"Georgia","rank":3,"mag":0.778,"label":"Elite"},{"team":"LSU","rank":4,"mag":0.715,"label":"Elite"},{"team":"Texas A&M","rank":5,"mag":0.709,"label":"Elite"},{"team":"Mississippi St","rank":6,"mag":0.69,"label":"Elite"},{"team":"Auburn","rank":7,"mag":0.652,"label":"Elite"},{"team":"Oklahoma","rank":8,"mag":0.627,"label":"Elite"},{"team":"Michigan","rank":9,"mag":0.595,"label":"Strong"},{"team":"Florida","rank":10,"mag":0.557,"label":"Strong"},{"team":"Missouri","rank":11,"mag":0.544,"label":"Strong"},{"team":"Texas","rank":12,"mag":0.525,"label":"Strong"},{"team":"Notre Dame","rank":13,"mag":0.506,"label":"Strong"},{"team":"Kentucky","rank":14,"mag":0.5,"label":"Strong"},{"team":"Ohio St","rank":15,"mag":0.481,"label":"Strong"},{"team":"Penn St","rank":16,"mag":0.481,"label":"Strong"},{"team":"Pittsburgh","rank":17,"mag":0.456,"label":"Strong"},{"team":"Washington","rank":18,"mag":0.456,"label":"Strong"},{"team":"West Virginia","rank":19,"mag":0.437,"label":"Strong"},{"team":"South Carolina","rank":20,"mag":0.437,"label":"Strong"},{"team":"Purdue","rank":21,"mag":0.424,"label":"Strong"},{"team":"Michigan St","rank":22,"mag":0.424,"label":"Strong"},{"team":"Northwestern","rank":23,"mag":0.418,"label":"Strong"},{"team":"Iowa St","rank":24,"mag":0.386,"label":"Strong"},{"team":"Oklahoma St","rank":25,"mag":0.38,"label":"Strong"},{"team":"UCLA","rank":26,"mag":0.38,"label":"Strong"},{"team":"Iowa","rank":27,"mag":0.38,"label":"Strong"},{"team":"Wisconsin","rank":28,"mag":0.354,"label":"Average"},{"team":"TCU","rank":29,"mag":0.342,"label":"Average"},{"team":"Texas Tech","rank":30,"mag":0.335,"label":"Average"},{"team":"Stanford","rank":31,"mag":0.329,"label":"Average"},{"team":"Utah","rank":32,"mag":0.323,"label":"Average"},{"team":"Syracuse","rank":33,"mag":0.304,"label":"Average"},{"team":"Kansas St","rank":34,"mag":0.285,"label":"Average"},{"team":"Maryland","rank":35,"mag":0.285,"label":"Average"},{"team":"Tennessee","rank":36,"mag":0.272,"label":"Average"},{"team":"Indiana","rank":37,"mag":0.266,"label":"Average"},{"team":"Duke","rank":38,"mag":0.266,"label":"Average"},{"team":"Mississippi","rank":39,"mag":0.253,"label":"Average"},{"team":"Minnesota","rank":40,"mag":0.253,"label":"Average"},{"team":"Nebraska","rank":41,"mag":0.247,"label":"Average"},{"team":"Vanderbilt","rank":42,"mag":0.247,"label":"Average"},{"team":"Miami","rank":43,"mag":0.241,"label":"Average"},{"team":"Boston College","rank":44,"mag":0.222,"label":"Average"},{"team":"USC","rank":45,"mag":0.222,"label":"Average"},{"team":"Arizona St","rank":46,"mag":0.215,"label":"Average"},{"team":"Baylor","rank":47,"mag":0.19,"label":"Average"},{"team":"Florida St","rank":48,"mag":0.184,"label":"Average"},{"team":"Georgia Tech","rank":49,"mag":0.177,"label":"Average"},{"team":"Washington St","rank":50,"mag":0.139,"label":"Average"},{"team":"Oregon","rank":51,"mag":0.127,"label":"Average"},{"team":"Wake Forest","rank":52,"mag":0.12,"label":"Average"},{"team":"Virginia","rank":53,"mag":0.108,"label":"Average"},{"team":"NC State","rank":54,"mag":0.101,"label":"Average"},{"team":"Boise St","rank":55,"mag":0.101,"label":"Average"},{"team":"Virginia Tech","rank":56,"mag":0.101,"label":"Average"},{"team":"California","rank":57,"mag":0.057,"label":"Weak"},{"team":"Kansas","rank":58,"mag":0.051,"label":"Weak"},{"team":"North Carolina","rank":59,"mag":0.044,"label":"Weak"},{"team":"Fresno St","rank":60,"mag":0.032,"label":"Weak"},{"team":"BYU","rank":61,"mag":0.013,"label":"Weak"},{"team":"Arizona","rank":62,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas","rank":63,"mag":0.001,"label":"Very Weak"},{"team":"Colorado","rank":64,"mag":0.001,"label":"Very Weak"},{"team":"UCF","rank":65,"mag":0.001,"label":"Very Weak"},{"team":"Rutgers","rank":66,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":67,"mag":0.001,"label":"Very Weak"},{"team":"Oregon St","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Navy","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Cincinnati","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"Louisville","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"SMU","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"Illinois","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Tulane","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Houston","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Liberty","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":128,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":129,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":130,"mag":0.001,"label":"Very Weak"}],"2017":[{"team":"Auburn","rank":1,"mag":1.0,"label":"Elite"},{"team":"Oklahoma","rank":2,"mag":0.977,"label":"Elite"},{"team":"Ohio St","rank":3,"mag":0.946,"label":"Elite"},{"team":"Clemson","rank":4,"mag":0.923,"label":"Elite"},{"team":"Penn St","rank":5,"mag":0.908,"label":"Elite"},{"team":"Alabama","rank":6,"mag":0.9,"label":"Elite"},{"team":"Georgia","rank":7,"mag":0.885,"label":"Elite"},{"team":"TCU","rank":8,"mag":0.777,"label":"Elite"},{"team":"Notre Dame","rank":9,"mag":0.754,"label":"Elite"},{"team":"Iowa","rank":10,"mag":0.715,"label":"Elite"},{"team":"Florida St","rank":11,"mag":0.638,"label":"Elite"},{"team":"Oklahoma St","rank":12,"mag":0.631,"label":"Elite"},{"team":"Stanford","rank":13,"mag":0.623,"label":"Elite"},{"team":"Wisconsin","rank":14,"mag":0.608,"label":"Elite"},{"team":"USC","rank":15,"mag":0.6,"label":"Elite"},{"team":"Wake Forest","rank":16,"mag":0.6,"label":"Elite"},{"team":"Texas","rank":17,"mag":0.577,"label":"Strong"},{"team":"Michigan St","rank":18,"mag":0.577,"label":"Strong"},{"team":"Miami","rank":19,"mag":0.577,"label":"Strong"},{"team":"Iowa St","rank":20,"mag":0.577,"label":"Strong"},{"team":"Michigan","rank":21,"mag":0.562,"label":"Strong"},{"team":"Mississippi St","rank":22,"mag":0.554,"label":"Strong"},{"team":"NC State","rank":23,"mag":0.554,"label":"Strong"},{"team":"Boston College","rank":24,"mag":0.538,"label":"Strong"},{"team":"Louisville","rank":25,"mag":0.508,"label":"Strong"},{"team":"Washington","rank":26,"mag":0.485,"label":"Strong"},{"team":"LSU","rank":27,"mag":0.477,"label":"Strong"},{"team":"Georgia Tech","rank":28,"mag":0.438,"label":"Strong"},{"team":"Virginia Tech","rank":29,"mag":0.438,"label":"Strong"},{"team":"West Virginia","rank":30,"mag":0.415,"label":"Strong"},{"team":"UCLA","rank":31,"mag":0.408,"label":"Strong"},{"team":"Texas Tech","rank":32,"mag":0.408,"label":"Strong"},{"team":"Purdue","rank":33,"mag":0.392,"label":"Strong"},{"team":"Maryland","rank":34,"mag":0.385,"label":"Strong"},{"team":"Northwestern","rank":35,"mag":0.377,"label":"Average"},{"team":"Kansas St","rank":36,"mag":0.346,"label":"Average"},{"team":"Washington St","rank":37,"mag":0.346,"label":"Average"},{"team":"Arizona St","rank":38,"mag":0.331,"label":"Average"},{"team":"Syracuse","rank":39,"mag":0.315,"label":"Average"},{"team":"Nebraska","rank":40,"mag":0.3,"label":"Average"},{"team":"Texas A&M","rank":41,"mag":0.292,"label":"Average"},{"team":"Utah","rank":42,"mag":0.292,"label":"Average"},{"team":"Indiana","rank":43,"mag":0.285,"label":"Average"},{"team":"Duke","rank":44,"mag":0.277,"label":"Average"},{"team":"Florida","rank":45,"mag":0.262,"label":"Average"},{"team":"Pittsburgh","rank":46,"mag":0.262,"label":"Average"},{"team":"Oregon","rank":47,"mag":0.254,"label":"Average"},{"team":"South Carolina","rank":48,"mag":0.246,"label":"Average"},{"team":"California","rank":49,"mag":0.192,"label":"Average"},{"team":"Baylor","rank":50,"mag":0.154,"label":"Average"},{"team":"Virginia","rank":51,"mag":0.154,"label":"Average"},{"team":"North Carolina","rank":52,"mag":0.154,"label":"Average"},{"team":"Arkansas","rank":53,"mag":0.146,"label":"Average"},{"team":"UCF","rank":54,"mag":0.138,"label":"Average"},{"team":"Missouri","rank":55,"mag":0.1,"label":"Average"},{"team":"Navy","rank":56,"mag":0.1,"label":"Average"},{"team":"Minnesota","rank":57,"mag":0.1,"label":"Average"},{"team":"Arizona","rank":58,"mag":0.1,"label":"Average"},{"team":"Kentucky","rank":59,"mag":0.077,"label":"Weak"},{"team":"Memphis","rank":60,"mag":0.023,"label":"Weak"},{"team":"Colorado","rank":61,"mag":0.015,"label":"Weak"},{"team":"Mississippi","rank":62,"mag":0.008,"label":"Very Weak"},{"team":"Rutgers","rank":63,"mag":0.008,"label":"Very Weak"},{"team":"Vanderbilt","rank":64,"mag":0.001,"label":"Very Weak"},{"team":"Tennessee","rank":65,"mag":0.001,"label":"Very Weak"},{"team":"Oregon St","rank":66,"mag":0.001,"label":"Very Weak"},{"team":"Boise St","rank":67,"mag":0.001,"label":"Very Weak"},{"team":"Houston","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Illinois","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"SMU","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Tulane","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Kansas","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"BYU","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Cincinnati","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"Idaho","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":128,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":129,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":130,"mag":0.001,"label":"Very Weak"}],"2016":[{"team":"Georgia","rank":1,"mag":1.0,"label":"Elite"},{"team":"Ohio St","rank":2,"mag":0.989,"label":"Elite"},{"team":"Texas","rank":3,"mag":0.847,"label":"Elite"},{"team":"Notre Dame","rank":4,"mag":0.818,"label":"Elite"},{"team":"Alabama","rank":5,"mag":0.75,"label":"Elite"},{"team":"Florida","rank":6,"mag":0.75,"label":"Elite"},{"team":"Tennessee","rank":7,"mag":0.733,"label":"Elite"},{"team":"Penn St","rank":8,"mag":0.71,"label":"Elite"},{"team":"LSU","rank":9,"mag":0.71,"label":"Elite"},{"team":"Oregon","rank":10,"mag":0.682,"label":"Elite"},{"team":"Michigan","rank":11,"mag":0.676,"label":"Elite"},{"team":"South Carolina","rank":12,"mag":0.676,"label":"Elite"},{"team":"Oklahoma","rank":13,"mag":0.676,"label":"Elite"},{"team":"Texas A&M","rank":14,"mag":0.665,"label":"Elite"},{"team":"Mississippi","rank":15,"mag":0.659,"label":"Elite"},{"team":"USC","rank":16,"mag":0.631,"label":"Elite"},{"team":"Kentucky","rank":17,"mag":0.574,"label":"Strong"},{"team":"Indiana","rank":18,"mag":0.534,"label":"Strong"},{"team":"UCLA","rank":19,"mag":0.528,"label":"Strong"},{"team":"Louisville","rank":20,"mag":0.517,"label":"Strong"},{"team":"Vanderbilt","rank":21,"mag":0.511,"label":"Strong"},{"team":"Clemson","rank":22,"mag":0.506,"label":"Strong"},{"team":"Arkansas","rank":23,"mag":0.5,"label":"Strong"},{"team":"Kansas","rank":24,"mag":0.483,"label":"Strong"},{"team":"Missouri","rank":25,"mag":0.46,"label":"Strong"},{"team":"Arizona St","rank":26,"mag":0.449,"label":"Strong"},{"team":"Iowa St","rank":27,"mag":0.438,"label":"Strong"},{"team":"Washington","rank":28,"mag":0.432,"label":"Strong"},{"team":"Auburn","rank":29,"mag":0.432,"label":"Strong"},{"team":"Minnesota","rank":30,"mag":0.426,"label":"Strong"},{"team":"Wisconsin","rank":31,"mag":0.409,"label":"Strong"},{"team":"Miami","rank":32,"mag":0.409,"label":"Strong"},{"team":"SMU","rank":33,"mag":0.398,"label":"Strong"},{"team":"BYU","rank":34,"mag":0.398,"label":"Strong"},{"team":"Georgia Tech","rank":35,"mag":0.398,"label":"Strong"},{"team":"Kansas St","rank":36,"mag":0.398,"label":"Strong"},{"team":"Iowa","rank":37,"mag":0.386,"label":"Strong"},{"team":"Baylor","rank":38,"mag":0.386,"label":"Strong"},{"team":"Mississippi St","rank":39,"mag":0.381,"label":"Strong"},{"team":"Nebraska","rank":40,"mag":0.375,"label":"Average"},{"team":"Houston","rank":41,"mag":0.369,"label":"Average"},{"team":"UCF","rank":42,"mag":0.364,"label":"Average"},{"team":"Illinois","rank":43,"mag":0.352,"label":"Average"},{"team":"Virginia Tech","rank":44,"mag":0.347,"label":"Average"},{"team":"Colorado","rank":45,"mag":0.341,"label":"Average"},{"team":"Cincinnati","rank":46,"mag":0.324,"label":"Average"},{"team":"West Virginia","rank":47,"mag":0.307,"label":"Average"},{"team":"Utah","rank":48,"mag":0.301,"label":"Average"},{"team":"Florida St","rank":49,"mag":0.29,"label":"Average"},{"team":"TCU","rank":50,"mag":0.261,"label":"Average"},{"team":"Rutgers","rank":51,"mag":0.261,"label":"Average"},{"team":"Texas Tech","rank":52,"mag":0.256,"label":"Average"},{"team":"Maryland","rank":53,"mag":0.256,"label":"Average"},{"team":"Oklahoma St","rank":54,"mag":0.233,"label":"Average"},{"team":"Boston College","rank":55,"mag":0.205,"label":"Average"},{"team":"Michigan St","rank":56,"mag":0.182,"label":"Average"},{"team":"Virginia","rank":57,"mag":0.176,"label":"Average"},{"team":"Northwestern","rank":58,"mag":0.165,"label":"Average"},{"team":"Syracuse","rank":59,"mag":0.153,"label":"Average"},{"team":"Stanford","rank":60,"mag":0.153,"label":"Average"},{"team":"Arizona","rank":61,"mag":0.148,"label":"Average"},{"team":"Pittsburgh","rank":62,"mag":0.142,"label":"Average"},{"team":"Duke","rank":63,"mag":0.125,"label":"Average"},{"team":"Tulane","rank":64,"mag":0.091,"label":"Weak"},{"team":"California","rank":65,"mag":0.057,"label":"Weak"},{"team":"Boise St","rank":66,"mag":0.034,"label":"Weak"},{"team":"Wake Forest","rank":67,"mag":0.023,"label":"Weak"},{"team":"NC State","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Purdue","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"North Carolina","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"Navy","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Washington St","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Oregon St","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Coastal Car","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"James Madison","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"Sam Houston","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Jacksonville St","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Kennesaw St","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":128,"mag":0.001,"label":"Very Weak"}],"2015":[{"team":"Alabama","rank":1,"mag":1.0,"label":"Elite"},{"team":"Oklahoma","rank":2,"mag":0.881,"label":"Elite"},{"team":"Mississippi","rank":3,"mag":0.833,"label":"Elite"},{"team":"Clemson","rank":4,"mag":0.817,"label":"Elite"},{"team":"LSU","rank":5,"mag":0.802,"label":"Elite"},{"team":"USC","rank":6,"mag":0.786,"label":"Elite"},{"team":"Arkansas","rank":7,"mag":0.786,"label":"Elite"},{"team":"Notre Dame","rank":8,"mag":0.738,"label":"Elite"},{"team":"Mississippi St","rank":9,"mag":0.683,"label":"Elite"},{"team":"Stanford","rank":10,"mag":0.635,"label":"Elite"},{"team":"California","rank":11,"mag":0.627,"label":"Elite"},{"team":"Tennessee","rank":12,"mag":0.627,"label":"Elite"},{"team":"Baylor","rank":13,"mag":0.627,"label":"Elite"},{"team":"TCU","rank":14,"mag":0.619,"label":"Elite"},{"team":"Auburn","rank":15,"mag":0.611,"label":"Elite"},{"team":"Oregon","rank":16,"mag":0.603,"label":"Elite"},{"team":"Florida","rank":17,"mag":0.595,"label":"Strong"},{"team":"Texas A&M","rank":18,"mag":0.563,"label":"Strong"},{"team":"Washington","rank":19,"mag":0.556,"label":"Strong"},{"team":"Michigan St","rank":20,"mag":0.556,"label":"Strong"},{"team":"Oklahoma St","rank":21,"mag":0.54,"label":"Strong"},{"team":"Utah","rank":22,"mag":0.532,"label":"Strong"},{"team":"Georgia Tech","rank":23,"mag":0.508,"label":"Strong"},{"team":"Arizona St","rank":24,"mag":0.508,"label":"Strong"},{"team":"Texas","rank":25,"mag":0.5,"label":"Strong"},{"team":"Ohio St","rank":26,"mag":0.484,"label":"Strong"},{"team":"West Virginia","rank":27,"mag":0.476,"label":"Strong"},{"team":"UCLA","rank":28,"mag":0.476,"label":"Strong"},{"team":"North Carolina","rank":29,"mag":0.46,"label":"Strong"},{"team":"Michigan","rank":30,"mag":0.444,"label":"Strong"},{"team":"Texas Tech","rank":31,"mag":0.444,"label":"Strong"},{"team":"Florida St","rank":32,"mag":0.429,"label":"Strong"},{"team":"Georgia","rank":33,"mag":0.413,"label":"Strong"},{"team":"Pittsburgh","rank":34,"mag":0.389,"label":"Strong"},{"team":"Louisville","rank":35,"mag":0.381,"label":"Strong"},{"team":"Virginia","rank":36,"mag":0.365,"label":"Average"},{"team":"Miami","rank":37,"mag":0.357,"label":"Average"},{"team":"Vanderbilt","rank":38,"mag":0.357,"label":"Average"},{"team":"Iowa St","rank":39,"mag":0.317,"label":"Average"},{"team":"Missouri","rank":40,"mag":0.302,"label":"Average"},{"team":"South Carolina","rank":41,"mag":0.302,"label":"Average"},{"team":"Washington St","rank":42,"mag":0.302,"label":"Average"},{"team":"Kansas St","rank":43,"mag":0.286,"label":"Average"},{"team":"Virginia Tech","rank":44,"mag":0.278,"label":"Average"},{"team":"BYU","rank":45,"mag":0.262,"label":"Average"},{"team":"Maryland","rank":46,"mag":0.254,"label":"Average"},{"team":"NC State","rank":47,"mag":0.238,"label":"Average"},{"team":"Northwestern","rank":48,"mag":0.238,"label":"Average"},{"team":"Wisconsin","rank":49,"mag":0.23,"label":"Average"},{"team":"Nebraska","rank":50,"mag":0.222,"label":"Average"},{"team":"Iowa","rank":51,"mag":0.214,"label":"Average"},{"team":"Syracuse","rank":52,"mag":0.206,"label":"Average"},{"team":"Memphis","rank":53,"mag":0.19,"label":"Average"},{"team":"Penn St","rank":54,"mag":0.19,"label":"Average"},{"team":"Minnesota","rank":55,"mag":0.183,"label":"Average"},{"team":"Arizona","rank":56,"mag":0.175,"label":"Average"},{"team":"Boston College","rank":57,"mag":0.143,"label":"Average"},{"team":"Illinois","rank":58,"mag":0.127,"label":"Average"},{"team":"Wake Forest","rank":59,"mag":0.119,"label":"Average"},{"team":"Indiana","rank":60,"mag":0.071,"label":"Weak"},{"team":"Oregon St","rank":61,"mag":0.063,"label":"Weak"},{"team":"Navy","rank":62,"mag":0.056,"label":"Weak"},{"team":"Purdue","rank":63,"mag":0.032,"label":"Weak"},{"team":"Kentucky","rank":64,"mag":0.0,"label":"Very Weak"},{"team":"Colorado","rank":65,"mag":0.001,"label":"Very Weak"},{"team":"Duke","rank":66,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":67,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Houston","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"Boise St","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Cincinnati","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Rutgers","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Kansas","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"SMU","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"UCF","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Tulane","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Idaho","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Charlotte","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":128,"mag":0.001,"label":"Very Weak"}],"2014":[{"team":"Auburn","rank":1,"mag":1.0,"label":"Elite"},{"team":"Alabama","rank":2,"mag":0.979,"label":"Elite"},{"team":"Mississippi","rank":3,"mag":0.879,"label":"Elite"},{"team":"Arkansas","rank":4,"mag":0.843,"label":"Elite"},{"team":"Oregon","rank":5,"mag":0.814,"label":"Elite"},{"team":"Ohio St","rank":6,"mag":0.793,"label":"Elite"},{"team":"LSU","rank":7,"mag":0.786,"label":"Elite"},{"team":"UCLA","rank":8,"mag":0.729,"label":"Elite"},{"team":"TCU","rank":9,"mag":0.721,"label":"Elite"},{"team":"Mississippi St","rank":10,"mag":0.693,"label":"Elite"},{"team":"Baylor","rank":11,"mag":0.686,"label":"Elite"},{"team":"Texas A&M","rank":12,"mag":0.679,"label":"Elite"},{"team":"Kansas St","rank":13,"mag":0.679,"label":"Elite"},{"team":"Georgia","rank":14,"mag":0.657,"label":"Elite"},{"team":"Stanford","rank":15,"mag":0.629,"label":"Elite"},{"team":"Michigan St","rank":16,"mag":0.629,"label":"Elite"},{"team":"USC","rank":17,"mag":0.593,"label":"Strong"},{"team":"West Virginia","rank":18,"mag":0.586,"label":"Strong"},{"team":"Oklahoma","rank":19,"mag":0.586,"label":"Strong"},{"team":"Arizona","rank":20,"mag":0.564,"label":"Strong"},{"team":"Florida","rank":21,"mag":0.543,"label":"Strong"},{"team":"Utah","rank":22,"mag":0.536,"label":"Strong"},{"team":"Missouri","rank":23,"mag":0.521,"label":"Strong"},{"team":"Tennessee","rank":24,"mag":0.5,"label":"Strong"},{"team":"Texas","rank":25,"mag":0.493,"label":"Strong"},{"team":"Georgia Tech","rank":26,"mag":0.471,"label":"Strong"},{"team":"Florida St","rank":27,"mag":0.471,"label":"Strong"},{"team":"Arizona St","rank":28,"mag":0.464,"label":"Strong"},{"team":"Clemson","rank":29,"mag":0.464,"label":"Strong"},{"team":"South Carolina","rank":30,"mag":0.436,"label":"Strong"},{"team":"California","rank":31,"mag":0.371,"label":"Average"},{"team":"Notre Dame","rank":32,"mag":0.371,"label":"Average"},{"team":"Washington St","rank":33,"mag":0.35,"label":"Average"},{"team":"Wisconsin","rank":34,"mag":0.343,"label":"Average"},{"team":"Miami","rank":35,"mag":0.321,"label":"Average"},{"team":"Louisville","rank":36,"mag":0.293,"label":"Average"},{"team":"Oklahoma St","rank":37,"mag":0.271,"label":"Average"},{"team":"Virginia","rank":38,"mag":0.257,"label":"Average"},{"team":"Washington","rank":39,"mag":0.25,"label":"Average"},{"team":"Maryland","rank":40,"mag":0.236,"label":"Average"},{"team":"Nebraska","rank":41,"mag":0.236,"label":"Average"},{"team":"Minnesota","rank":42,"mag":0.214,"label":"Average"},{"team":"Colorado","rank":43,"mag":0.2,"label":"Average"},{"team":"Kentucky","rank":44,"mag":0.2,"label":"Average"},{"team":"North Carolina","rank":45,"mag":0.179,"label":"Average"},{"team":"Oregon St","rank":46,"mag":0.179,"label":"Average"},{"team":"Michigan","rank":47,"mag":0.164,"label":"Average"},{"team":"Texas Tech","rank":48,"mag":0.157,"label":"Average"},{"team":"Virginia Tech","rank":49,"mag":0.15,"label":"Average"},{"team":"Boston College","rank":50,"mag":0.1,"label":"Average"},{"team":"Rutgers","rank":51,"mag":0.093,"label":"Weak"},{"team":"Iowa St","rank":52,"mag":0.071,"label":"Weak"},{"team":"Penn St","rank":53,"mag":0.029,"label":"Weak"},{"team":"Northwestern","rank":54,"mag":0.029,"label":"Weak"},{"team":"Syracuse","rank":55,"mag":0.014,"label":"Weak"},{"team":"Pittsburgh","rank":56,"mag":0.001,"label":"Very Weak"},{"team":"NC State","rank":57,"mag":0.001,"label":"Very Weak"},{"team":"BYU","rank":58,"mag":0.001,"label":"Very Weak"},{"team":"Iowa","rank":59,"mag":0.001,"label":"Very Weak"},{"team":"Duke","rank":60,"mag":0.001,"label":"Very Weak"},{"team":"Kansas","rank":61,"mag":0.001,"label":"Very Weak"},{"team":"Illinois","rank":62,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":63,"mag":0.001,"label":"Very Weak"},{"team":"Boise St","rank":64,"mag":0.001,"label":"Very Weak"},{"team":"Indiana","rank":65,"mag":0.001,"label":"Very Weak"},{"team":"Cincinnati","rank":66,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":67,"mag":0.001,"label":"Very Weak"},{"team":"Purdue","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Vanderbilt","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"Wake Forest","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"UCF","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"Navy","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Tulane","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"Utah St","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Houston","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"SMU","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Georgia Southern","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Old Dominion","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"Idaho","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"App State","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":125,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":126,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":127,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":128,"mag":0.001,"label":"Very Weak"}],"2013":[{"team":"Stanford","rank":1,"mag":1.0,"label":"Elite"},{"team":"Arizona St","rank":2,"mag":0.916,"label":"Elite"},{"team":"Auburn","rank":3,"mag":0.916,"label":"Elite"},{"team":"UCLA","rank":4,"mag":0.908,"label":"Elite"},{"team":"Washington","rank":5,"mag":0.849,"label":"Elite"},{"team":"Oregon","rank":6,"mag":0.849,"label":"Elite"},{"team":"Alabama","rank":7,"mag":0.798,"label":"Elite"},{"team":"Utah","rank":8,"mag":0.79,"label":"Elite"},{"team":"Oklahoma","rank":9,"mag":0.756,"label":"Elite"},{"team":"Georgia","rank":10,"mag":0.748,"label":"Elite"},{"team":"LSU","rank":11,"mag":0.714,"label":"Elite"},{"team":"Missouri","rank":12,"mag":0.706,"label":"Elite"},{"team":"Florida St","rank":13,"mag":0.706,"label":"Elite"},{"team":"Texas","rank":14,"mag":0.706,"label":"Elite"},{"team":"Oklahoma St","rank":15,"mag":0.697,"label":"Elite"},{"team":"Mississippi","rank":16,"mag":0.697,"label":"Elite"},{"team":"South Carolina","rank":17,"mag":0.689,"label":"Elite"},{"team":"Baylor","rank":18,"mag":0.664,"label":"Elite"},{"team":"Texas A&M","rank":19,"mag":0.655,"label":"Elite"},{"team":"Mississippi St","rank":20,"mag":0.605,"label":"Elite"},{"team":"Clemson","rank":21,"mag":0.597,"label":"Strong"},{"team":"Wisconsin","rank":22,"mag":0.571,"label":"Strong"},{"team":"USC","rank":23,"mag":0.563,"label":"Strong"},{"team":"Oregon St","rank":24,"mag":0.538,"label":"Strong"},{"team":"Florida","rank":25,"mag":0.521,"label":"Strong"},{"team":"Washington St","rank":26,"mag":0.513,"label":"Strong"},{"team":"Arizona","rank":27,"mag":0.513,"label":"Strong"},{"team":"BYU","rank":28,"mag":0.504,"label":"Strong"},{"team":"TCU","rank":29,"mag":0.462,"label":"Strong"},{"team":"Notre Dame","rank":30,"mag":0.462,"label":"Strong"},{"team":"Kansas St","rank":31,"mag":0.412,"label":"Strong"},{"team":"Texas Tech","rank":32,"mag":0.403,"label":"Strong"},{"team":"Tennessee","rank":33,"mag":0.395,"label":"Strong"},{"team":"Ohio St","rank":34,"mag":0.37,"label":"Average"},{"team":"Georgia Tech","rank":35,"mag":0.37,"label":"Average"},{"team":"Michigan St","rank":36,"mag":0.37,"label":"Average"},{"team":"Virginia Tech","rank":37,"mag":0.319,"label":"Average"},{"team":"Iowa","rank":38,"mag":0.277,"label":"Average"},{"team":"Michigan","rank":39,"mag":0.261,"label":"Average"},{"team":"Arkansas","rank":40,"mag":0.218,"label":"Average"},{"team":"Vanderbilt","rank":41,"mag":0.202,"label":"Average"},{"team":"Miami","rank":42,"mag":0.185,"label":"Average"},{"team":"Pittsburgh","rank":43,"mag":0.176,"label":"Average"},{"team":"Indiana","rank":44,"mag":0.134,"label":"Average"},{"team":"Iowa St","rank":45,"mag":0.118,"label":"Average"},{"team":"North Carolina","rank":46,"mag":0.118,"label":"Average"},{"team":"Virginia","rank":47,"mag":0.084,"label":"Weak"},{"team":"Duke","rank":48,"mag":0.076,"label":"Weak"},{"team":"Boise St","rank":49,"mag":0.067,"label":"Weak"},{"team":"UCF","rank":50,"mag":0.067,"label":"Weak"},{"team":"California","rank":51,"mag":0.067,"label":"Weak"},{"team":"Northwestern","rank":52,"mag":0.05,"label":"Weak"},{"team":"Nebraska","rank":53,"mag":0.034,"label":"Weak"},{"team":"Kentucky","rank":54,"mag":0.017,"label":"Weak"},{"team":"Utah St","rank":55,"mag":0.008,"label":"Very Weak"},{"team":"West Virginia","rank":56,"mag":0.008,"label":"Very Weak"},{"team":"Penn St","rank":57,"mag":0.001,"label":"Very Weak"},{"team":"Minnesota","rank":58,"mag":0.001,"label":"Very Weak"},{"team":"Boston College","rank":59,"mag":0.001,"label":"Very Weak"},{"team":"Houston","rank":60,"mag":0.001,"label":"Very Weak"},{"team":"Syracuse","rank":61,"mag":0.001,"label":"Very Weak"},{"team":"Colorado","rank":62,"mag":0.001,"label":"Very Weak"},{"team":"Illinois","rank":63,"mag":0.001,"label":"Very Weak"},{"team":"Kansas","rank":64,"mag":0.001,"label":"Very Weak"},{"team":"Wake Forest","rank":65,"mag":0.001,"label":"Very Weak"},{"team":"Purdue","rank":66,"mag":0.001,"label":"Very Weak"},{"team":"Louisville","rank":67,"mag":0.001,"label":"Very Weak"},{"team":"Maryland","rank":68,"mag":0.001,"label":"Very Weak"},{"team":"Nevada","rank":69,"mag":0.001,"label":"Very Weak"},{"team":"Navy","rank":70,"mag":0.001,"label":"Very Weak"},{"team":"San Jose St","rank":71,"mag":0.001,"label":"Very Weak"},{"team":"Hawaii","rank":72,"mag":0.001,"label":"Very Weak"},{"team":"SMU","rank":73,"mag":0.001,"label":"Very Weak"},{"team":"NC State","rank":74,"mag":0.001,"label":"Very Weak"},{"team":"South Florida","rank":75,"mag":0.001,"label":"Very Weak"},{"team":"Toledo","rank":76,"mag":0.001,"label":"Very Weak"},{"team":"Fresno St","rank":77,"mag":0.001,"label":"Very Weak"},{"team":"Rutgers","rank":78,"mag":0.001,"label":"Very Weak"},{"team":"Tulsa","rank":79,"mag":0.001,"label":"Very Weak"},{"team":"UConn","rank":80,"mag":0.001,"label":"Very Weak"},{"team":"UTSA","rank":81,"mag":0.001,"label":"Very Weak"},{"team":"Memphis","rank":82,"mag":0.001,"label":"Very Weak"},{"team":"Cincinnati","rank":83,"mag":0.001,"label":"Very Weak"},{"team":"Temple","rank":84,"mag":0.001,"label":"Very Weak"},{"team":"Colorado St","rank":85,"mag":0.001,"label":"Very Weak"},{"team":"San Diego St","rank":86,"mag":0.001,"label":"Very Weak"},{"team":"Bowling Green","rank":87,"mag":0.001,"label":"Very Weak"},{"team":"Rice","rank":88,"mag":0.001,"label":"Very Weak"},{"team":"East Carolina","rank":89,"mag":0.001,"label":"Very Weak"},{"team":"N Illinois","rank":90,"mag":0.001,"label":"Very Weak"},{"team":"Marshall","rank":91,"mag":0.001,"label":"Very Weak"},{"team":"UNLV","rank":92,"mag":0.001,"label":"Very Weak"},{"team":"Florida Atlantic","rank":93,"mag":0.001,"label":"Very Weak"},{"team":"Middle Tenn","rank":94,"mag":0.001,"label":"Very Weak"},{"team":"Arkansas St","rank":95,"mag":0.001,"label":"Very Weak"},{"team":"North Texas","rank":96,"mag":0.001,"label":"Very Weak"},{"team":"Tulane","rank":97,"mag":0.001,"label":"Very Weak"},{"team":"Kent St","rank":98,"mag":0.001,"label":"Very Weak"},{"team":"UL Monroe","rank":99,"mag":0.001,"label":"Very Weak"},{"team":"Buffalo","rank":100,"mag":0.001,"label":"Very Weak"},{"team":"Troy","rank":101,"mag":0.001,"label":"Very Weak"},{"team":"Western Kentucky","rank":102,"mag":0.001,"label":"Very Weak"},{"team":"South Alabama","rank":103,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana","rank":104,"mag":0.001,"label":"Very Weak"},{"team":"Air Force","rank":105,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico","rank":106,"mag":0.001,"label":"Very Weak"},{"team":"Wyoming","rank":107,"mag":0.001,"label":"Very Weak"},{"team":"Ball St","rank":108,"mag":0.001,"label":"Very Weak"},{"team":"Army","rank":109,"mag":0.001,"label":"Very Weak"},{"team":"Akron","rank":110,"mag":0.001,"label":"Very Weak"},{"team":"Ohio","rank":111,"mag":0.001,"label":"Very Weak"},{"team":"Miami (OH)","rank":112,"mag":0.001,"label":"Very Weak"},{"team":"Idaho","rank":113,"mag":0.001,"label":"Very Weak"},{"team":"Southern Miss","rank":114,"mag":0.001,"label":"Very Weak"},{"team":"UAB","rank":115,"mag":0.001,"label":"Very Weak"},{"team":"Georgia St","rank":116,"mag":0.001,"label":"Very Weak"},{"team":"Central Michigan","rank":117,"mag":0.001,"label":"Very Weak"},{"team":"Texas St","rank":118,"mag":0.001,"label":"Very Weak"},{"team":"UTEP","rank":119,"mag":0.001,"label":"Very Weak"},{"team":"Western Michigan","rank":120,"mag":0.001,"label":"Very Weak"},{"team":"Louisiana Tech","rank":121,"mag":0.001,"label":"Very Weak"},{"team":"UMass","rank":122,"mag":0.001,"label":"Very Weak"},{"team":"East Michigan","rank":123,"mag":0.001,"label":"Very Weak"},{"team":"Florida Intl","rank":124,"mag":0.001,"label":"Very Weak"},{"team":"New Mexico St","rank":125,"mag":0.001,"label":"Very Weak"}]}

function AddPlayerModal({onClose, onAdd, existingPlayers, sosByYear={}, currentProjectionClass="2026"}) {
  const [step, setStep] = useState(0); // 0=identity 1=seasons 2=athletic 3=recruiting 4=review
  const [form, setForm] = useState(() => buildEmptyForm(currentProjectionClass));
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [ddOpenMap, setDdOpenMap] = useState({}); // {seasonIdx: bool}
  const [ddActiveIdxMap, setDdActiveIdxMap] = useState({}); // {seasonIdx: highlighted suggestion idx}
  const [rcOpen, setRcOpen]       = useState(false); // recruit school dd
  const [rcActiveIdx, setRcActiveIdx] = useState(-1);
  const [trOpen, setTrOpen]       = useState(false); // transfer school dd
  const draftClassOptions = React.useMemo(() => getDraftClassOptions(currentProjectionClass), [currentProjectionClass]);

  const set = (key, val) => setForm(f => ({...f, [key]: val}));
  const pffScoreFromBoardRank = (rankVal) => {
    const r = Number(rankVal);
    if (!Number.isFinite(r) || r < 1 || r > 50) return "";
    // CSV mapping from AH234:AI286 in Prosp Score file:
    // rank 1..50 -> multiplier 1.00..0.02 (step 0.02)
    // displayed score is multiplier * 100
    const multiplier = 1 - (r - 1) * 0.02;
    return String(Math.round(multiplier * 100));
  };
  const setSeason = (idx, key, val) => setForm(f => {
    const statKeys = ['attempts', 'rush_yds', 'ypa', 'rush_tds', 'run_grade', 'yco_a', 'mtf_a', 'ydom', 'tddom', 'targets', 'receptions', 'rec_yds', 'yds_per_rec', 'rec_tds', 'recv_grade', 'yac_rec', 'mtf_rec'];
    const shouldClearScores = statKeys.includes(key);
    const seasons = f.seasons.map((s,i) => {
      if (i === idx) {
        const updated = {...s, [key]:val};
        if (shouldClearScores) {
          updated.rush_score = '';
          updated.recv_score = '';
          updated.adj_score = '';
        }
        return updated;
      }
      return s;
    });
    return {...f, seasons};
  });
  const addSeason = () => {
    if (form.seasons.length >= 5) return;
    setForm(f => ({...f, seasons: [...f.seasons, {...EMPTY_FORM.seasons[0], n: f.seasons.length+1}]}));
  };
  const removeSeason = idx => setForm(f => ({
    ...f, seasons: f.seasons.filter((_,i)=>i!==idx).map((s,i)=>({...s,n:i+1}))
  }));

  const derivedTransfers = useMemo(() => {
    const moves = [];
    for (let i = 1; i < form.seasons.length; i++) {
      const prevSchool = (form.seasons[i - 1]?.school || "").trim();
      const nextSchool = (form.seasons[i]?.school || "").trim();
      if (prevSchool && nextSchool && prevSchool.toLowerCase() !== nextSchool.toLowerCase()) {
        moves.push({ year: String(form.seasons[i]?.yr || "").trim(), school: nextSchool });
      }
    }
    return {
      moves,
      transfer_to: moves.map(m => m.school).join(", "),
      transfer_year: moves.map(m => m.year).filter(Boolean).join(", "),
      count: moves.length,
    };
  }, [form.seasons]);

  useEffect(() => {
    setForm(f => {
      if (f.transfer_to === derivedTransfers.transfer_to && f.transfer_year === derivedTransfers.transfer_year) {
        return f;
      }
      return {
        ...f,
        transfer_to: derivedTransfers.transfer_to,
        transfer_year: derivedTransfers.transfer_year,
      };
    });
  }, [derivedTransfers.transfer_to, derivedTransfers.transfer_year]);

  const validate0 = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Required";
    if (form.name.trim() && existingPlayers[form.name.trim()]) e.name = "Player already exists";
    if (!form.draft_class) e.draft_class = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateRecruiting = () => {
    const e = {};
    if (form.recruit_school === "Other (FCS/Lower)" && !form.recruit_school_other.trim()) {
      e.recruit_school_other = "Required";
    }
    setErrors(prev => ({ ...prev, ...e }));
    return Object.keys(e).length === 0;
  };

  const STEPS = ["Identity","Seasons","Athletic","Recruiting","Review"];

  const next = () => {
    if (step===0 && !validate0()) return;
    if (step===3 && !validateRecruiting()) return;
    setStep(s => Math.min(s+1, 4));
  };
  const back = () => setStep(s => Math.max(s-1,0));

  const hasValue = (v) => String(v ?? "").trim() !== "";
  const hasSeasonStatsInput = (seasons) =>
    (seasons || []).some((s) =>
      [
        "attempts","rush_yds","ypa","rush_tds","fumbles","run_grade","yco_a","mtf","ten_plus","fif_plus","bay","first_downs","elu","ydom","tddom",
        "targets","receptions","rec_yds","rec_tds","recv_grade","recv_snaps","yac_raw","adot","mtf_recv"
      ].some((k) => hasValue(s?.[k]))
    );
  const hasAthleticInput = () =>
    ["height","weight","forty","ten_split","vert","broad","three_cone","shuttle","arm","hand","wing","ras"].some((k) => hasValue(form?.[k]));
  const hasPffInput = () => hasValue(form?.pff_board_rank) || hasValue(form?.pff_grade);

  const getAddModalScores = () => {
    const base = buildProspectScore(
      form.seasons.map((s) => ({ ...s, conference: form.conference })),
      true,
      { forty: form.forty, vert: form.vert, weight: form.weight, pff_grade: form.pff_grade, ras: form.ras }
    );

    const seasonEntered = hasSeasonStatsInput(form.seasons);
    const athleticEntered = hasAthleticInput();
    const pffEntered = hasPffInput();

    const prod = seasonEntered ? base.prod_trajectory : 0;
    const athl = athleticEntered ? base.athl_score : 0;
    const pff = pffEntered ? base.pff_score : 0;

    const anyScoringInput = seasonEntered || athleticEntered || pffEntered;
    if (!anyScoringInput) {
      return {
        ...base,
        prospect_score: 0,
        prod_trajectory: 0,
        athl_score: 0,
        pff_score: 0,
        tier: scoreToTier(0),
      };
    }

    const raw = prod * 0.75 + athl * 0.10 + pff * 0.15;
    const final = Math.min(100, raw * 0.85 + 12);
    return {
      ...base,
      prospect_score: Math.round(final * 10) / 10,
      prod_trajectory: Math.round(prod * 10) / 10,
      athl_score: Math.round(athl * 10) / 10,
      pff_score: Math.round(pff * 10) / 10,
      tier: scoreToTier(final),
    };
  };

  const handleSave = () => {
    const scores = getAddModalScores();

    const seasons = form.seasons.map(s => {
      const isFcsOther = String(s.school || "").trim() === "Other (FCS/Lower)";
      const resolvedSchool = isFcsOther ? String(s.school_other || "").trim() : String(s.school || "").trim();
      return {
        n: s.n,
        sc: form.school,
        conf: form.school,
        yr: s.yr || form.draft_class,
        school: resolvedSchool,
        school_other: isFcsOther ? resolvedSchool : "",
        r: parseFloat(s.rush_yds)||null,
        v: parseFloat(s.rec_yds)||null,
        c: null,
        sos: isFcsOther ? 0 : null,
        sos_rank: isFcsOther ? 0 : (s.sos_rank ? parseInt(s.sos_rank) : null),
        sos_label: isFcsOther ? "FCS" : (s.sos_label || "Average"),
        sos_mag: isFcsOther ? 0 : (s.sos_mag ? parseFloat(s.sos_mag) : null)
      };
    });

    const athl = {};
    const total = Object.keys(existingPlayers).length;
    if (form.forty)     athl["40T"]     = {val: parseFloat(form.forty),     comp: null, rank: null, total};
    if (form.ten_split) athl["10split"] = {val: parseFloat(form.ten_split), comp: null, rank: null, total};
    if (form.vert)      athl["vert"]    = {val: parseFloat(form.vert),      comp: null, rank: null, total};
    if (form.broad)     athl["broad"]   = {val: parseFloat(form.broad),     comp: null, rank: null, total};
    if (form.three_cone)athl["3cone"]   = {val: parseFloat(form.three_cone),comp: null, rank: null, total};
    if (form.shuttle)   athl["shuttle"] = {val: parseFloat(form.shuttle),   comp: null, rank: null, total};
    if (form.height)    athl["height"]  = {val: parseFloat(form.height),    comp: null, rank: null, total};
    if (form.weight)    athl["weight"]  = {val: parseFloat(form.weight),    comp: null, rank: null, total};
    if (form.arm)       athl["arm"]     = {val: parseFloat(form.arm),       comp: null, rank: null, total};
    if (form.hand)      athl["hand"]    = {val: parseFloat(form.hand),      comp: null, rank: null, total};
    if (form.wing)      athl["wing"]    = {val: parseFloat(form.wing),      comp: null, rank: null, total};
    if (form.ras)       athl["ras"]     = {val: parseFloat(form.ras),       comp: null, rank: null, total};

    const nflData = (form.nfl_best||form.nfl_top12) ? {
      best_rank: parseInt(form.nfl_best)||null,
      avg_rank:  parseFloat(form.nfl_avg)||null,
      top12:     parseInt(form.nfl_top12)||0,
      top24:     parseInt(form.nfl_top24)||0,
      seasons:   parseInt(form.nfl_seasons)||0,
      season_ranks:[],
      draft_round: form.draft_round||null,
      draft_pick:  form.draft_pick||null,
    } : null;

    const allRanks = Object.values(existingPlayers).map(p=>p.rank).filter(Boolean);
    const newRank = Math.max(...allRanks) + 1;

    const newPlayer = {
      rank: newRank,
      prospect_score: scores.prospect_score,
      tier: scores.tier,
      prod_trajectory: scores.prod_trajectory,
      rush_trajectory: scores.prod_trajectory * 0.63,
      recv_trajectory: scores.prod_trajectory * 0.37,
      athl_score: scores.athl_score,
      athl_ras_applied: true,
      pff_score:  scores.pff_score,
      pff_rank: null,
      traj_peak: scores.prod_trajectory,
      traj_final: scores.prod_trajectory,
      traj_improvement: 50,
      traj_consistency: 70,
      declare_bonus: 0,
      transfer_bonus: 0,
      num_seasons: form.seasons.length,
      draft_class: String(form.draft_class),
      is_projection: form.is_projection,
      came_out_as: form.came_out_as || null,
      transfer_to: form.transfer_to?.trim() || null,
      tags: [autoArchetype(form).rush_arch],
      rush_arch: autoArchetype(form).rush_arch,
      recv_arch: autoArchetype(form).recv_arch,
      nfl: nflData,
      athletic: Object.keys(athl).length ? athl : null,
      comps: null,
      seasons,
      draft_round: form.draft_round || null,
      draft_pick:  form.draft_pick  || null,
      _custom: true,
    };

    onAdd(form.name.trim(), newPlayer, form.seasons);
    setSaved(true);
    setTimeout(onClose, 800);
  };

  const inp = (label, key, placeholder="", type="text", extraStyle={}, compact=false, autoFocus=false) => (
    <div style={{marginBottom:compact?8:14}}>
      <label style={{fontSize:compact?8:10,color:"#555",letterSpacing:1,display:"block",marginBottom:compact?3:5}}>{label.toUpperCase()}{errors[key]&&<span style={{color:"#e05050",marginLeft:8}}>{errors[key]}</span>}</label>
      <input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={placeholder}
        autoFocus={autoFocus}
        style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid "+(errors[key]?"#e05050":"rgba(255,255,255,0.10)"),borderRadius:7,color:"#e0e0e0",padding:compact?"6px 9px":"9px 13px",fontSize:compact?10:12,outline:"none",fontFamily:"monospace",...extraStyle}}/>
    </div>
  );

  const cinp = (label, key, placeholder="", type="text", extraStyle={}, autoFocus=false) =>
    inp(label, key, placeholder, type, extraStyle, true, autoFocus);

  const sel = (label, key, opts) => (
    <div style={{marginBottom:14}}>
      <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>{label.toUpperCase()}</label>
      <select value={form[key]} onChange={e=>set(key,e.target.value)}
        style={{width:"100%",background:"#0d1421",border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace"}}>
        {opts.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const sInp = (idx, label, key, placeholder="", type="text", autoFocus=false) => {
    const season = form.seasons[idx] || {};
    const pctMeta = getModalInputPercentileMeta(season, key, season.n || idx + 1);
    return (
      <div style={{marginBottom:8}}>
        <label style={{fontSize:8,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>{label.toUpperCase()}</label>
        <input type={type} value={form.seasons[idx][key]} onChange={e=>setSeason(idx,key,e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
          style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,color:"#ccc",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}/>
        {pctMeta && <MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
      </div>
    );
  };

  const autoBoxStyle = {
    width:"100%",
    boxSizing:"border-box",
    background:"rgba(77,166,255,0.06)",
    border:"1px solid rgba(77,166,255,0.18)",
    borderRadius:6,
    padding:"6px 9px",
    fontSize:10,
    color:"#4da6ff",
    fontFamily:"monospace"
  };

  const previewScore = useMemo(()=>{
    if (!form.seasons[0]) return null;
    try {
      return getAddModalScores();
    } catch(e) { return null; }
  }, [form]);

  if (saved) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:"#0d1421",borderRadius:14,padding:"40px 60px",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>✓</div>
        <div style={{fontSize:16,fontWeight:700,color:"#5dbf6a"}}>Player Added!</div>
        <div style={{fontSize:11,color:"#444",marginTop:6}}>{form.name}</div>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:9999,overflowY:"auto",padding:"30px 16px"}}>
      <div style={{background:"#0a0f1c",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,width:"100%",maxWidth:620,padding:"20px 16px"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div>
            <div style={{fontSize:9,color:"#444",letterSpacing:3,marginBottom:4}}>ADD PLAYER</div>
            <div style={{fontSize:18,fontWeight:900,color:"#f0c040"}}>New Prospect Entry</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,color:"#666",padding:"7px 13px",fontSize:12}}>✕</button>
        </div>

        {/* Step tabs */}
        <div style={{display:"flex",gap:0,marginBottom:24,borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.07)"}}>
          {STEPS.map((s,i)=>(
            <button key={s} onClick={()=>i<step?setStep(i):null}
              style={{flex:1,padding:"8px 4px",border:"none",borderRight:i<4?"1px solid rgba(255,255,255,0.07)":"none",
                background:i===step?"rgba(240,192,64,0.12)":i<step?"rgba(93,191,106,0.07)":"transparent",
                color:i===step?"#f0c040":i<step?"#5dbf6a":"#444",fontSize:8,letterSpacing:1,fontWeight:i===step?700:400,cursor:i<step?"pointer":"default"}}>
              {i<step?"✓ ":""}{s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Step 0: Identity */}
        {step===0&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
              {inp("Player Name","name","e.g. John Smith","text",{},false,true)}
              <div style={{marginBottom:14}}>
                <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>DRAFT CLASS{errors.draft_class&&<span style={{color:"#e05050",marginLeft:8}}>{errors.draft_class}</span>}</label>
                <select value={form.draft_class} onChange={e=>{set("draft_class",e.target.value);if(e.target.value===String(currentProjectionClass)){set("draft_round","");set("draft_pick","");set("is_projection",true);}else{set("is_projection",false);}}}
                  style={{width:"100%",background:"#0d1421",border:"1px solid "+(errors.draft_class?"#e05050":"rgba(255,255,255,0.12)"),borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace"}}>
                  {draftClassOptions.map(y=><option key={y} value={String(y)}>{y}{String(y)===String(currentProjectionClass)?" (Projection)":""}</option>)}
                </select>
              </div>
              {inp("School / Team","school","e.g. Georgia")}
              {sel("Conference","conference",CONF_LIST)}
              {form.draft_class!==String(currentProjectionClass)&&(
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>DRAFT ROUND</label>
                  <select value={form.draft_round} onChange={e=>set("draft_round",e.target.value)}
                    style={{width:"100%",background:"#0d1421",border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace"}}>
                    <option value="">Undrafted (UDFA)</option>
                    {[1,2,3,4,5,6,7].map(r=><option key={r} value={String(r)}>Round {r}</option>)}
                  </select>
                </div>
              )}
              {form.draft_class!==String(currentProjectionClass)&&form.draft_round&&form.draft_round!==""&&(
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>DRAFT PICK #</label>
                  <input type="number" value={form.draft_pick} onChange={e=>set("draft_pick",e.target.value)} placeholder="e.g. 22"
                    style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace"}}/>
                </div>
              )}
              {sel("Came Out As","came_out_as",["","Freshman","Sophomore","Junior","Senior","RS Freshman","RS Sophomore","RS Junior","RS Senior"])}
            </div>
            {form.draft_class===String(currentProjectionClass)&&(
              <div style={{marginBottom:14,padding:"10px 14px",background:"rgba(0,131,143,0.08)",border:"1px solid rgba(0,131,143,0.2)",borderRadius:8,fontSize:10,color:"#00838f"}}>
                {currentProjectionClass} class automatically marked as projection — draft info not applicable yet.
              </div>
            )}
            <div style={{marginBottom:8,padding:"10px 14px",background:"rgba(77,166,255,0.05)",border:"1px solid rgba(77,166,255,0.1)",borderRadius:8,fontSize:10,color:"#4da6ff88"}}>
              Rush and receiving archetypes will be automatically assigned from your season stats.
            </div>
          </div>
        )}

        {/* Step 1: Seasons */}
        {step===1&&(
          <div>
            <div style={{fontSize:10,color:"#555",marginBottom:16}}>Enter stats for each college season. At least Season 1 is required. Stats are used to calculate the prospect score.</div>
            {form.seasons.map((s,idx)=>(
              <div key={idx} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:s.redshirt?0:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#f0c040"}}>Season {s.n}</div>
                    {/* Portal badge — school differs from previous season */}
                    {idx>0&&s.school&&form.seasons[idx-1]?.school&&s.school!==form.seasons[idx-1].school&&(
                      <span style={{fontSize:9,padding:"2px 7px",background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.4)",borderRadius:10,color:"#4da6ff",fontWeight:700,letterSpacing:0.5}}>🔄 PORTAL</span>
                    )}
                    {s.redshirt&&<span style={{fontSize:18}}>🎽</span>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button onClick={()=>setSeason(idx,"redshirt",!s.redshirt)}
                      style={{background:s.redshirt?"rgba(240,192,64,0.15)":"rgba(255,255,255,0.04)",border:"1px solid "+(s.redshirt?"rgba(240,192,64,0.4)":"rgba(255,255,255,0.1)"),borderRadius:6,color:s.redshirt?"#f0c040":"#555",padding:"3px 10px",fontSize:9,cursor:"pointer"}}>
                      {s.redshirt?"✓ REDSHIRT":"REDSHIRT"}
                    </button>
                    {idx>0&&<button onClick={()=>removeSeason(idx)} style={{background:"rgba(224,80,80,0.1)",border:"1px solid rgba(224,80,80,0.25)",borderRadius:6,color:"#e05050",padding:"3px 10px",fontSize:9}}>REMOVE</button>}
                  </div>
                </div>
                {s.redshirt&&<div style={{textAlign:"center",padding:"10px 0",fontSize:10,color:"#555"}}>🎽 Redshirt season — no stats recorded</div>}
                {!s.redshirt&&(<div>{/* ── Year + School → auto SoS ── */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px",marginBottom:4}}>
                  {sInp(idx,"Season Year","yr","e.g. 2024","number",idx===0)}
                  {/* College typeahead */}
                  {(()=>{
                    const allTeams=[...new Set(Object.values(SOS_LOOKUP).flat().map(t=>t.team))].sort();
                    allTeams.push("Other (FCS/Lower)");
                    const schoolVal=s.school||'';
                    const schoolLow=schoolVal.toLowerCase();
                    const ddOpen=ddOpenMap[idx]||false;
                    const activeIdx=ddActiveIdxMap[idx]??-1;
                    const setDdOpen=(v)=>setDdOpenMap(m=>({...m,[idx]:v}));
                    const setActiveIdx=(v)=>setDdActiveIdxMap(m=>({...m,[idx]:v}));
                    const suggestions=schoolVal.length>=1&&ddOpen
                      ? allTeams.filter(t=>t.toLowerCase().includes(schoolLow)).slice(0,8)
                      : [];
                    const pickSchool=(t)=>{
                      if(t==="Other (FCS/Lower)"){
                        setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{
                          ...ss,
                          school:t,
                          sos_label:"FCS",
                          sos_rank:"0",
                          sos_mag:"0"
                        }:ss)}));
                        setDdOpen(false);
                        setActiveIdx(-1);
                        return;
                      }
                      const yr3=String(s?.yr||'');
                      const pool2=[...(SOS_LOOKUP[yr3]||[]),...Object.values(sosByYear[yr3]||sosByYear[String(Number(yr3)-1)]||{})];
                      const m=pool2.find(d=>d.team.toLowerCase()===t.toLowerCase())
                        ||pool2.find(d=>d.team.toLowerCase().startsWith(t.toLowerCase()))
                        ||pool2.find(d=>t.toLowerCase().startsWith(d.team.toLowerCase()));
                      setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{
                        ...ss,school:t,
                        sos_label:m?m.label:ss.sos_label,
                        sos_rank:m?String(m.rank||''):ss.sos_rank,
                        sos_mag:m?String(m.mag||''):ss.sos_mag
                      }:ss)}));
                      setDdOpen(false);
                      setActiveIdx(-1);
                    };
                    return (
                      <div style={{marginBottom:10,position:'relative'}}>
                        <label style={{fontSize:9,color:'#444',letterSpacing:1,display:'block',marginBottom:4}}>COLLEGE</label>
                        <input
                          type="text"
                          value={schoolVal}
                          onChange={e=>{setSeason(idx,'school',e.target.value);setDdOpen(true);setActiveIdx(-1);}}
                          onFocus={()=>{setDdOpen(true);setActiveIdx(-1);}}
                          onBlur={()=>setTimeout(()=>{setDdOpen(false);setActiveIdx(-1);},150)}
                          onKeyDown={e=>{
                            if(!suggestions.length) return;
                            if(e.key==='ArrowDown'){e.preventDefault();setDdOpen(true);setActiveIdx(Math.min(activeIdx+1,suggestions.length-1));}
                            else if(e.key==='ArrowUp'){e.preventDefault();setActiveIdx(Math.max(activeIdx-1,0));}
                            else if(e.key==='Enter'){if(activeIdx>=0&&activeIdx<suggestions.length){e.preventDefault();pickSchool(suggestions[activeIdx]);}}
                            else if(e.key==='Escape'){setDdOpen(false);setActiveIdx(-1);}
                          }}
                          placeholder="Start typing (e.g. Tex)"
                          autoComplete="off"
                          style={{width:'100%',boxSizing:'border-box',background:'#0d1421',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'#ccc',padding:'7px 11px',fontSize:11,fontFamily:'monospace',outline:'none'}}
                        />
                        {suggestions.length>0&&(
                          <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#131a24',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'0 0 7px 7px',zIndex:50,maxHeight:200,overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                            {suggestions.map((t,sIdx)=>(
                              <div key={t}
                                onMouseDown={e=>{
                                  e.preventDefault();
                                  pickSchool(t);
                                }}
                                style={{padding:'7px 12px',fontSize:11,color:t==='Other (FCS/Lower)'?'#f0873a':'#ccc',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',fontFamily:'monospace',background:sIdx===activeIdx?'rgba(240,192,64,0.08)':'transparent'}}
                                onMouseEnter={()=>setActiveIdx(sIdx)}>
                                {(()=>{
                                  const q=schoolVal.toLowerCase();
                                  const tl=t.toLowerCase();
                                  const i=tl.indexOf(q);
                                  if(i<0) return t;
                                  return <>{t.slice(0,i)}<span style={{color:'#f0c040',fontWeight:700}}>{t.slice(i,i+schoolVal.length)}</span>{t.slice(i+schoolVal.length)}</>;
                                })()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {s.school === "Other (FCS/Lower)" && (
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:8,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>MANUAL SCHOOL NAME</label>
                    <input
                      type="text"
                      value={s.school_other || ""}
                      onChange={e=>setSeason(idx,"school_other",e.target.value)}
                      placeholder="Type full school name"
                      autoComplete="off"
                      style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:7,color:"#e0e0e0",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}
                    />
                  </div>
                )}
                {/* SoS auto-lookup — checks SOS_LOOKUP first, then uploaded sosByYear */}
                {(()=>{
                  const yr2=String(s?.yr||'');
                  const sc2=(s?.school||'').toLowerCase().trim();
                  if(!yr2||!sc2) return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7,fontSize:9,color:"#444"}}>
                      Enter Season Year and College above to auto-populate Strength of Schedule.
                    </div>
                  );
                  if(sc2==="other (fcs/lower)"){
                    const applied=s.sos_label==="FCS"&&String(s.sos_rank)==="0"&&String(s.sos_mag)==="0";
                    const applyFcs=()=>setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{...ss,sos_label:"FCS",sos_rank:"0",sos_mag:"0"}:ss)}));
                    const typedSchool=String(s.school_other||"").trim()||"FCS/Lower";
                    const schoolWithYear=typedSchool+(yr2?" '"+String(yr2).slice(-2):"");
                    const badgeColor="#f0873a";
                    return (
                      <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7,fontSize:10,display:"flex",alignItems:"center",gap:10,justifyContent:"space-between"}}>
                        <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",padding:"7px 14px",borderRadius:8,background:badgeColor+"18",border:"1px solid "+badgeColor+"44",minWidth:90,gap:2}}>
                          <span style={{fontSize:10,color:badgeColor,fontWeight:800,letterSpacing:1.2}}>FCS</span>
                          <span style={{fontSize:9,color:"#666",fontWeight:500}}>{schoolWithYear}</span>
                          <span style={{fontSize:10,color:badgeColor,fontWeight:700}}>#0 SOS</span>
                          <span style={{fontSize:9,color:badgeColor,opacity:0.8,fontWeight:600,letterSpacing:0.5}}>mag 0.000</span>
                        </div>
                        {applied
                          ? <span style={{fontSize:9,color:"#5dbf6a88"}}>✓ applied</span>
                          : <button onClick={applyFcs} style={{background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.4)",borderRadius:5,color:"#4da6ff",fontSize:9,padding:"3px 12px",cursor:"pointer",fontFamily:"monospace",whiteSpace:"nowrap"}}>APPLY SoS</button>
                        }
                      </div>
                    );
                  }
                  // Search built-in data first, then uploaded
                  const builtIn=(SOS_LOOKUP[yr2]||[]);
                  const uploaded=Object.values(sosByYear[yr2]||sosByYear[String(Number(yr2)-1)]||{});
                  const pool=[...builtIn,...uploaded];
                  // Exact match first, then starts-with, then contains — prevents "Texas" beating "North Texas"
                  const match2=pool.find(d=>d.team.toLowerCase()===sc2)
                    ||pool.find(d=>d.team.toLowerCase().startsWith(sc2)&&sc2.length>3)
                    ||pool.find(d=>sc2.startsWith(d.team.toLowerCase())&&d.team.length>3)
                    ||pool.find(d=>d.team.toLowerCase().includes(sc2)&&sc2.length>4);
                  if(!match2) return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(240,135,58,0.05)",border:"1px solid rgba(240,135,58,0.2)",borderRadius:7,fontSize:9,color:"#f0873a"}}>
                      No SoS data found for "{s.school}" in {yr2}. Upload a new SoS season or check the school name spelling.
                    </div>
                  );
                  const applied=s.sos_label===match2.label&&String(s.sos_rank)===String(match2.rank||'');
                  const applyMatch=()=>setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{...ss,sos_label:match2.label,sos_rank:String(match2.rank||''),sos_mag:String(match2.mag||'')}:ss)}));
                  return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:applied?"rgba(93,191,106,0.06)":"rgba(77,166,255,0.06)",border:"1px solid "+(applied?"rgba(93,191,106,0.22)":"rgba(77,166,255,0.2)"),borderRadius:7,fontSize:10,display:"flex",alignItems:"center",gap:10,justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14}}>📊</span>
                        <div style={{color:applied?"#5dbf6a":"#4da6ff"}}>
                          <strong>{match2.team}</strong> · {yr2}
                          <span style={{marginLeft:8,padding:"2px 8px",background:applied?"rgba(93,191,106,0.12)":"rgba(77,166,255,0.12)",borderRadius:4,fontSize:9,fontWeight:700}}>{match2.label}</span>
                          <span style={{color:applied?"#5dbf6a88":"#4da6ff88",marginLeft:8,fontSize:9}}>Rank #{match2.rank} · Mag {match2.mag?.toFixed(3)}</span>
                        </div>
                      </div>
                      {applied
                        ? <span style={{fontSize:9,color:"#5dbf6a88"}}>✓ applied</span>
                        : <button onClick={applyMatch} style={{background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.4)",borderRadius:5,color:"#4da6ff",fontSize:9,padding:"3px 12px",cursor:"pointer",fontFamily:"monospace",whiteSpace:"nowrap"}}>APPLY SoS</button>
                      }
                    </div>
                  );
                })()}
                {(()=>{
                  const breakdown = calcSeasonProdBreakdown(
                    normalizeSeasonForScoring({...s, conference: s.conference || s.conf || form.conference}),
                    form.conference
                  );
                  if (!breakdown.hasAny) return null;
                  const rushPlacement = getSeasonScorePlacement(s.n || idx + 1, "rush", breakdown.rushScore);
                  const recvPlacement = getSeasonScorePlacement(s.n || idx + 1, "recv", breakdown.recvScore);
                  const adjPlacement = getSeasonScorePlacement(s.n || idx + 1, "adj", breakdown.adjProd);
                  return (
                    <div style={{marginBottom:10,padding:"8px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7}}>
                      <div style={{fontSize:8,color:"#555",letterSpacing:1,marginBottom:6}}>LIVE SEASON SCORES</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(90px,1fr))",gap:8}}>
                        <div style={{fontSize:9,color:"#f0873a"}}>
                          Rush <strong style={{fontSize:11}}>{breakdown.rushScore.toFixed(1)}</strong>
                          {rushPlacement&&<span style={{marginLeft:6,fontSize:8,color:rushPlacement.color,fontWeight:700}}>{"#"+rushPlacement.rank+"/"+rushPlacement.total}</span>}
                        </div>
                        <div style={{fontSize:9,color:"#5dbf6a"}}>
                          Recv <strong style={{fontSize:11}}>{breakdown.recvScore.toFixed(1)}</strong>
                          {recvPlacement&&<span style={{marginLeft:6,fontSize:8,color:recvPlacement.color,fontWeight:700}}>{"#"+recvPlacement.rank+"/"+recvPlacement.total}</span>}
                        </div>
                        <div style={{fontSize:9,color:"#4da6ff"}}>
                          Adj (SoS) <strong style={{fontSize:11}}>{breakdown.adjProd.toFixed(1)}</strong>
                          {adjPlacement&&<span style={{marginLeft:6,fontSize:8,color:adjPlacement.color,fontWeight:700}}>{"#"+adjPlacement.rank+"/"+adjPlacement.total}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* ── Rushing ── */}
                <div style={{fontSize:10,color:"#f0873a",letterSpacing:1,margin:"8px 0 10px"}}>— RUSHING —</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"0 10px"}}>
                  {sInp(idx,"Attempts","attempts","","number")}
                  {sInp(idx,"Rush Yards","rush_yds","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const yds=parseFloat(s.rush_yds);
                    const val=(!isNaN(att)&&att>0&&!isNaN(yds))?yds/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "Y/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>Y/Attempt <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.rush_yds} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {sInp(idx,"Rush TDs","rush_tds","","number")}
                  {sInp(idx,"Fumbles","fumbles","","number")}
                  {sInp(idx,"PFF Run Grade","run_grade","0–100","number")}
                  {sInp(idx,"YCO (Yds After Contact)","yco_a","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const yco=parseFloat(s.yco_a);
                    const val=(!isNaN(att)&&att>0&&!isNaN(yco))?yco/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "YCO/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>YCO/Attempt <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.yco_a} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {/* MTF raw + MTF/A auto */}
                  {sInp(idx,"MTF (Missed Tackles)","mtf","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const mtf=parseFloat(s.mtf);
                    const val=(!isNaN(att)&&att>0&&!isNaN(mtf))?mtf/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "MTF/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>MTF/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.mtf} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {/* 10+ raw + 10+/A auto */}
                  {sInp(idx,"10+ Yd Runs","ten_plus","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const tp=parseFloat(s.ten_plus);
                    const val=(!isNaN(att)&&att>0&&!isNaN(tp))?tp/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "10+/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>10+/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.ten_plus} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {/* 15+ raw + 15+/A auto */}
                  {sInp(idx,"15+ Yd Runs","fif_plus","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const fp=parseFloat(s.fif_plus);
                    const val=(!isNaN(att)&&att>0&&!isNaN(fp))?fp/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "15+/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>15+/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.fif_plus} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {sInp(idx,"BAY (Breakaway Yds)","bay","","number")}
                  {(()=>{
                    const bay=parseFloat(s.bay); const ryds=parseFloat(s.rush_yds);
                    const val=(!isNaN(bay)&&!isNaN(ryds)&&ryds>0)?bay/ryds*100:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "BAY%", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>BAY% <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2)+"%":<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.bay} ÷ {s.rush_yds} × 100 = {val.toFixed(2)}%</div>}
                      </div>
                    );
                  })()}
                  {/* 1Ds raw + 1D/A auto */}
                  {sInp(idx,"1Ds (First Downs)","first_downs","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const fd=parseFloat(s.first_downs);
                    const val=(!isNaN(att)&&att>0&&!isNaN(fd))?fd/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "1D/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>1D/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.first_downs} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {sInp(idx,"ELU (PFF Elusiveness)","elu","","number")}
                  {sInp(idx,"Yds Dominator %","ydom","","number")}
                  {sInp(idx,"TD Dominator %","tddom","","number")}
                </div>
                {/* ── Receiving ── */}
                <div style={{fontSize:10,color:"#5dbf6a",letterSpacing:1,margin:"8px 0 10px"}}>— RECEIVING —</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"0 10px"}}>
                  {sInp(idx,"Targets","targets","","number")}
                  {sInp(idx,"Receptions","receptions","","number")}
                  {(()=>{
                    const tgt=parseFloat(s.targets),rec=parseFloat(s.receptions);
                    const val=(!isNaN(tgt)&&tgt>0&&!isNaN(rec))?rec/tgt*100:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "REC%", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>REC% <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2)+"%":<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.receptions} ÷ {s.targets} × 100 = {val.toFixed(2)}%</div>}
                    </div>);
                  })()}
                  {sInp(idx,"Rec Yards","rec_yds","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),ryds=parseFloat(s.rec_yds);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(ryds))?ryds/rec:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "Y/REC", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>Y/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.rec_yds} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {sInp(idx,"Rec TDs","rec_tds","","number")}
                  {sInp(idx,"PFF Recv Grade","recv_grade","0–100","number")}
                  {sInp(idx,"RECV (Receiving Snaps)","recv_snaps","","number")}
                  {sInp(idx,"YAC (Yards After Catch)","yac_raw","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),yac=parseFloat(s.yac_raw);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(yac))?yac/rec:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "YAC/REC", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>YAC/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.yac_raw} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {(()=>{
                    const recv=parseFloat(s.recv_snaps),ryds=parseFloat(s.rec_yds);
                    const val=(!isNaN(recv)&&recv>0&&!isNaN(ryds))?ryds/recv:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "Y/RR", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>Y/RR <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.rec_yds} ÷ {s.recv_snaps} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {sInp(idx,"ADOT (Avg Depth of Target)","adot","","number")}
                  {sInp(idx,"MTF (Missed Tackles)","mtf_recv","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),mtf=parseFloat(s.mtf_recv);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(mtf))?mtf/rec:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "MTF/REC", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>MTF/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.mtf_recv} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                </div></div>)
}</div>
            ))}
            {form.seasons.length < 5 && (
              <button onClick={addSeason} style={{width:"100%",background:"rgba(77,166,255,0.07)",border:"1px dashed rgba(77,166,255,0.25)",borderRadius:8,color:"#4da6ff",padding:"10px",fontSize:10,letterSpacing:2}}>
                + ADD SEASON {form.seasons.length+1}
              </button>
            )}
          </div>
        )}

        {/* Step 2: Athletic */}
        {step===2&&(
          <div>
            <div style={{fontSize:10,color:"#555",marginBottom:16}}>All athletic fields are optional. Leave blank if not available.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 16px"}}>
              {cinp("Height (inches)","height","e.g. 71.0","number",{},true)}
              {cinp("Weight (lbs)","weight","e.g. 215","number")}
              {cinp("40-Yd Dash","forty","e.g. 4.40","number")}
              {cinp("10-Yd Split","ten_split","e.g. 1.54","number")}
              {cinp("Vertical (in)","vert","e.g. 38.5","number")}
              {cinp("Broad Jump (in)","broad","e.g. 125","number")}
              {cinp("3-Cone (sec)","three_cone","e.g. 7.05","number")}
              {cinp("Shuttle (sec)","shuttle","e.g. 4.25","number")}
              {cinp("Arm Length (in)","arm","e.g. 31.5","number")}
              {cinp("Hand Size (in)","hand","e.g. 9.5","number")}
              {cinp("Wingspan (in)","wing","e.g. 74.0","number")}
              {cinp("RAS (Relative Athletic Score)","ras","e.g. 8.74","number")}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px",alignItems:"end"}}>
              <div style={{marginBottom:8}}>
                <label style={{fontSize:8,color:"#555",letterSpacing:1,display:"block",marginBottom:3}}>PFF BIG BOARD CLASS RANK (1-50)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={form.pff_board_rank || ""}
                  onChange={e=>{
                    const nextRank = e.target.value;
                    const nextScore = pffScoreFromBoardRank(nextRank);
                    setForm(f => ({
                      ...f,
                      pff_board_rank: nextRank,
                      pff_grade: nextScore
                    }));
                  }}
                  placeholder="e.g. 12"
                  style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:7,color:"#e0e0e0",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}
                />
              </div>
              <div style={{marginBottom:8}}>
                <label style={{fontSize:8,color:"#555",letterSpacing:1,display:"block",marginBottom:3}}>PFF BIG BOARD SCORE (AUTO)</label>
                <input
                  type="text"
                  value={pffScoreFromBoardRank(form.pff_board_rank) || ""}
                  readOnly
                  placeholder="Auto from rank"
                  style={{width:"100%",boxSizing:"border-box",background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:7,color:"#4da6ff",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Recruiting */}
        {step===3&&(
          <div>
            <div style={{fontSize:10,color:"#555",marginBottom:16}}>Enter the player&#39;s recruiting profile. All fields are optional.</div>
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"16px",marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#f0c040",marginBottom:14}}>RECRUIT RANKING</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0 14px"}}>
                {/* Star rating */}
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:9,color:"#444",letterSpacing:1,display:"block",marginBottom:4}}>STAR RATING (0–5)</label>
                  <div style={{display:"flex",gap:6}}>
                    {[0,1,2,3,4,5].map(n=>(
                      <button key={n} onMouseDown={e=>{e.preventDefault();set("recruit_stars",String(n));}}
                        style={{flex:1,padding:"6px 0",borderRadius:6,border:"1px solid "+(String(form.recruit_stars)===String(n)?"rgba(240,192,64,0.6)":"rgba(255,255,255,0.1)"),background:String(form.recruit_stars)===String(n)?"rgba(240,192,64,0.15)":"rgba(255,255,255,0.03)",color:String(form.recruit_stars)===String(n)?"#f0c040":"#555",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>
                        {n===0?"☆":n+"★"}
                      </button>
                    ))}
                  </div>
                </div>
                {cinp("Recruit Rating (1–100)","recruit_rating","e.g. 92","number",{},true)}
                {cinp("National Rank","recruit_nat","e.g. 15","number")}
                {cinp("Position Rank (RB)","recruit_pos","e.g. 3","number")}
                {cinp("State Rank","recruit_state","e.g. 2","number")}
                {cinp("Enrollment Year","recruit_year","e.g. 2021","number")}
              </div>
              {/* Committed school — typeahead */}
              <div style={{marginBottom:10,position:"relative"}}>
                <label style={{fontSize:8,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>COMMITTED TO</label>
                {(()=>{
                  const allTeams=[...new Set(Object.values(SOS_LOOKUP).flat().map(t=>t.team))].sort();
                  allTeams.push("Other (FCS/Lower)");
                  const rv=form.recruit_school||"";
                  const rvLow=rv.toLowerCase();
                  const rcSugg=rv.length>=1&&rcOpen?allTeams.filter(t=>t.toLowerCase().includes(rvLow)).slice(0,8):[];
                  return(<>
                    <input type="text" value={rv}
                        onChange={e=>{set("recruit_school",e.target.value);setRcOpen(true);setRcActiveIdx(-1);}}
                        onFocus={()=>{setRcOpen(true);setRcActiveIdx(-1);}}
                      onBlur={()=>setTimeout(()=>{setRcOpen(false);setRcActiveIdx(-1);},150)}
                        onKeyDown={e=>{
                          if(!rcSugg.length) return;
                          if(e.key==='ArrowDown'){e.preventDefault();setRcOpen(true);setRcActiveIdx(i=>Math.min(i+1,rcSugg.length-1));}
                          else if(e.key==='ArrowUp'){e.preventDefault();setRcActiveIdx(i=>Math.max(i-1,0));}
                          else if(e.key==='Enter'){if(rcActiveIdx>=0&&rcActiveIdx<rcSugg.length){e.preventDefault();set("recruit_school",rcSugg[rcActiveIdx]);setRcOpen(false);setRcActiveIdx(-1);}}
                          else if(e.key==='Escape'){setRcOpen(false);setRcActiveIdx(-1);}
                        }}
                      placeholder="Start typing school name..."
                      autoComplete="off"
                      style={{width:"100%",boxSizing:"border-box",background:"#0d1421",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,color:"#ccc",padding:"6px 9px",fontSize:10,fontFamily:"monospace",outline:"none"}}/>
                    {rcSugg.length>0&&(
                      <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#131a24",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"0 0 7px 7px",zIndex:50,maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                          {rcSugg.map((t,sIdx)=>(
                          <div key={t} onMouseDown={e=>{e.preventDefault();set("recruit_school",t);setRcOpen(false);}}
                              style={{padding:"7px 12px",fontSize:11,color:t==="Other (FCS/Lower)"?"#f0873a":"#ccc",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.04)",fontFamily:"monospace",background:sIdx===rcActiveIdx?"rgba(240,192,64,0.08)":"transparent"}}
                              onMouseEnter={()=>setRcActiveIdx(sIdx)}>
                            {(()=>{const i=t.toLowerCase().indexOf(rvLow);if(i<0||!rvLow)return t;return<>{t.slice(0,i)}<span style={{color:"#f0c040",fontWeight:700}}>{t.slice(i,i+rv.length)}</span>{t.slice(i+rv.length)}</>;})()}
                          </div>
                        ))}
                      </div>
                    )}
                  </>);
                })()}
              </div>
              {form.recruit_school === "Other (FCS/Lower)" && (
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:8,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>MANUAL SCHOOL NAME{errors.recruit_school_other&&<span style={{color:"#e05050",marginLeft:8}}>{errors.recruit_school_other}</span>}</label>
                  <input
                    type="text"
                    value={form.recruit_school_other}
                    onChange={e=>set("recruit_school_other",e.target.value)}
                    placeholder="Type full school name"
                    autoComplete="off"
                    style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid "+(errors.recruit_school_other?"#e05050":"rgba(255,255,255,0.10)"),borderRadius:7,color:"#e0e0e0",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}
                  />
                </div>
              )}
              {/* Transfer info */}
              <div style={{marginTop:8,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:9,color:"#555",letterSpacing:2,marginBottom:10}}>TRANSFER (if applicable)</div>
                {derivedTransfers.count>0&&(
                  <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(77,166,255,0.07)",border:"1px solid rgba(77,166,255,0.22)",borderRadius:7,fontSize:9,color:"#4da6ff"}}>
                    Auto-filled from Seasons portal markers.
                  </div>
                )}
                {derivedTransfers.count>0 ? (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {derivedTransfers.moves.map((mv, i) => (
                      <div key={`${mv.year}-${mv.school}-${i}`} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px",padding:"8px 10px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8}}>
                        <div>
                          <label style={{fontSize:8,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>TRANSFER YEAR {derivedTransfers.count>1?`#${i+1}`:""}</label>
                          <input type="text" value={mv.year || "—"} readOnly style={{width:"100%",boxSizing:"border-box",background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,color:"#4da6ff",padding:"6px 9px",fontSize:10,fontFamily:"monospace",outline:"none"}} />
                        </div>
                        <div>
                          <label style={{fontSize:8,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>TRANSFERRED TO {derivedTransfers.count>1?`#${i+1}`:""}</label>
                          <input type="text" value={mv.school} readOnly style={{width:"100%",boxSizing:"border-box",background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,color:"#4da6ff",padding:"6px 9px",fontSize:10,fontFamily:"monospace",outline:"none"}} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
                    <div style={{marginBottom:10,position:"relative"}}>
                      <label style={{fontSize:8,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>TRANSFERRED TO</label>
                      {(()=>{
                        const allTeams2=[...new Set(Object.values(SOS_LOOKUP).flat().map(t=>t.team))].sort();
                        allTeams2.push("Other (FCS/Lower)");
                        const tv=form.transfer_to||"";
                        const tvLow=tv.toLowerCase();
                        const trSugg=tv.length>=1&&trOpen?allTeams2.filter(t=>t.toLowerCase().includes(tvLow)).slice(0,8):[];
                        return(<>
                          <input type="text" value={tv}
                            onChange={e=>{set("transfer_to",e.target.value);setTrOpen(true);}}
                            onFocus={()=>setTrOpen(true)}
                            onBlur={()=>setTimeout(()=>{setTrOpen(false);},150)}
                            placeholder="Start typing..."
                            autoComplete="off"
                            style={{width:"100%",boxSizing:"border-box",background:"#0d1421",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,color:"#ccc",padding:"6px 9px",fontSize:10,fontFamily:"monospace",outline:"none"}}/>
                          {trSugg.length>0&&(
                            <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#131a24",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"0 0 7px 7px",zIndex:50,maxHeight:160,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                              {trSugg.map(t=>(
                                <div key={t} onMouseDown={e=>{e.preventDefault();set("transfer_to",t);setTrOpen(false);}}
                                  style={{padding:"7px 12px",fontSize:11,color:t==="Other (FCS/Lower)"?"#f0873a":"#ccc",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.04)",fontFamily:"monospace"}}
                                  onMouseEnter={e=>e.currentTarget.style.background="rgba(240,192,64,0.08)"}
                                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  {t}
                                </div>
                              ))}
                            </div>
                          )}
                        </>);
                      })()}
                    </div>
                    {cinp("Transfer Year","transfer_year","e.g. 2023")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step===4&&form&&previewScore&&(
          <div>
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"20px",marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:22,fontWeight:900,color:"#fff",marginBottom:4}}>{form.name||"—"}</div>
                  <div style={{fontSize:11,color:"#555"}}>{form.school} · {form.conference} · {form.draft_class} class</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:48,fontWeight:900,color:"#f0c040",lineHeight:1}}>{previewScore.prospect_score}</div>
                  <div style={{fontSize:9,color:"#444",letterSpacing:2}}>NEW PROSPECT SCORE</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:16}}>
                {[["PRODUCTION",previewScore.prod_trajectory,"#f0873a"],["ATHLETIC",previewScore.athl_score,"#4da6ff"],["PFF GRADE",previewScore.pff_score,"#5dbf6a"],["PROSPECT",previewScore.prospect_score,"#f0c040"]].map(([lbl,val,c])=>(
                  <div key={lbl} style={{background:"rgba(255,255,255,0.04)",borderRadius:7,padding:"10px 12px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:"#444",letterSpacing:1,marginBottom:6}}>{lbl}</div>
                    <div style={{fontSize:18,fontWeight:800,color:c}}>{val!=null?val.toFixed(1):"—"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{fontSize:10,color:"#555",marginBottom:16,padding:"10px 14px",background:"rgba(240,192,64,0.05)",border:"1px solid rgba(240,192,64,0.12)",borderRadius:8}}>
              <strong style={{color:"#f0c04088"}}>Note:</strong> All scores automatically recalculated from your season and athletic edits. Click SAVE EDITS to apply changes to the database.
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:20,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <button onClick={step===0?onClose:back}
            style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:8,color:"#666",padding:"9px 20px",fontSize:10,letterSpacing:1}}>
            {step===0?"CANCEL":"← BACK"}
          </button>
          {step<4
            ? <button onClick={next} style={{background:"rgba(240,192,64,0.12)",border:"1px solid rgba(240,192,64,0.35)",borderRadius:8,color:"#f0c040",padding:"9px 20px",fontSize:10,letterSpacing:1,fontWeight:700}}>
                NEXT →
              </button>
            : <button onClick={handleSave} style={{background:"rgba(93,191,106,0.15)",border:"1px solid rgba(93,191,106,0.4)",borderRadius:8,color:"#5dbf6a",padding:"9px 24px",fontSize:11,letterSpacing:1,fontWeight:700}}>
                ✓ ADD PLAYER
              </button>
          }
        </div>
      </div>
    </div>
  );
}


function IdealBuildPage({onOpenPlayer, allData}) {
  const DEFAULT_IDEALS = {
    height:     {val:70.99,  unit:"in",  label:"Height",       note:"5′ 11″ — balance of vision and power"},
    weight:     {val:217.34, unit:"lbs", label:"Weight",       note:"Power without sacrificing speed"},
    arm:        {val:31.21,  unit:"in",  label:"Arm Length",   note:"Reach for tackles, ball security"},
    hand:       {val:9.47,   unit:"in",  label:"Hand Size",    note:"Ball control, fumble resistance"},
    wing:       {val:74.889, unit:"in",  label:"Wingspan",     note:"Extended reach on cuts and catches"},
    forty:      {val:4.51,   unit:"sec", label:"40-Yard Dash", note:"Elite speed without sacrificing power"},
    ten_split:  {val:1.56,   unit:"sec", label:"10-Yd Split",  note:"Explosive first step out of gaps"},
    vert:       {val:35.41,  unit:"in",  label:"Vertical",     note:"Lower-body explosion and burst"},
    broad:      {val:122.36, unit:"in",  label:"Broad Jump",   note:"Horizontal power and stride length"},
    three_cone: {val:7.12,   unit:"sec", label:"3-Cone Drill", note:"Change-of-direction and agility"},
    shuttle:    {val:4.33,   unit:"sec", label:"Shuttle",      note:"Lateral quickness and hip flexibility"},
  };
  // Snapshot of current weighted dynamic outputs; used as an anchor so canonical values
  // are shown now, while future data changes still move the displayed targets.
  const DYNAMIC_BASELINE_ANCHOR = {
    height: 70.641,
    weight: 215.404,
    arm: 31.108,
    hand: 9.462,
    wing: 74.798,
    forty: 4.504,
    ten_split: 1.561,
    vert: 35.282,
    broad: 121.919,
    three_cone: 7.106,
    shuttle: 4.315,
  };
  const STDEVS = {height:1.71,weight:15.11,arm:0.99,hand:0.39,wing:2.206,forty:0.052,ten_split:0.038,vert:3.2,broad:7.0,three_cone:0.22,shuttle:0.16};

  const dynamicIdealModel = useMemo(() => {
    const entries = Object.entries(allData || {});
    const metrics = Object.keys(DEFAULT_IDEALS);
    const sums = Object.fromEntries(metrics.map((m) => [m, 0]));
    const wSums = Object.fromEntries(metrics.map((m) => [m, 0]));
    let contributorPlayers = 0;
    let contributorSeasons = 0;

    entries.forEach(([, p]) => {
      const nfl = p?.nfl || {};
      const top12 = Number(nfl.top12) || 0;
      const top24 = Number(nfl.top24) || 0;
      if (top24 <= 0) return;

      const weight = top24 + top12;
      const ath = p?.athletic || {};
      let used = false;

      metrics.forEach((m) => {
        const v = Number(ath?.[m]?.val);
        if (!Number.isFinite(v)) return;
        sums[m] += v * weight;
        wSums[m] += weight;
        used = true;
      });

      if (used) {
        contributorPlayers += 1;
        contributorSeasons += weight;
      }
    });

    const ideals = {};
    metrics.forEach((m) => {
      ideals[m] = {
        ...DEFAULT_IDEALS[m],
        val: wSums[m] > 0 ? Math.round((sums[m] / wSums[m]) * 1000) / 1000 : DEFAULT_IDEALS[m].val,
      };
    });

    return {
      ideals,
      metricWeights: wSums,
      contributorPlayers,
      contributorSeasons,
    };
  }, [allData]);

  const IDEALS = useMemo(() => {
    const metrics = Object.keys(DEFAULT_IDEALS);
    const anchored = {};

    metrics.forEach((m) => {
      const base = DEFAULT_IDEALS[m].val;
      const anchor = Number(DYNAMIC_BASELINE_ANCHOR[m]);
      const live = Number(dynamicIdealModel.ideals?.[m]?.val);
      const hasLiveData = Number(dynamicIdealModel.metricWeights?.[m]) > 0;

      let val = base;
      if (hasLiveData && Number.isFinite(anchor) && Number.isFinite(live)) {
        val = base + (live - anchor);
      }

      anchored[m] = {
        ...DEFAULT_IDEALS[m],
        val: Math.round(val * 1000) / 1000,
      };
    });

    return anchored;
  }, [dynamicIdealModel]);

  // Compute top 10 closest to ideal
  const idealRanked = useMemo(()=>{
    const scored = Object.entries(allData || {}).map(([name,p])=>{
      const athl = p.athletic||{};
      let total=0, ws=0;
      Object.entries(IDEALS).forEach(([m,info])=>{
        const val = athl[m]?.val;
        if(val==null) return;
        const z = Math.abs(val-info.val)/(STDEVS[m]||1);
        ws += Math.max(0,100-(z/3)*100);
        total++;
      });
      return {name, score: total>=6 ? Math.round((ws/total)*10)/10 : 0, p};
    }).filter(x=>x.score>0);
    scored.sort((a,b)=>b.score-a.score);
    return scored.slice(0,10);
  },[allData, IDEALS]);

  const METRIC_GROUPS = [
    {title:"Body Profile",   keys:["height","weight","arm","hand","wing"]},
    {title:"Speed & Burst",  keys:["forty","ten_split","vert","broad"]},
    {title:"Agility",        keys:["three_cone","shuttle"]},
  ];

  return (
    <div style={{maxWidth:960,margin:"0 auto",padding:"20px 10px 60px",fontFamily:"monospace"}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9,color:"#333",letterSpacing:4,marginBottom:4}}>POSITIONAL STANDARDS</div>
        <div style={{fontSize:20,fontWeight:800,color:"#fff",marginBottom:6}}>
          The <span style={{color:"#f0c040"}}>Ideal</span> Running Back
        </div>
        <div style={{fontSize:10,color:"#555",maxWidth:580,lineHeight:1.6}}>
          Derived from composite scouting standards across draft classes, these measurements define the optimal athletic profile for an NFL running back. Rankings on each player's Athletic tab reflect closeness to these targets — not raw size or speed.
        </div>
        <div style={{fontSize:9,color:"#4da6ff",marginTop:8}}>
          Dynamic baseline: {dynamicIdealModel.contributorPlayers} successful RBs · weighted by Top-12/Top-24 finish seasons ({dynamicIdealModel.contributorSeasons} total weight)
        </div>
      </div>

      <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"flex-start"}}>

        {/* Left: Vitruvian-style figure */}
        <div style={{flexShrink:0,width:200}}>
          <svg viewBox="0 0 200 380" width="200" height="380" style={{display:"block",margin:"0 auto"}}>
            <defs>
              <radialGradient id="outBg" cx="50%" cy="38%" r="55%">
                <stop offset="0%" stopColor="#f0c04006"/>
                <stop offset="100%" stopColor="transparent"/>
              </radialGradient>
            </defs>
            <rect width="200" height="380" fill="url(#outBg)"/>

            {/* Vitruvian proportion circles */}
            <circle cx="100" cy="185" r="110" fill="none" stroke="rgba(240,192,64,0.07)" strokeWidth="1" strokeDasharray="4,8"/>
            <line x1="5"  x2="195" y1="185" y2="185" stroke="rgba(240,192,64,0.05)" strokeWidth="1"/>
            <line x1="100" x2="100" y1="30" y2="370" stroke="rgba(240,192,64,0.05)" strokeWidth="1"/>

            {/* ─── OUTLINE FIGURE — single path, no fill, stroke only ─── */}
            {/* All measurements tuned to match the reference silhouette proportions */}

            {/* HEAD */}
            <ellipse cx="100" cy="46" rx="16" ry="19"
              fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.90"/>

            {/* NECK */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M93,64 L93,74 L107,74 L107,64
            "/>

            {/* SHOULDERS + ARMS horizontal */}
            {/* Left shoulder sweep */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M93,74
              C85,74 72,76 58,80
              C44,84 20,90 8,92
            "/>
            {/* Left arm underside */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M93,82
              C82,83 68,86 54,90
              C40,94 20,97 8,98
            "/>
            {/* Left hand outline */}
            <path fill="none" stroke="#f0c040" strokeWidth="1.6" opacity="0.80" d="
              M8,92 C4,92 2,93 2,95 C2,97 4,98 8,98
            "/>

            {/* Right shoulder sweep */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M107,74
              C115,74 128,76 142,80
              C156,84 180,90 192,92
            "/>
            {/* Right arm underside */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M107,82
              C118,83 132,86 146,90
              C160,94 180,97 192,98
            "/>
            {/* Right hand outline */}
            <path fill="none" stroke="#f0c040" strokeWidth="1.6" opacity="0.80" d="
              M192,92 C196,92 198,93 198,95 C198,97 196,98 192,98
            "/>

            {/* TORSO — chest taper to waist */}
            {/* Left side */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M88,74
              C82,80 78,92 78,106
              C78,118 80,128 80,140
              C78,152 74,164 72,178
            "/>
            {/* Right side */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M112,74
              C118,80 122,92 122,106
              C122,118 120,128 120,140
              C122,152 126,164 128,178
            "/>
            {/* Chest top line */}
            <path fill="none" stroke="#f0c040" strokeWidth="1.5" opacity="0.55" d="
              M88,74 Q100,80 112,74
            "/>

            {/* PELVIS / HIPS */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M72,178 Q78,196 86,202 Q100,208 114,202 Q122,196 128,178
            "/>

            {/* LEFT LEG */}
            {/* Outer thigh */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M84,204
              C80,218 76,234 76,252
              C76,268 78,280 80,292
            "/>
            {/* Inner thigh */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M96,206
              C94,222 92,238 92,256
              C92,270 93,282 94,292
            "/>
            {/* Left knee */}
            <path fill="none" stroke="#f0c040" strokeWidth="1.8" opacity="0.80" d="
              M80,292 Q84,300 87,302 Q91,304 94,302 Q97,300 98,292
            "/>
            {/* Left lower leg outer */}
            <path fill="none" stroke="#f0c040" strokeWidth="1.8" opacity="0.80" d="
              M80,292 C78,308 78,324 80,340 C82,350 84,356 86,360
            "/>
            {/* Left lower leg inner */}
            <path fill="none" stroke="#f0c040" strokeWidth="1.8" opacity="0.80" d="
              M98,292 C98,308 97,324 96,340 C95,350 93,356 92,360
            "/>
            {/* Left foot */}
            <path fill="none" stroke="#f0c040" strokeWidth="1.6" opacity="0.78" d="
              M80,358 C78,362 78,366 82,368 C86,370 94,370 100,366 C104,362 103,358 98,358
            "/>

            {/* RIGHT LEG */}
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M116,204
              C120,218 124,234 124,252
              C124,268 122,280 120,292
            "/>
            <path fill="none" stroke="#f0c040" strokeWidth="2" opacity="0.85" d="
              M104,206
              C106,222 108,238 108,256
              C108,270 107,282 106,292
            "/>
            <path fill="none" stroke="#f0c040" strokeWidth="1.8" opacity="0.80" d="
              M120,292 Q116,300 113,302 Q109,304 106,302 Q103,300 102,292
            "/>
            <path fill="none" stroke="#f0c040" strokeWidth="1.8" opacity="0.80" d="
              M120,292 C122,308 122,324 120,340 C118,350 116,356 114,360
            "/>
            <path fill="none" stroke="#f0c040" strokeWidth="1.8" opacity="0.80" d="
              M102,292 C102,308 103,324 104,340 C105,350 107,356 108,360
            "/>
            <path fill="none" stroke="#f0c040" strokeWidth="1.6" opacity="0.78" d="
              M120,358 C122,362 122,366 118,368 C114,370 106,370 100,366 C96,362 97,358 102,358
            "/>

            {/* ─── ANNOTATIONS ─── */}
            <line x1="14" y1="28"  x2="14" y2="368" stroke="rgba(240,192,64,0.18)" strokeWidth="1"/>
            <line x1="10" y1="28"  x2="18" y2="28"  stroke="rgba(240,192,64,0.18)" strokeWidth="1"/>
            <line x1="10" y1="368" x2="18" y2="368" stroke="rgba(240,192,64,0.18)" strokeWidth="1"/>
            <text x="9" y="202" fill="#f0c040" fontSize="7.5" fontFamily="monospace" textAnchor="middle" transform="rotate(-90,9,202)" opacity="0.65">{IDEALS.height.val.toFixed(2)}″</text>

            <line x1="2"   y1="105" x2="198" y2="105" stroke="rgba(77,166,255,0.18)" strokeWidth="1"/>
            <line x1="2"   y1="101" x2="2"   y2="109" stroke="rgba(77,166,255,0.18)" strokeWidth="1"/>
            <line x1="198" y1="101" x2="198" y2="109" stroke="rgba(77,166,255,0.18)" strokeWidth="1"/>
            <text x="100" y="117" fill="#4da6ff" fontSize="7.5" fontFamily="monospace" textAnchor="middle" opacity="0.68">wing {IDEALS.wing.val.toFixed(1)}″</text>

            <text x="100" y="378" fill="#777" fontSize="8" fontFamily="monospace" textAnchor="middle">{Math.round(IDEALS.weight.val)} lbs</text>
          </svg>
        </div>

        {/* Right: metric cards */}
        <div style={{flex:1,minWidth:280}}>
          {METRIC_GROUPS.map(({title,keys})=>(
            <div key={title} style={{marginBottom:16}}>
              <div style={{fontSize:12,color:"#666",letterSpacing:2,marginBottom:10,fontWeight:600}}>{title.toUpperCase()}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:6}}>
                {keys.map(k=>{
                  const info=IDEALS[k];
                  return (
                    <div key={k} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(240,192,64,0.12)",borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:8,color:"#555",letterSpacing:1,marginBottom:4}}>{info.label.toUpperCase()}</div>
                      <div style={{fontSize:20,fontWeight:800,color:"#f0c040",lineHeight:1}}>
                        {info.val} <span style={{fontSize:9,color:"#555",fontWeight:400}}>{info.unit}</span>
                      </div>
                      <div style={{fontSize:11,color:"#555",marginTop:6,lineHeight:1.45}}>{info.note}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top 10 closest to ideal */}
      <div style={{marginTop:28}}>
        <div style={{fontSize:9,color:"#333",letterSpacing:4,marginBottom:12}}>TOP 10 · CLOSEST TO IDEAL BUILD</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
          {idealRanked.map(({name,score,p},i)=>{
            const ts=TIER_STYLE[p.tier]||TIER_STYLE.Fringe;
            return (
              <div key={name} onClick={()=>onOpenPlayer(name)}
                style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(240,192,64,0.10)",borderRadius:8,padding:"10px 14px",cursor:"pointer",transition:"background 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(240,192,64,0.06)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}>
                <div style={{fontSize:22,fontWeight:900,color:"rgba(240,192,64,0.25)",minWidth:32,textAlign:"center"}}>#{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
                  <div style={{fontSize:13,color:"#666",marginTop:3}}>{p.draft_class} · {p.tier}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:16,color:"#f0c040",fontWeight:700}}>{score.toFixed(1)}<span style={{fontSize:11,color:"#555",marginLeft:4}}>IDEAL FIT</span></div>
                  <div style={{fontSize:15,color:ts.accent,marginTop:3}}>{p.prospect_score.toFixed(1)}<span style={{fontSize:11,color:"#555",marginLeft:4}}>PROSP</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EditPlayerModal({onClose, onSave, allData, existingOverrides={}, sosByYear={}}) {
  const STEPS = ["Select Player","Seasons","Athletic","Recruiting","Review"];
  const playerNames = React.useMemo(() => Object.keys(allData || {}).sort(), [allData]);

  const parseCsvLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const toLooseNum = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    const n = Number(s.replace(/,/g, "").replace(/%/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const buildRawFantasyByPlayer = (csvText) => {
    if (!csvText || typeof csvText !== "string") return {};
    const lines = csvText.split(/\r?\n/).filter((l) => l.length);
    if (!lines.length) return {};

    let headerIdx = -1;
    let header = null;
    for (let i = 0; i < lines.length; i += 1) {
      const cols = parseCsvLine(lines[i]);
      if (cols[0] === "Year" && cols[2] === "Player") {
        headerIdx = i;
        header = cols;
        break;
      }
    }
    if (headerIdx < 0 || !header) return {};

    const attemptStarts = [];
    for (let i = 0; i < header.length; i += 1) {
      if (header[i] === "Attempts") attemptStarts.push(i);
    }
    if (!attemptStarts.length) return {};

    const out = {};
    for (let i = headerIdx + 1; i < lines.length; i += 1) {
      const cols = parseCsvLine(lines[i]);
      const player = (cols[2] || "").trim();
      if (!player) continue;
      if (!out[player]) out[player] = {};

      attemptStarts.forEach((start, blockIdx) => {
        const seasonNum = String(blockIdx + 1);
        const attempts = toLooseNum(cols[start]);
        const yards = toLooseNum(cols[start + 1]);
        const yco = toLooseNum(cols[start + 6]);
        const mtfRush = toLooseNum(cols[start + 8]);
        const tenPlus = toLooseNum(cols[start + 10]);
        const fifPlus = toLooseNum(cols[start + 13]);
        const bay = toLooseNum(cols[start + 14]);
        const firstDowns = toLooseNum(cols[start + 16]);
        const elu = toLooseNum(cols[start + 18]);
        const targets = toLooseNum(cols[start + 21]);
        const receptions = toLooseNum(cols[start + 22]);
        const recYds = toLooseNum(cols[start + 24]);
        const recTds = toLooseNum(cols[start + 26]);
        const recvGrade = toLooseNum(cols[start + 27]);
        const recvSnaps = toLooseNum(cols[start + 28]);
        const yac = toLooseNum(cols[start + 29]);
        const mtfRecv = toLooseNum(cols[start + 33]);

        const hasAny = [attempts, yards, yco, mtfRush, tenPlus, fifPlus, bay, firstDowns, elu, targets, receptions, recYds, recTds, recvGrade, recvSnaps, yac, mtfRecv]
          .some((v) => v != null);
        if (!hasAny) return;

        out[player][seasonNum] = {
          attempts,
          rush_yds: yards,
          yco_raw: yco,
          mtf_rush_raw: mtfRush,
          ten_plus_raw: tenPlus,
          fif_plus_raw: fifPlus,
          bay_raw: bay,
          first_downs_raw: firstDowns,
          elu,
          targets,
          receptions,
          rec_yds: recYds,
          rec_tds: recTds,
          recv_grade: recvGrade,
          recv_snaps: recvSnaps,
          yac_raw: yac,
          mtf_recv_raw: mtfRecv,
        };
      });
    }
    return out;
  };
  
  const [step, setStep] = React.useState(0);
  const [playerQuery, setPlayerQuery] = React.useState("");
  const [selectedPlayer, setSelectedPlayer] = React.useState("");
  const [typeaheadOpen, setTypeaheadOpen] = React.useState(false);
  const [activeTypeaheadIdx, setActiveTypeaheadIdx] = React.useState(-1);
  const [form, setForm] = React.useState(null);
  const [originalPlayer, setOriginalPlayer] = React.useState(null);
  const [originalScore, setOriginalScore] = React.useState(null);
  const [errors, setErrors] = React.useState({});
  const [showSaved, setShowSaved] = React.useState(false);
  const initialSeasonSigRef = React.useRef("");
  const [ddOpenMap, setDdOpenMap] = React.useState({});
  const [ddActiveIdxMap, setDdActiveIdxMap] = React.useState({});
  const [rcOpen, setRcOpen] = React.useState(false);
  const [rcActiveIdx, setRcActiveIdx] = React.useState(-1);
  const [showRawSourceDebug, setShowRawSourceDebug] = React.useState(false);
  const [rawFantasyByPlayer, setRawFantasyByPlayer] = React.useState({});

  React.useEffect(() => {
    let mounted = true;
    fetch("/data/College RB Data Set - Fantasy Finishes (1).csv")
      .then((r) => (r.ok ? r.text() : ""))
      .then((txt) => {
        if (!mounted) return;
        setRawFantasyByPlayer(buildRawFantasyByPlayer(txt));
      })
      .catch(() => {
        if (!mounted) return;
        setRawFantasyByPlayer({});
      });
    return () => { mounted = false; };
  }, []);

  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const pffScoreFromBoardRank = (rankVal) => {
    const r = Number(rankVal);
    if (!Number.isFinite(r) || r < 1 || r > 50) return "";
    const multiplier = 1 - (r - 1) * 0.02;
    return String(Math.round(multiplier * 100));
  };
  const pffBoardRankFromScore = (scoreVal) => {
    const s = Number(scoreVal);
    if (!Number.isFinite(s)) return "";
    const rank = Math.round((100 - s) / 2) + 1;
    if (!Number.isFinite(rank) || rank < 1 || rank > 50) return "";
    return String(rank);
  };
  
  const sInp = (idx, label, key, placeholder='', type='text') => {
    const val = form?.seasons?.[idx]?.[key] ?? '';
    const season = form?.seasons?.[idx] || {};
    const pctMeta = getModalInputPercentileMeta(season, key, season.n || idx + 1);
    return (
      <div style={{marginBottom:10}}>
        <label style={{fontSize:9,color:"#444",letterSpacing:1,display:"block",marginBottom:4}}>{label}</label>
        <input type={type} value={val} onChange={e=>setSeason(idx,key,e.target.value)} placeholder={placeholder}
          style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:7,color:"#e0e0e0",padding:"6px 9px",fontSize:11,outline:"none",fontFamily:"monospace"}} />
        {pctMeta && <MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
      </div>
    );
  };
  
  const autoBoxStyle = {background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,color:"#4da6ff",padding:"6px 9px",fontSize:11,fontFamily:"monospace",outline:"none"};
  
  const getAthVal = (player, key) => {
    const ath = player?.athletic || {};
    const direct = ath[key];
    if (direct && typeof direct === "object" && direct.val != null) return Number(direct.val);
    if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
    if (key === "forty") {
      const alt = ath["40T"];
      if (alt && typeof alt === "object" && alt.val != null) return Number(alt.val);
    }
    if (key === "ten_split") {
      const alt = ath["10split"];
      if (alt && typeof alt === "object" && alt.val != null) return Number(alt.val);
    }
    if (key === "three_cone") {
      const alt = ath["3cone"];
      if (alt && typeof alt === "object" && alt.val != null) return Number(alt.val);
    }
    if (key === "ras") {
      const d = Number(player?.ras);
      if (Number.isFinite(d)) return d;
      const alt = ath.ras;
      if (alt && typeof alt === "object" && alt.val != null) return Number(alt.val);
    }
    return null;
  };

  const fromRow = (row, idx) => {
    const pair = Array.isArray(row) ? row[idx] : null;
    const val = Array.isArray(pair) ? pair[0] : null;
    return val == null || Number.isNaN(Number(val)) ? "" : String(val);
  };

  const suggestions = React.useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    if (!q) return [];
    const starts = playerNames.filter(n => n.toLowerCase().startsWith(q));
    const contains = playerNames.filter(n => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 12);
  }, [playerNames, playerQuery]);

  const buildForm = React.useCallback((name) => {
    const p = allData?.[name] || {};
    const ov = existingOverrides?.[name] || {};
    const rec = {...(p.recruiting || {}), ...(ov.recruiting || {})};
    const athOv = ov.athletic || {};

    const ssSource = (_customSS && _customSS[name]) || (SEASON_STATS && SEASON_STATS[name]) || {};
    const baseSeasons = Array.isArray(p.seasons) ? [...p.seasons].sort((a,b)=>Number(a.n)-Number(b.n)) : [];
    const mergedMetaByN = {};
    baseSeasons.forEach(s => { mergedMetaByN[Number(s.n)] = {...s}; });
    (Array.isArray(ov.seasons) ? ov.seasons : []).forEach(s => {
      const n = Number(s?.n);
      if (!Number.isFinite(n)) return;
      mergedMetaByN[n] = {...(mergedMetaByN[n] || {n}), ...s};
    });

    const seasonNums = [...new Set([
      ...Object.keys(ssSource || {}).map(Number).filter(Number.isFinite),
      ...Object.keys(mergedMetaByN).map(Number).filter(Number.isFinite),
    ])].sort((a,b)=>a-b);

    const seasons = seasonNums.map((n) => {
      const row = (ov.seasonStats && ov.seasonStats[n]) || ssSource[n] || [];
      const meta = mergedMetaByN[n] || {};
      const raw = rawFantasyByPlayer?.[name]?.[String(n)] || null;
      const attemptsNum = Number(fromRow(row, 0));
      const rec = Number(fromRow(row, 16));
      const rushYdsNum = Number(fromRow(row, 1));
      const recYds = Number(fromRow(row, 18));
      const ypr = (Number.isFinite(rec) && rec > 0 && Number.isFinite(recYds)) ? recYds / rec : "";

      const ycoPerAtt = Number(fromRow(row, 6));
      const mtfPerAtt = Number(fromRow(row, 7));
      const tenPlusPerAtt = Number(fromRow(row, 8));
      const fifPlusPerAtt = Number(fromRow(row, 9));
      const bayPct = Number(fromRow(row, 10));
      const firstDownPerAtt = Number(fromRow(row, 11));
      const yacPerRec = Number(fromRow(row, 23));
      const mtfPerRec = Number(fromRow(row, 26));

      const ycoRaw = (Number.isFinite(attemptsNum) && attemptsNum > 0 && Number.isFinite(ycoPerAtt)) ? Math.round(ycoPerAtt * attemptsNum) : "";
      const mtfRaw = (Number.isFinite(attemptsNum) && attemptsNum > 0 && Number.isFinite(mtfPerAtt)) ? Math.round(mtfPerAtt * attemptsNum) : "";
      const tenPlusRaw = (Number.isFinite(attemptsNum) && attemptsNum > 0 && Number.isFinite(tenPlusPerAtt)) ? Math.round(tenPlusPerAtt * attemptsNum) : "";
      const fifPlusRaw = (Number.isFinite(attemptsNum) && attemptsNum > 0 && Number.isFinite(fifPlusPerAtt)) ? Math.round(fifPlusPerAtt * attemptsNum) : "";
      const bayRaw = (Number.isFinite(rushYdsNum) && rushYdsNum > 0 && Number.isFinite(bayPct)) ? Math.round((bayPct / 100) * rushYdsNum) : "";
      const firstDownRaw = (Number.isFinite(attemptsNum) && attemptsNum > 0 && Number.isFinite(firstDownPerAtt)) ? Math.round(firstDownPerAtt * attemptsNum) : "";
      const yacRaw = (Number.isFinite(rec) && rec > 0 && Number.isFinite(yacPerRec)) ? Math.round(yacPerRec * rec) : "";
      const mtfRecvRaw = (Number.isFinite(rec) && rec > 0 && Number.isFinite(mtfPerRec)) ? Math.round(mtfPerRec * rec) : "";

      const rawChecks = [
        ["attempts", raw?.attempts],
        ["rush_yds", raw?.rush_yds],
        ["yco", raw?.yco_raw],
        ["mtf_rush", raw?.mtf_rush_raw],
        ["ten_plus", raw?.ten_plus_raw],
        ["fif_plus", raw?.fif_plus_raw],
        ["bay", raw?.bay_raw],
        ["first_downs", raw?.first_downs_raw],
        ["elu", raw?.elu],
        ["targets", raw?.targets],
        ["receptions", raw?.receptions],
        ["rec_yds", raw?.rec_yds],
        ["rec_tds", raw?.rec_tds],
        ["recv_grade", raw?.recv_grade],
        ["recv_snaps", raw?.recv_snaps],
        ["yac", raw?.yac_raw],
        ["mtf_recv", raw?.mtf_recv_raw],
      ];
      const csvHit = rawChecks.filter(([, v]) => v != null).map(([k]) => k);
      const fallbackHit = rawChecks.filter(([, v]) => v == null).map(([k]) => k);
      const rawSourceLabel = !raw
        ? "FALLBACK"
        : (fallbackHit.length === 0 ? "CSV" : `CSV PARTIAL (${csvHit.length}/${rawChecks.length})`);

      return {
        n,
        yr: meta.yr ?? "",
        school: meta.school ?? meta.sc ?? "",
        conf: meta.conf ?? meta.conference ?? "",
        sos_label: meta.sos_label ?? "Average",
        sos_rank: meta.sos_rank ?? "",
        sos_mag: meta.sos_mag ?? "",
        redshirt: meta.redshirt ?? false,
        attempts: raw?.attempts ?? fromRow(row, 0),
        rush_yds: raw?.rush_yds ?? fromRow(row, 1),
        ypa: fromRow(row, 2),
        rush_tds: fromRow(row, 3),
        fumbles: fromRow(row, 4),
        run_grade: fromRow(row, 5),
        yco_a: raw?.yco_raw ?? ycoRaw,
        mtf_a: fromRow(row, 7),
        // Dataset stores several rushing/receiving rate stats directly.
        // Bind them into the edit fields so values always populate.
        mtf: raw?.mtf_rush_raw ?? mtfRaw,
        ten_plus: raw?.ten_plus_raw ?? tenPlusRaw,
        ten_plus_a: fromRow(row, 8),
        fif_plus: raw?.fif_plus_raw ?? fifPlusRaw,
        fifteen_plus: raw?.fif_plus_raw ?? fifPlusRaw,
        fifteen_plus_a: fromRow(row, 9),
        bay: raw?.bay_raw ?? bayRaw,
        bay_pct: fromRow(row, 10),
        first_downs: raw?.first_downs_raw ?? firstDownRaw,
        first_downs_a: fromRow(row, 11),
        elu: raw?.elu ?? fromRow(row, 12),
        ydom: fromRow(row, 13),
        tddom: fromRow(row, 14),
        targets: raw?.targets ?? fromRow(row, 15),
        receptions: raw?.receptions ?? fromRow(row, 16),
        rec_pct: fromRow(row, 17),
        rec_yds: raw?.rec_yds ?? fromRow(row, 18),
        yds_per_rec: ypr,
        rec_tds: raw?.rec_tds ?? fromRow(row, 20),
        recv_grade: raw?.recv_grade ?? fromRow(row, 21),
        recv_snaps: raw?.recv_snaps ?? fromRow(row, 22),
        yac_raw: raw?.yac_raw ?? yacRaw,
        yac_rec: fromRow(row, 23),
        y_rr: fromRow(row, 24),
        adot: fromRow(row, 25),
        mtf_recv: raw?.mtf_recv_raw ?? mtfRecvRaw,
        mtf_rec: fromRow(row, 26),
        rush_score: meta.rush_score ?? meta.r ?? "",
        recv_score: meta.recv_score ?? meta.v ?? "",
        adj_score: meta.adj_score ?? meta.c ?? "",
        _raw_source_label: rawSourceLabel,
        _raw_source_csv_fields: csvHit,
        _raw_source_fallback_fields: fallbackHit,
      };
    });

    return {
      name: p.name || "",
      draft_class: p.draft_class || "",
      school: p.school || "",
      conference: p.conference || p.conf || "",
      draft_round: ov.draft_round != null ? String(ov.draft_round) : (p.draft_round != null ? String(p.draft_round) : ""),
      draft_pick: ov.draft_pick != null ? String(ov.draft_pick) : (p.draft_pick != null ? String(p.draft_pick) : ""),
      came_out_as: p.came_out_as || "",
      is_projection: typeof ov.is_projection === "boolean" ? ov.is_projection : (p.is_projection ?? false),
      pff_board_rank: ov.pff_board_rank ?? pffBoardRankFromScore(ov.pff_score ?? p.pff_score ?? ""),
      pff_score: pffScoreFromBoardRank(ov.pff_board_rank ?? pffBoardRankFromScore(ov.pff_score ?? p.pff_score ?? "")) || String(ov.pff_score ?? p.pff_score ?? ""),
      transfer_to: ov.transfer_to ?? p.transfer_to ?? "",
      recruit_stars: rec.recruit_stars ?? "",
      recruit_rating: rec.recruit_rating ?? "",
      recruit_nat: rec.recruit_nat ?? "",
      recruit_pos: rec.recruit_pos ?? "",
      recruit_state: rec.recruit_state ?? "",
      recruit_school: rec.recruit_school ?? "",
      recruit_school_other: rec.recruit_school_other ?? "",
      recruit_year: rec.recruit_year ?? "",
      height: athOv.height ?? getAthVal(p, "height") ?? "",
      weight: athOv.weight ?? getAthVal(p, "weight") ?? "",
      arm: athOv.arm ?? getAthVal(p, "arm") ?? "",
      hand: athOv.hand ?? getAthVal(p, "hand") ?? "",
      wing: athOv.wing ?? getAthVal(p, "wing") ?? "",
      forty: athOv.forty ?? getAthVal(p, "forty") ?? "",
      ten_split: athOv.ten_split ?? getAthVal(p, "ten_split") ?? "",
      vert: athOv.vert ?? getAthVal(p, "vert") ?? "",
      broad: athOv.broad ?? getAthVal(p, "broad") ?? "",
      three_cone: athOv.three_cone ?? getAthVal(p, "three_cone") ?? "",
      shuttle: athOv.shuttle ?? getAthVal(p, "shuttle") ?? "",
      ras: athOv.ras ?? getAthVal(p, "ras") ?? "",
      seasons,
    };
  }, [allData, existingOverrides, rawFantasyByPlayer]);

  const normalizeSeasonForScoring = (s) => {
    const att = Number(s?.attempts);
    const rushYds = toNum(s?.rush_yds);
    const rec = Number(s?.receptions);
    const targets = Number(s?.targets);
    const recYds = toNum(s?.rec_yds);
    const ycoRaw = toNum(s?.yco_a);
    const mtfRaw = toNum(s?.mtf);
    const tenPlusRaw = toNum(s?.ten_plus);
    const fifPlusRaw = toNum(s?.fif_plus ?? s?.fifteen_plus);
    const bayRaw = toNum(s?.bay);
    const firstDownRaw = toNum(s?.first_downs);
    const yacRaw = toNum(s?.yac_raw);
    const mtfRecvRaw = toNum(s?.mtf_recv);
    const ypr = (Number.isFinite(rec) && rec > 0 && recYds != null) ? recYds / rec : toNum(s?.yds_per_rec);
    const ycoPerAtt = (Number.isFinite(att) && att > 0 && ycoRaw != null) ? ycoRaw / att : toNum(s?.yco_a);
    const mtfPerAtt = (Number.isFinite(att) && att > 0 && mtfRaw != null) ? mtfRaw / att : toNum(s?.mtf_a);
    const tenPlusPerAtt = (Number.isFinite(att) && att > 0 && tenPlusRaw != null) ? tenPlusRaw / att : toNum(s?.ten_plus_a);
    const fifPlusPerAtt = (Number.isFinite(att) && att > 0 && fifPlusRaw != null) ? fifPlusRaw / att : toNum(s?.fifteen_plus_a ?? s?.fif_plus_a);
    const bayPct = (rushYds != null && rushYds > 0 && bayRaw != null) ? (bayRaw / rushYds) * 100 : toNum(s?.bay_pct);
    const firstDownPerAtt = (Number.isFinite(att) && att > 0 && firstDownRaw != null) ? firstDownRaw / att : toNum(s?.first_downs_a);
    const recPct = (Number.isFinite(targets) && targets > 0 && Number.isFinite(rec)) ? (rec / targets) * 100 : toNum(s?.rec_pct);
    const yacPerRec = (Number.isFinite(rec) && rec > 0 && yacRaw != null) ? yacRaw / rec : toNum(s?.yac_rec);
    const mtfPerRec = (Number.isFinite(rec) && rec > 0 && mtfRecvRaw != null) ? mtfRecvRaw / rec : toNum(s?.mtf_rec);

    return {
      ...s,
      conference: s?.conference ?? s?.conf ?? "",
      yds_per_rec: ypr ?? s?.yds_per_rec,
      yco_a: ycoPerAtt ?? s?.yco_a,
      mtf_a: mtfPerAtt ?? s?.mtf_a,
      ten_plus_a: tenPlusPerAtt ?? s?.ten_plus_a,
      fifteen_plus_a: fifPlusPerAtt ?? s?.fifteen_plus_a ?? s?.fif_plus_a,
      bay_pct: bayPct ?? s?.bay_pct,
      first_downs_a: firstDownPerAtt ?? s?.first_downs_a,
      rec_pct: recPct ?? s?.rec_pct,
      yac_rec: yacPerRec ?? s?.yac_rec ?? s?.yac_raw,
      mtf_rec: mtfPerRec ?? s?.mtf_rec ?? s?.mtf_recv,
      mtf: undefined,
      ten_plus: undefined,
      fif_plus: undefined,
      bay: undefined,
      first_downs: undefined,
      yac_raw: undefined,
      mtf_recv: undefined,
    };
  };

  const buildSeasonSignature = (seasons) => JSON.stringify(
    (seasons || []).map((s) => ({
      n: s?.n ?? "",
      yr: s?.yr ?? "",
      school: s?.school ?? "",
      school_other: s?.school_other ?? "",
      conf: s?.conf ?? s?.conference ?? "",
      sos_label: s?.sos_label ?? "",
      sos_rank: s?.sos_rank ?? "",
      sos_mag: s?.sos_mag ?? "",
      redshirt: !!s?.redshirt,
      attempts: s?.attempts ?? "",
      rush_yds: s?.rush_yds ?? "",
      ypa: s?.ypa ?? "",
      rush_tds: s?.rush_tds ?? "",
      fumbles: s?.fumbles ?? "",
      run_grade: s?.run_grade ?? "",
      yco_a: s?.yco_a ?? "",
      mtf: s?.mtf ?? "",
      ten_plus: s?.ten_plus ?? "",
      fif_plus: s?.fif_plus ?? s?.fifteen_plus ?? "",
      bay: s?.bay ?? "",
      first_downs: s?.first_downs ?? "",
      elu: s?.elu ?? "",
      ydom: s?.ydom ?? "",
      tddom: s?.tddom ?? "",
      targets: s?.targets ?? "",
      receptions: s?.receptions ?? "",
      rec_yds: s?.rec_yds ?? "",
      rec_tds: s?.rec_tds ?? "",
      recv_grade: s?.recv_grade ?? "",
      recv_snaps: s?.recv_snaps ?? "",
      yac_raw: s?.yac_raw ?? "",
      adot: s?.adot ?? "",
      mtf_recv: s?.mtf_recv ?? "",
    }))
  );

  const choosePlayer = (name) => {
    setSelectedPlayer(name);
    setPlayerQuery(name);
    setTypeaheadOpen(false);
    setActiveTypeaheadIdx(-1);
    setStep(1);
    const built = buildForm(name);
    setForm(built);
    initialSeasonSigRef.current = buildSeasonSignature(built?.seasons || []);
    const original = allData?.[name] || {};
    setOriginalPlayer(original);
    const storedOrig = {
      prospect_score: toNum(original?.prospect_score),
      prod_trajectory: toNum(original?.prod_trajectory),
      athl_score: toNum(original?.athl_score),
      pff_score: toNum(original?.pff_score),
      tier: original?.tier,
    };
    const hasStoredOrig = storedOrig.prospect_score != null && storedOrig.prod_trajectory != null && storedOrig.athl_score != null && storedOrig.pff_score != null;
    const origScore = hasStoredOrig
      ? {
          prospect_score: storedOrig.prospect_score,
          prod_trajectory: storedOrig.prod_trajectory,
          athl_score: storedOrig.athl_score,
          pff_score: storedOrig.pff_score,
          tier: storedOrig.tier || scoreToTier(storedOrig.prospect_score),
        }
      : buildProspectScore(
          (built.seasons || []).map((s) => normalizeSeasonForScoring(s)),
          true,
          {
            forty: built.forty,
            vert: built.vert,
            weight: built.weight,
            ras: built.ras,
            pff_grade: built.pff_score,
          }
        );
    setOriginalScore(origScore);
  };

  const set = (k, v) => setForm(prev => ({...prev, [k]: v}));
  const setSeason = (idx, k, v) => {
    const statKeys = ['attempts', 'rush_yds', 'ypa', 'rush_tds', 'run_grade', 'yco_a', 'mtf_a', 'ydom', 'tddom', 'targets', 'receptions', 'rec_yds', 'yds_per_rec', 'rec_tds', 'recv_grade', 'yac_rec', 'mtf_rec'];
    const shouldClearScores = statKeys.includes(k);
    setForm(prev => ({
      ...prev,
      seasons: (prev?.seasons || []).map((s, i) => {
        if (i === idx) {
          const updated = {...s, [k]: v};
          if (shouldClearScores) {
            updated.rush_score = '';
            updated.recv_score = '';
            updated.adj_score = '';
          }
          return updated;
        }
        return s;
      })
    }));
  };
  
  const derivedTransfers = React.useMemo(() => {
    const moves = [];
    for (let i = 1; i < (form?.seasons || []).length; i++) {
      const prevSchool = (form?.seasons[i - 1]?.school || "").trim();
      const nextSchool = (form?.seasons[i]?.school || "").trim();
      if (prevSchool && nextSchool && prevSchool.toLowerCase() !== nextSchool.toLowerCase()) {
        moves.push({ year: String(form?.seasons[i]?.yr || "").trim(), school: nextSchool });
      }
    }
    return { moves, count: moves.length };
  }, [form?.seasons]);
  
  const previewScore = React.useMemo(() => {
    if (!form || !originalScore) return null;
    // Use stored prod/athl scores — they reflect the actual saved data.
    // Only PFF (and therefore prospect) changes when the user edits the PFF rank.
    // This matches the ALL_DATA formula that runs after a save.
    const prod = toNum(originalScore.prod_trajectory) ?? 0;
    const athl = toNum(originalScore.athl_score) ?? 0;
    const origProspect = toNum(originalScore.prospect_score) ?? 0;
    const origPff = toNum(originalScore.pff_score) ?? 0;
    // Always derive from board rank first so review matches the UI mapping exactly.
    const pff = toNum(pffScoreFromBoardRank(form.pff_board_rank) || form.pff_score) ?? 0;
    // Keep score movement aligned with user intent in edit review:
    // if only PFF rank changes, prospect should move by 15% of that PFF delta.
    const prospectScore = Math.min(100, Math.round((origProspect + (pff - origPff) * 0.15) * 10) / 10);
    return {
      prospect_score: prospectScore,
      prod_trajectory: Math.round(prod * 10) / 10,
      athl_score: Math.round(athl * 10) / 10,
      pff_score: Math.round(pff * 10) / 10,
      tier: scoreToTier(prospectScore),
    };
  }, [form?.pff_board_rank, form?.pff_score, originalScore]);

  const next = () => {
    if (step < 4) setStep(step + 1);
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSave = () => {
    if (!selectedPlayer || !form) return;
    if (form.recruit_school === "Other (FCS/Lower)" && !String(form.recruit_school_other || "").trim()) {
      setErrors((prev) => ({ ...prev, recruit_school_other: "Required" }));
      setStep(3);
      return;
    }
    const cleaned = {athletic:{}, recruiting:{}};

    const pff = toNum(pffScoreFromBoardRank(form.pff_board_rank) || form.pff_score);
    if (pff != null) cleaned.pff_score = pff;
    if (previewScore) {
      const ps = toNum(previewScore.prospect_score);
      const prod = toNum(previewScore.prod_trajectory);
      const athl = toNum(previewScore.athl_score);
      if (ps != null) cleaned.prospect_score = ps;
      if (prod != null) cleaned.prod_trajectory = prod;
      if (athl != null) cleaned.athl_score = athl;
      cleaned.tier = previewScore.tier || (ps != null ? scoreToTier(ps) : undefined);
    }

    const t = String(form.transfer_to || "").trim();
    if (t) cleaned.transfer_to = t;

    ["height","weight","arm","hand","wing","forty","ten_split","vert","broad","three_cone","shuttle","ras"].forEach((k)=>{
      const n = toNum(form[k]);
      if (n != null) cleaned.athletic[k] = n;
    });

    ["recruit_stars","recruit_rating","recruit_nat","recruit_pos","recruit_state","recruit_year"].forEach((k)=>{
      const n = toNum(form[k]);
      if (n != null) cleaned.recruiting[k] = n;
    });
    const recSchool = String(form.recruit_school || "").trim();
    if (recSchool) cleaned.recruiting.recruit_school = recSchool;
    const recSchoolOther = String(form.recruit_school_other || "").trim();
    if (form.recruit_school === "Other (FCS/Lower)" && recSchoolOther) {
      cleaned.recruiting.recruit_school_other = recSchoolOther;
    }

    const seasonsChanged = initialSeasonSigRef.current !== buildSeasonSignature(form.seasons || []);
    const seasons = (form.seasons || []).map((s, i) => {
      const n = Number(s.n) || (i + 1);
      const att = Number(s.attempts);
      const rushYds = Number(s.rush_yds);
      const rec = Number(s.receptions);
      const targets = Number(s.targets);
      const recYds = Number(s.rec_yds);
      const ypr = toNum(s.yds_per_rec) ?? ((Number.isFinite(rec) && rec > 0 && Number.isFinite(recYds)) ? recYds / rec : null);
      const ycoPerAtt = toNum(s.yco_a) != null && Number.isFinite(att) && att > 0 ? Number(s.yco_a) / att : toNum(s.yco_a);
      const mtfPerAtt = toNum(s.mtf_a) ?? ((Number.isFinite(att) && att > 0) ? toNum(s.mtf) != null ? Number(s.mtf) / att : null : null);
      const tenPlusA = toNum(s.ten_plus_a) ?? ((Number.isFinite(att) && att > 0) ? toNum(s.ten_plus) != null ? Number(s.ten_plus) / att : null : null);
      const fifPlusA = toNum(s.fifteen_plus_a) ?? ((Number.isFinite(att) && att > 0) ? toNum(s.fif_plus ?? s.fifteen_plus) != null ? Number(s.fif_plus ?? s.fifteen_plus) / att : null : null);
      const bayPct = toNum(s.bay_pct) ?? ((Number.isFinite(rushYds) && rushYds > 0) ? toNum(s.bay) != null ? Number(s.bay) / rushYds * 100 : null : null);
      const firstDownA = toNum(s.first_downs_a) ?? ((Number.isFinite(att) && att > 0) ? toNum(s.first_downs) != null ? Number(s.first_downs) / att : null : null);
      const recPct = toNum(s.rec_pct) ?? ((Number.isFinite(targets) && targets > 0 && Number.isFinite(rec)) ? rec / targets * 100 : null);
      const yacRec = toNum(s.yac_rec) ?? ((Number.isFinite(rec) && rec > 0) ? toNum(s.yac_raw) != null ? Number(s.yac_raw) / rec : null : null);
      const mtfRec = toNum(s.mtf_rec) ?? ((Number.isFinite(rec) && rec > 0) ? toNum(s.mtf_recv) != null ? Number(s.mtf_recv) / rec : null : null);

      const row = Array(27).fill(null).map(() => [null, null]);
      const put = (idx, val) => {
        const nVal = toNum(val);
        if (nVal == null) return;
        row[idx] = [nVal, null];
      };
      put(0, s.attempts);
      put(1, s.rush_yds);
      put(2, s.ypa);
      put(3, s.rush_tds);
      put(4, s.fumbles);
      put(5, s.run_grade);
      put(6, ycoPerAtt);
      put(7, mtfPerAtt);
      put(8, tenPlusA);
      put(9, fifPlusA);
      put(10, bayPct);
      put(11, firstDownA);
      put(12, s.elu);
      put(13, s.ydom);
      put(14, s.tddom);
      put(15, s.targets);
      put(16, s.receptions);
      put(17, recPct);
      put(18, s.rec_yds);
      put(19, ypr);
      put(20, s.rec_tds);
      put(21, s.recv_grade);
      put(22, s.recv_snaps);
      put(23, yacRec);
      put(24, s.y_rr);
      put(25, s.adot);
      put(26, mtfRec);

      const isFcsOther = String(s.school || "").trim() === "Other (FCS/Lower)";
      const resolvedSchool = isFcsOther ? String(s.school_other || "").trim() : String(s.school || "").trim();
      return {
        n,
        row,
        meta: {
          n,
          yr: toNum(s.yr),
          school: resolvedSchool,
          school_other: isFcsOther ? resolvedSchool : "",
          conf: String(s.conf || "").trim(),
          sos_label: isFcsOther ? "FCS" : (String(s.sos_label || "Average").trim() || "Average"),
          sos_rank: isFcsOther ? 0 : toNum(s.sos_rank),
          sos_mag: isFcsOther ? 0 : toNum(s.sos_mag),
          redshirt: !!s.redshirt
        }
      };
    });

    if (seasonsChanged) {
      cleaned.seasonStats = {};
      cleaned.seasons = seasons.map(s => s.meta);
      seasons.forEach(s => {
        cleaned.seasonStats[String(s.n)] = s.row;
      });
    }

    if (!Object.keys(cleaned.athletic).length) delete cleaned.athletic;
    if (!Object.keys(cleaned.recruiting).length) delete cleaned.recruiting;

    // For projection-class players: if a draft round is now entered, flip them to historical
    if (form.is_projection) {
      const dr = toNum(form.draft_round);
      const dp = toNum(form.draft_pick);
      if (dr != null) {
        cleaned.draft_round = dr;
        if (dp != null) cleaned.draft_pick = dp;
        cleaned.is_projection = false;
      }
    }

    onSave(selectedPlayer, cleaned);
    setShowSaved(true);
    setTimeout(() => {
      setShowSaved(false);
      onClose();
    }, 1200);
  };

  // Helper input functions matching AddPlayerModal style
  const inp = (label, key, placeholder, type="text", extraStyle={}, compact=false) => (
    <div style={{...extraStyle}}>
      <label style={{fontSize:compact?8:9,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>
        {label}
        {errors[key] && <span style={{color:"#e05050",marginLeft:8,fontSize:9}}>{errors[key]}</span>}
      </label>
      <input
        type={type}
        value={form?.[key] ?? ""}
        onChange={e=>set(key, e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid "+(errors[key]?"#e05050":"rgba(255,255,255,0.10)"),borderRadius:7,color:"#e0e0e0",padding:"6px 9px",fontSize:compact?10:11,outline:"none",fontFamily:"monospace"}}
      />
    </div>
  );

  const cinp = (label, key, placeholder, type="text") => inp(label, key, placeholder, type, {}, true);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.86)",zIndex:2200,display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
      <div style={{width:"100%",maxWidth:900,maxHeight:"90vh",overflowY:"auto",background:"#0f1422",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"20px 20px 24px",fontFamily:"monospace"}}>
        
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:9,color:"#555",letterSpacing:2,marginBottom:3}}>EDIT PROSPECT</div>
            <div style={{fontSize:20,fontWeight:900,color:"#fff"}}>Scout Profile</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"1px solid rgba(255,255,255,0.15)",color:"#666",padding:"8px 14px",borderRadius:8,fontSize:10,cursor:"pointer",fontFamily:"monospace",letterSpacing:1}}>CLOSE</button>
        </div>

        {/* Step tabs */}
        <div style={{display:"flex",gap:0,marginBottom:24,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          {STEPS.map((s, i) => (
            <button key={i} onClick={()=>i<=step&&setStep(i)} disabled={i>step}
              style={{flex:1,padding:"12px 10px",borderRight:i<STEPS.length-1?"1px solid rgba(255,255,255,0.07)":"none",background:i===step?"rgba(240,192,64,0.08)":"transparent",color:i<step?"#5dbf6a":i===step?"#f0c040":"#555",fontSize:11,letterSpacing:1,fontWeight:i===step?700:500,cursor:i<=step?"pointer":"default",opacity:i>step?0.4:1,border:"none",fontFamily:"monospace"}}>
              {i<step?<span>✓ </span>:null}{s}
            </button>
          ))}
        </div>

        {/* Step 0: Select Player */}
        {step === 0 && (
          <div>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:9,color:"#666",letterSpacing:1,display:"block",marginBottom:6}}>PLAYER NAME</label>
              <div style={{position:"relative"}}>
                <input
                  value={playerQuery}
                  autoFocus
                  onChange={(e)=>{ setPlayerQuery(e.target.value); setTypeaheadOpen(e.target.value.length > 0); setActiveTypeaheadIdx(-1); }}
                  onFocus={()=>setTypeaheadOpen(playerQuery.length > 0)}
                  onBlur={()=>setTimeout(()=>{setTypeaheadOpen(false);setActiveTypeaheadIdx(-1);setPlayerQuery("");},150)}
                  onKeyDown={(e)=>{
                    if (!suggestions.length) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setTypeaheadOpen(true);
                      setActiveTypeaheadIdx((i) => Math.min(i + 1, suggestions.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveTypeaheadIdx((i) => Math.max(i - 1, 0));
                    } else if (e.key === "Enter") {
                      if (typeaheadOpen && activeTypeaheadIdx >= 0 && activeTypeaheadIdx < suggestions.length) {
                        e.preventDefault();
                        choosePlayer(suggestions[activeTypeaheadIdx]);
                      }
                    } else if (e.key === "Escape") {
                      setTypeaheadOpen(false);
                      setActiveTypeaheadIdx(-1);
                    }
                  }}
                  placeholder="Start typing player name..."
                  autoComplete="off"
                  style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:7,color:"#e0e0e0",padding:"8px 10px",fontSize:11,fontFamily:"monospace",outline:"none"}}
                />
                {typeaheadOpen && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#0d1421",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"0 0 7px 7px",zIndex:50,maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                    {suggestions.length === 0 ? (
                      <div style={{padding:"10px 12px",fontSize:10,color:"#666"}}>No matching players found.</div>
                    ) : suggestions.map((name, idx)=>(
                      <button key={name} onMouseDown={e=>{e.preventDefault();choosePlayer(name);}}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",background:idx===activeTypeaheadIdx?"rgba(240,192,64,0.08)":"transparent",color:"#ddd",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(240,192,64,0.08)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Seasons */}
        {step === 1 && form && (
          <div>
            {/* Draft round/pick entry for projection-class players */}
            {form.is_projection && (
              <div style={{background:"rgba(0,131,143,0.08)",border:"1px solid rgba(0,131,143,0.30)",borderRadius:10,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:10,color:"#00838f",fontWeight:700,letterSpacing:1,marginBottom:8}}>NOW DRAFTED? <span style={{color:"#445",fontWeight:400}}>(OPTIONAL)</span></div>
                <div style={{fontSize:10,color:"#6a8a8d",marginBottom:12,lineHeight:1.55}}>If this player has been drafted, enter their round and overall pick number. Saving with a draft round will move them to historical mode and apply draft-capital weighting to their hit-rate projections.</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {inp("Draft Round","draft_round","1–7","number")}
                  {inp("Pick (Overall)","draft_pick","e.g. 14","number")}
                </div>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:16}}>
              <div style={{fontSize:10,color:"#555"}}>Enter stats for each college season. Stats are used to calculate the prospect score.</div>
              <button
                onClick={()=>setShowRawSourceDebug(v=>!v)}
                style={{background:showRawSourceDebug?"rgba(77,166,255,0.14)":"rgba(255,255,255,0.04)",border:"1px solid "+(showRawSourceDebug?"rgba(77,166,255,0.45)":"rgba(255,255,255,0.14)"),borderRadius:7,color:showRawSourceDebug?"#4da6ff":"#777",padding:"5px 10px",fontSize:9,cursor:"pointer",fontFamily:"monospace",letterSpacing:0.5,whiteSpace:"nowrap"}}
              >
                {showRawSourceDebug ? "HIDE RAW SOURCE" : "SHOW RAW SOURCE"}
              </button>
            </div>
            {form.seasons.map((s,idx)=>(
              <div key={idx} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:s.redshirt?0:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#f0c040"}}>Season {s.n}</div>
                    {showRawSourceDebug && !s.redshirt && (
                      <span style={{fontSize:9,padding:"2px 7px",background:s._raw_source_label==="CSV"?"rgba(93,191,106,0.15)":"rgba(240,135,58,0.12)",border:"1px solid "+(s._raw_source_label==="CSV"?"rgba(93,191,106,0.45)":"rgba(240,135,58,0.4)"),borderRadius:10,color:s._raw_source_label==="CSV"?"#5dbf6a":"#f0873a",fontWeight:700,letterSpacing:0.3}}>
                        RAW: {s._raw_source_label}
                      </span>
                    )}
                    {/* Portal badge — school differs from previous season */}
                    {idx>0&&s.school&&form.seasons[idx-1]?.school&&s.school!==form.seasons[idx-1].school&&(
                      <span style={{fontSize:9,padding:"2px 7px",background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.4)",borderRadius:10,color:"#4da6ff",fontWeight:700,letterSpacing:0.5}}>🔄 PORTAL</span>
                    )}
                    {s.redshirt&&<span style={{fontSize:18}}>🎽</span>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button onClick={()=>setSeason(idx,"redshirt",!s.redshirt)}
                      style={{background:s.redshirt?"rgba(240,192,64,0.15)":"rgba(255,255,255,0.04)",border:"1px solid "+(s.redshirt?"rgba(240,192,64,0.4)":"rgba(255,255,255,0.1)"),borderRadius:6,color:s.redshirt?"#f0c040":"#555",padding:"3px 10px",fontSize:9,cursor:"pointer"}}>
                      {s.redshirt?"✓ REDSHIRT":"REDSHIRT"}
                    </button>
                  </div>
                </div>
                {s.redshirt&&<div style={{textAlign:"center",padding:"10px 0",fontSize:10,color:"#555"}}>🎽 Redshirt season — no stats recorded</div>}
                {showRawSourceDebug && !s.redshirt && (
                  <div style={{marginBottom:10,padding:"7px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:7,fontSize:9,color:"#7d8da1"}}>
                    CSV fields: {(s._raw_source_csv_fields || []).join(", ") || "none"}
                    {(s._raw_source_fallback_fields || []).length > 0 && (
                      <div style={{marginTop:4,color:"#b08b66"}}>Fallback fields: {s._raw_source_fallback_fields.join(", ")}</div>
                    )}
                  </div>
                )}
                {!s.redshirt&&(<div>{/* ── Year + School → auto SoS ── */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px",marginBottom:4}}>
                  {sInp(idx,"Season Year","yr","e.g. 2024","number")}
                  {/* College typeahead */}
                  {(()=>{
                    const allTeams=[...new Set(Object.values(SOS_LOOKUP).flat().map(t=>t.team))].sort();
                    allTeams.push("Other (FCS/Lower)");
                    const schoolVal=s.school||'';
                    const schoolLow=schoolVal.toLowerCase();
                    const ddOpen=ddOpenMap[idx]||false;
                    const activeIdx=ddActiveIdxMap[idx]??-1;
                    const setDdOpen=(v)=>setDdOpenMap(m=>({...m,[idx]:v}));
                    const setActiveIdx=(v)=>setDdActiveIdxMap(m=>({...m,[idx]:v}));
                    const suggestions=schoolVal.length>=1&&ddOpen
                      ? allTeams.filter(t=>t.toLowerCase().includes(schoolLow)).slice(0,8)
                      : [];
                    const pickSchool=(t)=>{
                      if(t==="Other (FCS/Lower)"){
                        setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{
                          ...ss,
                          school:t,
                          sos_label:"FCS",
                          sos_rank:"0",
                          sos_mag:"0"
                        }:ss)}));
                        setDdOpen(false);
                        setActiveIdx(-1);
                        return;
                      }
                      const yr3=String(s?.yr||'');
                      const pool2=[...(SOS_LOOKUP[yr3]||[]),...Object.values(sosByYear[yr3]||sosByYear[String(Number(yr3)-1)]||{})];
                      const m=pool2.find(d=>d.team.toLowerCase()===t.toLowerCase())
                        ||pool2.find(d=>d.team.toLowerCase().startsWith(t.toLowerCase()))
                        ||pool2.find(d=>t.toLowerCase().startsWith(d.team.toLowerCase()));
                      setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{
                        ...ss,school:t,
                        sos_label:m?m.label:ss.sos_label,
                        sos_rank:m?String(m.rank||''):ss.sos_rank,
                        sos_mag:m?String(m.mag||''):ss.sos_mag
                      }:ss)}));
                      setDdOpen(false);
                      setActiveIdx(-1);
                    };
                    return (
                      <div style={{marginBottom:10,position:'relative'}}>
                        <label style={{fontSize:9,color:'#444',letterSpacing:1,display:'block',marginBottom:4}}>COLLEGE</label>
                        <input
                          type="text"
                          value={schoolVal}
                          onChange={e=>{setSeason(idx,'school',e.target.value);setDdOpen(true);setActiveIdx(-1);}}
                          onFocus={()=>{setDdOpen(true);setActiveIdx(-1);}}
                          onBlur={()=>setTimeout(()=>{setDdOpen(false);setActiveIdx(-1);},150)}
                          onKeyDown={e=>{
                            if(!suggestions.length) return;
                            if(e.key==='ArrowDown'){e.preventDefault();setDdOpen(true);setActiveIdx(Math.min(activeIdx+1,suggestions.length-1));}
                            else if(e.key==='ArrowUp'){e.preventDefault();setActiveIdx(Math.max(activeIdx-1,0));}
                            else if(e.key==='Enter'){if(activeIdx>=0&&activeIdx<suggestions.length){e.preventDefault();pickSchool(suggestions[activeIdx]);}}
                            else if(e.key==='Escape'){setDdOpen(false);setActiveIdx(-1);}
                          }}
                          placeholder="Start typing (e.g. Tex)"
                          autoComplete="off"
                          style={{width:'100%',boxSizing:'border-box',background:'#0d1421',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'#ccc',padding:'7px 11px',fontSize:11,fontFamily:'monospace',outline:'none'}}
                        />
                        {suggestions.length>0&&(
                          <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#131a24',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'0 0 7px 7px',zIndex:50,maxHeight:200,overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                            {suggestions.map((t,sIdx)=>(
                              <div key={t}
                                onMouseDown={e=>{
                                  e.preventDefault();
                                  pickSchool(t);
                                }}
                                style={{padding:'7px 12px',fontSize:11,color:t==='Other (FCS/Lower)'?'#f0873a':'#ccc',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',fontFamily:'monospace',background:sIdx===activeIdx?'rgba(240,192,64,0.08)':'transparent'}}
                                onMouseEnter={()=>setActiveIdx(sIdx)}>
                                {(()=>{
                                  const q=schoolVal.toLowerCase();
                                  const tl=t.toLowerCase();
                                  const i=tl.indexOf(q);
                                  if(i<0) return t;
                                  return <>{t.slice(0,i)}<span style={{color:'#f0c040',fontWeight:700}}>{t.slice(i,i+schoolVal.length)}</span>{t.slice(i+schoolVal.length)}</>;
                                })()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {s.school === "Other (FCS/Lower)" && (
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:8,color:"#444",letterSpacing:1,display:"block",marginBottom:3}}>MANUAL SCHOOL NAME</label>
                    <input
                      type="text"
                      value={s.school_other || ""}
                      onChange={e=>setSeason(idx,"school_other",e.target.value)}
                      placeholder="Type full school name"
                      autoComplete="off"
                      style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:7,color:"#e0e0e0",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}
                    />
                  </div>
                )}
                {/* SoS auto-lookup — checks SOS_LOOKUP first, then uploaded sosByYear */}
                {(()=>{
                  const yr2=String(s?.yr||'');
                  const sc2=(s?.school||'').toLowerCase().trim();
                  if(!yr2||!sc2) return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7,fontSize:9,color:"#444"}}>
                      Enter Season Year and College above to auto-populate Strength of Schedule.
                    </div>
                  );
                  if(sc2==="other (fcs/lower)"){
                    const applied=s.sos_label==="FCS"&&String(s.sos_rank)==="0"&&String(s.sos_mag)==="0";
                    const applyFcs=()=>setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{...ss,sos_label:"FCS",sos_rank:"0",sos_mag:"0"}:ss)}));
                    const typedSchool=String(s.school_other||"").trim()||"FCS/Lower";
                    const schoolWithYear=typedSchool+(yr2?" '"+String(yr2).slice(-2):"");
                    const badgeColor="#f0873a";
                    return (
                      <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7,fontSize:10,display:"flex",alignItems:"center",gap:10,justifyContent:"space-between"}}>
                        <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",padding:"7px 14px",borderRadius:8,background:badgeColor+"18",border:"1px solid "+badgeColor+"44",minWidth:90,gap:2}}>
                          <span style={{fontSize:10,color:badgeColor,fontWeight:800,letterSpacing:1.2}}>FCS</span>
                          <span style={{fontSize:9,color:"#666",fontWeight:500}}>{schoolWithYear}</span>
                          <span style={{fontSize:10,color:badgeColor,fontWeight:700}}>#0 SOS</span>
                          <span style={{fontSize:9,color:badgeColor,opacity:0.8,fontWeight:600,letterSpacing:0.5}}>mag 0.000</span>
                        </div>
                        {applied
                          ? <span style={{fontSize:9,color:"#5dbf6a88"}}>✓ applied</span>
                          : <button onClick={applyFcs} style={{background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.4)",borderRadius:5,color:"#4da6ff",fontSize:9,padding:"3px 12px",cursor:"pointer",fontFamily:"monospace",whiteSpace:"nowrap"}}>APPLY SoS</button>
                        }
                      </div>
                    );
                  }
                  // Search built-in data first, then uploaded
                  const builtIn=(SOS_LOOKUP[yr2]||[]);
                  const uploaded=Object.values(sosByYear[yr2]||sosByYear[String(Number(yr2)-1)]||{});
                  const pool=[...builtIn,...uploaded];
                  // Exact match first, then starts-with, then contains — prevents "Texas" beating "North Texas"
                  const match2=pool.find(d=>d.team.toLowerCase()===sc2)
                    ||pool.find(d=>d.team.toLowerCase().startsWith(sc2)&&sc2.length>3)
                    ||pool.find(d=>sc2.startsWith(d.team.toLowerCase())&&d.team.length>3)
                    ||pool.find(d=>d.team.toLowerCase().includes(sc2)&&sc2.length>4);
                  if(!match2) return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(240,135,58,0.05)",border:"1px solid rgba(240,135,58,0.2)",borderRadius:7,fontSize:9,color:"#f0873a"}}>
                      No SoS data found for "{s.school}" in {yr2}. Upload a new SoS season or check the school name spelling.
                    </div>
                  );
                  const applied=s.sos_label===match2.label&&String(s.sos_rank)===String(match2.rank||'');
                  const applyMatch=()=>setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{...ss,sos_label:match2.label,sos_rank:String(match2.rank||''),sos_mag:String(match2.mag||'')}:ss)}));
                  return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:applied?"rgba(93,191,106,0.06)":"rgba(77,166,255,0.06)",border:"1px solid "+(applied?"rgba(93,191,106,0.22)":"rgba(77,166,255,0.2)"),borderRadius:7,fontSize:10,display:"flex",alignItems:"center",gap:10,justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14}}>📊</span>
                        <div style={{color:applied?"#5dbf6a":"#4da6ff"}}>
                          <strong>{match2.team}</strong> · {yr2}
                          <span style={{marginLeft:8,padding:"2px 8px",background:applied?"rgba(93,191,106,0.12)":"rgba(77,166,255,0.12)",borderRadius:4,fontSize:9,fontWeight:700}}>{match2.label}</span>
                          <span style={{color:applied?"#5dbf6a88":"#4da6ff88",marginLeft:8,fontSize:9}}>Rank #{match2.rank} · Mag {match2.mag?.toFixed(3)}</span>
                        </div>
                      </div>
                      {applied
                        ? <span style={{fontSize:9,color:"#5dbf6a88"}}>✓ applied</span>
                        : <button onClick={applyMatch} style={{background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.4)",borderRadius:5,color:"#4da6ff",fontSize:9,padding:"3px 12px",cursor:"pointer",fontFamily:"monospace",whiteSpace:"nowrap"}}>APPLY SoS</button>
                      }
                    </div>
                  );
                })()}
                {(()=>{
                  const breakdown = calcSeasonProdBreakdown(
                    {
                      ...s,
                      conference: s.conference || s.conf || form.conference,
                    },
                    form.conference
                  );
                  if (!breakdown.hasAny) return null;
                  const rushPlacement = getSeasonScorePlacement(s.n || idx + 1, "rush", breakdown.rushScore, selectedPlayer || null);
                  const recvPlacement = getSeasonScorePlacement(s.n || idx + 1, "recv", breakdown.recvScore, selectedPlayer || null);
                  const adjPlacement = getSeasonScorePlacement(s.n || idx + 1, "adj", breakdown.adjProd, selectedPlayer || null);
                  return (
                    <div style={{marginBottom:10,padding:"8px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7}}>
                      <div style={{fontSize:8,color:"#555",letterSpacing:1,marginBottom:6}}>LIVE SEASON SCORES</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(90px,1fr))",gap:8}}>
                        <div style={{fontSize:9,color:"#f0873a"}}>
                          Rush <strong style={{fontSize:11}}>{breakdown.rushScore.toFixed(1)}</strong>
                          {rushPlacement&&<span style={{marginLeft:6,fontSize:8,color:rushPlacement.color,fontWeight:700}}>{"#"+rushPlacement.rank+"/"+rushPlacement.total}</span>}
                        </div>
                        <div style={{fontSize:9,color:"#5dbf6a"}}>
                          Recv <strong style={{fontSize:11}}>{breakdown.recvScore.toFixed(1)}</strong>
                          {recvPlacement&&<span style={{marginLeft:6,fontSize:8,color:recvPlacement.color,fontWeight:700}}>{"#"+recvPlacement.rank+"/"+recvPlacement.total}</span>}
                        </div>
                        <div style={{fontSize:9,color:"#4da6ff"}}>
                          Adj (SoS) <strong style={{fontSize:11}}>{breakdown.adjProd.toFixed(1)}</strong>
                          {adjPlacement&&<span style={{marginLeft:6,fontSize:8,color:adjPlacement.color,fontWeight:700}}>{"#"+adjPlacement.rank+"/"+adjPlacement.total}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* ── Rushing ── */}
                <div style={{fontSize:10,color:"#f0873a",letterSpacing:1,margin:"8px 0 10px"}}>— RUSHING —</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"0 10px"}}>
                  {sInp(idx,"Attempts","attempts","","number")}
                  {sInp(idx,"Rush Yards","rush_yds","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const yds=parseFloat(s.rush_yds);
                    const val=(!isNaN(att)&&att>0&&!isNaN(yds))?yds/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "Y/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>Y/Attempt <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.rush_yds} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {sInp(idx,"Rush TDs","rush_tds","","number")}
                  {sInp(idx,"Fumbles","fumbles","","number")}
                  {sInp(idx,"PFF Run Grade","run_grade","0–100","number")}
                  {sInp(idx,"YCO (Yds After Contact)","yco_a","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const yco=parseFloat(s.yco_a);
                    const val=(!isNaN(att)&&att>0&&!isNaN(yco))?yco/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "YCO/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>YCO/Attempt <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.yco_a} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {/* MTF raw + MTF/A auto */}
                  {sInp(idx,"MTF (Missed Tackles)","mtf","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const mtf=parseFloat(s.mtf);
                    const val=(!isNaN(att)&&att>0&&!isNaN(mtf))?mtf/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "MTF/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>MTF/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.mtf} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {/* 10+ raw + 10+/A auto */}
                  {sInp(idx,"10+ Yd Runs","ten_plus","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const tp=parseFloat(s.ten_plus);
                    const val=(!isNaN(att)&&att>0&&!isNaN(tp))?tp/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "10+/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>10+/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.ten_plus} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {/* 15+ raw + 15+/A auto */}
                  {sInp(idx,"15+ Yd Runs","fif_plus","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const fp=parseFloat(s.fif_plus);
                    const val=(!isNaN(att)&&att>0&&!isNaN(fp))?fp/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "15+/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>15+/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.fif_plus} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {sInp(idx,"BAY (Breakaway Yds)","bay","","number")}
                  {(()=>{
                    const bay=parseFloat(s.bay); const ryds=parseFloat(s.rush_yds);
                    const val=(!isNaN(bay)&&!isNaN(ryds)&&ryds>0)?bay/ryds*100:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "BAY%", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>BAY% <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2)+"%":<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.bay} ÷ {s.rush_yds} × 100 = {val.toFixed(2)}%</div>}
                      </div>
                    );
                  })()}
                  {/* 1Ds raw + 1D/A auto */}
                  {sInp(idx,"1Ds (First Downs)","first_downs","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const fd=parseFloat(s.first_downs);
                    const val=(!isNaN(att)&&att>0&&!isNaN(fd))?fd/att:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "1D/A", val) : null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>1D/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={autoBoxStyle}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.first_downs} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {sInp(idx,"ELU (PFF Elusiveness)","elu","","number")}
                  {sInp(idx,"Yds Dominator %","ydom","","number")}
                  {sInp(idx,"TD Dominator %","tddom","","number")}
                </div>
                {/* ── Receiving ── */}
                <div style={{fontSize:10,color:"#5dbf6a",letterSpacing:1,margin:"8px 0 10px"}}>— RECEIVING —</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"0 10px"}}>
                  {sInp(idx,"Targets","targets","","number")}
                  {sInp(idx,"Receptions","receptions","","number")}
                  {(()=>{
                    const tgt=parseFloat(s.targets),rec=parseFloat(s.receptions);
                    const val=(!isNaN(tgt)&&tgt>0&&!isNaN(rec))?rec/tgt*100:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "REC%", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>REC% <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2)+"%":<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.receptions} ÷ {s.targets} × 100 = {val.toFixed(2)}%</div>}
                    </div>);
                  })()}
                  {sInp(idx,"Rec Yards","rec_yds","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),ryds=parseFloat(s.rec_yds);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(ryds))?ryds/rec:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "Y/REC", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>Y/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.rec_yds} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {sInp(idx,"Rec TDs","rec_tds","","number")}
                  {sInp(idx,"PFF Recv Grade","recv_grade","0–100","number")}
                  {sInp(idx,"RECV (Receiving Snaps)","recv_snaps","","number")}
                  {sInp(idx,"YAC (Yards After Catch)","yac_raw","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),yac=parseFloat(s.yac_raw);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(yac))?yac/rec:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "YAC/REC", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>YAC/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.yac_raw} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {(()=>{
                    const recv=parseFloat(s.recv_snaps),ryds=parseFloat(s.rec_yds);
                    const val=(!isNaN(recv)&&recv>0&&!isNaN(ryds))?ryds/recv:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "Y/RR", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>Y/RR <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.rec_yds} ÷ {s.recv_snaps} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {sInp(idx,"ADOT (Avg Depth of Target)","adot","","number")}
                  {sInp(idx,"MTF (Missed Tackles)","mtf_recv","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),mtf=parseFloat(s.mtf_recv);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(mtf))?mtf/rec:null;
                    const pctMeta = val!=null ? getModalStatPercentileMetaByStatKey(s, s.n || idx + 1, "MTF/REC", val) : null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>MTF/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={autoBoxStyle}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {pctMeta&&<MiniInputPctBar pct={pctMeta.pct} inverted={pctMeta.inverted} />}
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.mtf_recv} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                </div></div>)
}</div>
            ))}
          </div>
        )}

        {/* Step 2: Athletic */}
        {step === 2 && form && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:12}}>
              {inp("Height (in)","height","e.g. 72.5")}
              {inp("Weight (lbs)","weight","e.g. 220")}
              {inp("Arm Length (in)","arm","e.g. 31.2")}
              {inp("Hand Size (in)","hand","e.g. 9.5")}
              {inp("Wingspan (in)","wing","e.g. 75.5")}
              {inp("40-Yard Dash (sec)","forty","e.g. 4.51")}
              {inp("10-Yard Split (sec)","ten_split","e.g. 1.56")}
              {inp("Vertical Jump (in)","vert","e.g. 35")}
              {inp("Broad Jump (in)","broad","e.g. 122")}
              {inp("3-Cone Drill (sec)","three_cone","e.g. 7.12")}
              {inp("Shuttle Run (sec)","shuttle","e.g. 4.33")}
              {inp("RAS Score","ras","e.g. 8.45")}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px",alignItems:"end",marginBottom:16}}>
              <div style={{marginBottom:8}}>
                <label style={{fontSize:8,color:"#555",letterSpacing:1,display:"block",marginBottom:3}}>PFF BIG BOARD CLASS RANK (1-50)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={form.pff_board_rank || ""}
                  onChange={e => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setForm(f => ({ ...f, pff_board_rank: "", pff_score: "" }));
                      return;
                    }
                    const digits = raw.replace(/[^0-9]/g, "");
                    if (!digits) return;
                    const bounded = Math.min(50, Math.max(1, Number(digits)));
                    const nextRank = String(bounded);
                    const nextScore = pffScoreFromBoardRank(nextRank);
                    setForm(f => ({ ...f, pff_board_rank: nextRank, pff_score: nextScore }));
                  }}
                  placeholder="e.g. 12"
                  style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:7,color:"#e0e0e0",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}
                />
              </div>
              <div style={{marginBottom:8}}>
                <label style={{fontSize:8,color:"#555",letterSpacing:1,display:"block",marginBottom:3}}>PFF BIG BOARD SCORE (AUTO)</label>
                <input
                  type="text"
                  value={pffScoreFromBoardRank(form.pff_board_rank) || ""}
                  readOnly
                  placeholder="Auto from rank"
                  style={{width:"100%",boxSizing:"border-box",background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:7,color:"#4da6ff",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Recruiting */}
        {step === 3 && form && (
          <div>
            {/* Transfer section — auto-detected from seasons */}
            {derivedTransfers.count>0&&(
              <div style={{fontSize:10,color:"#8eaed0",margin:"0 0 12px",letterSpacing:1,fontWeight:700}}>PORTAL TRANSFERS</div>
            )}
            {derivedTransfers.count>0 ? (
              <div style={{display:"grid",gap:10,marginBottom:16}}>
                {derivedTransfers.moves.map((mv, i) => (
                  <div key={i} style={{background:"rgba(77,166,255,0.08)",border:"1px solid rgba(77,166,255,0.2)",borderRadius:8,padding:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div>
                        <label style={{fontSize:8,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:3}}>TRANSFER YEAR</label>
                        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,padding:"8px 10px",fontSize:11,color:"#ccc",fontFamily:"monospace"}}>
                          {mv.year}
                        </div>
                      </div>
                      <div>
                        <label style={{fontSize:8,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:3}}>TRANSFERRED TO</label>
                        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,padding:"8px 10px",fontSize:11,color:"#ccc",fontFamily:"monospace"}}>
                          {mv.school}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Recruiting info section */}
            <div style={{fontSize:10,color:"#8eaed0",margin:"0 0 12px",letterSpacing:1,fontWeight:700}}>RECRUITING INFO</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12}}>
              {inp("Star Rating","recruit_stars","1-5")}
              {inp("Recruit Grade","recruit_rating","e.g. 89.5")}
              {inp("National Rank","recruit_nat","e.g. 42")}
              {inp("Position Rank","recruit_pos","e.g. 12")}
              {inp("State Rank","recruit_state","e.g. 5")}
              {inp("Recruit Year","recruit_year","e.g. 2020")}
            </div>
            <div style={{marginBottom:10,marginTop:12,position:"relative"}}>
              <label style={{fontSize:9,color:"#444",letterSpacing:1,display:"block",marginBottom:4}}>COMMITTED SCHOOL</label>
              {(()=>{
                const allTeams=[...new Set(Object.values(SOS_LOOKUP).flat().map(t=>t.team))].sort();
                allTeams.push("Other (FCS/Lower)");
                const rv=form.recruit_school||"";
                const rvLow=rv.toLowerCase();
                const rcSugg=rv.length>=1&&rcOpen?allTeams.filter(t=>t.toLowerCase().includes(rvLow)).slice(0,8):[];
                return(<>
                  <input
                    type="text"
                    value={rv}
                    onChange={e=>{set("recruit_school",e.target.value);setRcOpen(true);setRcActiveIdx(-1);}}
                    onFocus={()=>{setRcOpen(true);setRcActiveIdx(-1);}}
                    onBlur={()=>setTimeout(()=>{setRcOpen(false);setRcActiveIdx(-1);},150)}
                    onKeyDown={e=>{
                      if(!rcSugg.length) return;
                      if(e.key==='ArrowDown'){e.preventDefault();setRcOpen(true);setRcActiveIdx(i=>Math.min(i+1,rcSugg.length-1));}
                      else if(e.key==='ArrowUp'){e.preventDefault();setRcActiveIdx(i=>Math.max(i-1,0));}
                      else if(e.key==='Enter'){if(rcActiveIdx>=0&&rcActiveIdx<rcSugg.length){e.preventDefault();set("recruit_school",rcSugg[rcActiveIdx]);setRcOpen(false);setRcActiveIdx(-1);}}
                      else if(e.key==='Escape'){setRcOpen(false);setRcActiveIdx(-1);}
                    }}
                    placeholder="Start typing school name..."
                    autoComplete="off"
                    style={{width:"100%",boxSizing:"border-box",background:"#0d1421",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,color:"#ccc",padding:"6px 9px",fontSize:10,fontFamily:"monospace",outline:"none"}}
                  />
                  {rcSugg.length>0&&(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#131a24",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"0 0 7px 7px",zIndex:50,maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                      {rcSugg.map((t,sIdx)=>(
                        <div key={t} onMouseDown={e=>{e.preventDefault();set("recruit_school",t);setRcOpen(false);}}
                          style={{padding:"7px 12px",fontSize:11,color:t==="Other (FCS/Lower)"?"#f0873a":"#ccc",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.04)",fontFamily:"monospace",background:sIdx===rcActiveIdx?"rgba(240,192,64,0.08)":"transparent"}}
                          onMouseEnter={()=>setRcActiveIdx(sIdx)}>
                          {(()=>{const i=t.toLowerCase().indexOf(rvLow);if(i<0||!rvLow)return t;return<>{t.slice(0,i)}<span style={{color:"#f0c040",fontWeight:700}}>{t.slice(i,i+rv.length)}</span>{t.slice(i+rv.length)}</>;})()}
                        </div>
                      ))}
                    </div>
                  )}
                </>);
              })()}
            </div>
            {form.recruit_school === "Other (FCS/Lower)" && (
              <div style={{marginBottom:16}}>
                <label style={{fontSize:9,color:"#444",letterSpacing:1,display:"block",marginBottom:4}}>MANUAL SCHOOL NAME{errors.recruit_school_other&&<span style={{color:"#e05050",marginLeft:8}}>{errors.recruit_school_other}</span>}</label>
                <input
                  type="text"
                  value={form.recruit_school_other || ""}
                  onChange={e=>{ set("recruit_school_other",e.target.value); if (errors.recruit_school_other) setErrors(prev=>({ ...prev, recruit_school_other: undefined })); }}
                  placeholder="Type full school name"
                  autoComplete="off"
                  style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid "+(errors.recruit_school_other?"#e05050":"rgba(255,255,255,0.10)"),borderRadius:7,color:"#e0e0e0",padding:"6px 9px",fontSize:10,outline:"none",fontFamily:"monospace"}}
                />
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && form && originalPlayer && originalScore && previewScore && (
          <div>
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:16,marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4}}>{form.name}</div>
              <div style={{fontSize:10,color:"#666"}}>{form.school} · {form.conference} · {form.draft_class} class</div>
              {form.draft_round && <div style={{fontSize:10,color:"#f0c040",marginTop:4}}>Rd {form.draft_round}{form.draft_pick?" · Pick "+form.draft_pick:""}</div>}
            </div>

            <div style={{fontSize:10,color:"#8eaed0",margin:"16px 0 12px",letterSpacing:1,fontWeight:700}}>SCORE COMPARISON</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:16}}>
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:12}}>
                <div style={{fontSize:9,color:"#666",letterSpacing:1,marginBottom:6}}>PRODUCTION TRAJECTORY</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:16,fontWeight:700,color:"#f0c040"}}>{originalScore.prod_trajectory}</div>
                  <div style={{fontSize:12,color:"#666"}}>→</div>
                  <div style={{fontSize:16,fontWeight:700,color:"#4da6ff"}}>{previewScore.prod_trajectory}</div>
                  {originalScore.prod_trajectory !== previewScore.prod_trajectory && (
                    <div style={{marginLeft:"auto",fontSize:10,padding:"2px 8px",background:previewScore.prod_trajectory>originalScore.prod_trajectory?"rgba(93,191,106,0.12)":"rgba(224,80,80,0.12)",color:previewScore.prod_trajectory>originalScore.prod_trajectory?"#5dbf6a":"#e05050",borderRadius:4}}>
                      {previewScore.prod_trajectory>originalScore.prod_trajectory?"+":""}{(previewScore.prod_trajectory - originalScore.prod_trajectory).toFixed(1)}
                    </div>
                  )}
                </div>
                <details style={{marginTop:8}}>
                  <summary style={{fontSize:9,color:"#8eaed0",cursor:"pointer"}}>Formula</summary>
                  <div style={{fontSize:8,color:"#666",marginTop:6,lineHeight:1.5}}>
                    PROD = weighted average of season production scores using year weights [25, 28, 30, 28, 25].
                  </div>
                </details>
              </div>

              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:12}}>
                <div style={{fontSize:9,color:"#666",letterSpacing:1,marginBottom:6}}>ATHLETIC SCORE</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:16,fontWeight:700,color:"#f0c040"}}>{originalScore.athl_score}</div>
                  <div style={{fontSize:12,color:"#666"}}>→</div>
                  <div style={{fontSize:16,fontWeight:700,color:"#4da6ff"}}>{previewScore.athl_score}</div>
                  {originalScore.athl_score !== previewScore.athl_score && (
                    <div style={{marginLeft:"auto",fontSize:10,padding:"2px 8px",background:previewScore.athl_score>originalScore.athl_score?"rgba(93,191,106,0.12)":"rgba(224,80,80,0.12)",color:previewScore.athl_score>originalScore.athl_score?"#5dbf6a":"#e05050",borderRadius:4}}>
                      {previewScore.athl_score>originalScore.athl_score?"+":""}{(previewScore.athl_score - originalScore.athl_score).toFixed(1)}
                    </div>
                  )}
                </div>
                <details style={{marginTop:8}}>
                  <summary style={{fontSize:9,color:"#8eaed0",cursor:"pointer"}}>Formula</summary>
                  <div style={{fontSize:8,color:"#666",marginTop:6,lineHeight:1.5}}>
                    ATHL base = (40-score * 0.50) + (vert-score * 0.30) + (weight-score * 0.20).<br/>
                    ATHL final = clamp(ATHL base * RAS multiplier, 0, 100).
                  </div>
                </details>
              </div>

              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:12}}>
                <div style={{fontSize:9,color:"#666",letterSpacing:1,marginBottom:6}}>PFF GRADE</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:16,fontWeight:700,color:"#f0c040"}}>{originalScore.pff_score}</div>
                  <div style={{fontSize:12,color:"#666"}}>→</div>
                  <div style={{fontSize:16,fontWeight:700,color:"#4da6ff"}}>{previewScore.pff_score}</div>
                  {originalScore.pff_score !== previewScore.pff_score && (
                    <div style={{marginLeft:"auto",fontSize:10,padding:"2px 8px",background:previewScore.pff_score>originalScore.pff_score?"rgba(93,191,106,0.12)":"rgba(224,80,80,0.12)",color:previewScore.pff_score>originalScore.pff_score?"#5dbf6a":"#e05050",borderRadius:4}}>
                      {previewScore.pff_score>originalScore.pff_score?"+":""}{(previewScore.pff_score - originalScore.pff_score).toFixed(1)}
                    </div>
                  )}
                </div>
                <details style={{marginTop:8}}>
                  <summary style={{fontSize:9,color:"#8eaed0",cursor:"pointer"}}>Formula</summary>
                  <div style={{fontSize:8,color:"#666",marginTop:6,lineHeight:1.5}}>
                    PFF score = round((1 - (rank - 1) * 0.02) * 100), with rank in [1, 50].
                  </div>
                </details>
              </div>

              <div style={{background:"rgba(77,166,255,0.08)",border:"2px solid rgba(77,166,255,0.2)",borderRadius:8,padding:12,position:"relative"}}>
                <div style={{fontSize:9,color:"rgba(77,166,255,0.8)",letterSpacing:1,marginBottom:6,fontWeight:700}}>PROSPECT SCORE</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:16,fontWeight:700,color:"#f0c040"}}>{originalScore.prospect_score}</div>
                  <div style={{fontSize:12,color:"#666"}}>→</div>
                  <div style={{fontSize:16,fontWeight:900,color:"#4da6ff"}}>{previewScore.prospect_score}</div>
                </div>
                <div style={{fontSize:8,color:"rgba(77,166,255,0.7)",marginTop:4}}>Tier: <strong>{previewScore.tier}</strong></div>
                {originalScore.prospect_score !== previewScore.prospect_score && (
                  <div style={{position:"absolute",top:12,right:12,fontSize:11,padding:"3px 10px",background:previewScore.prospect_score>originalScore.prospect_score?"rgba(93,191,106,0.12)":"rgba(224,80,80,0.12)",color:previewScore.prospect_score>originalScore.prospect_score?"#5dbf6a":"#e05050",borderRadius:5,fontWeight:700}}>
                    {previewScore.prospect_score>originalScore.prospect_score?"+":""}{(previewScore.prospect_score - originalScore.prospect_score).toFixed(1)}
                  </div>
                )}
                <details style={{marginTop:8}}>
                  <summary style={{fontSize:9,color:"#8eaed0",cursor:"pointer"}}>Formula</summary>
                  <div style={{fontSize:8,color:"#666",marginTop:6,lineHeight:1.5}}>
                    Raw = (PROD * 0.75) + (ATHL * 0.10) + (PFF * 0.15).<br/>
                    Final = min(100, (Raw * 0.85) + 12).
                  </div>
                </details>
              </div>
            </div>

            <div style={{fontSize:10,color:"#8eaed0",margin:"16px 0 12px",letterSpacing:1,fontWeight:700}}>NOTE</div>
            <div style={{background:"rgba(240,192,64,0.05)",border:"1px solid rgba(240,192,64,0.15)",borderRadius:8,padding:12,marginBottom:16,fontSize:10,color:"#ccc",lineHeight:1.6}}>
              <strong style={{color:"#f0c040"}}>Ready to save?</strong> Click "SAVE EDITS" below to update this player with your changes. All metrics will be recalculated and preserved.
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:24,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <button onClick={step===0?onClose:back}
            style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:8,color:"#666",padding:"9px 20px",fontSize:10,letterSpacing:1,fontFamily:"monospace"}}>
            {step===0?"CANCEL":"← BACK"}
          </button>
          {step<4
            ? <button onClick={next} disabled={step===0&&!selectedPlayer}
              style={{background:step===0&&!selectedPlayer?"rgba(240,192,64,0.06)":"rgba(240,192,64,0.12)",border:"1px solid rgba(240,192,64,0.35)",borderRadius:8,color:step===0&&!selectedPlayer?"#666":"#f0c040",padding:"9px 20px",fontSize:10,letterSpacing:1,fontWeight:700,fontFamily:"monospace",cursor:step===0&&!selectedPlayer?"default":"pointer"}}>
                NEXT →
              </button>
            : <button onClick={handleSave}
              style={{background:"rgba(93,191,106,0.15)",border:"1px solid rgba(93,191,106,0.4)",borderRadius:8,color:"#5dbf6a",padding:"9px 24px",fontSize:11,letterSpacing:1,fontWeight:700,fontFamily:"monospace"}}>
                ✓ SAVE EDITS
              </button>
          }
        </div>

        {showSaved && (
          <div style={{position:"fixed",bottom:20,right:20,background:"#1a3a2a",border:"1px solid #5dbf6a",borderRadius:8,padding:"12px 16px",color:"#5dbf6a",fontSize:11,fontFamily:"monospace",fontWeight:700,letterSpacing:1}}>
            ✓ PLAYER UPDATED
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectionClassConfirmModal({currentProjectionClass, playerCount, onClose, onContinue}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.84)",zIndex:10020,display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
      <div style={{width:"100%",maxWidth:520,background:"#0f1422",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"22px 22px 20px",fontFamily:"monospace"}}>
        <div style={{fontSize:10,color:"#555",letterSpacing:2,marginBottom:8}}>CLASS CLOSEOUT</div>
        <div style={{fontSize:20,fontWeight:900,color:"#fff",marginBottom:10}}>Advance {currentProjectionClass} To The Next Class</div>
        <div style={{fontSize:11,color:"#8891a6",lineHeight:1.7,marginBottom:10}}>
          Are you sure? This will change all {currentProjectionClass} players to no longer be projections.
        </div>
        <div style={{fontSize:10,color:"#4da6ff",marginBottom:18}}>{playerCount} projected player{playerCount===1?"":"s"} currently assigned to this class.</div>
        <div style={{display:"flex",justifyContent:"space-between",gap:10}}>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#777",padding:"10px 16px",fontSize:10,letterSpacing:1,fontFamily:"monospace",cursor:"pointer"}}>NO</button>
          <button onClick={onContinue} style={{background:"rgba(240,192,64,0.14)",border:"1px solid rgba(240,192,64,0.35)",borderRadius:8,color:"#f0c040",padding:"10px 16px",fontSize:10,letterSpacing:1,fontFamily:"monospace",fontWeight:700,cursor:"pointer"}}>YES, REVIEW CLASS</button>
        </div>
      </div>
    </div>
  );
}

function ProjectionClassCloseoutModal({currentProjectionClass, players, onClose, onConfirm}) {
  const initialEntries = React.useMemo(() => {
    const next = {};
    (players || []).forEach(({name, data}) => {
      const storedRound = data?.draft_round ?? data?.nfl?.draft_round ?? "";
      const storedPick = data?.draft_pick ?? data?.nfl?.draft_pick ?? "";
      const undrafted = String(storedRound || "") === "UDFA";
      next[name] = {
        draft_round: undrafted ? "" : (storedRound !== "" && storedRound != null ? String(storedRound) : ""),
        draft_pick: storedPick !== "" && storedPick != null ? String(storedPick) : "",
        undrafted,
      };
    });
    return next;
  }, [players]);

  const [entries, setEntries] = useState(initialEntries);

  React.useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const setEntry = (name, patch) => {
    setEntries((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || {}),
        ...patch,
      },
    }));
  };

  const unresolvedPlayers = React.useMemo(() => {
    return (players || []).filter(({name}) => {
      const entry = entries[name] || {};
      const draftRound = String(entry.draft_round || "").trim();
      const draftPick = Number(entry.draft_pick);
      const hasDraftRound = /^[1-7]$/.test(draftRound);
      const hasDraftPick = Number.isFinite(draftPick) && draftPick > 0;
      return !(entry.undrafted || (hasDraftRound && hasDraftPick));
    });
  }, [players, entries]);

  const readyToConfirm = unresolvedPlayers.length === 0;
  const nextProjectionClass = String((Number(currentProjectionClass) || 2026) + 1);
  const resolvedCount = (players || []).length - unresolvedPlayers.length;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:10030,display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
      <div style={{width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",background:"#0f1422",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"22px 22px 20px",fontFamily:"monospace"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:16}}>
          <div>
            <div style={{fontSize:10,color:"#555",letterSpacing:2,marginBottom:6}}>CLASS CLOSEOUT REVIEW</div>
            <div style={{fontSize:20,fontWeight:900,color:"#fff",marginBottom:6}}>{currentProjectionClass} Draft Designations</div>
            <div style={{fontSize:11,color:"#8891a6",lineHeight:1.7}}>Every player must have both draft round and pick entered, or be marked undrafted, before the class can advance to {nextProjectionClass}.</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#777",padding:"8px 12px",fontSize:10,letterSpacing:1,fontFamily:"monospace",cursor:"pointer"}}>CLOSE</button>
        </div>

        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
          <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(77,166,255,0.08)",border:"1px solid rgba(77,166,255,0.25)",fontSize:10,color:"#4da6ff"}}>TOTAL {players.length}</div>
          <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(93,191,106,0.08)",border:"1px solid rgba(93,191,106,0.25)",fontSize:10,color:"#5dbf6a"}}>READY {resolvedCount}</div>
          <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(224,80,80,0.08)",border:"1px solid rgba(224,80,80,0.25)",fontSize:10,color:"#e05050"}}>MISSING {unresolvedPlayers.length}</div>
        </div>

        {players.length === 0 && (
          <div style={{padding:"14px 16px",borderRadius:10,background:"rgba(93,191,106,0.08)",border:"1px solid rgba(93,191,106,0.25)",fontSize:11,color:"#5dbf6a",marginBottom:16}}>
            No active projection players are assigned to the {currentProjectionClass} class. You can advance directly to {nextProjectionClass}.
          </div>
        )}

        {players.length > 0 && unresolvedPlayers.length === 0 && (
          <div style={{padding:"14px 16px",borderRadius:10,background:"rgba(93,191,106,0.08)",border:"1px solid rgba(93,191,106,0.25)",fontSize:11,color:"#5dbf6a",marginBottom:16}}>
            Every {currentProjectionClass} player has a final draft designation. Advancing will convert them to historical players and set new projections to {nextProjectionClass} by default.
          </div>
        )}

        {unresolvedPlayers.map(({name, data}) => {
          const entry = entries[name] || {};
          return (
            <div key={name} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"14px 14px 12px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:10}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{name}</div>
                  <div style={{fontSize:10,color:"#666",marginTop:4}}>#{data?.rank || "—"} · {data?.school || data?.seasons?.[0]?.school || "Unknown school"}</div>
                </div>
                <div style={{fontSize:10,color:"#e05050",letterSpacing:1}}>MISSING DESIGNATION</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"end"}}>
                <div>
                  <label style={{fontSize:8,color:"#555",letterSpacing:1,display:"block",marginBottom:4}}>DRAFT ROUND</label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={entry.draft_round || ""}
                    onChange={(e) => setEntry(name, {draft_round: e.target.value, undrafted: false})}
                    disabled={!!entry.undrafted}
                    placeholder="1-7"
                    style={{width:"100%",boxSizing:"border-box",background:entry.undrafted?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,color:entry.undrafted?"#555":"#e0e0e0",padding:"8px 10px",fontSize:11,outline:"none",fontFamily:"monospace"}}
                  />
                </div>
                <div>
                  <label style={{fontSize:8,color:"#555",letterSpacing:1,display:"block",marginBottom:4}}>OVERALL PICK</label>
                  <input
                    type="number"
                    min="1"
                    value={entry.draft_pick || ""}
                    onChange={(e) => setEntry(name, {draft_pick: e.target.value, undrafted: false})}
                    disabled={!!entry.undrafted}
                    placeholder="e.g. 87"
                    style={{width:"100%",boxSizing:"border-box",background:entry.undrafted?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:7,color:entry.undrafted?"#555":"#e0e0e0",padding:"8px 10px",fontSize:11,outline:"none",fontFamily:"monospace"}}
                  />
                </div>
                <button
                  onClick={() => setEntry(name, {undrafted: !entry.undrafted, draft_round: "", draft_pick: ""})}
                  style={{background:entry.undrafted?"rgba(93,191,106,0.14)":"rgba(255,255,255,0.04)",border:"1px solid "+(entry.undrafted?"rgba(93,191,106,0.35)":"rgba(255,255,255,0.1)"),borderRadius:8,color:entry.undrafted?"#5dbf6a":"#aaa",padding:"8px 12px",fontSize:10,letterSpacing:1,fontFamily:"monospace",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}
                >
                  {entry.undrafted ? "UNDRAFTED ✓" : "MARK UNDRAFTED"}
                </button>
              </div>
            </div>
          );
        })}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:18,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:10,color:"#666"}}>{readyToConfirm ? `All players resolved. Advancing will set the current class to ${nextProjectionClass}.` : `Resolve ${unresolvedPlayers.length} remaining player${unresolvedPlayers.length===1?"":"s"} to continue.`}</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#777",padding:"10px 16px",fontSize:10,letterSpacing:1,fontFamily:"monospace",cursor:"pointer"}}>CANCEL</button>
            {readyToConfirm && (
              <button onClick={() => onConfirm(entries)} style={{background:"rgba(93,191,106,0.14)",border:"1px solid rgba(93,191,106,0.35)",borderRadius:8,color:"#5dbf6a",padding:"10px 16px",fontSize:10,letterSpacing:1,fontFamily:"monospace",fontWeight:700,cursor:"pointer"}}>CONFIRM ADVANCEMENT</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const PERSIST_KEY = "rbscout_v6_runtime_data";
  const BACKUP_KEY = "rbscout_v6_runtime_backups";
  const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
  const BACKUP_MAX_ENTRIES = 24;
  const env = (() => {
    const winEnv = typeof window !== "undefined"
      ? (window.__RB_SCOUT_SYNC__ || window.__RB_SCOUT_ENV__ || {})
      : {};
    const procEnv = (typeof globalThis !== "undefined" && globalThis.process && globalThis.process.env)
      ? globalThis.process.env
      : {};
    return { 
      VITE_SUPABASE_URL: "https://qdwqoevprdkhicoxlspj.supabase.co",
      VITE_SUPABASE_ANON_KEY: "sb_publishable_lT5v9RswtxQOpU3nCa6HCg_edj9UaF8",
      VITE_SUPABASE_TABLE: "rb_scout_sync",
      VITE_SUPABASE_ROW_ID: "main",
      ...procEnv,
      ...winEnv 
    };
  })();
  const normalizeSupabaseUrl = (raw) => {
    let s = String(raw).trim();
    if (!s) return "";
    s = s.replace(/^['\"]+|['\"]+$/g, "");
    if (s.startsWith("//")) s = `https:${s}`;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    s = s.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
    return s;
  };
  const SUPABASE_URL = normalizeSupabaseUrl(env.VITE_SUPABASE_URL);
  const normalizeSupabaseKey = (raw) => {
    let s = String(raw).trim();
    if (!s) return "";
    s = s.replace(/^['\"]+|['\"]+$/g, "");
    s = s.replace(/^Bearer\s+/i, "").trim();
    return s;
  };
  const SUPABASE_ANON_KEY = normalizeSupabaseKey(env.VITE_SUPABASE_ANON_KEY);
  const SUPABASE_TABLE = String(env.VITE_SUPABASE_TABLE || "rb_scout_sync").trim();
  const SUPABASE_ROW_ID = String(env.VITE_SUPABASE_ROW_ID || "main").trim();
  const hasValidSupabaseUrl = /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(SUPABASE_URL);
  const keyLooksJwt = /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(SUPABASE_ANON_KEY);
  const keyLooksPublishable = /^sb_publishable_/i.test(SUPABASE_ANON_KEY);
  const keyLooksValid = keyLooksJwt || keyLooksPublishable;
  const supabaseHeaders = {
    apikey: SUPABASE_ANON_KEY,
    ...(keyLooksJwt ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
  };
  const CLOUD_POLL_MS = 12000;
  const CLOUD_PUSH_DEBOUNCE_MS = 1500;
  const readPersistedStore = () => {
    if (typeof window === "undefined" || !window.localStorage) return {};
    try {
      const raw = window.localStorage.getItem(PERSIST_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };
  const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const readLastBackupAt = () => {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(BACKUP_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr) || !arr.length) return null;
      return arr[arr.length - 1]?.takenAt || null;
    } catch {
      return null;
    }
  };
  const persisted = readPersistedStore();

  const isMobile = useIsMobile(860);
  const [query,setQuery]       = useState("");
  const [selected,setSelected] = useState(null);
  const [showVal,setShowVal]   = useState(false);
  const [suggestions,setSugg]  = useState([]);
  const [activeSearchIdx,setActiveSearchIdx] = useState(-1);
  const [tierFilter,setTier]   = useState(null);
  const [classFilter,setClass] = useState(null);
  const [page,setPage]         = useState("prospects"); // "prospects" | "archetypes" | "idealbuild"
  const [rushArchFilter,setRushArch] = useState(null);
  const [recvArchFilter,setRecvArch] = useState(null);
  const [roundFilter,setRoundFilter] = useState(null);
  const [sortBy,setSortBy]           = useState(null);      // null | sort metric key
  const [sortDir,setSortDir]         = useState("desc");    // "asc" | "desc"
  const [showAdd,setShowAdd]         = useState(false);
  const [showEditPlayer,setShowEditPlayer] = useState(false);
  const [showDeletePlayer,setShowDeletePlayer] = useState(false);
  const [showCompare,setShowCompare] = useState(false);
  const [compareSelections,setCompareSelections] = useState(["", "", ""]);
  const [returnToCompare,setReturnToCompare] = useState(false);
  const [customPlayers,setCustom]    = useState(() => asObj(persisted.customPlayers));
  const [playerOverrides,setPlayerOverrides] = useState(() => asObj(persisted.playerOverrides));
  const [customSeasons,setCustomSS]  = useState(() => asObj(persisted.customSeasons));
  const [deletedPlayers,setDeletedPlayers] = useState(() => asObj(persisted.deletedPlayers));
  const [customSoS,setCustomSoS]     = useState(() => asObj(persisted.customSoS)); // {year: {teamName: {rank, mag, label}}}
  const [customFinishSeasons,setCustomFinishSeasons] = useState(() => asObj(persisted.customFinishSeasons)); // {year: {top12:[{name,rank}], top24:[{name,rank}]}}
  const [customSeasonsPlayed,setCustomSeasonsPlayed] = useState(() => asObj(persisted.customSeasonsPlayed)); // {year: {players:[name]}}
  const [currentProjectionClass,setCurrentProjectionClass] = useState(() => String(persisted.currentProjectionClass || "2026"));
  const [showSoS,setShowSoS]         = useState(false);
  const [showFinishSeasons,setShowFinishSeasons] = useState(false);
  const [showSeasonsPlayed,setShowSeasonsPlayed] = useState(false);
  const [showCloseoutConfirm,setShowCloseoutConfirm] = useState(false);
  const [showCloseoutReview,setShowCloseoutReview] = useState(false);
  const [passcodeGate,setPasscodeGate] = useState(null); // null | 'add' | 'edit' | 'delete' | 'sos' | 'finishes' | 'seasons' | 'backup' | 'closeout'
  const [adminUnlocked,setAdminUnlocked] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState(() => readLastBackupAt());
  const [cloudSyncStatus, setCloudSyncStatus] = useState("OFF");
  const [cloudSyncError, setCloudSyncError] = useState("");
  const latestPayloadRef = useRef(null);
  const cloudPushTimerRef = useRef(null);
  const isApplyingCloudRef = useRef(false);
  const lastCloudSeenAtRef = useRef(null);
  const cloudSyncEnabled = !!(hasValidSupabaseUrl && keyLooksValid && SUPABASE_TABLE && SUPABASE_ROW_ID);

  const parseTs = (ts) => {
    const ms = Date.parse(ts || "");
    return Number.isFinite(ms) ? ms : 0;
  };

  const applyRuntimePayload = (payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    isApplyingCloudRef.current = true;
    setCustom(asObj(p.customPlayers));
    setPlayerOverrides(asObj(p.playerOverrides));
    setCustomSS(asObj(p.customSeasons));
    setDeletedPlayers(asObj(p.deletedPlayers));
    setCustomSoS(asObj(p.customSoS));
    setCustomFinishSeasons(asObj(p.customFinishSeasons));
    setCustomSeasonsPlayed(asObj(p.customSeasonsPlayed));
    setCurrentProjectionClass(String(p.currentProjectionClass || "2026"));
    setTimeout(() => { isApplyingCloudRef.current = false; }, 0);
  };

  const fetchCloudRuntime = async () => {
    if (!cloudSyncEnabled) return null;
    const endpoint = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&select=id,payload,updated_at&limit=1`;
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          ...supabaseHeaders,
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        setCloudSyncError(`READ ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
        setCloudSyncStatus("ERROR");
        return undefined;
      }
      const rows = await res.json();
      setCloudSyncError("");
      if (!Array.isArray(rows) || !rows.length) return null;
      setCloudSyncStatus("ON");
      return rows[0];
    } catch {
      setCloudSyncError(`READ failed: network/CORS or invalid URL (${SUPABASE_URL || "missing URL"})`);
      setCloudSyncStatus("ERROR");
      return undefined;
    }
  };

  const upsertCloudRuntime = async (payload) => {
    if (!cloudSyncEnabled) return;
    const endpoint = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?on_conflict=id`;
    const updatedAt = payload?.updatedAt || new Date().toISOString();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...supabaseHeaders,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify([
          {
            id: SUPABASE_ROW_ID,
            payload,
            updated_at: updatedAt,
          },
        ]),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        setCloudSyncError(`WRITE ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
        setCloudSyncStatus("ERROR");
        return;
      }
      lastCloudSeenAtRef.current = updatedAt;
      setCloudSyncError("");
      setCloudSyncStatus("ON");
    } catch {
      // Keep local-first behavior if cloud write fails.
      setCloudSyncError(`WRITE failed: network/CORS or invalid URL (${SUPABASE_URL || "missing URL"})`);
      setCloudSyncStatus("ERROR");
    }
  };

  const buildRuntimePayload = () => ({
    version: "rbscout_v6_runtime_data",
    updatedAt: new Date().toISOString(),
    customPlayers,
    playerOverrides,
    customSeasons,
    deletedPlayers,
    customSoS,
    customFinishSeasons,
    customSeasonsPlayed,
    currentProjectionClass,
  });

  useEffect(() => {
    const merged = { ...customSeasons };
    Object.entries(playerOverrides || {}).forEach(([name, ov]) => {
      if (ov && ov.seasonStats && typeof ov.seasonStats === "object") {
        merged[name] = ov.seasonStats;
      }
    });
    _customSS = merged;
  }, [customSeasons, playerOverrides]);

  useEffect(() => {
    latestPayloadRef.current = buildRuntimePayload();
  }, [customPlayers, playerOverrides, customSeasons, deletedPlayers, customSoS, customFinishSeasons, customSeasonsPlayed, currentProjectionClass]);

  useEffect(() => {
    if (!hasValidSupabaseUrl && String(env.VITE_SUPABASE_URL || "").trim()) {
      setCloudSyncStatus("ERROR");
      setCloudSyncError(`Invalid SUPABASE URL: ${String(env.VITE_SUPABASE_URL).trim()}`);
      return;
    }
    if (!keyLooksValid && String(env.VITE_SUPABASE_ANON_KEY || "").trim()) {
      const raw = String(env.VITE_SUPABASE_ANON_KEY || "").trim();
      setCloudSyncStatus("ERROR");
      setCloudSyncError(`Invalid API key format. Use anon JWT (eyJ...) or publishable key (sb_publishable_...). Current: ${raw.slice(0, 24)}...`);
      return;
    }
    if (!cloudSyncEnabled) {
      setCloudSyncStatus("OFF");
      setCloudSyncError("");
    }
    if (!cloudSyncEnabled) return;
    setCloudSyncError("");
    setCloudSyncStatus("SYNCING");
    let cancelled = false;

    const pullCloud = async () => {
      const row = await fetchCloudRuntime();
      if (cancelled) return;
      if (typeof row === "undefined") return;

      // Seed cloud once from local state when no shared record exists.
      if (!row) {
        const localPayload = latestPayloadRef.current || buildRuntimePayload();
        await upsertCloudRuntime(localPayload);
        return;
      }

      const cloudUpdatedAt = row.updated_at || row?.payload?.updatedAt || null;
      const localUpdatedAt = latestPayloadRef.current?.updatedAt || persisted?.updatedAt || null;
      const newerThanLocal = parseTs(cloudUpdatedAt) > parseTs(localUpdatedAt);
      const newerThanLastSeen = parseTs(cloudUpdatedAt) > parseTs(lastCloudSeenAtRef.current);

      if (newerThanLocal && newerThanLastSeen && row.payload && typeof row.payload === "object") {
        lastCloudSeenAtRef.current = cloudUpdatedAt;
        applyRuntimePayload(row.payload);
      }
    };

    pullCloud();
    const pollId = window.setInterval(pullCloud, CLOUD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [cloudSyncEnabled]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;

    const writeBackup = (reason) => {
      try {
        const payload = latestPayloadRef.current || buildRuntimePayload();
        const payloadJson = JSON.stringify(payload);
        const existingRaw = window.localStorage.getItem(BACKUP_KEY);
        const existing = existingRaw ? JSON.parse(existingRaw) : [];
        const arr = Array.isArray(existing) ? existing : [];
        const last = arr.length ? arr[arr.length - 1] : null;

        // Skip duplicate snapshots to reduce storage churn.
        if (last && last.payloadJson === payloadJson) return;

        const next = [
          ...arr,
          {
            takenAt: new Date().toISOString(),
            reason,
            payload,
            payloadJson,
          },
        ].slice(-BACKUP_MAX_ENTRIES);

        window.localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
        setLastBackupAt(next[next.length - 1]?.takenAt || null);
      } catch {
        // Ignore backup write errors so app usage is never blocked.
      }
    };

    writeBackup("startup");
    const intervalId = window.setInterval(() => writeBackup("interval"), BACKUP_INTERVAL_MS);
    const onBeforeUnload = () => writeBackup("beforeunload");
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    const payload = buildRuntimePayload();
    try {
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota/storage errors so app interaction is never blocked.
    }

    if (!cloudSyncEnabled || isApplyingCloudRef.current) return;
    if (cloudPushTimerRef.current) window.clearTimeout(cloudPushTimerRef.current);
    cloudPushTimerRef.current = window.setTimeout(() => {
      const latest = latestPayloadRef.current || payload;
      upsertCloudRuntime(latest);
    }, CLOUD_PUSH_DEBOUNCE_MS);

    return () => {
      if (cloudPushTimerRef.current) window.clearTimeout(cloudPushTimerRef.current);
    };
  }, [customPlayers, playerOverrides, customSeasons, deletedPlayers, customSoS, customFinishSeasons, customSeasonsPlayed, currentProjectionClass]);

  const ALL_DATA = useMemo(()=>{
    const mergedBase = {...ALL_PLAYERS,...customPlayers};
    const deletedLookup = asObj(deletedPlayers);
    const merged = {};

    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const rowVal = (row, idx) => {
      const pair = Array.isArray(row) ? row[idx] : null;
      const val = Array.isArray(pair) ? pair[0] : null;
      return toNum(val);
    };
    const calcSeasonComponents = (season) => {
      const breakdown = calcSeasonProdBreakdown(season, season.conference || "Other");
      return {rushScore: breakdown.rushScore, recvScore: breakdown.recvScore, adjScore: breakdown.adjProd};
    };

    const calcAthleticComposite = (player) => {
      const ath = player?.athletic || {};
      const grab = (k, alt=null) => {
        const src = ath[k];
        if (src && typeof src === "object" && src.val != null) return Number(src.val);
        if (src != null && Number.isFinite(Number(src))) return Number(src);
        if (alt) {
          const a = ath[alt];
          if (a && typeof a === "object" && a.val != null) return Number(a.val);
        }
        return null;
      };
      const athl40 = grab("forty", "40T");
      const athlVert = grab("vert");
      const athlWt = grab("weight");
      const athl40Score = athl40 != null ? Math.max(0, Math.min(100, (4.80 - athl40) / 0.40 * 50 + 50)) : 50;
      const athlVertScore = athlVert != null ? Math.max(0, Math.min(100, (athlVert - 25) / 18 * 100)) : 50;
      const athlWtScore = athlWt != null ? Math.max(0, Math.min(100, (athlWt - 170) / 60 * 100)) : 50;
      const athlBase = athl40 != null ? (athl40Score * 0.5 + athlVertScore * 0.3 + athlWtScore * 0.2) : 50;
      const ras = Number(player?.ras);
      const rasMult = getRasMultiplier(Number.isFinite(ras) ? ras : null);
      return Math.max(0, Math.min(100, Math.round(athlBase * rasMult * 10) / 10));
    };

    for (const [name, data] of Object.entries(mergedBase)) {
      if (deletedLookup[name]) continue;
      const edit = playerOverrides[name];
      if (!edit) {
        merged[name] = data;
        continue;
      }

      const next = {...data};

      const fixedProd = toNum(edit.prod_trajectory);
      const fixedAthl = toNum(edit.athl_score);
      const fixedProspect = toNum(edit.prospect_score);
      const fixedTier = typeof edit.tier === "string" ? edit.tier : null;

      const pff = toNum(edit.pff_score);
      if (pff != null) next.pff_score = pff;
      if (typeof edit.transfer_to === "string") next.transfer_to = edit.transfer_to || null;
      if (edit.draft_round != null) {
        const draftRoundVal = String(edit.draft_round) === "UDFA" ? "UDFA" : Number(edit.draft_round);
        next.draft_round = draftRoundVal;
        next.nfl = {...(next.nfl||{}), draft_round: draftRoundVal};
      }
      if (edit.draft_pick != null) {
        next.draft_pick = Number(edit.draft_pick);
        next.nfl = {...(next.nfl||{}), draft_pick: Number(edit.draft_pick)};
      }
      if (typeof edit.is_projection === "boolean") next.is_projection = edit.is_projection;

      if (edit.recruiting && typeof edit.recruiting === "object") {
        next.recruiting = {...(next.recruiting || {}), ...edit.recruiting};
      }

      if (edit.athletic && typeof edit.athletic === "object") {
        const ath = {...(next.athletic || {})};
        const applyAth = (key, aliases=[]) => {
          const n = toNum(edit.athletic[key]);
          if (n == null) return;
          const baseSlot = ath[key];
          ath[key] = baseSlot && typeof baseSlot === "object" ? {...baseSlot, val:n} : {val:n, rank:null, total:null, comp:null};
          aliases.forEach((alias) => {
            if (ath[alias] && typeof ath[alias] === "object") {
              ath[alias] = {...ath[alias], val:n};
            }
          });
        };

        applyAth("height");
        applyAth("weight");
        applyAth("arm");
        applyAth("hand");
        applyAth("wing");
        applyAth("forty", ["40T"]);
        applyAth("ten_split", ["10split"]);
        applyAth("vert");
        applyAth("broad");
        applyAth("three_cone", ["3cone"]);
        applyAth("shuttle");

        const rasVal = toNum(edit.athletic.ras);
        if (rasVal != null) {
          next.ras = rasVal;
          ath.ras = ath.ras && typeof ath.ras === "object" ? {...ath.ras, val:rasVal} : {val:rasVal, rank:null, total:null, comp:null};
        }

        next.athletic = ath;
      }

      const hasEditSeasonStats = !!(edit.seasonStats && typeof edit.seasonStats === "object");
      const hasEditSeasonMeta = Array.isArray(edit.seasons) && edit.seasons.length > 0;
      const shouldRebuildSeasonMetrics = hasEditSeasonStats || hasEditSeasonMeta;
      const ssData = hasEditSeasonStats
        ? edit.seasonStats
        : ((SEASON_STATS && SEASON_STATS[name]) || {});
      const metaByN = {};
      (Array.isArray(next.seasons) ? next.seasons : []).forEach((s) => { if (s?.n != null) metaByN[Number(s.n)] = {...s}; });
      (Array.isArray(edit.seasons) ? edit.seasons : []).forEach((s) => {
        const n = Number(s?.n);
        if (!Number.isFinite(n)) return;
        metaByN[n] = {...(metaByN[n] || {n}), ...s};
      });

      const seasonNums = [...new Set([
        ...Object.keys(ssData || {}).map(Number).filter(Number.isFinite),
        ...Object.keys(metaByN).map(Number).filter(Number.isFinite),
      ])].sort((a,b)=>a-b);

      if (shouldRebuildSeasonMetrics && seasonNums.length) {
        const rebuilt = [];
        const adjScores = [];
        const rushScores = [];
        const recvScores = [];

        seasonNums.forEach((n, idx) => {
          const row = ssData[String(n)] || ssData[n] || [];
          const baseMeta = metaByN[n] || {n};
          const seasonInput = {
            n,
            attempts: rowVal(row, 0) ?? 0,
            rush_yds: rowVal(row, 1) ?? 0,
            ypa: rowVal(row, 2) ?? 0,
            rush_tds: rowVal(row, 3) ?? 0,
            fumbles: rowVal(row, 4) ?? 0,
            run_grade: rowVal(row, 5) ?? 0,
            yco_a: rowVal(row, 6) ?? 0,
            mtf_a: rowVal(row, 7) ?? 0,
            ten_plus_a: rowVal(row, 8) ?? 0,
            fifteen_plus_a: rowVal(row, 9) ?? 0,
            bay_pct: rowVal(row, 10) ?? 0,
            first_downs_a: rowVal(row, 11) ?? 0,
            elu: rowVal(row, 12) ?? 0,
            ydom: rowVal(row, 13) ?? 0,
            tddom: rowVal(row, 14) ?? 0,
            targets: rowVal(row, 15) ?? 0,
            receptions: rowVal(row, 16) ?? 0,
            rec_pct: rowVal(row, 17) ?? 0,
            rec_yds: rowVal(row, 18) ?? 0,
            yds_per_rec: rowVal(row, 19) ?? 0,
            rec_tds: rowVal(row, 20) ?? 0,
            recv_grade: rowVal(row, 21) ?? 0,
            recv_snaps: rowVal(row, 22) ?? 0,
            yac_rec: rowVal(row, 23) ?? 0,
            mtf_rec: rowVal(row, 26) ?? 0,
            y_rr: rowVal(row, 24) ?? 0,
            adot: rowVal(row, 25) ?? 0,
            conference: baseMeta.conf || baseMeta.conference || "Other",
            sos_label: baseMeta.sos_label || "Average",
          };

          const {rushScore, recvScore, adjScore} = calcSeasonComponents(seasonInput);
          rushScores.push({idx, score:rushScore});
          recvScores.push({idx, score:recvScore});
          adjScores.push({idx, score:adjScore});

          rebuilt.push({
            ...baseMeta,
            n,
            yr: baseMeta.yr ?? baseMeta.year ?? null,
            school: baseMeta.school ?? baseMeta.sc ?? "",
            conf: baseMeta.conf ?? baseMeta.conference ?? "",
            sos_label: baseMeta.sos_label || "Average",
            sos_rank: baseMeta.sos_rank ?? null,
            sos_mag: baseMeta.sos_mag ?? null,
            rush_score: Math.round(rushScore * 10) / 10,
            recv_score: Math.round(recvScore * 10) / 10,
            adj_score: Math.round(adjScore * 10) / 10,
            r: Math.round(rushScore * 10) / 10,
            v: Math.round(recvScore * 10) / 10,
            c: Math.round(adjScore * 10) / 10,
          });
        });

        next.seasons = rebuilt;
        next.num_seasons = rebuilt.length;

        const weighted = (arr) => {
          if (!arr.length) return null;
          const tw = arr.reduce((s, x) => s + (YEAR_WEIGHTS[x.idx] || 25), 0);
          if (!tw) return null;
          return arr.reduce((s, x) => s + x.score * (YEAR_WEIGHTS[x.idx] || 25), 0) / tw;
        };

        const prodTraj = weighted(adjScores);
        const rushTraj = weighted(rushScores);
        const recvTraj = weighted(recvScores);

        if (prodTraj != null && fixedProd == null) next.prod_trajectory = Math.round(prodTraj * 10) / 10;
        if (rushTraj != null) next.rush_trajectory = Math.round(rushTraj * 10) / 10;
        if (recvTraj != null) next.recv_trajectory = Math.round(recvTraj * 10) / 10;

        const flat = adjScores.map(x => x.score);
        if (flat.length) {
          const peak = Math.max(...flat);
          const final = flat[flat.length - 1];
          const first = flat[0];
          const mean = flat.reduce((a,b)=>a+b,0) / flat.length;
          const variance = flat.reduce((a,b)=>a+Math.pow(b-mean,2),0) / flat.length;
          const std = Math.sqrt(variance);
          next.traj_peak = Math.round(peak * 10) / 10;
          next.traj_final = Math.round(final * 10) / 10;
          next.traj_improvement = Math.round(Math.max(0, Math.min(100, 50 + (final - first) * 1.2)) * 10) / 10;
          next.traj_consistency = Math.round(Math.max(0, Math.min(100, 100 - std * 3.5)) * 10) / 10;
        }
      }

      if (fixedAthl != null) next.athl_score = fixedAthl;
      else next.athl_score = calcAthleticComposite(next);

      if (fixedProd != null) next.prod_trajectory = fixedProd;

      const prod = Number(next.prod_trajectory);
      const athl = Number(next.athl_score);
      const pffFinal = Number(next.pff_score);
      if (fixedProspect != null) {
        next.prospect_score = fixedProspect;
      } else if (Number.isFinite(prod) && Number.isFinite(athl) && Number.isFinite(pffFinal)) {
        next.prospect_score = Math.max(0, Math.min(100, Math.round((prod * 0.75 + athl * 0.10 + pffFinal * 0.15) * 10) / 10));
      }
      next.tier = fixedTier || scoreToTier(Number(next.prospect_score));

      merged[name] = next;
    }

    const withFinishUpdates = applySeasonFinishUpdates(merged, customFinishSeasons);
    const withSeasonPlayedUpdates = applySeasonsPlayedUpdates(withFinishUpdates, customSeasonsPlayed);
    const out = {};
    for (const [name, data] of Object.entries(withSeasonPlayedUpdates)) {
      const adjProspect = getAdjustedProspectScore(data, name);
      const finalProspect = Number.isFinite(adjProspect) ? adjProspect : data?.prospect_score;
      out[name] = {
        ...data,
        prospect_score: finalProspect,
        tier: scoreToTier(Number(finalProspect)),
        recv_arch: getRebalancedRecvArchetype(data, name),
      };
    }

    // Keep displayed rank aligned to the current prospect-score ordering.
    const rankedNames = Object.keys(out).sort((a,b) => {
      const sa = Number(out[a]?.prospect_score);
      const sb = Number(out[b]?.prospect_score);
      const va = Number.isFinite(sa) ? sa : -Infinity;
      const vb = Number.isFinite(sb) ? sb : -Infinity;
      if (vb !== va) return vb - va;
      const ra = Number(out[a]?.rank);
      const rb = Number(out[b]?.rank);
      if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
    rankedNames.forEach((name, idx) => {
      out[name] = { ...out[name], rank: idx + 1 };
    });

    return out;
  },[customPlayers, customFinishSeasons, customSeasonsPlayed, playerOverrides, deletedPlayers]);

  const allNames = useMemo(()=>Object.keys(ALL_DATA).sort((a,b)=>{
    const sa = ALL_DATA[a]?.prospect_score ?? -1;
    const sb = ALL_DATA[b]?.prospect_score ?? -1;
    if (sb !== sa) return sb - sa;
    return (ALL_DATA[a]?.rank ?? 9999) - (ALL_DATA[b]?.rank ?? 9999);
  }),[ALL_DATA]);
  const draftClasses = useMemo(()=>[...new Set([...allNames.map(n=>ALL_DATA[n].draft_class).filter(Boolean), String(currentProjectionClass)])].sort((a,b)=>Number(a)-Number(b)),[allNames, ALL_DATA, currentProjectionClass]);
  const currentClassPlayers = useMemo(() => {
    return allNames
      .filter((name) => String(ALL_DATA[name]?.draft_class) === String(currentProjectionClass) && !!ALL_DATA[name]?.is_projection)
      .map((name) => ({name, data: ALL_DATA[name]}));
  }, [allNames, ALL_DATA, currentProjectionClass]);

  useEffect(()=>{
    if(query.length<2){setSugg([]);setActiveSearchIdx(-1);return;}
    const q=query.toLowerCase();
    const nextSugg = allNames.filter(n=>n.toLowerCase().includes(q)).slice(0,8);
    setSugg(nextSugg);
    setActiveSearchIdx((i)=>nextSugg.length ? Math.min(Math.max(i, -1), nextSugg.length-1) : -1);
  },[query]);

  const open=name=>{setSelected(name);setQuery("");setSugg([]);setActiveSearchIdx(-1);};

  const projectionSortMetrics = useMemo(() => {
    const out = {};
    allNames.forEach((name) => {
      const p = ALL_DATA[name] || {};
      out[name] = computeProjectedMultiMetricsFromTargets(p?.proj_t12, p?.proj_t24, p, !!p?.is_projection);
    });
    return out;
  }, [allNames, ALL_DATA]);

  const display = useMemo(()=>{
    let names = allNames;
    if (classFilter)    names = names.filter(n=>ALL_DATA[n].draft_class===classFilter);
    if (tierFilter)     names = names.filter(n=>ALL_DATA[n].tier===tierFilter);
    if (rushArchFilter) names = names.filter(n=>ALL_DATA[n].rush_arch===rushArchFilter);
    if (recvArchFilter) names = names.filter(n=>ALL_DATA[n].recv_arch===recvArchFilter);
    if (roundFilter)    names = names.filter(n=>String(ALL_DATA[n].draft_round)===String(roundFilter));
    if (!tierFilter&&!classFilter&&!rushArchFilter&&!recvArchFilter&&!sortBy&&!roundFilter) names = names.slice(0,20);
    if (sortBy) {
      const invertSort = sortBy==="draft_round"||sortBy==="draft_pick";
      const metricValue = (name) => {
        const p = ALL_DATA[name] || {};
        const m = projectionSortMetrics[name] || {};
        if (sortBy === "consistency") return p.traj_consistency;
        if (sortBy === "improvement") return p.traj_improvement;
        if (sortBy === "rush_trajectory") return p.rush_trajectory;
        if (sortBy === "recv_trajectory") return p.recv_trajectory;
        if (sortBy === "top12_per_season") return p.proj_t12;
        if (sortBy === "top24_per_season") return p.proj_t24;
        if (sortBy === "proj_multi_t12_chance") return m.projMultiT12Pct;
        if (sortBy === "proj_multi_t24_chance") return m.projMultiT24Pct;
        if (sortBy === "proj_top12_seasons") return m.projTop12Seasons;
        if (sortBy === "proj_top24_seasons") return m.projTop24Seasons;
        if (sortBy === "prospect_score") return p.prospect_score;
        if (sortBy === "athl_score") return getAdjustedAthlScore(p, name);
        if (sortBy === "draft_round") return p.draft_round;
        return p.draft_pick;
      };
      names = [...names].sort((a,b)=>{
        const rawA = metricValue(a);
        const rawB = metricValue(b);
        const va = invertSort ? (Number.isFinite(Number(rawA)) ? Number(rawA) : 99999) : (Number.isFinite(Number(rawA)) ? Number(rawA) : -99999);
        const vb = invertSort ? (Number.isFinite(Number(rawB)) ? Number(rawB) : 99999) : (Number.isFinite(Number(rawB)) ? Number(rawB) : -99999);
        const dir = invertSort ? (sortDir==="desc" ? 1 : -1) : (sortDir==="desc" ? -1 : 1);
        return (va-vb)*dir;
      });
    }
    return names;
  },[allNames,tierFilter,classFilter,rushArchFilter,recvArchFilter,roundFilter,sortBy,sortDir,ALL_DATA,projectionSortMetrics]);

  const handleArchFilter = (side,key) => {
    if (side==="rush") { setRushArch(key); setRecvArch(null); }
    else               { setRecvArch(key); setRushArch(null); }
    setPage("prospects");
  };
  const openPlayer = (name, options={}) => {
    setSelected(name);
    setQuery("");
    setSugg([]);
    if (options.fromCompare) {
      setReturnToCompare(true);
      setShowCompare(false);
    } else {
      setReturnToCompare(false);
    }
  };

  const closePlayerCard = () => {
    setSelected(null);
    if (returnToCompare) setShowCompare(true);
    setReturnToCompare(false);
  };

  const backToCompare = () => {
    setSelected(null);
    setShowCompare(true);
    setReturnToCompare(false);
  };

  const exportData = () => {
    const custom = Object.entries(customPlayers);
    if (!custom.length) { alert("No custom players to export yet."); return; }
    const exportObj = {
      version: "rbscout_v6_custom",
      exported: new Date().toISOString(),
      players: customPlayers,
      playerOverrides,
      seasons: customSeasons,
      deletedPlayers,
      finishSeasons: customFinishSeasons,
      seasonsPlayed: customSeasonsPlayed,
      currentProjectionClass,
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], {type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "rbscout_custom_players_" + new Date().toISOString().slice(0,10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportLatestBackupJson = () => {
    if (typeof window === "undefined" || !window.localStorage) {
      alert("Browser storage is unavailable.");
      return;
    }
    try {
      const raw = window.localStorage.getItem(BACKUP_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr) || !arr.length) {
        alert("No periodic backups found yet.");
        return;
      }
      const latest = arr[arr.length - 1];
      const payload = latest?.payload || latest;
      const stamp = String(latest?.takenAt || new Date().toISOString()).replace(/[.:]/g, "-");
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rbscout_periodic_backup_" + stamp + ".json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not export the latest periodic backup.");
    }
  };

  const importData = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const obj = JSON.parse(ev.target.result);
        if (obj.version !== "rbscout_v6_custom") { alert("Unrecognized file format."); return; }
        setCustom(prev => ({...prev, ...obj.players}));
        const merged = {...(_customSS||{}), ...obj.seasons};
        const importedOverrides = obj.playerOverrides || {};
        const importedDeleted = obj.deletedPlayers || {};
        Object.entries(importedOverrides).forEach(([name, ov]) => {
          if (ov && ov.seasonStats && typeof ov.seasonStats === "object") {
            merged[name] = ov.seasonStats;
          }
        });
        _customSS = merged;
        setCustomSS(merged);
        setPlayerOverrides(prev => ({...prev, ...importedOverrides}));
        setDeletedPlayers(prev => ({...prev, ...importedDeleted}));
        setCustomFinishSeasons(prev => ({...prev, ...(obj.finishSeasons||{})}));
        setCustomSeasonsPlayed(prev => ({...prev, ...(obj.seasonsPlayed||{})}));
        if (obj.currentProjectionClass) setCurrentProjectionClass(String(obj.currentProjectionClass));
        alert("Imported " + Object.keys(obj.players).length + " player(s) successfully.");
      } catch(e) { alert("Could not parse file."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div style={{minHeight:"100vh",background:"#06080f",color:"#fff",fontFamily:"monospace"}}>
      {/* Header */}
      <div style={{position:"relative",background:"linear-gradient(180deg,#0a0f1c,#06080f)",borderBottom:"1px solid rgba(255,255,255,0.05)",padding:"10px 12px 10px"}}>
        <div style={{position:"absolute",top:isMobile?4:6,left:"50%",transform:"translateX(-50%)",zIndex:50,display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:isMobile?3:5,flexWrap:"nowrap",maxWidth:isMobile?"96%":"100%",whiteSpace:"nowrap"}}>
          <button onClick={()=>adminUnlocked?exportLatestBackupJson():setPasscodeGate("backup")} style={{background:"rgba(93,191,106,0.10)",border:"1px solid rgba(93,191,106,0.30)",color:"#5dbf6a",padding:isMobile?"3px 6px":"5px 8px",borderRadius:7,fontSize:isMobile?7:8,letterSpacing:isMobile?0.8:1.1,fontWeight:700,lineHeight:1.15}}>
            BACKUP JSON ↓
          </button>
          <div style={{background:"rgba(8,20,12,0.85)",border:"1px solid rgba(93,191,106,0.35)",borderRadius:7,padding:isMobile?"3px 6px":"5px 8px",fontSize:isMobile?7:8,color:"#5dbf6a",letterSpacing:isMobile?0.8:1.1,whiteSpace:"nowrap",backdropFilter:"blur(2px)",lineHeight:1.15}}>
            BKP {lastBackupAt ? new Date(lastBackupAt).toLocaleString([], {month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "--"}
          </div>
          <div title={cloudSyncStatus==="ERROR" && cloudSyncError ? cloudSyncError : undefined} style={{background:"rgba(11,24,31,0.85)",border:"1px solid rgba(77,166,255,0.35)",borderRadius:7,padding:isMobile?"3px 6px":"5px 8px",fontSize:isMobile?7:8,color:cloudSyncStatus==="ON"?"#4da6ff":cloudSyncStatus==="OFF"?"#777":"#f0873a",letterSpacing:isMobile?0.8:1.1,whiteSpace:"nowrap",lineHeight:1.15}}>
            CLOUD SYNC {cloudSyncStatus}
          </div>
        </div>
        <div style={{maxWidth:960,margin:"0 auto",paddingTop:isMobile?22:18}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:8,gap:8}}>
            <div style={{minWidth:0,textAlign:"center"}}>
              <div style={{fontSize:isMobile?26:38,fontWeight:900,letterSpacing:-1.3,lineHeight:0.94}}>RB <span style={{color:"#f0c040"}}>Scout</span></div>
              <div style={{fontSize:8,color:"#333",letterSpacing:3,marginTop:3,marginBottom:3}}>COLLEGE RB PROSPECT MODEL · V6</div>
              <div style={{fontSize:9,color:"#444",marginTop:1}}>{Object.keys(ALL_DATA).length} prospects · 2017–{currentProjectionClass} · Prod 75% · Athl 10% · PFF 15%</div>
              <div style={{fontSize:10,color:"#4da6ff",marginTop:6,letterSpacing:1.2}}>CURRENT CLASS · {currentProjectionClass}</div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"center",flexShrink:0,width:"100%"}}>
              <button onClick={()=>setShowVal(true)} style={{background:"rgba(240,192,64,0.08)",border:"1px solid rgba(240,192,64,0.3)",color:"#f0c040",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5}}>
                VALIDATE ↗
              </button>
              <button onClick={()=>setShowCompare(true)} style={{background:"rgba(77,166,255,0.10)",border:"1px solid rgba(77,166,255,0.32)",color:"#4da6ff",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                COMPARE
              </button>
              <button onClick={()=>adminUnlocked?setShowAdd(true):setPasscodeGate("add")} style={{background:"rgba(93,191,106,0.10)",border:"1px solid rgba(93,191,106,0.35)",color:"#5dbf6a",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                + ADD
              </button>
              <button onClick={()=>adminUnlocked?setShowEditPlayer(true):setPasscodeGate("edit")} style={{background:"rgba(192,132,252,0.10)",border:"1px solid rgba(192,132,252,0.35)",color:"#c084fc",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                EDIT PLAYER
              </button>
              <button onClick={()=>adminUnlocked?setShowDeletePlayer(true):setPasscodeGate("delete")} style={{background:"rgba(224,80,80,0.10)",border:"1px solid rgba(224,80,80,0.35)",color:"#e05050",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                DELETE PLAYER
              </button>
              {Object.keys(customPlayers).length>0&&(
                <button onClick={exportData} style={{background:"rgba(77,166,255,0.10)",border:"1px solid rgba(77,166,255,0.30)",color:"#4da6ff",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                  ↓ EXPORT
                </button>
              )}
              <button onClick={()=>adminUnlocked?setShowSoS(true):setPasscodeGate("sos")} style={{background:"rgba(77,166,255,0.08)",border:"1px solid rgba(77,166,255,0.25)",color:"#4da6ff",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                SoS ↑
              </button>
              <button onClick={()=>adminUnlocked?setShowFinishSeasons(true):setPasscodeGate("finishes")} style={{background:"rgba(240,192,64,0.08)",border:"1px solid rgba(240,192,64,0.28)",color:"#f0c040",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                NFL FIN ↑
              </button>
              <button onClick={()=>adminUnlocked?setShowSeasonsPlayed(true):setPasscodeGate("seasons")} style={{background:"rgba(93,191,106,0.1)",border:"1px solid rgba(93,191,106,0.32)",color:"#5dbf6a",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                SEASONS ↑
              </button>
              <button onClick={()=>adminUnlocked?setShowCloseoutConfirm(true):setPasscodeGate("closeout")} style={{background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.3)",color:"#f0c040",padding:"6px 10px",borderRadius:7,fontSize:8,letterSpacing:1.5,fontWeight:700}}>
                ADVANCE {currentProjectionClass}
              </button>
            </div>
          </div>
          {/* Elevator pitch */}
          <div style={{marginBottom:12,padding:"12px 14px",background:"rgba(255,255,255,0.02)",borderRadius:9,border:"1px solid rgba(255,255,255,0.06)",textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#fff",marginBottom:5,letterSpacing:-0.2}}>The most data-driven college RB evaluation model available.</div>
            <div style={{fontSize:13,color:"#777",lineHeight:1.7}}>RB Scout grades every prospect across production trajectory, athletic testing, and PFF board scores — then validates each metric against real NFL outcomes from {Object.values(ALL_PLAYERS).filter(p=>(p.draft_round||p.draft_pick)&&p.draft_round!=='UDFA').length} drafted backs. Use it to cut through the noise of draft season, surface undervalued prospects, and understand exactly what college statistics actually predict success at the next level.
            </div>
          </div>

          {/* Page nav */}
          <div style={{display:"flex",gap:0,borderRadius:7,overflow:"hidden",border:"1px solid rgba(255,255,255,0.07)",width:isMobile?"100%":"fit-content",marginBottom:10}}>
            {[["prospects","Prospects"],["archetypes","Archetypes"],["idealbuild","Ideal Build"]].map(([p,lbl])=>(
              <button key={p} onClick={()=>setPage(p)}
                style={{padding:"7px 11px",border:"none",background:page===p?"rgba(240,192,64,0.12)":"transparent",color:page===p?"#f0c040":"#555",fontSize:8,letterSpacing:1,fontWeight:page===p?700:400,borderRight:p==="prospects"?"1px solid rgba(255,255,255,0.07)":"none",flex:isMobile?1:"0 0 auto"}}>
                {lbl.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Search */}
          {page==="prospects"&&<div style={{position:"relative",marginTop:2}}>
            <input value={query} onChange={e=>{setQuery(e.target.value);setActiveSearchIdx(-1);}} onBlur={()=>setTimeout(()=>{setSugg([]);setActiveSearchIdx(-1);setQuery("");},150)} placeholder={`Search ${Object.keys(ALL_DATA).length} players...`}
              onKeyDown={e=>{
                if (!suggestions.length) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveSearchIdx(i=>Math.min(i+1, suggestions.length-1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveSearchIdx(i=>Math.max(i-1, 0));
                } else if (e.key === "Enter") {
                  if (activeSearchIdx >= 0 && activeSearchIdx < suggestions.length) {
                    e.preventDefault();
                    openPlayer(suggestions[activeSearchIdx]);
                  }
                } else if (e.key === "Escape") {
                  setSugg([]);
                  setActiveSearchIdx(-1);
                }
              }}
              style={{width:"100%",padding:"10px 14px",borderRadius:8,boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",color:"#fff",fontSize:14,outline:"none"}}/>
            {suggestions.length>0&&(
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:200,background:"#111724",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,overflow:"hidden",boxShadow:"0 12px 40px rgba(0,0,0,0.7)"}}>
                {suggestions.map((name, idx)=>{
                  const d=ALL_DATA[name]; const ts=TIER_STYLE[d.tier]||TIER_STYLE.Fringe;
                  return (
                    <div key={name} onClick={()=>openPlayer(name)}
                      style={{padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,0.04)",background:idx===activeSearchIdx?"rgba(255,255,255,0.05)":"transparent"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{minWidth:0,flex:1}}>
                        <span style={{color:"#fff",fontSize:14,fontWeight:600}}>{name}</span>
                        <span style={{color:ts.accent,fontSize:9,marginLeft:8}}>{d.tier}</span>
                        {d.is_projection&&<span style={{color:"#00838f",fontSize:9,marginLeft:6}}>★ {d.draft_class}</span>}
                      </div>
                      <div style={{flexShrink:0}}>
                        <span style={{color:ts.accent,fontSize:15,fontWeight:700}}>{d.prospect_score!=null?d.prospect_score.toFixed(1):"—"}</span>
                        <span style={{color:"#444",fontSize:10,marginLeft:5}}>#{d.rank}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>}
        </div>
      </div>

      {page==="archetypes"&&<ArchetypePage onFilter={handleArchFilter} rushFilter={rushArchFilter} recvFilter={recvArchFilter} onOpenPlayer={openPlayer} allData={ALL_DATA}/>}
      {page==="idealbuild"&&<IdealBuildPage onOpenPlayer={openPlayer} allData={ALL_DATA}/>}
      {page==="prospects"&&<div style={{maxWidth:960,margin:"0 auto",padding:isMobile?"12px 8px":"14px 10px"}}>
        {/* ── Filter bar ── */}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:isMobile?"stretch":"flex-end"}}>

          {/* Draft Class */}
          <div style={{display:"flex",flexDirection:"column",gap:4,width:isMobile?"100%":"auto"}}>
            <label style={{fontSize:8,color:"#444",letterSpacing:2}}>DRAFT CLASS</label>
            <div style={{position:"relative"}}>
              <select value={classFilter||""} onChange={e=>setClass(e.target.value||null)}
                style={{appearance:"none",WebkitAppearance:"none",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,color:classFilter?"#f0c040":"#aaa",fontSize:10,padding:"7px 30px 7px 12px",outline:"none",cursor:"pointer",minWidth:isMobile?"100%":110,width:isMobile?"100%":"auto",fontFamily:"monospace",letterSpacing:1}}>
                <option value="">All Classes</option>
                {draftClasses.map(yr=><option key={yr} value={yr}>{yr}{String(yr)===String(currentProjectionClass)?" (Proj)":""}</option>)}
              </select>
              <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",color:"#555",fontSize:9,pointerEvents:"none"}}>v</span>
            </div>
          </div>

          {/* Prospect Tier */}
          <div style={{display:"flex",flexDirection:"column",gap:4,width:isMobile?"100%":"auto"}}>
            <label style={{fontSize:8,color:"#444",letterSpacing:2}}>PROSPECT TIER</label>
            <div style={{position:"relative"}}>
              <select value={tierFilter||""} onChange={e=>setTier(e.target.value||null)}
                style={{appearance:"none",WebkitAppearance:"none",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,color:tierFilter?(TIER_STYLE[tierFilter]||TIER_STYLE.Fringe).accent:"#aaa",fontSize:10,padding:"7px 30px 7px 12px",outline:"none",cursor:"pointer",minWidth:isMobile?"100%":130,width:isMobile?"100%":"auto",fontFamily:"monospace",letterSpacing:1}}>
                <option value="">All Tiers</option>
                {["Elite","Starter","Rotational","Developmental","Fringe"].map(t=>{
                  const cnt=allNames.filter(n=>ALL_DATA[n].tier===t&&(!classFilter||ALL_DATA[n].draft_class===classFilter)).length;
                  return <option key={t} value={t}>{t} ({cnt})</option>;
                })}
              </select>
              <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",color:"#555",fontSize:9,pointerEvents:"none"}}>v</span>
            </div>
          </div>

          {/* Rush Archetype */}
          <div style={{display:"flex",flexDirection:"column",gap:4,width:isMobile?"100%":"auto"}}>
            <label style={{fontSize:8,color:"#f0873a",letterSpacing:2}}>RUSH ARCHETYPE</label>
            <div style={{position:"relative"}}>
              <select value={rushArchFilter||""} onChange={e=>{setRushArch(e.target.value||null);}}
                style={{appearance:"none",WebkitAppearance:"none",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(240,135,58,0.25)",borderRadius:7,color:rushArchFilter?(RUSH_ARCH_COLORS[rushArchFilter]||"#f0873a"):"#aaa",fontSize:10,padding:"7px 30px 7px 12px",outline:"none",cursor:"pointer",minWidth:isMobile?"100%":155,width:isMobile?"100%":"auto",fontFamily:"monospace",letterSpacing:0.5}}>
                <option value="">All Rush Types</option>
                {Object.keys(RUSH_ARCH_COLORS).map(arch=>{
                  const cnt=allNames.filter(n=>ALL_DATA[n].rush_arch===arch).length;
                  return <option key={arch} value={arch}>{arch} ({cnt})</option>;
                })}
              </select>
              <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",color:"#555",fontSize:9,pointerEvents:"none"}}>v</span>
            </div>
          </div>

          {/* Recv Archetype */}
          <div style={{display:"flex",flexDirection:"column",gap:4,width:isMobile?"100%":"auto"}}>
            <label style={{fontSize:8,color:"#00bcd4",letterSpacing:2}}>RECV ARCHETYPE</label>
            <div style={{position:"relative"}}>
              <select value={recvArchFilter||""} onChange={e=>{setRecvArch(e.target.value||null);}}
                style={{appearance:"none",WebkitAppearance:"none",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(0,188,212,0.25)",borderRadius:7,color:recvArchFilter?"#00bcd4":"#aaa",fontSize:10,padding:"7px 30px 7px 12px",outline:"none",cursor:"pointer",minWidth:isMobile?"100%":170,width:isMobile?"100%":"auto",fontFamily:"monospace",letterSpacing:0.5}}>
                <option value="">All Recv Types</option>
                {Object.keys(RECV_ARCH_COLORS).map(arch=>{
                  const cnt=allNames.filter(n=>ALL_DATA[n].recv_arch===arch).length;
                  return <option key={arch} value={arch}>{arch} ({cnt})</option>;
                })}
              </select>
              <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",color:"#555",fontSize:9,pointerEvents:"none"}}>v</span>
            </div>
          </div>

          {/* Draft Round Filter */}
          <div style={{display:"flex",flexDirection:"column",gap:4,width:isMobile?"100%":"auto"}}>
            <label style={{fontSize:8,color:"#aaa",letterSpacing:2}}>DRAFT ROUND</label>
            <div style={{position:"relative"}}>
              <select value={roundFilter||""} onChange={e=>setRoundFilter(e.target.value||null)}
                style={{appearance:"none",WebkitAppearance:"none",background:"rgba(255,255,255,0.05)",border:`1px solid ${roundFilter?"rgba(240,192,64,0.35)":"rgba(255,255,255,0.12)"}`,borderRadius:7,color:roundFilter?"#f0c040":"#aaa",fontSize:10,padding:"7px 28px 7px 12px",outline:"none",cursor:"pointer",minWidth:isMobile?"100%":120,width:isMobile?"100%":"auto",fontFamily:"monospace",letterSpacing:0.5}}>
                <option value="">All Rounds</option>
                {[1,2,3,4,5,6,7].map(r=>{
                  const cnt=Object.values(ALL_DATA).filter(p=>String(p.draft_round)===String(r)).length;
                  return <option key={r} value={r}>Round {r} ({cnt})</option>;
                })}
              </select>
              <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",color:"#555",fontSize:9,pointerEvents:"none"}}>v</span>
            </div>
          </div>

          {/* Sort: Consistency */}
          <div style={{display:"flex",flexDirection:"column",gap:4,width:isMobile?"100%":"auto"}}>
            <label style={{fontSize:8,color:"#aaa",letterSpacing:2}}>SORT BY</label>
            <div style={{display:"flex",gap:4,flexWrap:isMobile?"wrap":"nowrap"}}>
              <div style={{position:"relative",width:isMobile?"100%":"auto"}}>
                <select value={sortBy||""} onChange={e=>setSortBy(e.target.value||null)}
                  style={{appearance:"none",WebkitAppearance:"none",background:"rgba(255,255,255,0.05)",border:`1px solid ${sortBy?"rgba(77,166,255,0.35)":"rgba(255,255,255,0.12)"}`,borderRadius:7,color:sortBy?"#4da6ff":"#aaa",fontSize:10,padding:"7px 28px 7px 12px",outline:"none",cursor:"pointer",minWidth:isMobile?"100%":150,width:isMobile?"100%":"auto",fontFamily:"monospace",letterSpacing:0.5}}>
                  <option value="">Default (Rank)</option>
                  <option value="prospect_score">Prospect Score</option>
                  <option value="rush_trajectory">Rushing Trajectory</option>
                  <option value="recv_trajectory">Receiving Trajectory</option>
                  <option value="improvement">Improvement Score</option>
                  <option value="consistency">Consistency Score</option>
                  <option value="top12_per_season">Top-12/Season</option>
                  <option value="top24_per_season">Top-24/Season</option>
                  <option value="proj_multi_t12_chance">Projected Multi Top-12 Chance</option>
                  <option value="proj_multi_t24_chance">Projected Multi Top-24 Chance</option>
                  <option value="proj_top12_seasons">Projected Top-12 Seasons</option>
                  <option value="proj_top24_seasons">Projected Top-24 Seasons</option>
                  <option value="athl_score">Athletic Score</option>
                  <option value="draft_round">Draft Round</option>
                  <option value="draft_pick">Draft Pick</option>
                </select>
                <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",color:"#555",fontSize:9,pointerEvents:"none"}}>v</span>
              </div>
              {sortBy&&(
                <button onClick={()=>setSortDir(d=>d==="desc"?"asc":"desc")}
                  title={sortDir==="desc"?"Highest first (click to flip)":"Lowest first (click to flip)"}
                  style={{padding:"7px 11px",borderRadius:7,border:"1px solid rgba(77,166,255,0.35)",background:"rgba(77,166,255,0.08)",color:"#4da6ff",fontSize:11,cursor:"pointer",fontFamily:"monospace",lineHeight:1,width:isMobile?"100%":"auto"}}>
                  {sortDir==="desc"?"↓ Hi→Lo":"↑ Lo→Hi"}
                </button>
              )}
            </div>
          </div>

          {/* Clear all */}
          {(classFilter||tierFilter||rushArchFilter||recvArchFilter||roundFilter||sortBy)&&(
            <button onClick={()=>{setClass(null);setTier(null);setRushArch(null);setRecvArch(null);setRoundFilter(null);setSortBy(null);setSortDir("desc");}}
              style={{alignSelf:isMobile?"stretch":"flex-end",padding:"7px 14px",borderRadius:7,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#555",fontSize:8,letterSpacing:2,marginBottom:0,width:isMobile?"100%":"auto"}}>
              CLEAR ALL
            </button>
          )}
        </div>
        {/* Grid label */}
        <div style={{fontSize:9,color:"#333",letterSpacing:3,marginBottom:10}}>
          {(classFilter||tierFilter||rushArchFilter||recvArchFilter)
            ? [classFilter,tierFilter,rushArchFilter,recvArchFilter].filter(Boolean).join(" · ").toUpperCase()+" — "
            : "TOP 20 — "
          }
          {display.length} PLAYERS · CLICK TO OPEN
        </div>
        {/* Player grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,240px),1fr))",gap:7}}>
          {display.map(name=>{
            const d=ALL_DATA[name]; const ts=TIER_STYLE[d.tier]||TIER_STYLE.Fringe; const adjAth=getAdjustedAthlScore(d, name);
            return (
              <div key={name} onClick={()=>openPlayer(name)}
                style={{background:"rgba(255,255,255,0.025)",border:"1px solid "+ts.accent+"1a",borderRadius:9,padding:"11px 13px",cursor:"pointer"}}
                onMouseEnter={e=>{e.currentTarget.style.background=ts.accent+"0d";e.currentTarget.style.borderColor=ts.accent+"44";}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.025)";e.currentTarget.style.borderColor=ts.accent+"1a";}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,marginBottom:2}}><span style={{color:"rgba(255,255,255,0.75)",fontWeight:700}}>#{d.rank}</span><span style={{color:"#444"}}> · </span><span style={{color:(TIER_STYLE[d.tier]||TIER_STYLE.Fringe).accent,fontWeight:600}}>{d.tier.toUpperCase()}{d.is_projection?" · ★":""}</span></div>
                    <div style={{fontSize:13,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
                    <div style={{fontSize:9,color:"#444",marginTop:1}}>
                      {d.draft_class}
                      {d.draft_round&&!d.is_projection&&<span style={{color:"#f0c040",marginLeft:5}}>{d.draft_round==="UDFA"?"UDFA":"Rd "+d.draft_round+(d.draft_pick?" #"+d.draft_pick:"")}</span>}
                      {d.transfer_to&&d.transfer_to!="nan"&&<span style={{color:"#4da6ff",marginLeft:5}}>portal</span>}
                    </div>
                    <div style={{marginTop:5,display:"flex",gap:3,flexWrap:"wrap"}}>
                      {d.rush_arch&&<ArchTag label={d.rush_arch} colors={RUSH_ARCH_COLORS}/>}
                      {d.recv_arch&&<ArchTag label={d.recv_arch} colors={RECV_ARCH_COLORS}/>}
                    </div>
                  </div>
                  <div style={{textAlign:"right",marginLeft:8,flexShrink:0}}>
                    <div style={{fontSize:19,fontWeight:900,color:ts.accent,lineHeight:1}}>{d.prospect_score!=null?d.prospect_score.toFixed(1):"—"}</div>
                    <div style={{display:"flex",gap:5,justifyContent:"flex-end",marginTop:3}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                        <span style={{fontSize:10,color:"#f0873a"}}>RUS:{d.rush_trajectory!=null?d.rush_trajectory.toFixed(0):"—"}</span>
                        <span style={{fontSize:10,color:"#5dbf6a"}}>IMP:{d.traj_improvement!=null?d.traj_improvement.toFixed(0):"—"}</span>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                        <span style={{fontSize:10,color:"#5dbf6a"}}>REC:{d.recv_trajectory!=null?d.recv_trajectory.toFixed(0):"—"}</span>
                        <span style={{fontSize:10,color:"#c084fc"}}>CON:{d.traj_consistency!=null?d.traj_consistency.toFixed(0):"—"}</span>
                        <span style={{fontSize:10,color:"#4da6ff"}}>ATH:{adjAth!=null?adjAth.toFixed(0):"—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{marginTop:8,height:2,borderRadius:1,background:"rgba(255,255,255,0.05)"}}>
                  <div style={{height:"100%",width:(d.prospect_score||0)+"%",background:ts.accent,borderRadius:1}}/>
                </div>
              </div>
            );
          })}
        </div>

      </div>}
      {selected&&ALL_DATA[selected]&&<PlayerCard player={selected} data={ALL_DATA[selected]} onClose={closePlayerCard} onSelectPlayer={openPlayer} onBack={returnToCompare ? backToCompare : null} allData={ALL_DATA}/>} 
      {showCompare&&<CompareModal
        onClose={()=>setShowCompare(false)}
        allNames={allNames}
        allData={ALL_DATA}
        selections={compareSelections}
        onChangeSelections={setCompareSelections}
        onOpenPlayer={(name)=>openPlayer(name,{fromCompare:true})}
      />} 
      {showVal&&<ValModal onClose={()=>setShowVal(false)}/>}
      {passcodeGate&&<PasscodeModal
        onClose={()=>setPasscodeGate(null)}
        onSuccess={()=>{
          setAdminUnlocked(true);
          setPasscodeGate(null);
          if(passcodeGate==='add') setShowAdd(true);
          else if(passcodeGate==='edit') setShowEditPlayer(true);
          else if(passcodeGate==='delete') setShowDeletePlayer(true);
          else if(passcodeGate==='sos') setShowSoS(true);
          else if(passcodeGate==='finishes') setShowFinishSeasons(true);
          else if(passcodeGate==='seasons') setShowSeasonsPlayed(true);
          else if(passcodeGate==='backup') exportLatestBackupJson();
          else if(passcodeGate==='closeout') setShowCloseoutConfirm(true);
        }}
      />}
      {showCloseoutConfirm&&<ProjectionClassConfirmModal
        currentProjectionClass={currentProjectionClass}
        playerCount={currentClassPlayers.length}
        onClose={()=>setShowCloseoutConfirm(false)}
        onContinue={()=>{
          setShowCloseoutConfirm(false);
          setShowCloseoutReview(true);
        }}
      />}
      {showCloseoutReview&&<ProjectionClassCloseoutModal
        currentProjectionClass={currentProjectionClass}
        players={currentClassPlayers}
        onClose={()=>setShowCloseoutReview(false)}
        onConfirm={(entries)=>{
          const nextOverrides = {...playerOverrides};
          currentClassPlayers.forEach(({name}) => {
            const entry = entries?.[name] || {};
            const roundVal = entry.undrafted ? "UDFA" : Number(entry.draft_round);
            const pickVal = entry.undrafted ? null : Number(entry.draft_pick);
            nextOverrides[name] = {
              ...(nextOverrides[name] || {}),
              is_projection: false,
              draft_round: roundVal,
              draft_pick: entry.undrafted ? null : (Number.isFinite(pickVal) ? pickVal : null),
            };
          });
          setPlayerOverrides(nextOverrides);
          setCurrentProjectionClass(String((Number(currentProjectionClass) || 2026) + 1));
          setShowCloseoutReview(false);
        }}
      />}
      {showDeletePlayer&&<DeletePlayerModal
        onClose={()=>setShowDeletePlayer(false)}
        allNames={allNames}
        allData={ALL_DATA}
        customPlayers={customPlayers}
        playerOverrides={playerOverrides}
        customSeasons={customSeasons}
        customFinishSeasons={customFinishSeasons}
        customSeasonsPlayed={customSeasonsPlayed}
        deletedPlayers={deletedPlayers}
        onDelete={(name, scope)=>{
          const playerName = String(name||"").trim();
          if (!playerName) return;
          const isAll = !!scope?.all;
          const removeCustomProfile = isAll || !!scope?.customProfile;
          const removeOverrides = isAll || !!scope?.overrides;
          const removeSeasonStats = isAll || !!scope?.seasonStats;
          const removeFinishRefs = isAll || !!scope?.finishRefs;
          const removeSeasonsPlayedRefs = isAll || !!scope?.seasonsPlayedRefs;
          const removeFromDbView = isAll || !!scope?.databaseDelete;

          const removeByKey = (setter) => {
            setter((prev) => {
              if (!prev || typeof prev !== "object" || Array.isArray(prev) || !prev[playerName]) return prev;
              const next = { ...prev };
              delete next[playerName];
              return next;
            });
          };

          if (removeCustomProfile) removeByKey(setCustom);
          if (removeOverrides) removeByKey(setPlayerOverrides);
          if (removeSeasonStats) {
            setCustomSS((prev) => {
              if (!prev || typeof prev !== "object" || Array.isArray(prev) || !prev[playerName]) return prev;
              const next = { ...prev };
              delete next[playerName];
              _customSS = next;
              return next;
            });
          }

          if (removeFinishRefs) {
            setCustomFinishSeasons((prev) => {
              const base = asObj(prev);
              const next = {};
              Object.entries(base).forEach(([yr, row]) => {
                const top12 = Array.isArray(row?.top12) ? row.top12.filter((x) => String(x?.name || "") !== playerName) : [];
                const top24 = Array.isArray(row?.top24) ? row.top24.filter((x) => String(x?.name || "") !== playerName) : [];
                next[yr] = { ...row, top12, top24 };
              });
              return next;
            });
          }

          if (removeSeasonsPlayedRefs) {
            setCustomSeasonsPlayed((prev) => {
              const base = asObj(prev);
              const next = {};
              Object.entries(base).forEach(([yr, row]) => {
                const players = Array.isArray(row?.players) ? row.players.filter((p) => String(p || "") !== playerName) : [];
                next[yr] = { ...row, players };
              });
              return next;
            });
          }

          if (removeFromDbView) {
            setDeletedPlayers((prev) => ({ ...asObj(prev), [playerName]: true }));
          }

          if (selected === playerName) setSelected(null);
        }}
      />}
      {showEditPlayer&&<EditPlayerModal
        onClose={()=>setShowEditPlayer(false)}
        allData={ALL_DATA}
        existingOverrides={playerOverrides}
        sosByYear={customSoS}
        onSave={(name, override)=>{
          setPlayerOverrides(prev=>({...prev, [name]: override}));
          if (override && override.seasonStats && typeof override.seasonStats === "object") {
            setCustomSS(prev=>{const n={...prev,[name]:override.seasonStats};_customSS=n;return n;});
          } else {
            setCustomSS(prev=>{
              const n={...prev};
              delete n[name];
              _customSS=n;
              return n;
            });
          }
          setShowEditPlayer(false);
        }}
      />}
      {showSoS&&<SoSUploadModal onClose={()=>setShowSoS(false)} existing={customSoS} onSave={(yr,data,replace)=>{
        if(replace){setCustomSoS(replace);}
        else if(yr&&data){setCustomSoS(prev=>({...prev,[yr]:data}));}
        setShowSoS(false);
      }}/>}
      {showFinishSeasons&&<FinishSeasonsModal
        onClose={()=>setShowFinishSeasons(false)}
        existing={customFinishSeasons}
        players={ALL_DATA}
        onSave={(yr,data,replace)=>{
          if(replace){
            setCustomFinishSeasons(replace);
          } else if(yr&&data){
            const payload = {
              top12: Array.isArray(data.top12) ? data.top12 : [],
              top24: Array.isArray(data.top24) ? data.top24 : [],
            };
            setCustomFinishSeasons(prev=>({...prev,[yr]:payload}));
            if (Array.isArray(data.unmatched) && data.unmatched.length) {
              alert("Saved with unmatched names ignored until a matching player exists: " + data.unmatched.join(", "));
            }
          }
          setShowFinishSeasons(false);
        }}
      />} 
      {showSeasonsPlayed&&<SeasonsPlayedModal
        onClose={()=>setShowSeasonsPlayed(false)}
        existing={customSeasonsPlayed}
        players={ALL_DATA}
        onSave={(yr,data,replace)=>{
          if(replace){
            setCustomSeasonsPlayed(replace);
          } else if(yr&&data){
            const payload = {
              players: Array.isArray(data.players) ? data.players : [],
            };
            setCustomSeasonsPlayed(prev=>({...prev,[yr]:payload}));
            if (Array.isArray(data.unmatched) && data.unmatched.length) {
              alert("Saved with unmatched names ignored: " + data.unmatched.join(", "));
            }
          }
          setShowSeasonsPlayed(false);
        }}
      />}
      {showAdd&&<AddPlayerModal
        onClose={()=>setShowAdd(false)}
        existingPlayers={ALL_DATA}
        currentProjectionClass={currentProjectionClass}
        onAdd={(name,playerData,seasons)=>{
          setCustom(prev=>({...prev,[name]:playerData}));
          const ssMap={};
          seasons.forEach((s,i)=>{
            const key=String(s.n||i+1);
            // build a 26-element array of [val, null] pairs for each stat
            const row=Array(26).fill(null).map(()=>[null,null]);
            const rushKeys=[s.attempts,s.rush_yds,s.ypa,s.rush_tds,null,s.run_grade,s.yco_a,s.mtf_a,null,null,null,null,s.ydom,s.tddom];
            const recvKeys=[s.targets,s.receptions,null,s.rec_yds,s.yds_per_rec,s.rec_tds,s.recv_grade,null,s.yac_rec,null,null,s.mtf_rec];
            rushKeys.forEach((v,ri)=>{ if(v!=null&&v!=="")row[ri]=[parseFloat(v),null]; });
            recvKeys.forEach((v,ri)=>{ if(v!=null&&v!=="")row[14+ri]=[parseFloat(v),null]; });
            ssMap[key]=row;
          });
          setCustomSS(prev=>{const n={...prev,[name]:ssMap};_customSS=n;return n;});
          setShowAdd(false);
        }}
        sosByYear={customSoS}
      />}
    </div>
  );
}

export default App;



