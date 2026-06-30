/* ============================================================
   Pixel — diffusion field
   Raw WebGL, hand-written GLSL. No libraries. The whole visual
   thesis: noise that resolves into a formed frame. Scroll and
   cursor drive the "denoise" — runs on the GPU so it stays light.
   ============================================================ */
function DiffusionField(canvas, opts={}){
  const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const gl = !reduce && (canvas.getContext('webgl',{antialias:false,alpha:true,premultipliedAlpha:false})
                       || canvas.getContext('experimental-webgl'));
  // graceful fallback: static cold→warm gradient
  if(!gl){
    canvas.style.background='radial-gradient(120% 90% at 50% 30%,#1a1d3a,#070711 70%)';
    return { setResolve(){}, setScroll(){}, destroy(){} };
  }

  const vert = `
    attribute vec2 p;
    void main(){ gl_Position = vec4(p,0.,1.); }`;

  // Fragment: domain-warped fbm noise. A "resolve" uniform morphs the field
  // from chaotic cold noise into a coherent warm composition (a horizon/iris).
  const frag = `
    precision highp float;
    uniform vec2  u_res;
    uniform float u_time;
    uniform float u_resolve;   // 0 = noise, 1 = formed frame
    uniform vec2  u_mouse;     // -1..1
    uniform float u_density;

    // hash + value noise + fbm
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
      vec2 u=f*f*(3.-2.*f);
      return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
    }
    float fbm(vec2 p){
      float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
      for(int i=0;i<6;i++){ v+=a*noise(p); p=m*p; a*=.5; }
      return v;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy/u_res;
      vec2 q  = (uv-.5); q.x *= u_res.x/u_res.y;

      float t = u_time*.06;
      // cursor pushes the field like wind
      q += u_mouse*0.12*(1.0-u_resolve*0.6);

      // domain warp
      vec2 w = vec2(fbm(q*3.0 + t), fbm(q*3.0 - t + 5.2));
      float n = fbm(q*4.0 + w*1.8 + t);

      // the "formed" target: a horizon band + soft iris, emerging as resolve->1
      float horizon = smoothstep(0.20,0.0, abs(q.y+0.05 - sin(q.x*2.0)*0.04));
      float iris    = smoothstep(0.62,0.0, length(q*vec2(1.0,1.4)));
      float formed  = clamp(horizon*0.8 + iris*0.75, 0.0, 1.0);

      // mix chaotic noise -> formed structure
      float field = mix(n, mix(n,formed,0.9), u_resolve);

      // grain that fades as it resolves
      float grain = (hash(gl_FragCoord.xy + u_time)*2.-1.) * 0.06 * (1.0-u_resolve);
      field += grain;

      // two-temperature palette: cold ice (noise) -> warm plasma/magma (resolved)
      vec3 ice    = vec3(0.30,0.42,1.00);
      vec3 deep   = vec3(0.03,0.03,0.10);
      vec3 plasma = vec3(1.00,0.52,0.22);
      vec3 magma  = vec3(1.00,0.28,0.42);

      vec3 cold = mix(deep, ice, smoothstep(0.35,0.85,field));
      // warm leans plasma-orange in the body, magma only at the hottest core
      vec3 warm = mix(deep, mix(plasma,magma, smoothstep(0.6,0.95,field)), smoothstep(0.18,0.85,field));
      vec3 col  = mix(cold, warm, u_resolve);

      // glow concentrated where structure forms
      col += plasma * formed * u_resolve * 0.5 * smoothstep(0.25,1.0,field);

      // vignette
      col *= 1.0 - 0.5*dot(q,q);

      // alpha: denser where field is bright, so it composites over the page bg
      float alpha = (0.15 + 0.85*smoothstep(0.2,0.9,field)) * u_density;
      gl_FragColor = vec4(col, alpha);
    }`;

  function compile(type,src){
    const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    return s;
  }
  const prog=gl.createProgram();
  gl.attachShader(prog,compile(gl.VERTEX_SHADER,vert));
  gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,frag));
  gl.linkProgram(prog); gl.useProgram(prog);

  const buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 3,-1, -1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(prog,'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

  const U={
    res:gl.getUniformLocation(prog,'u_res'),
    time:gl.getUniformLocation(prog,'u_time'),
    resolve:gl.getUniformLocation(prog,'u_resolve'),
    mouse:gl.getUniformLocation(prog,'u_mouse'),
    density:gl.getUniformLocation(prog,'u_density'),
  };

  const isMobile = window.innerWidth < 760;
  let resolve=opts.resolve!=null?opts.resolve:0.0, targetResolve=resolve;
  let mouse=[0,0], mTarget=[0,0];
  let density=opts.density!=null?opts.density:1.0;
  let raf, t0=performance.now(), running=true;
  // mobile: cap DPR hard for perf
  const DPR=Math.min(isMobile?1:1.6, window.devicePixelRatio||1);

  function resize(){
    const w=canvas.clientWidth, h=canvas.clientHeight;
    canvas.width=Math.round(w*DPR); canvas.height=Math.round(h*DPR);
    gl.viewport(0,0,canvas.width,canvas.height);
  }
  window.addEventListener('resize',resize); resize();

  function frame(now){
    if(!running)return;
    const time=(now-t0)/1000;
    resolve += (targetResolve-resolve)*0.06;
    mouse[0]+=(mTarget[0]-mouse[0])*0.05; mouse[1]+=(mTarget[1]-mouse[1])*0.05;
    gl.uniform2f(U.res,canvas.width,canvas.height);
    gl.uniform1f(U.time,time);
    gl.uniform1f(U.resolve,resolve);
    gl.uniform2f(U.mouse,mouse[0],mouse[1]);
    gl.uniform1f(U.density,density);
    gl.drawArrays(gl.TRIANGLES,0,3);
    raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);

  // pause when offscreen (perf + battery)
  if('IntersectionObserver' in window){
    new IntersectionObserver(es=>{
      running=es[0].isIntersecting;
      if(running){ t0=performance.now()-1; raf=requestAnimationFrame(frame); }
      else cancelAnimationFrame(raf);
    },{threshold:0}).observe(canvas);
  }

  if(opts.mouse!==false && !isMobile){
    window.addEventListener('pointermove',e=>{
      mTarget=[(e.clientX/window.innerWidth)*2-1, -((e.clientY/window.innerHeight)*2-1)];
    },{passive:true});
  }

  return {
    setResolve(v){ targetResolve=Math.max(0,Math.min(1,v)); },
    setScroll(v){ /* hook for scroll-driven resolve */ targetResolve=Math.max(0,Math.min(1,v)); },
    setDensity(v){ density=v; },
    destroy(){ running=false; cancelAnimationFrame(raf); }
  };
}
