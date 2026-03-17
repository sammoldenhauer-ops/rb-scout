import React, { useState, useMemo } from 'react';
import { ARCHETYPE_DEFS, RUSH_ARCH_COLORS, RECV_ARCH_COLORS, TIER_STYLE, ALL_PLAYERS } from '../data/playersBase.js';
import { ArchTag } from '../logic/scoring.jsx';

function ArchetypeCard({arch, side, onFilter, activeFilter}) {
  const color = arch.color;
  const isActive = activeFilter === arch.key;
  const playerCount = Object.values(ALL_PLAYERS).filter(p=>
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

export default function ArchetypePage({onFilter, rushFilter, recvFilter, onOpenPlayer}) {
  const [side,setSide] = useState("rush");
  const archs = ARCHETYPE_DEFS[side];

  // Players matching active archetype filter
  const filteredPlayers = useMemo(()=>{
    const activeKey = side==="rush" ? rushFilter : recvFilter;
    if (!activeKey) return [];
    return Object.entries(ALL_PLAYERS)
      .filter(([,d])=> side==="rush" ? d.rush_arch===activeKey : d.recv_arch===activeKey)
      .sort(([,a],[,b])=>a.rank-b.rank)
      .slice(0,24);
  },[side,rushFilter,recvFilter]);

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
            activeFilter={activeFilter}/>
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