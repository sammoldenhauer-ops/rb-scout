import React, { useState, useMemo } from "react";
import { SEASON_SCORE_RANKS, STAT_LABELS, STAT_IDX, sosColor } from '../logic/scoring.jsx';
import { ALL_PLAYERS_BASE, TIER_STYLE, RUSH_ARCH_COLORS, RECV_ARCH_COLORS, SEASON_STATS_BASE } from '../data/playersBase.js';

export function ArchTag({label, colors}) {
  const color = colors[label] || "#888";
  return <span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,marginRight:4,marginBottom:3,fontSize:9,fontWeight:700,letterSpacing:1,background:color+"18",border:"1px solid "+color+"55",color}}>{label}</span>;
}

export function Bar({label, value, max=100, color="#4da6ff"}) {
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

export function Hex({values, color, size=200}) {
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

export function Sparkline({seasons, color, width=580, height=170}) {
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

export function PctBar({pct, inverted=false}) {
  if (pct==null) return <span style={{color:"#333",fontSize:11}}>—</span>;
  const display = inverted ? (100-pct) : pct;
  const c = display>=75?"#5dbf6a":display>=40?"#f0c040":"#f0873a";
  return (
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      <div style={{width:56,height:11,borderRadius:4,background:"rgba(255,255,255,0.07)",flexShrink:0}}>
        <div style={{height:"100%",width:display+"%",background:c,borderRadius:4}}/>
      </div>
      <span style={{fontSize:11,color:c,fontWeight:700,minWidth:28}}>{Math.round(display)}th</span>
    </div>
  );
}

export function SOSBadge({season}) {
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

export function SeasonStatTable({playerName, seasons, accent}) {
  const [group,setGroup] = useState("rush");
  const ssData = (SEASON_STATS_BASE&&SEASON_STATS_BASE[playerName])||{};
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
        {[["rush","Rushing","#f0873a"],["recv","Receiving","#5dbf6a"]].map(([g,lbl,c])=>((
          <button key={g} onClick={()=>setGroup(g)} style={{padding:"5px 14px",borderRadius:6,border:"1px solid "+(group===g?c:c+"33"),background:group===g?c+"18":"transparent",color:group===g?c:"#555",fontSize:9,letterSpacing:2,fontWeight:group===g?700:400}}>
            {lbl.toUpperCase()}
          </button>
        )))}
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
                const rankColor=(r,tot)=>{
                  if(!r||!tot) return "#555";
                  const pct=(r-1)/tot;
                  if(pct<=0.10) return "#f0c040";
                  if(pct<=0.20) return "#4da6ff";
                  if(pct<=0.40) return "#5dbf6a";
                  if(pct<=0.60) return "#f0e040";
                  if(pct<=0.80) return "#f0873a";
                  return "#e05050";
                };
                return (
                  <th key={sn} style={{textAlign:"center",padding:"4px 10px",color:accent,fontSize:12,minWidth:120}}>
                    {/* Rush score + rank */}
                    <div style={{marginBottom:3,padding:"4px 6px",borderRadius:5,background:"rgba(240,135,58,0.08)",border:"1px solid rgba(240,135,58,0.15)"}}>
                      <div style={{fontSize:7,color:"#f0873a",letterSpacing:1,marginBottom:1}}>RUSH</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        <span style={{fontSize:13,fontWeight:800,color:"#f0873a"}}>{rushScore!=null?rushScore.toFixed(1):"—"}</span>
                        {rushRank&&<span style={{fontSize:8,color:rankColor(rushRank,rushTotal),fontWeight:700}}>{"#"+rushRank+"/"+rushTotal}</span>}
                      </div>
                    </div>
                    {/* Recv score + rank */}
                    <div style={{marginBottom:4,padding:"4px 6px",borderRadius:5,background:"rgba(93,191,106,0.08)",border:"1px solid rgba(93,191,106,0.15)"}}>
                      <div style={{fontSize:7,color:"#5dbf6a",letterSpacing:1,marginBottom:1}}>RECV</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        <span style={{fontSize:13,fontWeight:800,color:"#5dbf6a"}}>{recvScore!=null?recvScore.toFixed(1):"—"}</span>
                        {recvRank&&<span style={{fontSize:8,color:rankColor(recvRank,recvTotal),fontWeight:700}}>{"#"+recvRank+"/"+recvTotal}</span>}
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
              const isBay = key==="BAY%";
              return (
                <tr key={key} style={{background:ri%2===0?"rgba(255,255,255,0.015)":"transparent",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                  <td style={{padding:"8px 8px",color:"#999",fontSize:11,position:"sticky",left:0,background:ri%2===0?"rgba(9,14,24,0.97)":"rgba(8,12,20,0.97)",zIndex:1}}>
                    {label}
                    {isBay&&<span style={{color:"#f0873a",fontSize:7,marginLeft:3}} title="Higher percentile = LESS breakaway ability">⚠ INV</span>}
                    {lb&&!isBay&&<span style={{color:"#555",fontSize:8,marginLeft:3}}>(↓)</span>}
                  </td>
                  {seasonKeys.map(sn=>{
                    const row=(ssData[sn]||[]);
                    const pair=row[idx];
                    return (
                      <td key={sn} style={{padding:"5px 10px",verticalAlign:"middle"}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,justifyContent:"flex-start"}}>
                          <span style={{fontSize:14,fontWeight:800,color:"#e0e0e0",minWidth:38,textAlign:"right",flexShrink:0}}>{pair&&pair[0]!=null?(Number.isInteger(pair[0])?pair[0]:pair[0].toFixed(2)):"—"}</span>
                          <PctBar pct={pair?pair[1]:null} inverted={isBay}/>
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
      <div style={{marginTop:8,fontSize:9,color:"#333"}}>Percentile vs all RBs in draft season · 100th = best · ⚠ INV = higher raw % = worse</div>
    </div>
  );
}

export function AthleticPanel({data, accent}) {
  const athl = data.athletic;
  const score = data.athl_score;
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

export function CompsPanel({playerName, data, accent, onSelectPlayer}) {
  // ── Live similarity engine ──────────────────────────────────────────────────
  const comps = useMemo(()=>{
    const others = Object.entries(ALL_PLAYERS_BASE).filter(([n])=>n!==playerName);
    if(!others.length) return null;

    // Normalise a value 0-100 given a key across all players
    const allVals = key => Object.values(ALL_PLAYERS_BASE).map(p=>p[key]).filter(v=>v!=null);
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
    const athlPlayers = Object.values(ALL_PLAYERS_BASE).filter(p=>p.athletic);
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
      const p=ALL_PLAYERS_BASE[n]; const v=rushVec(p);
      return dist(null,null, RUSH_W.map((w,i)=>[myRush[i],v[i],w]));
    };
    const recvDist = n => {
      const p=ALL_PLAYERS_BASE[n]; const v=recvVec(p);
      return dist(null,null, RECV_W.map((w,i)=>[myRecv[i],v[i],w]));
    };
    const athlDist = n => {
      const p=ALL_PLAYERS_BASE[n]; if(!p.athletic||!me.athletic) return 999;
      const v=athlVec(p);
      return dist(null,null, ATHL_W.map((w,i)=>[myAthl[i],v[i],w]));
    };
    const ovrlDist = n => {
      const p=ALL_PLAYERS_BASE[n];
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
          tier: ALL_PLAYERS_BASE[nm]?.tier,
          score: ALL_PLAYERS_BASE[nm]?.prospect_score,
          draft_class: ALL_PLAYERS_BASE[nm]?.draft_class,
          rush_arch: ALL_PLAYERS_BASE[nm]?.rush_arch,
          recv_arch: ALL_PLAYERS_BASE[nm]?.recv_arch,
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

export function TrajectoryTiles({data, accent, recruiting}) {
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
        {tiles.map(({label,value,color,sublabel,desc})=>(((
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
        ))))}
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
                    {strengths.map((s,i)=>(((
                      <div key={i} style={{display:"flex",gap:8,marginBottom:i<strengths.length-1?10:0,alignItems:"flex-start"}}>
                        <span style={{color:"#5dbf6a",fontSize:10,flexShrink:0,marginTop:1}}>✓</span>
                        <span style={{fontSize:10,color:"#ccc",lineHeight:1.6}}>{s}</span>
                      </div>
                    ))))}
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
                    {weaknesses.map((w,i)=>(((
                      <div key={i} style={{display:"flex",gap:8,marginBottom:i<weaknesses.length-1?10:0,alignItems:"flex-start"}}>
                        <span style={{color:"#f0873a",fontSize:10,flexShrink:0,marginTop:1}}>⚠</span>
                        <span style={{fontSize:10,color:"#ccc",lineHeight:1.6}}>{w}</span>
                      </div>
                    ))))}
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

export function ProductionChart({data, accent}) {
  const currentPts = (data.seasons||[]).filter(s=>s.c!=null).sort((a,b)=>a.n-b.n);
  if(!currentPts.length) return null;
  const otherPaths = useMemo(()=>{
    const paths = [];
    Object.entries(ALL_PLAYERS_BASE).forEach(([name,p])=>{
      if(name===data.name) return;
      const pts=(p.seasons||[]).filter(s=>s.c!=null).sort((a,b)=>a.n-b.n);
      if(pts.length>=2) paths.push(pts);
    });
    return paths;
  },[data.name]);
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