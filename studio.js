/* ============================================================
   Pixel Studio — functional engine
   - Real video generation via fal.ai (bring-your-own-key), with a
     zero-setup Mock mode fallback so the app always works.
   - localStorage persistence: API key, settings, saved projects.
   - Real <video> previews + sequence playback.
   - Export: downloads every rendered clip + a manifest.json.
   Provider is swappable: see PROVIDERS below.
   ============================================================ */
(function(){
const $=id=>document.getElementById(id);
const LS={ key:'pixel_fal_key', proxy:'pixel_proxy_url', settings:'pixel_settings', projects:'pixel_projects', current:'pixel_current' };

/* ---- provider registry (swappable) ------------------------------ */
// Each fal model id + how to map our scene -> its input payload.
const PROVIDERS={
  'fal-ltx':   { falId:'fal-ai/ltx-video',            label:'LTX Video',
                 input:s=>({ num_frames:121, aspect_ratio:aspectRatio() }) },
  'fal-kling': { falId:'fal-ai/kling-video/v1.6/standard/text-to-video', label:'Kling 1.6',
                 input:s=>({ duration:"5", aspect_ratio:aspectRatio() }) },
  'fal-luma':  { falId:'fal-ai/luma-dream-machine',   label:'Luma Dream Machine',
                 input:s=>({ aspect_ratio:aspectRatio() }) },
  'fal-wan':   { falId:'fal-ai/wan-t2v',              label:'Wan 2.2',
                 input:s=>({ aspect_ratio:aspectRatio() }) },
};
function aspectRatio(){ const b=document.querySelector('#aspect button.on'); return b?b.dataset.a:'16:9'; }
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

/* ---- persisted settings ----------------------------------------- */
let settings = loadJSON(LS.settings, { parallel:3 });
function loadJSON(k,def){ try{const v=localStorage.getItem(k);return v?JSON.parse(v):def;}catch(e){return def;} }
function saveJSON(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch(e){} }
function getKey(){ try{return localStorage.getItem(LS.key)||'';}catch(e){return '';} }
function setKey(v){ try{ v?localStorage.setItem(LS.key,v):localStorage.removeItem(LS.key);}catch(e){} }

/* ---- state ------------------------------------------------------ */
const grads=[
  'linear-gradient(135deg,#10204a,#070711)','linear-gradient(135deg,#3a2410,#140d08)',
  'linear-gradient(135deg,#2a1040,#0a0717)','linear-gradient(135deg,#103a2a,#07120d)',
  'linear-gradient(135deg,#3a1020,#1a070f)','linear-gradient(135deg,#10284a,#070d17)',
  'linear-gradient(135deg,#241040,#0d0717)','linear-gradient(135deg,#103a36,#07120f)'
];
let state={ scenes:[], selected:null, playing:false, playT:0, name:'Untitled film' };

/* ---- toast & mode badge ----------------------------------------- */
function toast(msg,ms){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),ms||2800);}
function currentMode(){ const m=$('model').value; return (m!=='mock' && getProxy()) ? 'real' : 'mock'; }
function refreshModeBadge(){
  const real=currentMode()==='real';
  const b=$('modeBadge');
  b.textContent = real ? (PROVIDERS[$('model').value]?.label||'Live') : 'Mock';
  b.classList.toggle('modeBadge-real', real);
}

/* ============================================================
   1. Break script into scenes
   ============================================================ */
function shortTitle(s){const w=s.replace(/[^a-zA-Z ]/g,'').split(/\s+/).filter(Boolean).slice(0,4).join(' ');return w.charAt(0).toUpperCase()+w.slice(1);}
function breakIntoScenes(){
  const text=$('script').value.trim();
  if(!text){toast('Add a script first.');return;}
  const target=+$('length').value, style=$('style').value;
  let units=text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const want=Math.max(3,Math.round(target/13));
  while(units.length<want){
    let li=units.reduce((m,u,i,a)=>u.length>a[m].length?i:m,0);
    const parts=units[li].split(/,\s+/);
    if(parts.length>1){units.splice(li,1,parts.slice(0,Math.ceil(parts.length/2)).join(', '),parts.slice(Math.ceil(parts.length/2)).join(', '));}
    else units.push(units[li]+' (continued)');
  }
  units=units.slice(0,Math.max(want,units.length>want?want:units.length));
  const seedBase=Math.floor(Math.random()*90000);
  state.scenes=units.map((u,i)=>({
    id:'sc'+i+'_'+Date.now(), n:i+1, title:shortTitle(u),
    prompt:`${style} shot — ${u}`, seed:seedBase+i, grad:grads[i%grads.length],
    status:'idle', progress:0, dur:8, videoUrl:null, error:null
  }));
  state.selected=null;
  renderAllUI();
  $('tlLabel').textContent=`Timeline — ${state.scenes.length} scenes · seed-locked`;
  toast(`Split into ${state.scenes.length} scenes. Ready to render.`);
  autosave();
}

/* ============================================================
   2. Generation — real fal.ai via proxy, or recorded mock video
   ============================================================
   Browsers can't call queue.fal.run directly (CORS). So real
   generation routes through a Cloudflare Worker proxy whose URL
   the user sets in Settings. The proxy adds CORS + the fal key.
   We always use the status_url / response_url that fal returns
   (never reconstruct them).
   ============================================================ */
function getProxy(){ try{return localStorage.getItem(LS.proxy)||'';}catch(e){return '';} }
function setProxy(v){ try{ v?localStorage.setItem(LS.proxy,v):localStorage.removeItem(LS.proxy);}catch(e){} }

// Map a fal absolute URL (queue.fal.run/...) onto the proxy origin.
function viaProxy(falUrl){
  const proxy=getProxy().replace(/\/$/,'');
  const path=falUrl.replace(/^https:\/\/queue\.fal\.run\//,'');
  return `${proxy}/${path}`;
}
async function falGenerate(scene){
  const prov=PROVIDERS[$('model').value]; if(!prov) throw new Error('Unknown model');
  const proxy=getProxy().replace(/\/$/,'');
  if(!proxy) throw new Error('Set a Proxy URL in Settings');
  const headers={'Content-Type':'application/json'};
  const key=getKey(); if(key) headers['X-Fal-Key']=key; // BYO key; omitted if proxy holds a shared key

  // submit
  const submit=await fetch(`${proxy}/${prov.falId}`,{method:'POST',headers,body:JSON.stringify(
    Object.assign({prompt:scene.prompt, seed:scene.seed}, prov.input?prov.input(scene):{})
  )});
  if(!submit.ok){ throw new Error('Submit '+submit.status+' — '+(await safeMsg(submit))); }
  const job=await submit.json();
  if(!job.status_url || !job.response_url){ throw new Error('Bad submit response'); }
  const statusUrl=viaProxy(job.status_url);
  const respUrl  =viaProxy(job.response_url);

  // poll status until COMPLETED
  let tries=0;
  while(tries++<150){ // ~5 min @2s
    await sleep(2000);
    const st=await fetch(statusUrl,{headers});
    if(!st.ok) continue;
    const sj=await st.json();
    if(sj.status==='COMPLETED') break;
    if(sj.status==='FAILED'||sj.status==='ERROR'){ throw new Error('Generation failed'); }
    // IN_QUEUE / IN_PROGRESS → show estimated progress
    scene.progress=Math.min(95, 8+tries*4); renderScenes(); renderQueue();
    if(state.selected===scene.id) renderInspector();
  }
  // fetch result
  const res=await fetch(respUrl,{headers});
  if(!res.ok) throw new Error('Result '+res.status);
  const data=await res.json();
  const url = data?.video?.url || data?.video_url
           || (Array.isArray(data?.videos)&&data.videos[0]?.url)
           || (Array.isArray(data?.images)&&data.images[0]?.url);
  if(!url) throw new Error('No video URL in result');
  return url;
}
async function safeMsg(resp){ try{const j=await resp.clone().json();return j.error||j.detail||'';}catch(e){return '';} }

/* --- Mock: render a REAL animated clip via canvas + MediaRecorder --- */
// Produces an actual playable/downloadable webm so mock mode isn't faked.
function canRecord(){ return typeof MediaRecorder!=='undefined' && HTMLCanvasElement.prototype.captureStream; }
async function mockGenerate(scene){
  // animate progress UI
  const total=1400; const t0=performance.now();
  if(!canRecord()){
    // no MediaRecorder → just progress, gradient preview stands in
    while(performance.now()-t0<total){ scene.progress=Math.min(99,((performance.now()-t0)/total)*100); renderScenes();renderQueue(); await sleep(120); }
    scene.progress=100; return null;
  }
  const cv=document.createElement('canvas'); cv.width=640; cv.height=360;
  const ctx=cv.getContext('2d');
  const stream=cv.captureStream(30);
  let mime='video/webm;codecs=vp9'; if(!MediaRecorder.isTypeSupported(mime)) mime='video/webm';
  const rec=new MediaRecorder(stream,{mimeType:mime}); const chunks=[];
  rec.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
  const done=new Promise(r=>rec.onstop=r);
  rec.start();
  // derive colors from the scene gradient seed
  const hueA=(scene.seed*37)%360, hueB=(hueA+60)%360;
  const start=performance.now();
  await new Promise(resolve=>{
    function frame(){
      const el=performance.now()-start; const p=Math.min(1, el/2200);
      // diffusion-style: noise resolving into a warm formed frame
      ctx.fillStyle=`hsl(${hueA},40%,6%)`; ctx.fillRect(0,0,640,360);
      const grd=ctx.createRadialGradient(320,180,0,320,180,260);
      grd.addColorStop(0,`hsla(${hueB},80%,${30+p*25}%,${0.3+p*0.5})`);
      grd.addColorStop(1,`hsla(${hueA},60%,8%,0)`);
      ctx.fillStyle=grd; ctx.fillRect(0,0,640,360);
      // drifting particles that settle as p->1
      for(let i=0;i<70;i++){
        const a=i/70*Math.PI*2 + el*0.0006*(1-p);
        const r=120*(1-p)+ (40+i)*p*0.6;
        const x=320+Math.cos(a+i)*r + (1-p)*(Math.sin(el*0.002+i)*120);
        const y=180+Math.sin(a*1.3+i)*r*0.7 + (1-p)*(Math.cos(el*0.0017+i)*80);
        ctx.fillStyle=`hsla(${hueB},90%,65%,${0.15+p*0.5})`;
        ctx.beginPath(); ctx.arc(x,y,1.5+p*1.5,0,Math.PI*2); ctx.fill();
      }
      ctx.fillStyle=`rgba(246,245,255,${p*0.9})`;
      ctx.font='600 22px Inter, sans-serif'; ctx.textAlign='center';
      ctx.fillText(`Scene ${scene.n}`, 320, 330);
      scene.progress=Math.min(99, p*100); renderScenes(); renderQueue();
      if(state.selected===scene.id) renderInspector();
      if(el<2200){ requestAnimationFrame(frame); } else { resolve(); }
    }
    requestAnimationFrame(frame);
  });
  rec.stop(); await done;
  scene.progress=100;
  const blob=new Blob(chunks,{type:mime});
  return URL.createObjectURL(blob); // a real, playable object URL
}

let activeRenders=0, queueRunning=false;
async function renderScene(scene){
  scene.status='rendering'; scene.progress=Math.max(scene.progress,4); scene.error=null;
  renderScenes(); renderQueue();
  try{
    if(currentMode()==='real'){
      scene.videoUrl = await falGenerate(scene);
    } else {
      scene.videoUrl = await mockGenerate(scene);
    }
    scene.status='done'; scene.progress=100;
  }catch(err){
    scene.status='error'; scene.error=err.message||'Failed';
    toast(`Scene ${scene.n}: ${scene.error}`, 4000);
  }
  renderScenes(); renderQueue();
  if(state.selected===scene.id) renderInspector();
  autosave();
}

async function pump(){
  if(queueRunning) return; queueRunning=true;
  const parallel = currentMode()==='real' ? (settings.parallel||3) : 3;
  while(true){
    const idle=state.scenes.filter(s=>s.status==='idle');
    const running=state.scenes.filter(s=>s.status==='rendering').length;
    if(!idle.length && running===0) break;
    const slots=Math.max(0, parallel-running);
    const batch=idle.slice(0,slots);
    if(batch.length) await Promise.all(batch.map(renderScene));
    else await sleep(150);
  }
  queueRunning=false;
  buildPlayback();
  const errs=state.scenes.filter(s=>s.status==='error').length;
  toast(errs?`Done with ${errs} error(s). Re-roll to retry.`:'Render complete. Your cut is ready.');
}

function renderAll(){
  const pending=state.scenes.filter(s=>s.status!=='done');
  if(!pending.length){toast('Break your script into scenes first.');return;}
  if(currentMode()==='real'){
    toast(`Generating ${pending.length} scenes on ${PROVIDERS[$('model').value].label}…`,3500);
  } else {
    toast(`Rendering ${pending.length} scenes (mock preview)…`);
  }
  pending.forEach(s=>{ if(s.status==='error'){s.status='idle';s.progress=0;} });
  pump();
}

/* ============================================================
   3. UI rendering
   ============================================================ */
function renderAllUI(){ renderScenes(); renderQueue(); renderInspector(); }

function renderScenes(){
  const wrap=$('scenes');
  if(!state.scenes.length){wrap.innerHTML='<div style="color:var(--ink-faint);font-size:12.5px;padding:24px 4px">Your scenes will appear here as a filmstrip.</div>';return;}
  wrap.innerHTML='';
  state.scenes.forEach(s=>{
    const el=document.createElement('div');
    el.className='sc '+s.status+(state.selected===s.id?' sel':'')+(s.status==='idle'?' queued':'');
    const label=s.status==='done'?'Ready':s.status==='rendering'?Math.round(s.progress)+'%':s.status==='error'?'Error':'Queued';
    const thumb = s.videoUrl
      ? `<video class="thumb" src="${s.videoUrl}#t=0.1" muted preserveAspectRatio style="object-fit:cover"></video>`
      : `<div class="thumb" style="background:${s.grad}"></div>`;
    el.innerHTML=`${thumb}
      <div class="meta"><div class="t">${s.n}. ${s.title}</div>
        <div class="s"><span class="pip"></span>${label} · ${s.dur}s</div></div>
      <div class="pbar"><i style="width:${s.status==='done'?100:s.progress}%"></i></div>`;
    el.onclick=()=>{state.selected=s.id;renderScenes();renderInspector();showFrame(s);};
    wrap.appendChild(el);
  });
}

function renderQueue(){
  const done=state.scenes.filter(s=>s.status==='done').length;
  const rend=state.scenes.filter(s=>s.status==='rendering').length;
  const q=state.scenes.filter(s=>s.status==='idle').length;
  $('statDone').textContent=done;$('statRender').textContent=rend;$('statQueue').textContent=q;
  const list=$('queueList');
  if(!state.scenes.length){list.innerHTML='<p class="empty-insp">Nothing queued yet.</p>';return;}
  list.innerHTML='';
  state.scenes.forEach(s=>{
    const r=document.createElement('div');r.className='qrow '+s.status;
    const st=s.status==='done'?'✓ Ready':s.status==='rendering'?Math.round(s.progress)+'%':s.status==='error'?'⚠ Error':'Queued';
    r.innerHTML=`<div class="qi" style="background:${s.grad}"></div>
      <div class="qt"><div class="a">${s.n}. ${s.title}</div><div class="b">seed ${s.seed} · ${s.dur}s</div></div>
      <div class="qstate">${st}</div>`;
    list.appendChild(r);
  });
}

function renderInspector(){
  const ins=$('inspector');
  const s=state.scenes.find(x=>x.id===state.selected);
  if(!s){ins.innerHTML='<p class="empty-insp">Select a scene from the timeline to edit its prompt, re-roll it, or change its seed.</p>';return;}
  const preview = s.videoUrl
    ? `<video class="insp-thumb" src="${s.videoUrl}" controls muted loop style="object-fit:cover"></video>`
    : `<div class="insp-thumb" style="background:${s.grad}"></div>`;
  ins.innerHTML=`${preview}
    <label class="fld">Scene ${s.n} prompt</label>
    <textarea class="insp-prompt" id="inspPrompt">${s.prompt}</textarea>
    <div class="row" style="margin-top:10px">
      <div class="ctrl"><label class="fld">Seed</label><input class="numin" id="inspSeed" value="${s.seed}"></div>
      <div class="ctrl"><label class="fld">Duration (s)</label><input class="numin" id="inspDur" value="${s.dur}"></div>
    </div>
    ${s.error?`<p class="hint" style="color:#ff8a9c">Last error: ${s.error}</p>`:''}
    <div class="insp-actions">
      <button class="btn btn-ghost" id="reroll">⟳ Re-roll</button>
      <button class="btn btn-amber" id="applyScene">Apply</button>
    </div>
    <p class="hint">Re-rolling regenerates only this scene. A new seed changes the shot; the same seed keeps it consistent.</p>`;
  $('reroll').onclick=()=>{
    s.seed=Math.floor(Math.random()*90000); s.grad=grads[Math.floor(Math.random()*grads.length)];
    s.status='idle'; s.progress=0; s.videoUrl=null; s.error=null;
    renderAllUI(); pump(); toast(`Re-rolling scene ${s.n}.`);
  };
  $('applyScene').onclick=()=>{
    s.prompt=$('inspPrompt').value; s.seed=+$('inspSeed').value||s.seed; s.dur=Math.max(2,+$('inspDur').value||8);
    renderScenes();renderQueue();toast('Scene updated.');autosave();
  };
}

/* ============================================================
   4. Preview + playback (real video when available)
   ============================================================ */
function showFrame(s){
  $('playerEmpty').style.display='none';
  const vid=$('playerVideo'), frame=$('playerFrame');
  if(s.videoUrl){
    frame.style.display='none';
    vid.style.display='block'; vid.src=s.videoUrl; vid.currentTime=0; vid.pause();
  }else{
    vid.style.display='none'; vid.removeAttribute('src');
    frame.style.display='block'; frame.style.background=s.grad; frame.style.backgroundSize='cover';
  }
  $('playerOv').style.display='block';
  $('playerOv').textContent=`Scene ${s.n} · ${s.title} · seed ${s.seed}`;
}

let playTimer=null,totalDur=0,frameStops=[];
function buildPlayback(){
  const done=state.scenes.filter(s=>s.status==='done');
  if(!done.length)return;
  $('playerCtrl').style.display='flex';
  totalDur=done.reduce((a,s)=>a+s.dur,0);
  frameStops=[];let acc=0;done.forEach(s=>{frameStops.push({t:acc,end:acc+s.dur,scene:s});acc+=s.dur;});
  state.playT=0;updatePlayhead();
  $('ttime').textContent=`00:00 / ${fmt(totalDur)}`;
}
function fmt(sec){const m=Math.floor(sec/60),s=Math.floor(sec%60);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function currentStop(){let cur=frameStops[0];for(const fs of frameStops){if(state.playT>=fs.t)cur=fs;}return cur;}
function updatePlayhead(){
  const pct=totalDur?state.playT/totalDur*100:0;
  $('scrubFill').style.width=pct+'%';
  $('ttime').textContent=`${fmt(state.playT)} / ${fmt(totalDur)}`;
  const cur=currentStop(); if(!cur)return;
  const s=cur.scene; const vid=$('playerVideo'), frame=$('playerFrame');
  $('playerEmpty').style.display='none';
  if(s.videoUrl){
    frame.style.display='none'; vid.style.display='block';
    const want=s.videoUrl;
    if(vid.src!==want){ vid.src=want; }
    const local=Math.min(s.dur, state.playT-cur.t);
    if(state.playing){ if(vid.paused) vid.play().catch(()=>{}); }
    else { vid.pause(); try{vid.currentTime=local;}catch(e){} }
  }else{
    vid.style.display='none'; frame.style.display='block';
    frame.style.background=s.grad; frame.style.backgroundSize='cover';
  }
  $('playerOv').style.display='block';
  $('playerOv').textContent=`Scene ${s.n} · ${s.title}`;
}
function togglePlay(){
  if(!totalDur){toast('Render scenes first.');return;}
  state.playing=!state.playing; $('playBtn').textContent=state.playing?'❚❚':'▶';
  const vid=$('playerVideo');
  if(state.playing){
    playTimer=setInterval(()=>{
      state.playT+=0.1;
      if(state.playT>=totalDur){state.playT=totalDur;togglePlay();}
      updatePlayhead();
    },100);
  } else { clearInterval(playTimer); if(vid) vid.pause(); }
}

/* ============================================================
   5. Export — clips + manifest
   ============================================================ */
async function exportFilm(){
  const done=state.scenes.filter(s=>s.status==='done');
  if(!done.length){toast('Nothing to export yet — render some scenes.');return;}
  const manifest={
    project:state.name, created:new Date().toISOString(),
    aspect:aspectRatio(), totalSeconds:done.reduce((a,s)=>a+s.dur,0),
    model:$('model').value,
    scenes:done.map(s=>({n:s.n,title:s.title,prompt:s.prompt,seed:s.seed,dur:s.dur,videoUrl:(s.videoUrl&&!s.videoUrl.startsWith('blob:'))?s.videoUrl:null}))
  };
  downloadBlob(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}), `${slug(state.name)}-manifest.json`);
  const withVideo=done.filter(s=>s.videoUrl);
  if(withVideo.length){
    toast(`Downloading ${withVideo.length} clip(s) + manifest…`,3500);
    for(const s of withVideo){
      try{
        const r=await fetch(s.videoUrl); const b=await r.blob();
        const ext=b.type.includes('webm')?'webm':(b.type.includes('mp4')?'mp4':'mp4');
        downloadBlob(b, `${slug(state.name)}-scene-${String(s.n).padStart(2,'0')}.${ext}`);
        await sleep(400);
      }catch(e){ /* cross-origin remote clips may block fetch; manifest keeps the URL */ }
    }
  } else {
    toast('Exported manifest. Render scenes to get clip files.',4000);
  }
}
function slug(s){return (s||'pixel').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'pixel';}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

/* ============================================================
   6. Projects (localStorage)
   ============================================================ */
function snapshot(){
  return { name:state.name, script:$('script').value, length:$('length').value, style:$('style').value,
    aspect:aspectRatio(), model:$('model').value,
    scenes:state.scenes.map(s=>{
      const c={...s};
      // blob: object URLs (mock clips) don't survive a reload — drop them and reset status
      if(c.videoUrl && c.videoUrl.startsWith('blob:')){ c.videoUrl=null; if(c.status==='done'){c.status='idle';c.progress=0;} }
      return c;
    }), saved:Date.now() };
}
function autosave(){ saveJSON(LS.current, snapshot()); }
function restoreCurrent(){
  const c=loadJSON(LS.current,null); if(!c)return false;
  applySnapshot(c); return true;
}
function applySnapshot(c){
  state.name=c.name||'Untitled film'; $('projname').value=state.name;
  $('script').value=c.script||''; if(c.length)$('length').value=c.length; if(c.style)$('style').value=c.style;
  if(c.model){$('model').value=c.model;} 
  if(c.aspect){document.querySelectorAll('#aspect button').forEach(b=>b.classList.toggle('on',b.dataset.a===c.aspect));}
  state.scenes=(c.scenes||[]).map(s=>({...s}));
  state.selected=null;
  renderAllUI(); refreshModeBadge();
  if(state.scenes.length) $('tlLabel').textContent=`Timeline — ${state.scenes.length} scenes · seed-locked`;
  buildPlayback();
}
function listProjects(){ return loadJSON(LS.projects, []); }
function saveProject(){
  const projects=listProjects();
  const snap=snapshot(); snap.id='p_'+Date.now();
  // replace if same name
  const idx=projects.findIndex(p=>p.name===snap.name);
  if(idx>=0) projects[idx]=snap; else projects.unshift(snap);
  saveJSON(LS.projects, projects.slice(0,30));
  toast(`Saved “${snap.name}”.`); renderProjectList();
}
function renderProjectList(){
  const projects=listProjects(); const wrap=$('projectList');
  if(!projects.length){wrap.innerHTML='<p class="empty-insp">No saved projects yet.</p>';return;}
  wrap.innerHTML='';
  projects.forEach(p=>{
    const sceneCount=(p.scenes||[]).length;
    const el=document.createElement('div');el.className='proj-item';
    el.innerHTML=`<div class="pi-body"><div class="pi-name">${p.name}</div>
      <div class="pi-meta">${sceneCount} scenes · ${new Date(p.saved).toLocaleDateString()}</div></div>
      <button class="pi-del" title="Delete">🗑</button>`;
    el.querySelector('.pi-body').onclick=()=>{applySnapshot(p);autosave();$('projectsModal').classList.remove('show');toast(`Loaded “${p.name}”.`);};
    el.querySelector('.pi-del').onclick=(e)=>{e.stopPropagation();
      const np=listProjects().filter(x=>x.id!==p.id);saveJSON(LS.projects,np);renderProjectList();toast('Project deleted.');};
    wrap.appendChild(el);
  });
}

/* ============================================================
   7. Settings modal
   ============================================================ */
function openSettings(){
  $('proxyUrl').value=getProxy();
  $('falKey').value=getKey();
  $('parallelSel').value=String(settings.parallel||3);
  $('keyStatus').className='keystatus'; $('keyStatus').textContent='';
  $('settingsModal').classList.add('show');
}
function saveSettingsValues(){
  setProxy($('proxyUrl').value.trim());
  setKey($('falKey').value.trim());
  settings.parallel=+$('parallelSel').value||3; saveJSON(LS.settings,settings);
  refreshModeBadge();
}
async function testConnection(){
  saveSettingsValues();
  const ks=$('keyStatus');
  const proxy=getProxy().replace(/\/$/,'');
  if(!proxy){ ks.className='keystatus err'; ks.textContent='Add a Proxy URL first (deploy worker.js to Cloudflare).'; return; }
  ks.className='keystatus busy'; ks.textContent='Testing proxy…';
  try{
    // hit the proxy with a tiny known model submit; we only care that CORS + auth work
    const headers={'Content-Type':'application/json'};
    const key=getKey(); if(key) headers['X-Fal-Key']=key;
    const r=await fetch(`${proxy}/fal-ai/ltx-video`,{method:'POST',headers,body:JSON.stringify({prompt:'connection test',num_frames:9})});
    if(r.status===401){ ks.className='keystatus err'; ks.textContent='Proxy reached, but no valid fal key (set FAL_KEY secret on the Worker, or add a key above).'; return; }
    if(r.ok || r.status===200){ const j=await r.json().catch(()=>({}));
      ks.className='keystatus ok'; ks.textContent='✓ Connected. Real generation is ready.'; return; }
    ks.className='keystatus err'; ks.textContent='Proxy responded '+r.status+'. Check the Worker URL.';
  }catch(e){
    ks.className='keystatus err'; ks.textContent='Could not reach proxy (CORS or wrong URL). See README.';
  }
}
function saveSettings(){
  saveSettingsValues();
  const real=currentMode()==='real';
  toast(real?'Settings saved. Real generation enabled.':'Settings saved. Mock mode active (add a Proxy URL for real video).');
  $('settingsModal').classList.remove('show');
}

/* ============================================================
   8. Wiring
   ============================================================ */
$('breakdown').onclick=breakIntoScenes;
$('renderAll').onclick=renderAll;
$('exportBtn').onclick=exportFilm;
$('addScene').onclick=()=>{
  if(!state.scenes.length){toast('Break your script first.');return;}
  const i=state.scenes.length;
  state.scenes.push({id:'sc'+i+'_'+Date.now(),n:i+1,title:'New scene',prompt:'Cinematic shot — describe this scene',
    seed:Math.floor(Math.random()*90000),grad:grads[i%grads.length],status:'idle',progress:0,dur:8,videoUrl:null,error:null});
  renderScenes();renderQueue();toast('Scene added.');autosave();
};
$('playBtn').onclick=togglePlay;
$('scrub').onclick=e=>{if(!totalDur)return;const r=e.currentTarget.getBoundingClientRect();state.playT=(e.clientX-r.left)/r.width*totalDur;updatePlayhead();};
document.querySelectorAll('#aspect button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#aspect button').forEach(x=>x.classList.remove('on'));b.classList.add('on');autosave();});
$('model').onchange=()=>{ refreshModeBadge();
  const real=$('model').value!=='mock';
  $('modelHint').textContent = real
    ? (getProxy()?`Ready: real video via ${PROVIDERS[$('model').value].label} (through your proxy).`:'Add a Proxy URL in Settings to render real video — a static site cannot call fal.ai directly.')
    : 'Mock mode renders a real animated clip in your browser — no key or proxy needed.';
  autosave();
};
$('projname').oninput=()=>{state.name=$('projname').value||'Untitled film';autosave();};

// settings modal
$('settingsBtn').onclick=openSettings;
$('settingsX').onclick=()=>$('settingsModal').classList.remove('show');
$('saveSettings').onclick=saveSettings;
$('testProxy').onclick=testConnection;

// projects modal
$('projectsBtn').onclick=()=>{renderProjectList();$('projectsModal').classList.add('show');};
$('projectsX').onclick=()=>$('projectsModal').classList.remove('show');
$('saveProject').onclick=saveProject;
$('newProject').onclick=()=>{
  state.scenes=[];state.selected=null;state.name='Untitled film';$('projname').value=state.name;
  $('script').value='';renderAllUI();$('playerCtrl').style.display='none';
  $('playerEmpty').style.display='grid';$('playerFrame').style.display='none';$('playerVideo').style.display='none';
  $('projectsModal').classList.remove('show');toast('New project started.');autosave();
};

// close modals on backdrop / Esc
[ 'settingsModal','projectsModal' ].forEach(id=>{
  $(id).addEventListener('click',e=>{ if(e.target===$(id)) $(id).classList.remove('show'); });
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){$('settingsModal').classList.remove('show');$('projectsModal').classList.remove('show');} });

// boot: restore last session or seed defaults
if(!restoreCurrent()){ renderAllUI(); }
refreshModeBadge();
$('model').dispatchEvent(new Event('change'));
})();
