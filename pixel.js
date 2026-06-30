/* ============================================================
   Pixel — shared behaviour
   ============================================================ */
const REDUCE = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

/* reveal */
(function(){
  function reveal(el){el.classList.add('in');}
  function checkAll(){
    document.querySelectorAll('.rv:not(.in)').forEach(el=>{
      const r=el.getBoundingClientRect();
      // reveal once it has entered from the bottom OR is already above the fold
      if(r.top < innerHeight*0.92) reveal(el);
    });
  }
  const io=('IntersectionObserver' in window) ? new IntersectionObserver(es=>es.forEach(e=>{
    if(e.isIntersecting){reveal(e.target);io.unobserve(e.target);}
  }),{threshold:0, rootMargin:'0px 0px -8% 0px'}) : null;
  function observeAll(){
    document.querySelectorAll('.rv:not(.in)').forEach(el=>{ if(io) io.observe(el); });
    checkAll();
  }
  document.addEventListener('DOMContentLoaded',observeAll);
  window.addEventListener('load',observeAll);
  // scroll fallback guarantees reveal even if the observer is flaky
  window.addEventListener('scroll',checkAll,{passive:true});
  window.__observeReveals=observeAll;
})();

/* denoise rail + solid nav on scroll */
(function(){
  const rail=document.querySelector('.rail i');
  const header=document.querySelector('header');
  function onScroll(){
    const h=document.documentElement;
    const max=h.scrollHeight-h.clientHeight;
    const p=max>0?h.scrollTop/max:0;
    if(rail) rail.style.width=(p*100)+'%';
    if(header) header.classList.toggle('solid', h.scrollTop>40);
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  document.addEventListener('DOMContentLoaded',onScroll);
})();

/* ============================================================
   Type → field mask. Renders heavy display text whose fill is a
   live diffusion gradient, on a canvas — letters made of noise.
   ============================================================ */
function FieldText(canvas, text, opts={}){
  const ctx=canvas.getContext('2d');
  const DPR=Math.min(2,window.devicePixelRatio||1);
  let t=0, raf, running=true;
  function size(){
    canvas.width=canvas.clientWidth*DPR; canvas.height=canvas.clientHeight*DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener('resize',size); size();
  function draw(){
    if(!running)return;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    // moving warm gradient
    t+=REDUCE?0:0.006;
    const g=ctx.createLinearGradient(0, h*(.5+.4*Math.sin(t)), w, h*(.5+.4*Math.cos(t*.8)));
    g.addColorStop(0,'#7aa2ff'); g.addColorStop(.5,'#ff7a45'); g.addColorStop(1,'#ff3d6e');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    // punch text out as mask
    ctx.globalCompositeOperation='destination-in';
    ctx.fillStyle='#000';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    // fit: start from a height-based size, shrink until it fits the width with padding
    let fs = opts.size || h*0.82;
    ctx.font=`800 ${fs}px Inter, sans-serif`;
    const pad = w*0.06;
    let measured = ctx.measureText(text).width;
    if(measured > w-pad){ fs = fs*(w-pad)/measured; ctx.font=`800 ${fs}px Inter, sans-serif`; }
    ctx.fillText(text, w/2, h/2);
    ctx.globalCompositeOperation='source-over';
    if(!REDUCE) raf=requestAnimationFrame(draw); 
  }
  draw();
  if('IntersectionObserver' in window){
    new IntersectionObserver(es=>{running=es[0].isIntersecting; if(running&&!REDUCE){raf=requestAnimationFrame(draw);}})
      .observe(canvas);
  }
  return { redraw:draw };
}

/* prompt-first hero box (invideo accent) that resolves the field */
function PromptDemo(opts){
  const input=document.getElementById(opts.input);
  const btn=document.getElementById(opts.btn);
  const onGenerate=opts.onGenerate||function(){};
  if(!input||!btn) return;
  const prompts=[
    "A lighthouse keeper rows into a storm at dusk, cinematic",
    "Neon-lit Tokyo alley in the rain, slow dolly forward",
    "A lone astronaut crossing red dunes at sunrise",
    "A whale gliding through clouds above a sleeping city"
  ];
  let pi=0,ci=0,typing=true,paused=0,locked=false;
  function tick(){
    if(locked)return;
    const full=prompts[pi];
    if(paused>0)paused--;
    else if(typing){input.value=full.slice(0,++ci);if(ci>=full.length){typing=false;paused=80;}}
    else{input.value=full.slice(0,--ci);if(ci<=0){typing=true;pi=(pi+1)%prompts.length;}}
    setTimeout(tick,typing?44:24);
  }
  if(!REDUCE) tick(); else input.value=prompts[0];
  btn.addEventListener('click',()=>{
    if(locked) { onGenerate(1); return; }
    locked=true; btn.textContent='Resolving…';
    onGenerate(1); // drive field to resolved
    let p=0; const iv=setInterval(()=>{
      p+=5+Math.random()*9;
      if(p>=100){clearInterval(iv);btn.textContent='Open in Studio';
        btn.onclick=()=>location.href='app.html';}
    },170);
  });
}
