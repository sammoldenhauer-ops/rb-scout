import React, { useMemo } from 'react';
import { IDEALS, STDEVS, ALL_PLAYERS, TIER_STYLE } from '../data/playersBase.js';

export default function IdealBuildPage({onOpenPlayer}) {
  // Compute top 10 closest to ideal
  const idealRanked = useMemo(()=>{
    const scored = Object.entries(ALL_PLAYERS).map(([name,p])=>{
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
  },[]);

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
            <text x="9" y="202" fill="#f0c040" fontSize="7.5" fontFamily="monospace" textAnchor="middle" transform="rotate(-90,9,202)" opacity="0.65">70.99″</text>

            <line x1="2"   y1="105" x2="198" y2="105" stroke="rgba(77,166,255,0.18)" strokeWidth="1"/>
            <line x1="2"   y1="101" x2="2"   y2="109" stroke="rgba(77,166,255,0.18)" strokeWidth="1"/>
            <line x1="198" y1="101" x2="198" y2="109" stroke="rgba(77,166,255,0.18)" strokeWidth="1"/>
            <text x="100" y="117" fill="#4da6ff" fontSize="7.5" fontFamily="monospace" textAnchor="middle" opacity="0.68">wing 74.9″</text>

            <text x="100" y="378" fill="#777" fontSize="8" fontFamily="monospace" textAnchor="middle">217 lbs</text>
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