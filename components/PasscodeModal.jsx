import React from 'react';

export default function PasscodeModal({onSuccess, onClose}) {
  const CORRECT = '098989';
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
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{
        background:'linear-gradient(145deg,#0d1117,#111827)',
        border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:16,
        padding:'32px 28px',
        width:'100%',
        maxWidth:360,
        textAlign:'center',
        fontFamily:'monospace',
      }}>
        {/* Lock icon */}
        <div style={{fontSize:36,marginBottom:16}}>🔐</div>

        {/* Title */}
        <div style={{fontSize:15,fontWeight:700,color:'#fff',marginBottom:8,letterSpacing:-0.3}}>
          Developer Access
        </div>

        {/* Prompt */}
        <div style={{fontSize:11,color:'#666',lineHeight:1.7,marginBottom:24}}>
          Enter passcode to access this feature.<br/>
          <em style={{color:'#555'}}>Only developer(s) will have this code.</em>
        </div>

        {/* 6-digit boxes */}
        <div style={{
          display:'flex',
          gap:10,
          justifyContent:'center',
          marginBottom:20,
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
                width:44,
                height:54,
                textAlign:'center',
                fontSize:22,
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
          fontSize:11,
          color:'#e05050',
          marginBottom:16,
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