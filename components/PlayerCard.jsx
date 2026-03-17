// /components/PlayerCard.jsx

import React, { useState } from "react";
import { ALL_PLAYERS_BASE, TIER_STYLE, RUSH_ARCH_COLORS, RECV_ARCH_COLORS } from '../data/playersBase.js';
import { ArchTag, SeasonStatTable, AthleticPanel, NFLPanel, CompsPanel, TrajectoryTiles, ProductionChart, OverviewSummary, ProductionTrajectoryChart } from '../logic/scoring.jsx';

export default function PlayerCard({player, data, onClose, onSelectPlayer}) {
  const ts = TIER_STYLE[data.tier]||TIER_STYLE.Fringe;
  const accent = ts.accent;
  const [tab,setTab] = useState("overview");

  const tabs = [
    {key:"overview",label:"OVERVIEW"},
    {key:"seasons",label:"SEASONS"},
    {key:"athletic",label:"ATHLETIC"},
    {key:"nfl",label:"NFL"},
    {key:"comps",label:"COMPS"},
    {key:"recruiting",label:"RECRUITING"},
  ];

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:1000,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",boxSizing:"border-box"}}>
      <div style={{background:"#111724",borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,0.8)",maxWidth:1000,width:"100%",maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,"+accent+"15,"+accent+"08)",borderBottom:"1px solid rgba(255,255,255,0.08)",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <div style={{fontSize:28,fontWeight:900,color:accent,lineHeight:1}}>{data.prospect_score!=null?data.prospect_score.toFixed(1):"—"}</div>
              <div>
                <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>{player}</div>
                <div style={{fontSize:12,color:"#666",marginTop:2}}>
                  {data.draft_class} · <span style={{color:accent}}>{data.tier.toUpperCase()}</span>
                  {data.is_projection&&<span style={{color:"#00838f",marginLeft:8}}>★ 2026 PROJECTION</span>}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {data.rush_arch&&<ArchTag label={data.rush_arch} colors={RUSH_ARCH_COLORS}/>}
              {data.recv_arch&&<ArchTag label={data.recv_arch} colors={RECV_ARCH_COLORS}/>}
            </div>
            <div style={{fontSize:11,color:"#777",lineHeight:1.5,maxWidth:600}}>
              {data.bio||"No bio available."}
            </div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",padding:"8px 12px",borderRadius:6,fontSize:12,cursor:"pointer",marginLeft:20}}>
            ✕ CLOSE
          </button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{flex:1,padding:"12px 16px",border:"none",background:tab===t.key?accent+"15":"transparent",color:tab===t.key?accent:"#666",fontSize:11,letterSpacing:1.5,fontWeight:tab===t.key?700:500,cursor:"pointer",borderBottom:tab===t.key?"2px solid "+accent:"none"}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
          {tab==="overview"&&(
            <div>
              <OverviewSummary data={data} accent={accent}/>
              <TrajectoryTiles data={data} accent={accent} recruiting={data.recruiting}/>
              <ProductionChart data={data} accent={accent}/>
            </div>
          )}
          {tab==="seasons"&&(
            <div>
              <ProductionTrajectoryChart data={data} accent={accent}/>
              <SeasonStatTable playerName={player} seasons={data.seasons} accent={accent}/>
            </div>
          )}
          {tab==="athletic"&&<AthleticPanel data={data} accent={accent}/>}
          {tab==="nfl"&&<NFLPanel nfl={data.nfl} accent={accent} isDraftClass={data.is_projection} projT12={data.proj_t12} projT24={data.proj_t24} projT12Rank={data.proj_t12_rank} projT24Rank={data.proj_t24_rank} totalPlayers={Object.keys(ALL_PLAYERS_BASE).length}/>}
          {tab==="comps"&&<CompsPanel playerName={player} data={data} accent={accent} onSelectPlayer={onSelectPlayer}/>}
          {tab==="recruiting"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:"14px 16px"}}>
              <div style={{fontSize:10,color:"#555",letterSpacing:2,marginBottom:8}}>RECRUITING PROFILE</div>
              {data.recruiting ? (
                <div>
                  <div style={{fontSize:12,color:"#ddd",marginBottom:6}}>
                    {(data.recruiting.school || "Unknown School")} · {(data.recruiting.enrolled || "Unknown Class")}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    <div style={{background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#555"}}>National</div>
                      <div style={{fontSize:18,color:"#f0c040",fontWeight:800}}>{data.recruiting.national_rank || "—"}</div>
                    </div>
                    <div style={{background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#555"}}>Position (RB)</div>
                      <div style={{fontSize:18,color:"#f0c040",fontWeight:800}}>{data.recruiting.position_rank || "—"}</div>
                    </div>
                    <div style={{background:"rgba(255,255,255,0.04)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                      <div style={{fontSize:9,color:"#555"}}>In-State</div>
                      <div style={{fontSize:18,color:"#f0c040",fontWeight:800}}>{data.recruiting.state_rank || "—"}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{fontSize:11,color:"#666",lineHeight:1.6}}>
                  Recruiting detail not available for this player in the current source rows.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}