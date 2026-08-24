/* ============================================================
   SESSİZ FREKANS — Silent Frequency  v2.0
   Bölüm 1: Orman  |  Bölüm 2: İstasyonun İçi
   ============================================================ */
'use strict';

const cv = document.getElementById('game');
const cx = cv.getContext('2d');
const W = cv.width, H = cv.height;

const rand = (a,b)=>a+Math.random()*(b-a);
const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const ang = (a,b)=>Math.atan2(b.y-a.y, b.x-a.x);
/* ekran dışı culling — FPS kurtarıcı */
const vis = (x,y,m=90)=> x>cam.x-m && x<cam.x+W+m && y>cam.y-m && y<cam.y+H+m;

let state = 'title';       // title | intro | play | dead | win | note | jumpscare | pause | admin
let chapter = 1;
let time = 0, shake = 0;
let WORLD = { w: 2600, h: 2000 };

/* ---------------- ADMIN / CHEATS ---------------- */
const ADMIN_PASS = '4747';
let adminUnlocked = false;
const cheats = { god:false, ghost:false, esp:false, bright:false, speed:false, inf:false };
const cheatsActive = ()=>Object.values(cheats).some(v=>v);

/* ---------------- AYARLAR ---------------- */
const settings = { bright:100, vol:80, shake:100, grain:55 };
try{ Object.assign(settings, JSON.parse(localStorage.getItem('sf_settings')||'{}')); }catch(e){}
function saveSettings(){ try{ localStorage.setItem('sf_settings', JSON.stringify(settings)); }catch(e){} }
function applySettings(){
  // parlaklık: canvas'a CSS filtresi
  cv.style.filter = `brightness(${settings.bright/100})`;
  // ses: master gain
  if(AU.master) AU.master.gain.value = 0.8 * (settings.vol/100);
}

/* ---------------- GÖRSEL VARLIKLAR (AI konsept & dokular) ---------------- */
const IMG = {};
for(const [k,src] of Object.entries({
  texForest:'assets/tex_forest.png',
  texConcrete:'assets/tex_concrete.png',
  roomSecurity:'assets/room_security.png',
  roomVent:'assets/room_vent.png',
  conceptForest:'assets/concept_forest.png',
  conceptMutant:'assets/concept_mutant.png',
  level2:'assets/level2.png',
})){
  const im=new Image(); im.src=src;
  im.onload=()=>{ IMG[k+'Ok']=true; if(k==='texForest'&&chapter===1) buildGroundForest();
    if(k==='texConcrete'&&chapter===2) buildGroundStation(); };
  IMG[k]=im;
}

/* ---------------- AUDIO ---------------- */
const AU = {
  ctx:null, master:null, staticGain:null, droneGain:null, heartT:0, _tw:null,
  init(){
    if(this.ctx) return;
    const C = new (window.AudioContext||window.webkitAudioContext)();
    this.ctx = C;
    this.master = C.createGain();
    this.master.gain.value = 0.8 * ((typeof settings!=='undefined'?settings.vol:80)/100);
    this.master.connect(C.destination);
    const o1 = C.createOscillator(); o1.type='sine'; o1.frequency.value=48;
    const o2 = C.createOscillator(); o2.type='sine'; o2.frequency.value=51.3;
    const dg = C.createGain(); dg.gain.value=0.05;
    o1.connect(dg); o2.connect(dg); dg.connect(this.master);
    o1.start(); o2.start(); this.droneGain = dg;
    const buf = C.createBuffer(1, C.sampleRate*2, C.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    this.noiseBuf = buf;
    const nz = C.createBufferSource(); nz.buffer=buf; nz.loop=true;
    const lp = C.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=300;
    const ng = C.createGain(); ng.gain.value=0.045;
    nz.connect(lp); lp.connect(ng); ng.connect(this.master); nz.start();
    const nz2 = C.createBufferSource(); nz2.buffer=buf; nz2.loop=true; nz2.playbackRate.value=0.7;
    const bp = C.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1400; bp.Q.value=0.6;
    const sg = C.createGain(); sg.gain.value=0;
    nz2.connect(bp); bp.connect(sg); sg.connect(this.master); nz2.start();
    this.staticGain = sg;
  },
  blip(freq=440, dur=0.08, vol=0.15, type='square'){
    if(!this.ctx) return; const C=this.ctx;
    const o=C.createOscillator(), g=C.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(vol, C.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, C.currentTime+dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(C.currentTime+dur);
  },
  thud(vol=0.4){
    if(!this.ctx) return; const C=this.ctx;
    const o=C.createOscillator(), g=C.createGain();
    o.type='sine'; o.frequency.setValueAtTime(90,C.currentTime);
    o.frequency.exponentialRampToValueAtTime(30,C.currentTime+0.25);
    g.gain.setValueAtTime(vol,C.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.3);
    o.connect(g); g.connect(this.master); o.start(); o.stop(C.currentTime+0.32);
  },
  screech(){
    if(!this.ctx) return; const C=this.ctx;
    const o=C.createOscillator(), g=C.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(1800,C.currentTime);
    o.frequency.exponentialRampToValueAtTime(300,C.currentTime+0.5);
    g.gain.setValueAtTime(0.22,C.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.55);
    o.connect(g); g.connect(this.master); o.start(); o.stop(C.currentTime+0.6);
  },
  jumpscareSound(){
    if(!this.ctx) return; const C=this.ctx;
    // layered scream: noise burst + detuned saws + sub drop
    const nz=C.createBufferSource(); nz.buffer=this.noiseBuf; nz.playbackRate.value=1.6;
    const hp=C.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=700;
    const ngn=C.createGain(); ngn.gain.setValueAtTime(0.55,C.currentTime);
    ngn.gain.exponentialRampToValueAtTime(0.001,C.currentTime+1.1);
    nz.connect(hp); hp.connect(ngn); ngn.connect(this.master); nz.start(); nz.stop(C.currentTime+1.2);
    for(const f of [620, 655, 880]){
      const o=C.createOscillator(), g=C.createGain();
      o.type='sawtooth'; o.frequency.setValueAtTime(f,C.currentTime);
      o.frequency.exponentialRampToValueAtTime(f*0.4,C.currentTime+0.9);
      g.gain.setValueAtTime(0.20,C.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+1.0);
      o.connect(g); g.connect(this.master); o.start(); o.stop(C.currentTime+1.05);
    }
    const s=C.createOscillator(), sg=C.createGain();
    s.type='sine'; s.frequency.setValueAtTime(120,C.currentTime);
    s.frequency.exponentialRampToValueAtTime(28,C.currentTime+0.8);
    sg.gain.setValueAtTime(0.6,C.currentTime);
    sg.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.9);
    s.connect(sg); sg.connect(this.master); s.start(); s.stop(C.currentTime+0.95);
  },
  whisper(){ // creepy random whisper-ish chirps for crawlers
    if(!this.ctx) return;
    this.blip(rand(140,220),0.3,0.05,'sawtooth');
  },
  heartbeat(){ this.thud(0.5); setTimeout(()=>this.thud(0.35), 140); },
  torchWhine(on){
    if(!this.ctx) return;
    if(on && !this._tw){
      const C=this.ctx, o=C.createOscillator(), g=C.createGain();
      o.type='sine'; o.frequency.value=2400; g.gain.value=0.06;
      o.connect(g); g.connect(this.master); o.start();
      this._tw={o,g};
    } else if(!on && this._tw){
      this._tw.g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+0.1);
      this._tw.o.stop(this.ctx.currentTime+0.12); this._tw=null;
    }
  },
  step(run, indoor){ this.blip(run?120:90, 0.04, (run?0.09:0.04)*(indoor?1.6:1), indoor?'square':'triangle'); },

  /* ---- BÖLÜM 3 MÜZİĞİ: karanlık synth (procedural, loop) ---- */
  music:null,
  startMusic(){
    if(!this.ctx || this.music) return;
    const C=this.ctx;
    const mg=C.createGain(); mg.gain.value=0; mg.connect(this.master);
    mg.gain.linearRampToValueAtTime(0.5, C.currentTime+3);
    this.music={gain:mg, timers:[], oscs:[]};
    // deep pad: iki detune saw + lowpass
    const pad=C.createGain(); pad.gain.value=0.10;
    const lp=C.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=420; lp.Q.value=4;
    pad.connect(lp); lp.connect(mg);
    for(const det of [0,0.4]){
      const o=C.createOscillator(); o.type='sawtooth'; o.frequency.value=55+det;
      o.connect(pad); o.start(); this.music.oscs.push(o);
    }
    // filter sweep LFO
    const lfo=C.createOscillator(); lfo.frequency.value=0.06;
    const lg=C.createGain(); lg.gain.value=260;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); this.music.oscs.push(lfo);
    // bass pulse sequence (Am: A C E G dark arpeggio, yavaş)
    const seq=[55,65.4,82.4,73.4]; let step=0;
    const bassT=setInterval(()=>{
      if(!this.music) return;
      const o=C.createOscillator(), g=C.createGain();
      o.type='triangle'; o.frequency.value=seq[step%seq.length]; step++;
      g.gain.setValueAtTime(0.22,C.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+1.7);
      o.connect(g); g.connect(mg); o.start(); o.stop(C.currentTime+1.8);
    }, 1800);
    // sparse high bell (tension)
    const bellT=setInterval(()=>{
      if(!this.music || Math.random()<0.4) return;
      const f=[440,523,659,880][Math.floor(Math.random()*4)];
      const o=C.createOscillator(), g=C.createGain();
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.05,C.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+2.5);
      o.connect(g); g.connect(mg); o.start(); o.stop(C.currentTime+2.6);
    }, 3400);
    // heartbeat-like kick
    const kickT=setInterval(()=>{
      if(!this.music) return;
      const o=C.createOscillator(), g=C.createGain();
      o.type='sine'; o.frequency.setValueAtTime(70,C.currentTime);
      o.frequency.exponentialRampToValueAtTime(35,C.currentTime+0.18);
      g.gain.setValueAtTime(0.28,C.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.22);
      o.connect(g); g.connect(mg); o.start(); o.stop(C.currentTime+0.25);
    }, 900);
    this.music.timers.push(bassT,bellT,kickT);
  },
  stopMusic(fade=2){
    if(!this.ctx || !this.music) return;
    const m=this.music; this.music=null;
    m.gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime+fade);
    setTimeout(()=>{ m.timers.forEach(clearInterval); m.oscs.forEach(o=>{try{o.stop()}catch(e){}}); }, fade*1000+100);
  },
  doorSlam(){ this.thud(0.8); this.blip(65,0.3,0.3,'square'); },
  /* --- gerçekçi kapı sesleri --- */
  doorServo(){ // motor çalışmaya başlar: elektrik vınlaması
    if(!this.ctx) return; const C=this.ctx;
    const o=C.createOscillator(), g=C.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(90,C.currentTime);
    o.frequency.linearRampToValueAtTime(160,C.currentTime+0.45);
    g.gain.setValueAtTime(0.08,C.currentTime);
    g.gain.linearRampToValueAtTime(0.05,C.currentTime+0.45);
    g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.55);
    o.connect(g); g.connect(this.master); o.start(); o.stop(C.currentTime+0.6);
    // ray gıcırtısı
    const n=C.createBufferSource(); n.buffer=this.noiseBuf; n.playbackRate.value=0.5;
    const bp=C.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=800; bp.Q.value=2;
    const ng=C.createGain(); ng.gain.setValueAtTime(0.05,C.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.5);
    n.connect(bp); bp.connect(ng); ng.connect(this.master); n.start(); n.stop(C.currentTime+0.55);
  },
  doorImpact(){ // çelik kapı yere oturur: GÜM + metalik çınlama
    if(!this.ctx) return; const C=this.ctx;
    // alçak gövde darbesi
    const o=C.createOscillator(), g=C.createGain();
    o.type='sine'; o.frequency.setValueAtTime(110,C.currentTime);
    o.frequency.exponentialRampToValueAtTime(32,C.currentTime+0.3);
    g.gain.setValueAtTime(0.7,C.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.4);
    o.connect(g); g.connect(this.master); o.start(); o.stop(C.currentTime+0.45);
    // metalik çınlama (iki detune parsiyel)
    for(const f of [387, 592]){
      const m=C.createOscillator(), mg2=C.createGain();
      m.type='triangle'; m.frequency.value=f;
      mg2.gain.setValueAtTime(0.10,C.currentTime+0.01);
      mg2.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.9);
      m.connect(mg2); mg2.connect(this.master); m.start(C.currentTime+0.01); m.stop(C.currentTime+1);
    }
    // toz/şak sesi: kısa gürültü patlaması
    const n=C.createBufferSource(); n.buffer=this.noiseBuf; n.playbackRate.value=1.2;
    const lp=C.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1600;
    const ng=C.createGain(); ng.gain.setValueAtTime(0.30,C.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.18);
    n.connect(lp); lp.connect(ng); ng.connect(this.master); n.start(); n.stop(C.currentTime+0.2);
  },
  doorHiss(){ // kapı açılır: pnömatik hışş + hafif vınlama
    if(!this.ctx) return; const C=this.ctx;
    const n=C.createBufferSource(); n.buffer=this.noiseBuf; n.playbackRate.value=0.9;
    const hp=C.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800;
    const ng=C.createGain(); ng.gain.setValueAtTime(0.16,C.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.6);
    n.connect(hp); hp.connect(ng); ng.connect(this.master); n.start(); n.stop(C.currentTime+0.65);
    const o=C.createOscillator(), g=C.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(150,C.currentTime);
    o.frequency.linearRampToValueAtTime(70,C.currentTime+0.5);
    g.gain.setValueAtTime(0.06,C.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,C.currentTime+0.55);
    o.connect(g); g.connect(this.master); o.start(); o.stop(C.currentTime+0.6);
  },
  camBlip(){ this.blip(1500,0.06,0.08,'square'); this.blip(900,0.04,0.05,'square'); }
};

/* ---------------- INPUT ---------------- */
const keys = {};
let mouse = {x:W/2, y:H/2, down:false};
addEventListener('keydown', e=>{ keys[e.code]=true; if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup',   e=>{ keys[e.code]=false; });
cv.addEventListener('mousemove', e=>{
  const r = cv.getBoundingClientRect();
  mouse.x = (e.clientX-r.left) * (W/r.width);
  mouse.y = (e.clientY-r.top) * (H/r.height);
});
cv.addEventListener('mousedown', ()=>{ mouse.down=true; });
cv.addEventListener('mouseup',   ()=>{ mouse.down=false; });

/* ---------------- STATE VARS ---------------- */
let player, listeners, maws, crawlers, radios, orbs, fuses, trees, walls, noises, cam, door, pickups, notes, glassPiles;
let torchCharge, batteries, orbCount, fuseCount, noteCount, sneak, markedT, footT, radioNoiseT, hintT;
let stamina, tired, finalSeq, ground, groundReady=false;
let notesRead = 0;

/* ---- BÖLÜM 3 ---- */
let ch3 = null;   // null | {phase:'escape'|'room', ...}
let stalkers, watcher; // bölüm 3 düşmanları

/* ============================================================
   LEVEL BUILDERS
   ============================================================ */
function makeListener(x,y,wp,opts={}){
  return { kind:'listener', x,y, r:17, dir:rand(0,6.28), state:'patrol',
    wp:wp.map(p=>({x:p[0],y:p[1]})), wpi:0, target:null, stun:0,
    listenT:rand(1,4), alive:true, hearGlow:0, confuse:0, scream:0,
    twitchT:rand(0,3), twitch:0, drool:rand(0,10), fast:opts.fast||false };
}
function makeMaw(x,y,wp){
  return { kind:'maw', x,y, r:26, dir:0, state:'roam',
    wp:wp.map(p=>({x:p[0],y:p[1]})), wpi:0, stun:0, alive:true,
    charge:0, hum:rand(0,9), cd:0, twitchT:rand(0,3), twitch:0 };
}
function makeCrawler(x,y){
  return { kind:'crawler', x,y, r:13, dir:rand(0,6.28), state:'sleep',
    alive:true, stun:0, wakeT:0, lungeT:0, vx:0, vy:0, hearGlow:0,
    breathT:rand(0,4), homeX:x, homeY:y, returnT:0 };
}

function buildChapter1(){
  chapter=1; WORLD={w:2600,h:2000};
  baseInit();
  player = { x:1300, y:1820, r:14, dir:-Math.PI/2, moving:false, _atk:false };
  cam = { x:player.x-W/2, y:player.y-H/2 };
  door = { x:1300, y:210, w:120, h:26 };
  walls = []; glassPiles=[];

  trees=[];
  for(let i=0;i<150;i++){
    const t={ x:rand(60,WORLD.w-60), y:rand(60,WORLD.h-60), r:rand(20,42) };
    if(Math.abs(t.x-1300)<130 && t.y>1500) continue;
    if(t.y<330 && Math.abs(t.x-1300)<260) continue;
    trees.push(t);
  }
  radios = [
    {x:640,  y:1500, on:false}, {x:1980, y:1420, on:false},
    {x:420,  y:820,  on:false}, {x:2140, y:760,  on:false},
    {x:1300, y:1050, on:false}, {x:900,  y:420,  on:false},
  ];
  fuses = [
    {x:380,  y:1180, got:false}, {x:2260, y:1040, got:false}, {x:1620, y:480, got:false},
  ];
  pickups = [
    {x:820, y:980,  type:'bat'}, {x:1760,y:1620, type:'bat'},
    {x:2280,y:420,  type:'bat'}, {x:520, y:400,  type:'orb'},
    {x:1980,y:1780, type:'orb'},
  ];
  notes = [
    {x:1140,y:1690, got:false, text:
`Karayolu bakım tutanağı — 7 yıl önce

"D-340 orman yolu KAPATILDI. Gerekçe: 'sinyal
çalışmaları'. İmza yok. Mühür yok.

Kim bir orman yolunu mühürsüz kapatır?"`},
    {x:300, y:1420, got:false, text:
`Avcı defterinden yırtık sayfa

"Köpekler dağa çıkmıyor artık. Kayışı koparıp
kaçıyorlar. Dün gece sırtta bir şey ULUDU —
ama nefes almadan, tek notada, iki dakika boyunca.

Bir daha buraya gelmeyeceğim."`},
    {x:2050,y:560, got:false, text:
`Elif'in el yazısı — yağmurdan dağılmış

"...taşıyıcı dalga kulaktan giriyor ama BEYİNDE
yaşıyor. Kulaklık takmak yetmiyor. Duymamak
yetmiyor. Sinyal kendine yeni kulaklar İNŞA EDİYOR.

Deniz'i sakın buraya getirmeyin."
<span class="sig">— E.A.</span>`},
  ];
  listeners = [
    makeListener(700,1250,[[700,1250],[500,1500],[900,1550]]),
    makeListener(1900,1250,[[1900,1250],[2200,1500],[1700,1500]]),
    makeListener(500,700,[[500,700],[900,700],[700,950]]),
    makeListener(2100,650,[[2100,650],[1800,850],[2300,900]]),
    makeListener(1300,700,[[1100,700],[1500,700],[1300,900]]),
  ];
  maws = [ makeMaw(1300,520,[[1000,520],[1600,520],[1300,820]]) ];
  crawlers = [];
  buildGroundForest();
  setObjective('BÖLÜM 1 — Sigortaları bul, istasyona gir (3 sigorta)');
  document.getElementById('stObjLabel').textContent='SİGORTA';
}

function buildChapter2(){
  chapter=2; WORLD={w:2400,h:2200};
  baseInit();
  fuseCount=0;
  player = { x:1200, y:2080, r:14, dir:-Math.PI/2, moving:false, _atk:false };
  cam = { x:player.x-W/2, y:player.y-H/2 };
  trees=[];

  /* walls: station interior — corridors & rooms (x,y,w,h) */
  walls = [
    // outer shell
    {x:80,y:80,w:2240,h:40},{x:80,y:2120,w:960,h:40},{x:1360,y:2120,w:960,h:40},
    {x:80,y:80,w:40,h:2080},{x:2280,y:80,w:40,h:2080},
    // entry hall walls
    {x:80,y:1750,w:800,h:36},{x:1520,y:1750,w:800,h:36},
    // long corridor verticals
    {x:840,y:1300,w:36,h:490},{x:1520,y:1300,w:36,h:490},
    // mid cross walls
    {x:120,y:1300,w:500,h:36},{x:1780,y:1300,w:540,h:36},
    {x:120,y:900,w:720,h:36},{x:1560,y:900,w:760,h:36},
    // lab dividers
    {x:840,y:900,w:36,h:250},{x:1520,y:900,w:36,h:250},
    // generator room
    {x:400,y:400,w:36,h:340},{x:400,y:400,w:520,h:36},
    // archive room
    {x:1480,y:400,w:520,h:36},{x:1960,y:400,w:36,h:340},
    // transmitter chamber walls
    {x:900,y:200,w:36,h:340},{x:1460,y:200,w:36,h:340},
  ];
  glassPiles = [
    {x:1180,y:1600,r:46},{x:1230,y:1180,r:40},{x:700,y:1080,r:44},
    {x:1700,y:1080,r:44},{x:1180,y:700,r:50},{x:620,y:560,r:38},{x:1760,y:560,r:38},
  ];
  radios = [
    {x:300, y:1950, on:false},{x:2100,y:1950,on:false},
    {x:200, y:1100, on:false},{x:2200,y:1100,on:false},
    {x:700, y:480,  on:false},{x:1800,y:480, on:false},
    {x:1180,y:1400, on:false},
  ];
  fuses = [ // now "kayıt bantları" — 3 tapes to unlock transmitter
    {x:250, y:520, got:false},{x:2150,y:520,got:false},{x:1180,y:980,got:false},
  ];
  pickups = [
    {x:500,y:1950,type:'bat'},{x:1900,y:1500,type:'bat'},{x:300,y:700,type:'bat'},
    {x:2050,y:700,type:'orb'},{x:1180,y:1900,type:'orb'},{x:640,y:1180,type:'bat'},
  ];
  notes = [
    {x:980,y:1950, got:false, text:
`LULLABY PROJESİ — GÜVENLİK NOTU (KOPYA 4/4)

"Denek 12, sedasyon olmadan 87.9'a 6 saat maruz
bırakıldı. Görme korteksi 41. dakikada söndü.
İşitme korteksi... büyümeye devam ediyor.

Denek gülümsüyor. Neden gülümsüyor?"`},
    {x:170,y:1500, got:false, text:
`Teknisyen yazısı — duvar sıvasına kazınmış

"IŞIĞI DEĞİL SESİ KISIN
IŞIĞI DEĞİL SESİ KISIN
IŞIĞI DEĞİL SESİ KISIN

alt kata inen herkes önce ayakkabılarını çıkardı"`},
    {x:2230,y:1500, got:false, text:
`Elif'in kayıt defteri — Sayfa 112

"Vericiyi kapatmayı denedik. Sinyal artık makineye
ihtiyaç duymuyor — ONLARIN göğsünde yaşıyor.
Ama ana verici susarsa yeni kimseyi ÇAĞIRAMAZ.

Bantları bul. Üç doğrulama bandı. Ana konsol
onlarsız açılmıyor. Ben 3 No'lu bandı laboratuvara
sakladım. Işıklara güvenme. Seslere güvenme.
<span class="sig">Bana bile güvenme. — E.A.</span>"`},
    {x:1180,y:290, got:false, text:
`Ana konsola bantlanmış son not

"Deniz. Buraya kadar geldiysen, artık biliyorsun.

Vericiyi kapattığında ÇOK SES ÇIKACAK.
Hepsi gelecek. Hepsi.

Kaçma. Dayan. Sinyal ölünce onlar da duracak.

Kardeşin hâlâ burada. Alt katta. Bekliyor.
<span class="sig">— E</span>"`},
  ];
  listeners = [
    makeListener(400,1550,[[300,1550],[700,1550],[500,1650]]),
    makeListener(2000,1550,[[1900,1550],[2200,1650],[2000,1450]]),
    makeListener(1180,1150,[[1000,1150],[1350,1150],[1180,1250]]),
    makeListener(600,1080,[[300,1080],[750,1080]],{fast:true}),
    makeListener(1780,1080,[[1650,1080],[2150,1080]],{fast:true}),
  ];
  maws = [
    makeMaw(1180,1550,[[1000,1550],[1360,1550]]),
    makeMaw(1180,600,[[1050,600],[1310,600],[1180,760]]),
  ];
  crawlers = [
    makeCrawler(950,1850), makeCrawler(1450,1850),
    makeCrawler(720,980),  makeCrawler(1650,980),
    makeCrawler(520,620),  makeCrawler(1880,620),
    makeCrawler(1060,420), makeCrawler(1300,420),
  ];
  door = { x:1180, y:245, w:130, h:26 }; // transmitter console
  buildGroundStation();
  setObjective('BÖLÜM 2 — 3 doğrulama bandını bul, ANA VERİCİYİ kapat');
  document.getElementById('stObjLabel').textContent='BANT';
}

/* ============================================================
   BÖLÜM 3 — KAÇIŞ + GÜVENLİK ODASI (FNAF)
   ============================================================ */
function makeStalker(side){
  // side: 'L' | 'R' — kapılara sokulan yeni düşman "GÖLGE"
  return { side, pos:0, // 0=uzak, 1=kapıda
    speed:rand(0.045,0.075), waitT:rand(4,9), atDoor:false, doorT:0,
    retreatFlash:0, killT:0 };
}
function buildChapter3(){
  chapter=3; WORLD={w:2400,h:900};
  baseInit();
  trees=[]; glassPiles=[]; radios=[]; fuses=[]; pickups=[]; notes=[];
  listeners=[]; maws=[]; crawlers=[]; orbs=[];
  ch3 = {
    phase:'escape',
    escapeT:0,
    wave:0, waveT:1.5,
    // room phase:
    power:100, hour:0, hourT:0,
    doorL:false, doorR:false,   // hedef durum: kapı kapalı mı (istek)
    doorLpos:0, doorRpos:0,     // animasyon: 0=tam açık, 1=tam kapalı
    peek:null,                  // null | 'L' | 'R' — fenerle bakış
    cam:false, camIdx:0,        // kamera görünümü
    camStatic:0,
    watcherCam:0, watcherT:rand(8,14), watcherAtWin:false, watcherWinT:0,
    winBlink:0,
  };
  stalkers=[ makeStalker('L'), makeStalker('R') ];
  watcher={ cam:2, moveT:rand(6,10) }; // kameralarda gezen "SEYİRCİ"
  // escape koridoru: soldan sağa koş
  player={ x:150, y:450, r:14, dir:0, moving:false, _atk:false };
  cam={ x:0, y:player.y-H/2 };
  door={ x:2280, y:430, w:40, h:80 }; // güvenlik odası kapısı
  walls=[ {x:0,y:300,w:2400,h:30},{x:0,y:570,w:2400,h:30} ];
  buildGroundCorridor();
  setObjective('KAÇ! GÜVENLİK ODASINA ULAŞ! (SAĞA KOŞ)');
  document.getElementById('stObjLabel').textContent='—';
}
function buildGroundCorridor(){
  ground=document.createElement('canvas');
  ground.width=WORLD.w; ground.height=WORLD.h;
  const g=ground.getContext('2d');
  g.fillStyle='#0a0d11'; g.fillRect(0,0,WORLD.w,WORLD.h);
  // zemin şeridi
  g.fillStyle='#12161b'; g.fillRect(0,330,WORLD.w,240);
  for(let x=0;x<WORLD.w;x+=80){
    g.fillStyle=`rgba(${rand(14,22)|0},${rand(18,26)|0},${rand(22,30)|0},0.8)`;
    g.fillRect(x+1,331,78,238);
  }
  // duvar boruları
  g.strokeStyle='#1c242b'; g.lineWidth=5;
  for(const y of [310,320]){ g.beginPath(); g.moveTo(0,y); g.lineTo(WORLD.w,y); g.stroke(); }
  // kan izleri sağa doğru
  g.strokeStyle='rgba(80,20,18,0.5)'; g.lineWidth=10; g.lineCap='round';
  for(let i=0;i<12;i++){
    const sx=rand(100,2100);
    g.beginPath(); g.moveTo(sx,rand(360,540)); g.lineTo(sx+rand(60,220),rand(360,540)); g.stroke();
  }
  // acil çıkış okları
  g.fillStyle='rgba(77,189,110,0.5)'; g.font='bold 26px Courier New';
  for(let x=200;x<2200;x+=400) g.fillText('→ ÇIKIŞ →', x, 290);
  groundReady=true;
}

function baseInit(){
  time=0; shake=0; markedT=0; footT=0; radioNoiseT=0; sneak=false;
  torchCharge=100; batteries=3; orbCount=2; fuseCount=0; noteCount=notesRead;
  stamina=100; tired=false; finalSeq=null;
  noises=[]; orbs=[];
  document.getElementById('finalbar').classList.add('hidden');
}

/* ---------------- GROUND PRE-RENDER ---------------- */
function tileTexture(g, img, alpha=1, scale=1){
  // AI dokusunu dünyaya döşe
  if(!img || !img.complete || !img.naturalWidth) return false;
  const tw=img.naturalWidth*scale, th=img.naturalHeight*scale;
  g.save(); g.globalAlpha=alpha;
  for(let y=0;y<WORLD.h;y+=th) for(let x=0;x<WORLD.w;x+=tw)
    g.drawImage(img,x,y,tw,th);
  g.restore();
  return true;
}
function buildGroundForest(){
  ground = document.createElement('canvas');
  ground.width=WORLD.w; ground.height=WORLD.h;
  const g=ground.getContext('2d');
  g.fillStyle='#0b1410'; g.fillRect(0,0,WORLD.w,WORLD.h);
  // AI orman zemini dokusu (yüklendiyse)
  const tex = tileTexture(g, IMG.texForest, 0.85, 0.75);
  if(!tex){
    for(let i=0;i<3800;i++){
      g.fillStyle=`rgba(${rand(10,30)|0},${rand(28,48)|0},${rand(18,34)|0},${rand(0.15,0.5)})`;
      g.beginPath(); g.arc(rand(0,WORLD.w),rand(0,WORLD.h),rand(4,26),0,7); g.fill();
    }
  }
  // karanlık ton eşitleme + yosun lekeleri
  g.fillStyle='rgba(5,12,9,0.45)'; g.fillRect(0,0,WORLD.w,WORLD.h);
  for(let i=0;i<300;i++){
    g.fillStyle=`rgba(${rand(14,26)|0},${rand(34,52)|0},${rand(22,36)|0},${rand(0.08,0.22)})`;
    g.beginPath(); g.arc(rand(0,WORLD.w),rand(0,WORLD.h),rand(14,60),0,7); g.fill();
  }
  for(let i=0;i<900;i++){
    g.fillStyle=`rgba(${rand(40,70)|0},${rand(50,72)|0},${rand(30,48)|0},${rand(0.06,0.18)})`;
    g.fillRect(rand(0,WORLD.w),rand(0,WORLD.h),rand(2,5),rand(2,5));
  }
  g.strokeStyle='rgba(52,44,34,0.55)'; g.lineWidth=70; g.lineCap='round';
  g.beginPath(); g.moveTo(1300,1950); g.quadraticCurveTo(1240,1200,1300,300); g.stroke();
  // patika kenarı aşınması
  g.strokeStyle='rgba(40,34,26,0.25)'; g.lineWidth=95;
  g.beginPath(); g.moveTo(1300,1950); g.quadraticCurveTo(1240,1200,1300,300); g.stroke();
  groundReady=true;
}
function buildGroundStation(){
  ground = document.createElement('canvas');
  ground.width=WORLD.w; ground.height=WORLD.h;
  const g=ground.getContext('2d');
  g.fillStyle='#101317'; g.fillRect(0,0,WORLD.w,WORLD.h);
  // AI beton doku (yüklendiyse), yoksa prosedürel karo
  const tex = tileTexture(g, IMG.texConcrete, 0.9, 0.7);
  if(tex){ g.fillStyle='rgba(8,10,14,0.4)'; g.fillRect(0,0,WORLD.w,WORLD.h); }
  else for(let y=0;y<WORLD.h;y+=90){ for(let x=0;x<WORLD.w;x+=90){
    g.fillStyle=`rgba(${rand(18,26)|0},${rand(22,30)|0},${rand(26,34)|0},0.7)`;
    g.fillRect(x+1,y+1,88,88);
  }}
  // stains & rubble
  for(let i=0;i<420;i++){
    g.fillStyle=`rgba(${rand(8,18)|0},${rand(10,18)|0},${rand(8,14)|0},${rand(0.2,0.55)})`;
    g.beginPath(); g.arc(rand(0,WORLD.w),rand(0,WORLD.h),rand(6,40),0,7); g.fill();
  }
  // dried dark trails toward lower level
  g.strokeStyle='rgba(60,18,16,0.35)'; g.lineWidth=12; g.lineCap='round';
  for(let i=0;i<8;i++){
    g.beginPath(); g.moveTo(rand(400,2000),rand(500,2000));
    g.quadraticCurveTo(rand(400,2000),rand(400,1800),1180,rand(300,500)); g.stroke();
  }
  // cables on floor
  g.strokeStyle='rgba(10,12,14,0.8)'; g.lineWidth=4;
  for(let i=0;i<26;i++){
    g.beginPath(); const sx=rand(100,2300), sy=rand(100,2100);
    g.moveTo(sx,sy); g.bezierCurveTo(sx+rand(-200,200),sy+rand(-100,100),sx+rand(-200,200),sy+rand(-100,100),sx+rand(-300,300),sy+rand(-150,150));
    g.stroke();
  }
  groundReady=true;
}

/* ---------------- NOISE SYSTEM ---------------- */
function emitNoise(x,y,radius,strength=1,src='player'){
  if(cheats.ghost && src==='player') return;
  if(markedT>0 && src==='player') radius*=2;
  noises.push({x,y,r:0,max:radius,life:0.9,src,strength});
  for(const L of listeners){
    if(!L.alive || L.stun>0) continue;
    const d = Math.hypot(L.x-x, L.y-y);
    if(d < radius + 30){
      L.hearGlow = 1;
      const pri = strength * (1 - d/(radius+60));
      if(L.target && Math.hypot(L.target.x-x,L.target.y-y)>250 && L.state==='investigate' && src!=='player' && L.target.src!=='player'){
        L.confuse = 2.2;
      }
      if(pri > 0.12){
        L.state = (pri>0.55 && src==='player') ? 'chase' : 'investigate';
        L.target = {x,y,src};
        if(L.state==='chase' && L.scream<=0){ L.scream=0.6; AU.screech(); }
      }
    }
  }
  for(const Cw of crawlers){
    if(!Cw.alive || Cw.stun>0) continue;
    const d = Math.hypot(Cw.x-x, Cw.y-y);
    if(d < radius*0.9 + 20 && strength>0.15){
      if(Cw.state==='sleep'){ Cw.state='wake'; Cw.wakeT=0.55; AU.whisper(); }
      else if(Cw.state!=='lunge'){ Cw.target={x,y}; Cw.state='hunt'; }
      Cw.hearGlow=1;
    }
  }
}

/* ---------------- COLLISION ---------------- */
function collide(e){
  for(const t of trees){
    const d=Math.hypot(e.x-t.x,e.y-t.y), min=t.r+e.r-6;
    if(d<min && d>0){ const p=(min-d)/d; e.x+=(e.x-t.x)*p; e.y+=(e.y-t.y)*p; }
  }
  for(const w of walls){
    const nx=clamp(e.x,w.x,w.x+w.w), ny=clamp(e.y,w.y,w.y+w.h);
    const dx=e.x-nx, dy=e.y-ny, d=Math.hypot(dx,dy);
    if(d<e.r && d>0){ e.x=nx+dx/d*e.r; e.y=ny+dy/d*e.r; }
    else if(d===0){ e.y=w.y-e.r; }
  }
  if(chapter===1){
    if(e.y < 330 && (e.x<1180 || e.x>1420)) e.y = 330;
    if(e.y < 240 && !(fuseCount>=3 && Math.abs(e.x-door.x)<door.w/2)) e.y = 240;
  }
  e.x=clamp(e.x,20,WORLD.w-20); e.y=clamp(e.y,20,WORLD.h-20);
}

/* ============================================================
   UPDATE
   ============================================================ */
function update(dt){
  time+=dt;
  if(shake>0) shake=Math.max(0,shake-dt*3);
  if(chapter>=3){ updateCh3(dt); return; }
  if(markedT>0) markedT-=dt;
  document.getElementById('marked').classList.toggle('hidden', markedT<=0);

  /* --- cheats upkeep --- */
  if(cheats.inf){ batteries=Math.max(batteries,9); orbCount=Math.max(orbCount,9); torchCharge=100; }

  /* --- stamina --- */
  const wantRun = (keys.ShiftLeft||keys.ShiftRight);
  if(cheats.speed || cheats.inf) stamina=100;
  if(tired && stamina>35) tired=false;
  const canRun = wantRun && stamina>1 && !tired;

  /* --- movement --- */
  let dx=0,dy=0;
  if(keys.KeyW)dy--; if(keys.KeyS)dy++; if(keys.KeyA)dx--; if(keys.KeyD)dx++;
  const moving=(dx||dy);
  const running = canRun && moving;
  if(running){ stamina=Math.max(0,stamina-30*dt); if(stamina<=0) tired=true; }
  else stamina=Math.min(100,stamina+16*dt);
  const spd = (moving ? (running?195 : sneak?62 : 115) : 0) * (cheats.speed?2:1);
  if(moving){
    const l=Math.hypot(dx,dy); dx/=l; dy/=l;
    player.x+=dx*spd*dt; player.y+=dy*spd*dt;
    player.moving=true;
  } else player.moving=false;
  player.dir = ang({x:player.x-cam.x,y:player.y-cam.y}, mouse);
  collide(player);

  /* --- glass piles (indoor traps) --- */
  let onGlass=false;
  for(const G of glassPiles){
    if(dist(G,player)<G.r){ onGlass=true; break; }
  }

  /* --- footsteps --- */
  footT-=dt;
  if(moving && footT<=0){
    footT = running?0.26 : sneak?0.55 : 0.4;
    let r = running?185 : sneak?26 : 72;
    if(chapter===2) r*=1.25;               // indoor echo
    if(onGlass){ r=Math.max(r,200); AU.blip(2600,0.05,0.12,'square'); setHint('CAM KIRIĞI! Çok ses çıktı!',1.2); }
    emitNoise(player.x,player.y,r, running?1:sneak?(onGlass?0.8:0.2):0.55);
    AU.step(running, chapter===2);
  }

  /* --- radios --- */
  radioNoiseT-=dt;
  let nearestRadioD=1e9;
  for(const R of radios){
    const d=dist(R,player); if(R.on&&d<nearestRadioD)nearestRadioD=d;
    if(R.on && radioNoiseT<=0) emitNoise(R.x,R.y,270,0.8,'radio');
  }
  if(radioNoiseT<=0) radioNoiseT=0.7;
  if(AU.staticGain) AU.staticGain.gain.value = nearestRadioD<420 ? 0.12*(1-nearestRadioD/420) : 0;

  /* --- orbs --- */
  for(const O of orbs){
    if(O.fly){
      O.x+=O.vx*dt; O.y+=O.vy*dt; O.t-=dt; collide(O);
      if(O.t<=0){ O.fly=false; O.delay=1.6; }
    } else if(O.delay>0){ O.delay-=dt; if(O.delay<=0){O.playT=6; O.pulseT=0;} }
    else if(O.playT>0){
      O.playT-=dt; O.pulseT-=dt;
      if(O.pulseT<=0){ O.pulseT=0.75; emitNoise(O.x,O.y,300,0.9,'orb'); AU.blip(300,0.15,0.1,'sawtooth'); }
      if(O.playT<=0) O.done=true;
    }
  }

  /* --- torch --- */
  const torchOn = keys.KeyF && torchCharge>0;
  AU.torchWhine(torchOn);
  if(torchOn){
    torchCharge=Math.max(0,torchCharge-22*dt);
    if(Math.random()<dt*2) emitNoise(player.x,player.y,420,1,'torch');
    for(const E of [...listeners, ...maws, ...crawlers]){
      if(!E.alive) continue;
      const d=dist(E,player);
      if(d<340){
        const a=ang(player,E);
        let da=Math.abs(a-player.dir); da=Math.min(da,Math.PI*2-da);
        if(da<0.45){ E.stun=Math.max(E.stun,4.5); if(E.kind!=='maw')E.state='stun'; }
      }
    }
  } else torchCharge=Math.min(100,torchCharge+4*dt);

  /* --- spear --- */
  if(mouse.down && !player._atk){
    player._atk=true;
    if(batteries>0){
      batteries--;
      AU.thud(0.5); shake=0.4;
      emitNoise(player.x,player.y,45,0.3);
      for(const L of [...listeners,...crawlers]){
        if(!L.alive) continue;
        const d=dist(L,player);
        if(d<62){
          const a=ang(player,L); let da=Math.abs(a-player.dir); da=Math.min(da,Math.PI*2-da);
          if(da<0.95){ L.alive=false; AU.blip(60,0.4,0.3,'sine'); }
        }
      }
      for(const M of maws){
        if(!M.alive) continue;
        if(dist(M,player)<75 && (M.stun>0 || M.charge>0)){ M.alive=false; AU.thud(0.7); shake=1; setHint('Göğüs zarı patladı!',2); }
      }
    } else { AU.blip(180,0.1,0.1); setHint('Akü boş! Aküleri topla (⚡)'); }
  }
  if(!mouse.down) player._atk=false;

  /* --- LISTENERS AI --- */
  for(const L of listeners){
    if(!L.alive) continue;
    L.hearGlow=Math.max(0,L.hearGlow-dt*0.8);
    L.twitchT-=dt; if(L.twitchT<=0){ L.twitchT=rand(1.2,4); L.twitch=0.35; }
    if(L.twitch>0)L.twitch-=dt;
    L.drool+=dt;
    if(L.scream>0)L.scream-=dt;
    if(L.stun>0){ L.stun-=dt; if(L.stun<=0)L.state='patrol'; continue; }
    if(L.confuse>0){ L.confuse-=dt; L.dir+=dt*6; continue; }

    let tx,ty,sp=0;
    if(L.state==='patrol'){
      L.listenT-=dt;
      if(L.listenT<0){ L.listenT=rand(2.5,5); L._pause=1.4; }
      if(L._pause>0){ L._pause-=dt; sp=0; }
      else{
        const w=L.wp[L.wpi]; tx=w.x; ty=w.y; sp=46;
        if(Math.hypot(w.x-L.x,w.y-L.y)<30) L.wpi=(L.wpi+1)%L.wp.length;
      }
    }
    else if(L.state==='investigate'){
      tx=L.target.x; ty=L.target.y; sp=95;
      if(Math.hypot(tx-L.x,ty-L.y)<28){ L.state='patrol'; L.target=null; }
    }
    else if(L.state==='chase'){
      tx=L.target.x; ty=L.target.y; sp=L.fast?245:215;
      if(Math.hypot(tx-L.x,ty-L.y)<24){ L.state='investigate'; L.target={x:tx,y:ty,src:'echo'}; }
    }
    if(sp>0 && tx!==undefined){
      const a=ang(L,{x:tx,y:ty});
      L.dir += Math.sin(a-L.dir)*dt*6;
      L.x+=Math.cos(L.dir)*sp*dt; L.y+=Math.sin(L.dir)*sp*dt;
      collide(L);
    }
    if(dist(L,player) < L.r+player.r+2 && state==='play') return kill('listener');
    if(dist(L,player)<70 && player.moving && !sneak){ L.state='chase'; L.target={x:player.x,y:player.y,src:'player'}; }
  }

  /* --- MAWS AI --- */
  for(const M of maws){
    if(!M.alive) continue;
    M.hum+=dt;
    M.twitchT-=dt; if(M.twitchT<=0){M.twitchT=rand(2,5);M.twitch=0.3;}
    if(M.twitch>0)M.twitch-=dt;
    if(M.stun>0){ M.stun-=dt; continue; }
    const d=dist(M,player);
    if(M.cd>0)M.cd-=dt;
    if(d<240 && player.moving && !sneak && M.cd<=0 && M.charge<=0) M.charge=2;
    if(M.charge>0){
      M.charge-=dt;
      M.dir = ang(M,player);
      if(M.charge<=0){
        M.cd=6; AU.screech(); shake=1.2;
        markedT=10;
        emitNoise(player.x,player.y,240,1,'maw');
        setHint('AĞIZ seni işaretledi! 10 sn boyunca sesin 2 kat!');
      }
    } else {
      const w=M.wp[M.wpi];
      const a=ang(M,w); M.dir+=Math.sin(a-M.dir)*dt*3;
      M.x+=Math.cos(M.dir)*28*dt; M.y+=Math.sin(M.dir)*28*dt;
      if(dist(M,w)<40) M.wpi=(M.wpi+1)%M.wp.length;
      collide(M);
    }
    if(d < M.r+player.r+2) return kill('maw');
  }

  /* --- CRAWLERS AI (Bölüm 2 ağırlıklı) --- */
  for(const Cw of crawlers){
    if(!Cw.alive) continue;
    Cw.hearGlow=Math.max(0,Cw.hearGlow-dt);
    Cw.breathT+=dt;
    if(Cw.stun>0){ Cw.stun-=dt; if(Cw.stun<=0)Cw.state='sleep'; continue; }
    if(Cw.state==='sleep'){
      // breathing sound cue when player is near
      if(dist(Cw,player)<160 && Math.random()<dt*0.8) AU.whisper();
      continue;
    }
    if(Cw.state==='wake'){
      Cw.wakeT-=dt;
      if(Cw.wakeT<=0){
        // LUNGE toward last heard point
        const t = Cw.target || {x:player.x,y:player.y};
        const a=ang(Cw,t);
        Cw.vx=Math.cos(a)*430; Cw.vy=Math.sin(a)*430;
        Cw.state='lunge'; Cw.lungeT=0.75; AU.screech();
      }
      continue;
    }
    if(Cw.state==='lunge'){
      Cw.lungeT-=dt;
      Cw.x+=Cw.vx*dt; Cw.y+=Cw.vy*dt; Cw.dir=Math.atan2(Cw.vy,Cw.vx);
      collide(Cw);
      if(Cw.lungeT<=0){ Cw.state='hunt'; Cw.target=null; Cw.returnT=4; }
      if(dist(Cw,player)<Cw.r+player.r+2 && state==='play') return kill('crawler');
      continue;
    }
    if(Cw.state==='hunt'){
      Cw.returnT-=dt;
      if(Cw.target){
        const a=ang(Cw,Cw.target);
        Cw.dir+=Math.sin(a-Cw.dir)*dt*7;
        Cw.x+=Math.cos(Cw.dir)*150*dt; Cw.y+=Math.sin(Cw.dir)*150*dt;
        collide(Cw);
        if(dist(Cw,Cw.target)<26) Cw.target=null;
      } else if(Cw.returnT<=0){
        const a=ang(Cw,{x:Cw.homeX,y:Cw.homeY});
        Cw.dir+=Math.sin(a-Cw.dir)*dt*5;
        Cw.x+=Math.cos(Cw.dir)*90*dt; Cw.y+=Math.sin(Cw.dir)*90*dt;
        collide(Cw);
        if(dist(Cw,{x:Cw.homeX,y:Cw.homeY})<30) Cw.state='sleep';
      }
      if(dist(Cw,player)<Cw.r+player.r+2 && state==='play') return kill('crawler');
    }
  }

  /* --- noise anim --- */
  for(const n of noises){ n.life-=dt; n.r=(1-n.life/0.9)*n.max; }
  noises=noises.filter(n=>n.life>0);

  /* --- heartbeat --- */
  let nd=1e9;
  for(const L of listeners) if(L.alive) nd=Math.min(nd,dist(L,player));
  for(const M of maws) if(M.alive) nd=Math.min(nd,dist(M,player));
  for(const Cw of crawlers) if(Cw.alive&&Cw.state!=='sleep') nd=Math.min(nd,dist(Cw,player));
  AU.heartT-=dt;
  if(nd<320 && AU.heartT<=0){ AU.heartT = 0.4+nd/320; AU.heartbeat(); }

  /* --- FINAL SEQUENCE (chapter 2) --- */
  if(finalSeq){
    finalSeq.t+=dt;
    document.getElementById('finalfill').style.width=(finalSeq.t/finalSeq.dur*100)+'%';
    // siren pings draw everything
    finalSeq.pingT-=dt;
    if(finalSeq.pingT<=0){
      finalSeq.pingT=1.4;
      emitNoise(player.x,player.y,360,1,'siren');
      AU.blip(880,0.3,0.08,'sawtooth');
    }
    // waves of crawlers
    finalSeq.waveT-=dt;
    if(finalSeq.waveT<=0){
      finalSeq.waveT=6;
      const sx = Math.random()<0.5?300:2100;
      const c1=makeCrawler(sx,1900); c1.state='hunt'; c1.target={x:player.x,y:player.y}; c1.returnT=99;
      crawlers.push(c1);
      const L=makeListener(sx,1600,[[sx,1600],[1180,1000]]); L.state='chase'; L.target={x:player.x,y:player.y,src:'player'};
      listeners.push(L);
      setHint('GELİYORLAR! Dayan!',2);
    }
    if(finalSeq.t>=finalSeq.dur){ return winGame(); }
  }

  /* --- interact --- */
  let hint='';
  for(const R of radios){ if(dist(R,player)<52){ hint=`[E] Radyoyu ${R.on?'KAPAT':'AÇ'} — mutantları çeker`; if(keys.KeyE&&!player._e){R.on=!R.on;AU.blip(R.on?900:300,0.1,0.12);} } }
  for(const Fu of fuses){ if(!Fu.got && dist(Fu,player)<45){
    hint = chapter===1?'[E] Sigortayı al':'[E] Doğrulama bandını al';
    if(keys.KeyE&&!player._e){Fu.got=true;fuseCount++;AU.blip(1200,0.2,0.15);
      const done=fuseCount===3;
      setHint(chapter===1?`Sigorta ${fuseCount}/3 ${done?'— İSTASYON KAPISINA GİT!':''}`:`Bant ${fuseCount}/3 ${done?'— ANA VERİCİYE GİT (kuzey)!':''}`);} } }
  for(const P of pickups){ if(!P.got && dist(P,player)<42){ hint = P.type==='bat'?'[E] Akü al':'[E] Yankı Küresi al';
    if(keys.KeyE&&!player._e){P.got=true; if(P.type==='bat')batteries++; else orbCount++; AU.blip(1000,0.15,0.12);} } }
  for(const N of notes){ if(!N.got && dist(N,player)<45){ hint='[E] Notu oku';
    if(keys.KeyE&&!player._e){ N.got=true; noteCount++; notesRead++; openNote(N.text); } } }
  // door / console
  if(Math.abs(player.x-door.x)<110 && Math.abs(player.y-(door.y+40))<80){
    if(chapter===1){
      if(fuseCount>=3){ hint='[E] İSTASYONA GİR'; if(keys.KeyE&&!player._e){ startChapter2Card(); } }
      else hint=`Kapı kilitli — sigorta gerekli (${fuseCount}/3)`;
    } else if(!finalSeq){
      if(fuseCount>=3){ hint='[E] ANA VERİCİYİ KAPAT — HAZIR OL'; if(keys.KeyE&&!player._e){
        finalSeq={t:0,dur:35,waveT:0.1,pingT:0.1};
        document.getElementById('finalbar').classList.remove('hidden');
        setObjective('VERİCİ KAPANIYOR — 35 SANİYE HAYATTA KAL');
        AU.screech(); shake=1.5;
      } }
      else hint=`Konsol kilitli — doğrulama bandı gerekli (${fuseCount}/3)`;
    }
  }
  for(const O of orbs){ if(O.done && dist(O,player)<45){ hint='[E] Yankı Küresini geri al'; if(keys.KeyE&&!player._e){O.rm=true;orbCount++;AU.blip(1000,0.1,0.1);} } }
  orbs=orbs.filter(o=>!o.rm);
  player._e = keys.KeyE;
  if(hint) setHint(hint,0.1);

  /* --- throw orb --- */
  if(keys.KeyQ && !player._q && orbCount>0){
    orbCount--;
    const a=player.dir;
    orbs.push({x:player.x,y:player.y,vx:Math.cos(a)*320,vy:Math.sin(a)*320,fly:true,t:0.65,delay:0,playT:0,r:9});
    AU.blip(500,0.08,0.1);
  }
  player._q=keys.KeyQ;

  if(keys.KeyC && !player._c){ sneak=!sneak; AU.blip(sneak?250:400,0.06,0.08); }
  player._c=keys.KeyC;

  /* --- camera --- */
  cam.x += (player.x-W/2-cam.x)*dt*5;
  cam.y += (player.y-H/2-cam.y)*dt*5;
  cam.x=clamp(cam.x,0,WORLD.w-W); cam.y=clamp(cam.y,0,WORLD.h-H);

  /* --- HUD --- */
  const curNoise = markedT>0?100 : torchOn?100 : running?85 : moving&&!sneak?45 : moving?12 : 4;
  document.getElementById('vufill').style.width=curNoise+'%';
  const sf=document.getElementById('stamfill');
  sf.style.width=stamina+'%'; sf.classList.toggle('tired',tired);
  document.getElementById('stBat').textContent=batteries;
  document.getElementById('stOrb').textContent=orbCount;
  document.getElementById('stTorch').style.width=torchCharge+'%';
  document.getElementById('stFuse').textContent=fuseCount+'/3';
  document.getElementById('stNote').textContent=noteCount;
  hintT-=dt; if(hintT<=0) document.getElementById('hint').textContent='';
}

function setHint(t,dur=3){ document.getElementById('hint').textContent=t; hintT=dur; }
function setObjective(t){ document.getElementById('objective').textContent='— '+t+' —'; }

/* ============================================================
   BÖLÜM 3 UPDATE
   ============================================================ */
function updateCh3(dt){
  if(ch3.phase==='escape'){
    /* ---------- KAÇIŞ SEKANSI ---------- */
    ch3.escapeT+=dt;
    let dx=0,dy=0;
    if(keys.KeyW)dy--; if(keys.KeyS)dy++; if(keys.KeyA)dx--; if(keys.KeyD)dx++;
    const moving=(dx||dy);
    const spd=(moving?230:0)*(cheats.speed?2:1); // kaçışta hep koşuyorsun
    if(moving){
      const l=Math.hypot(dx,dy); dx/=l; dy/=l;
      player.x+=dx*spd*dt; player.y+=dy*spd*dt;
      player.moving=true;
    } else player.moving=false;
    player.dir = moving?Math.atan2(dy,dx):0;
    player.y=clamp(player.y,345,555); player.x=clamp(player.x,40,WORLD.w-40);

    // arkadan kovalayan sürü — hızları oyuncuya yakın, gerilim sabit
    ch3.waveT-=dt;
    if(ch3.waveT<=0){
      ch3.waveT=rand(1.2,2.2);
      const L=makeListener(player.x-rand(480,650), rand(350,550), [[0,0]]);
      L.state='chase'; L.target={x:player.x+600,y:player.y,src:'player'};
      L.fast=true; listeners.push(L);
    }
    for(const L of listeners){
      if(!L.alive) continue;
      L.hearGlow=1;
      L.target={x:player.x,y:player.y,src:'player'};
      const a=ang(L,player);
      L.dir+=Math.sin(a-L.dir)*dt*8;
      const sp = 205 + Math.min(60,(player.x-L.x-300)*0.1); // lastik bant
      L.x+=Math.cos(L.dir)*sp*dt; L.y+=Math.sin(L.dir)*sp*dt;
      L.y=clamp(L.y,345,555);
      if(dist(L,player)<L.r+player.r+2 && !cheats.god && !cheats.ghost) return kill('listener');
    }
    // ışıklar patlıyor efekti
    if(Math.random()<dt*1.5){ shake=0.3; AU.blip(rand(80,140),0.1,0.1,'square'); }

    // odaya ulaştın mı?
    if(player.x>door.x-30 && Math.abs(player.y-(door.y+40))<70){
      ch3.phase='room';
      listeners=[];
      AU.doorSlam(); shake=1;
      document.getElementById('hud').classList.add('hidden');
      setObjective('');
      setHint('');
    }
    // HUD (escape sırasında normal hud kullanılıyor)
    document.getElementById('vufill').style.width='100%';
    const sf=document.getElementById('stamfill'); sf.style.width='100%';
    hintT-=dt; if(hintT<=0) document.getElementById('hint').textContent='';
    return;
  }

  /* ---------- HAVALANDIRMA MİNİGAME ---------- */
  if(ch3.phase==='maze'){ updateMaze(dt);
    return; }
  if(ch3.phase==='vent'){ updateVent(dt);
    hintT-=dt; if(hintT<=0) document.getElementById('hint').textContent='';
    return; }

  /* ---------- GÜVENLİK ODASI (FNAF) ---------- */
  const R=ch3;
  // saat: 03:00'a kadar dayan — her "saat" 35 sn (hızlı gece)
  R.hourT+=dt;
  if(R.hourT>=35){ R.hourT=0; R.hour++;
    AU.blip(660,0.3,0.12,'sine');
    if(R.hour>=3) return startChapter4();
  }

  // güç tüketimi (3 saatlik kısa gece için dengeli — pasif toplam ~%8)
  let drain=0.08;            // pasif: 35 sn'lik saatte ~%2.8
  if(R.doorL) drain+=0.38;   // kapalı kapı: saatte ~%13
  if(R.doorR) drain+=0.38;
  if(R.peek)  drain+=0.22;
  if(R.cam)   drain+=0.16;
  if(cheats.inf) drain=0;
  R.power=Math.max(0,R.power-drain*dt);
  if(R.power<=0){
    // güç bitti: kapılar açılır, kısa süre sonra ölüm
    if((R.doorL||R.doorR) && !R._blackoutSnd){ R._blackoutSnd=true; AU.doorHiss(); AU.doorImpact(); }
    R.doorL=R.doorR=false; R.cam=false; R.peek=null;
    R.blackoutT=(R.blackoutT||0)+dt;
    if(R.blackoutT>rand(4,7) && !cheats.god && !cheats.ghost) return kill('stalker');
  }

  /* --- girişler --- */
  // A / D veya ok tuşları: kapılar (animasyonlu!)
  if((keys.KeyA||keys.ArrowLeft) && !R._dl){
    R.doorL=!R.doorL;
    if(R.doorL) AU.doorServo(); else AU.doorHiss();
  }
  R._dl=(keys.KeyA||keys.ArrowLeft);
  if((keys.KeyD||keys.ArrowRight) && !R._dr){
    R.doorR=!R.doorR;
    if(R.doorR) AU.doorServo(); else AU.doorHiss();
  }
  R._dr=(keys.KeyD||keys.ArrowRight);

  /* --- kapı animasyonu: iniş ~0.5sn, kalkış ~0.7sn --- */
  for(const side of ['L','R']){
    const want=R['door'+side], key='door'+side+'pos';
    const p=R[key];
    if(want && p<1){
      R[key]=Math.min(1, p + dt*2.1);          // gümbürtüyle iner
      if(R[key]>=1 && p<1){ AU.doorImpact(); shake=Math.max(shake,0.5); } // yere oturdu: GÜM!
    } else if(!want && p>0){
      R[key]=Math.max(0, p - dt*1.5);          // daha yavaş, kontrollü kalkar
    }
  }
  // Q / E: fenerle kapıdan bak (kapı fiilen açıkken — inmişse bakamazsın!)
  R.peek=null;
  if(keys.KeyQ && R.doorLpos<0.25) R.peek='L';
  if(keys.KeyE && R.doorRpos<0.25) R.peek='R';
  // S: kamera aç/kapat, W: kamera değiştir
  if(keys.KeyS && !R._cam){ R.cam=!R.cam; R.camStatic=0.4; AU.camBlip(); }
  R._cam=keys.KeyS;
  if(R.cam && keys.KeyW && !R._csw){ R.camIdx=(R.camIdx+1)%4; R.camStatic=0.35; AU.camBlip(); }
  R._csw=keys.KeyW;
  if(R.camStatic>0) R.camStatic-=dt;

  /* --- GÖLGELER (kapı düşmanları) --- */
  for(const S of stalkers){
    if(S.killT>0){ // saldırı animasyonu başladı
      S.killT-=dt;
      if(S.killT<=0 && !cheats.god && !cheats.ghost) return kill('stalker');
      continue;
    }
    if(S.retreatFlash>0){ S.retreatFlash-=dt; continue; }
    if(!S.atDoor){
      S.waitT-=dt;
      if(S.waitT<=0){
        S.pos=Math.min(1,S.pos+S.speed*dt*10);
        if(S.pos>=1){ S.atDoor=true; S.doorT=rand(3.5,6);
          // kapıya vardı: ipucu sesi — hangi taraftan geldiği belli
          AU.blip(S.side==='L'?220:330,0.4,0.14,'sawtooth');
        }
      }
    } else {
      // kapıda bekliyor: kapı FİİLEN inmişse vazgeçer, açıksa süre dolunca saldırır
      const doorClosed = (S.side==='L'?R.doorLpos:R.doorRpos) >= 0.95;
      if(doorClosed){
        S.atDoor=false; S.pos=0; S.waitT=rand(6,12); S.speed=Math.min(0.11,S.speed+0.008);
        AU.blip(120,0.3,0.1,'sine'); // homurdanıp gider
      } else if(R.peek===S.side){
        // fenerle yakalandı: geri çekilir!
        S.atDoor=false; S.pos=0; S.waitT=rand(7,13); S.retreatFlash=0.5;
        AU.screech(); shake=0.5;
      } else {
        S.doorT-=dt;
        if(S.doorT<=0){ S.killT=0.9; AU.jumpscareSound(); shake=2; }
      }
    }
  }

  /* --- SEYİRCİ (kamera düşmanı) --- */
  watcher.moveT-=dt;
  if(watcher.moveT<=0){
    watcher.moveT=rand(5,9);
    watcher.cam=Math.floor(rand(0,4));
    if(Math.random()<0.3) watcher.cam=-1; // kameralardan kaybolur...
  }
  // Seyirci kaybolduysa pencereye gelir!
  if(watcher.cam===-1){
    R.watcherWinT=(R.watcherWinT||0)+dt;
    if(R.watcherWinT>5){
      // pencereden içeri bakıyor — kameraya bakarsan (S) kaçar
      if(R.cam){ watcher.cam=Math.floor(rand(0,4)); R.watcherWinT=0; AU.camBlip(); }
      else if(R.watcherWinT>11 && !cheats.god && !cheats.ghost) return kill('watcher');
    }
  } else R.watcherWinT=0;

  /* --- FNAF HUD çizimi render'da --- */
}

/* ============================================================
   HAVALANDIRMA ODASI — FENER MİNİGAME'İ
   Görev: 3 fanı tamir et (E basılı tut). Kanallardan yaratıklar
   gelir — fareyle fener tutup onları geri püskürt!
   ============================================================ */
function startChapter4(){
  // BÖLÜM 4 — HAVALANDIRMA (ayrı bölüm olarak)
  AU.init();
  if(!ch3){ buildChapter3(); }  // ch3 yapısı yoksa kur (menüden direkt gelindi)
  chapter=4;
  document.getElementById('btnCh4').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  hideAll(); state='play';
  startVentPhase();
  setObjective('BÖLÜM 4 — HAVALANDIRMA: 3 FANI TAMİR ET');
  setHint('FARE=fener yönü, SOL TIK=ışık, fan başında E basılı tut',6);
}
function startVentPhase(){
  const R=ch3;
  R.phase='vent';
  AU.doorSlam(); shake=1;
  // 5 kanal ağzı (ekran kenarlarında)
  R.vents=[
    {x:120,  y:150, dir:'TL'}, {x:W-120, y:150, dir:'TR'},
    {x:60,   y:H/2, dir:'L'},  {x:W-60,  y:H/2, dir:'R'},
    {x:W/2,  y:110, dir:'T'},
  ];
  // 3 fan görevi
  R.fans=[
    {x:W/2-320, y:H-190, prog:0, done:false},
    {x:W/2,     y:H-160, prog:0, done:false},
    {x:W/2+320, y:H-190, prog:0, done:false},
  ];
  R.creeps=[];       // aktif yaratıklar
  R.spawnT=2.5;
  R.flash=100;       // fener pili (yenilenir)
  R.ventDone=false;
  setHint('');
}

function updateVent(dt){
  const R=ch3;
  // fener pili: kullanınca azalır, bırakınca dolar
  const lightOn = mouse.down && R.flash>0;
  if(lightOn) R.flash=Math.max(0, R.flash-(cheats.inf?0:16*dt));
  else R.flash=Math.min(100, R.flash+22*dt);

  /* --- yaratık spawn: AYNI ANDA SADECE 1 YARATIK --- */
  const remaining=R.fans.filter(f=>!f.done).length;
  const activeCreeps=R.creeps.filter(c=>!c.dead).length;
  R.spawnT-=dt;
  if(R.spawnT<=0 && !R.ventDone && activeCreeps<1){
    R.spawnT = rand(3.5,5.5) - (3-remaining)*0.6; // son fanda ~2.3-4.3 sn
    const v=R.vents[Math.floor(rand(0,R.vents.length))];
    R.creeps.push({ x:v.x, y:v.y, vent:v, prog:0, // 0=kanalda, 1=üstünde
      speed:rand(0.08,0.12)+(3-remaining)*0.015, pushed:0, dead:false });
  } else if(R.spawnT<=0){
    R.spawnT=0.8; // oda doluysa kısa aralıklarla tekrar dene
  }

  /* --- yaratıklar oyuncuya (ekran merkezine-alt) süzülür --- */
  const tx=W/2, ty=H-220;
  for(const c of R.creeps){
    if(c.dead) continue;
    // fener üstünde mi? (fare imleci yakınında + basılı)
    const mx=mouse.x, my=mouse.y;
    const cxp=c.x+(tx-c.x)*c.prog, cyp=c.y+(ty-c.y)*c.prog;
    const lit = lightOn && Math.hypot(mx-cxp,my-cyp)<110;
    if(lit){
      c.pushed+=dt;
      c.prog=Math.max(0, c.prog-0.40*dt); // geri püskürt (hızlı)
      if(c.prog<=0 && c.pushed>0.3){ c.dead=true; AU.screech(); }
    } else {
      c.pushed=0;
      c.prog+=c.speed*dt;
      if(c.prog>=1 && !cheats.god && !cheats.ghost) { kill('ventcreep'); return true; }
      if(c.prog>=1) { c.dead=true; }
    }
  }
  R.creeps=R.creeps.filter(c=>!c.dead);

  /* --- fan tamiri: fana yaklaş (fare) + E basılı tut --- */
  let hintTxt='';
  for(const f of R.fans){
    if(f.done) continue;
    const near=Math.hypot(mouse.x-f.x, mouse.y-f.y)<90;
    if(near){
      hintTxt='[E BASILI TUT] Fanı tamir et';
      if(keys.KeyE){
        f.prog=Math.min(100, f.prog+ (cheats.inf?60:14)*dt);
        if(Math.random()<dt*8) AU.blip(rand(300,500),0.03,0.05);
        if(f.prog>=100){ f.done=true; AU.blip(1100,0.3,0.15,'sine'); shake=0.4;
          setHint(`Fan tamir edildi! (${R.fans.filter(x=>x.done).length}/3)`,2.5); }
      }
    }
  }
  if(hintTxt) setHint(hintTxt,0.1);

  /* --- hepsi bitti mi? → LABİRENT KAÇIŞI --- */
  if(!R.ventDone && R.fans.every(f=>f.done)){
    R.ventDone=true;
    setTimeout(()=>{ if(state==='play') startChapter5(); }, 2500);
  }
  return false;
}

/* ============================================================
   VENT LABİRENTİ — fanlar dönünce kanallara giriyorsun:
   karanlık, dar, arkadan hava basıncı + peşindeki ŞEY
   ============================================================ */
function startChapter5(){
  // BÖLÜM 5 — VENT LABİRENTİ KAÇIŞI (ayrı bölüm)
  AU.init();
  if(!ch3){ buildChapter3(); }
  chapter=5;
  document.getElementById('btnCh5').classList.remove('hidden');
  hideAll(); state='play';
  startMazePhase();
}
function startMazePhase(){
  const R=ch3;
  R.phase='maze';
  AU.doorSlam(); shake=1;
  AU.startMusic(); // final kaçış müziği
  WORLD={w:5400,h:900};
  walls=[]; trees=[]; glassPiles=[]; radios=[]; fuses=[]; pickups=[]; notes=[];
  listeners=[]; maws=[]; crawlers=[]; orbs=[]; noises=[];
  player={ x:140, y:450, r:13, dir:0, moving:false, slowT:0 };
  cam={ x:0, y:player.y-H/2 };
  door={ x:5220, y:400, w:70, h:120 }; // çıkış kapağı (sağ uç)
  // TAKİPÇİ: düz koridorda arkandan gelir
  R.hunter={ x:-260, y:450, speed:196, alive:true };
  R.mazeT=0; R.lastCreak=0;

  /* ENGELLER — koridor boyunca */
  R.obs=[];
  // devrilen tahtalar: yaklaşınca gıcırdayıp DÜŞER, yere yatar (üstünden atlanmaz, etrafından dolaş)
  for(const px of [700,1500,2300,3100,3900,4600]){
    R.obs.push({type:'plank', x:px+rand(-80,80), y:rand(380,520),
      state:'idle', fallT:0, ang:0, len:rand(150,190), lane:0});
  }
  // buhar jetleri: duvardan periyodik püskürür — içinden geçersen yavaşlarsın
  for(const px of [1100,1900,2700,3500,4300]){
    R.obs.push({type:'steam', x:px+rand(-60,60), y:Math.random()<0.5?345:555,
      up:false, cycle:rand(0,3), on:false});
  }
  // moloz yığınları: statik, etrafından dolaş
  for(const px of [900,1700,2500,3300,4100,4800]){
    R.obs.push({type:'debris', x:px+rand(-100,100), y:rand(370,530), r:rand(34,50)});
  }
  buildGroundMaze();
  document.getElementById('hud').classList.remove('hidden');
  setObjective('BÖLÜM 5 — KAÇ! ÇIKIŞA KOŞ (SAĞA)');
  setHint('ARKANDA! Engellerin etrafından dolaş — takılırsan yavaşlarsın!',5);
}
function buildGroundMaze(){
  ground=document.createElement('canvas');
  ground.width=WORLD.w; ground.height=WORLD.h;
  const g=ground.getContext('2d');
  g.fillStyle='#07090c'; g.fillRect(0,0,WORLD.w,WORLD.h);
  // koridor zemini: metal paneller
  g.fillStyle='#12161b'; g.fillRect(0,330,WORLD.w,240);
  for(let x=0;x<WORLD.w;x+=120){
    g.fillStyle=`rgba(${rand(16,23)|0},${rand(20,27)|0},${rand(24,31)|0},0.9)`;
    g.fillRect(x+2,332,116,236);
    g.fillStyle='rgba(60,70,80,0.45)';
    g.fillRect(x+8,340,3,3); g.fillRect(x+108,340,3,3);
    g.fillRect(x+8,558,3,3); g.fillRect(x+108,558,3,3);
  }
  // duvar boruları
  g.strokeStyle='#1c242b'; g.lineWidth=6;
  for(const y of [312,322,578,588]){ g.beginPath(); g.moveTo(0,y); g.lineTo(WORLD.w,y); g.stroke(); }
  // pas/su izleri
  for(let i=0;i<120;i++){
    g.fillStyle=`rgba(${rand(40,70)|0},${rand(28,40)|0},${rand(18,26)|0},${rand(0.05,0.15)})`;
    g.beginPath(); g.arc(rand(0,WORLD.w),rand(340,560),rand(8,34),0,7); g.fill();
  }
  // sürüklenme izleri
  g.strokeStyle='rgba(70,20,18,0.3)'; g.lineWidth=8; g.lineCap='round';
  for(let i=0;i<10;i++){
    const sx=rand(200,5000);
    g.beginPath(); g.moveTo(sx,rand(360,540)); g.lineTo(sx+rand(80,240),rand(360,540)); g.stroke();
  }
  // çıkış okları
  g.fillStyle='rgba(77,189,110,0.4)'; g.font='bold 24px Courier New';
  for(let x=400;x<5000;x+=600) g.fillText('→ ÇIKIŞ →', x, 300);
  groundReady=true;
}

function updateMaze(dt){
  const R=ch3;
  R.mazeT+=dt;
  /* hareket: hep koşuyorsun, stamina yok — tempo sinematik */
  let dx=0,dy=0;
  if(keys.KeyW)dy--; if(keys.KeyS)dy++; if(keys.KeyA)dx--; if(keys.KeyD)dx++;
  const moving=(dx||dy);
  if(player.slowT>0) player.slowT-=dt;
  const spd=(moving? (player.slowT>0?120:225) : 0)*(cheats.speed?2:1);
  if(moving){
    const l=Math.hypot(dx,dy); dx/=l; dy/=l;
    player.x+=dx*spd*dt; player.y+=dy*spd*dt;
    player.moving=true; player.dir=Math.atan2(dy,dx);
  } else player.moving=false;
  player.y=clamp(player.y,348,552); player.x=clamp(player.x,40,WORLD.w-30);

  footT-=dt;
  if(moving&&footT<=0){ footT=0.24; AU.step(true,true); }

  /* ENGELLER */
  for(const o of R.obs){
    if(o.type==='plank'){
      if(o.state==='idle' && player.x>o.x-260 && player.x<o.x){
        o.state='falling'; o.fallT=0.55;
        AU.blip(140,0.4,0.2,'sawtooth'); AU.blip(90,0.5,0.15,'square'); // gıcırt
        shake=Math.max(shake,0.35);
      }
      if(o.state==='falling'){
        o.fallT-=dt; o.ang=(1-o.fallT/0.55)*Math.PI/2;
        if(o.fallT<=0){ o.state='down'; o.ang=Math.PI/2; AU.doorImpact(); shake=Math.max(shake,0.6); }
      }
      if(o.state==='down'){
        // yatan tahta: yatay blok — çarpma kontrolü
        if(Math.abs(player.y-o.y)<16 && player.x>o.x-o.len/2-8 && player.x<o.x+o.len/2+8){
          if(player.slowT<=0){ player.slowT=0.6; AU.thud(0.4); shake=Math.max(shake,0.3); }
          // geri it
          player.x-=60*dt*3;
        }
      }
    }
    else if(o.type==='steam'){
      o.cycle+=dt;
      o.on = (o.cycle%3)<1.4; // 1.4sn açık, 1.6sn kapalı
      if(o.on){
        const jetY = o.y<450 ? [o.y,o.y+120] : [o.y-120,o.y];
        if(Math.abs(player.x-o.x)<26 && player.y>jetY[0] && player.y<jetY[1]){
          if(player.slowT<=0){ player.slowT=0.7; AU.blip(2400,0.2,0.1); }
        }
        if(Math.abs(player.x-o.x)<400 && Math.random()<dt*3) AU.blip(rand(1800,2600),0.05,0.03);
      }
    }
    else if(o.type==='debris'){
      const d=Math.hypot(player.x-o.x,player.y-o.y);
      if(d<o.r+player.r-4){
        const a=Math.atan2(player.y-o.y,player.x-o.x);
        player.x=o.x+Math.cos(a)*(o.r+player.r-4);
        player.y=o.y+Math.sin(a)*(o.r+player.r-4);
      }
    }
  }
  player.y=clamp(player.y,348,552);

  /* TAKİPÇİ: düz koridor — lastik bant, asla durmaz */
  const Hn=R.hunter;
  if(Hn.alive){
    const d=player.x-Hn.x;
    const sp=Hn.speed + Math.max(0,(d-430))*0.5 - (d<240?36:0);
    Hn.x+=sp*dt;
    Hn.y+=(player.y-Hn.y)*dt*3.2;
    if(Math.random()<dt*2.4){ AU.blip(rand(55,105),0.15,0.13,'square'); if(d<340) shake=Math.max(shake,0.22); }
    if(d<230 && Math.random()<dt*1.6) AU.whisper();
    if(d<40 && Math.abs(player.y-Hn.y)<46 && !cheats.god && !cheats.ghost) return kill('hunter');
  }

  /* ışıklar patlıyor */
  if(Math.random()<dt*1.2){ shake=Math.max(shake,0.2); AU.blip(rand(80,140),0.08,0.08,'square'); }

  /* çıkış */
  if(player.x>door.x-40){ return winGame(); }

  /* kamera: oyuncu solda kalsın — önünü gör */
  cam.x += ((player.x-W*0.32)-cam.x)*dt*7;
  cam.x=clamp(cam.x,0,WORLD.w-W);
  cam.y=clamp(player.y-H/2,0,Math.max(0,WORLD.h-H));

  document.getElementById('vufill').style.width=(moving?85:6)+'%';
  document.getElementById('stamfill').style.width='100%';
  hintT-=dt; if(hintT<=0) document.getElementById('hint').textContent='';
}

function renderMaze(){
  const R=ch3;
  const shakeMul=settings.shake/100;
  const sx=shake>0?rand(-shake,shake)*8*shakeMul:0;
  const sy=shake>0?rand(-shake,shake)*8*shakeMul:0;
  cx.save(); cx.translate(-cam.x+sx,-cam.y+sy);
  if(groundReady) cx.drawImage(ground,0,0);

  /* titrek tavan lambaları */
  for(let x=300;x<WORLD.w;x+=450){
    if(x<cam.x-100||x>cam.x+W+100) continue;
    const on=Math.sin(time*6+x*0.7)>-0.2;
    cx.fillStyle= on?'rgba(255,190,110,0.75)':'#1a1512';
    cx.fillRect(x-16,316,32,8);
    if(on){ cx.fillStyle='rgba(255,190,110,0.05)';
      cx.beginPath(); cx.moveTo(x-16,324); cx.lineTo(x-58,570); cx.lineTo(x+58,570); cx.lineTo(x+16,324); cx.fill(); }
  }

  /* ENGELLER */
  for(const o of R.obs){
    if(!vis(o.x,o.y,220)) continue;
    if(o.type==='plank'){
      cx.save(); cx.translate(o.x,o.y);
      if(o.state==='idle'){
        // duvara yaslı tahta (dikey)
        cx.rotate(-0.08);
        cx.fillStyle='#4a3826'; cx.fillRect(-9,-o.len,18,o.len);
        cx.strokeStyle='#2c2115'; cx.lineWidth=2; cx.strokeRect(-9,-o.len,18,o.len);
        for(let i=1;i<4;i++){ cx.beginPath(); cx.moveTo(-9,-o.len*i/4); cx.lineTo(9,-o.len*i/4); cx.stroke(); }
      } else {
        // düşüyor/yerde: açıyla yat
        cx.rotate(o.ang-Math.PI/2+(o.state==='falling'?Math.sin(time*40)*0.02:0));
        cx.fillStyle= o.state==='down' ? '#54402c' : '#4a3826';
        cx.fillRect(-o.len/2,-9,o.len,18);
        cx.strokeStyle='#2c2115'; cx.lineWidth=2; cx.strokeRect(-o.len/2,-9,o.len,18);
        for(let i=1;i<5;i++){ cx.beginPath(); cx.moveTo(-o.len/2+o.len*i/5,-9); cx.lineTo(-o.len/2+o.len*i/5,9); cx.stroke(); }
        // çivi parıltısı
        cx.fillStyle='rgba(190,190,200,0.5)';
        cx.fillRect(-o.len/2+8,-2,3,3); cx.fillRect(o.len/2-11,-2,3,3);
      }
      cx.restore();
      if(o.state==='falling'){ cx.fillStyle='#ffb03b'; cx.font='bold 13px Courier New';
        cx.fillText('!', o.x-3, o.y-o.len-8); }
    }
    else if(o.type==='steam'){
      // boru ağzı
      cx.fillStyle='#242e36'; cx.fillRect(o.x-14, o.y<450?o.y-14:o.y, 28, 14);
      if(o.on){
        const dir=o.y<450?1:-1;
        for(let i=0;i<7;i++){
          const t=(time*3+i*0.4)%1;
          cx.fillStyle=`rgba(210,225,230,${0.24*(1-t)})`;
          cx.beginPath();
          cx.arc(o.x+Math.sin(time*8+i)*8*t, o.y+dir*(6+t*115), 7+t*16, 0, 7);
          cx.fill();
        }
      }
    }
    else if(o.type==='debris'){
      cx.fillStyle='rgba(0,0,0,0.4)';
      cx.beginPath(); cx.ellipse(o.x+4,o.y+5,o.r,o.r*0.7,0,0,7); cx.fill();
      cx.fillStyle='#252c33';
      cx.beginPath(); cx.arc(o.x,o.y,o.r,0,7); cx.fill();
      cx.fillStyle='#313a42';
      cx.beginPath(); cx.arc(o.x-o.r*0.3,o.y-o.r*0.3,o.r*0.5,0,7); cx.fill();
      cx.strokeStyle='#171d22'; cx.lineWidth=2;
      cx.beginPath(); cx.moveTo(o.x-o.r*0.5,o.y+o.r*0.2); cx.lineTo(o.x+o.r*0.4,o.y-o.r*0.1); cx.stroke();
    }
  }

  /* çıkış kapağı */
  const dg2=cx.createRadialGradient(door.x+35,door.y+60,8,door.x+35,door.y+60,170);
  dg2.addColorStop(0,'rgba(77,189,110,0.4)'); dg2.addColorStop(1,'rgba(77,189,110,0)');
  cx.fillStyle=dg2; cx.beginPath(); cx.arc(door.x+35,door.y+60,170,0,7); cx.fill();
  cx.fillStyle='#12241a'; cx.fillRect(door.x,door.y,door.w,door.h);
  cx.strokeStyle=`rgba(77,189,110,${0.6+Math.sin(time*6)*0.3})`;
  cx.lineWidth=4; cx.strokeRect(door.x,door.y,door.w,door.h);
  cx.fillStyle='#8fd9a8'; cx.font='bold 14px Courier New';
  cx.fillText('ÇIKIŞ', door.x+10, door.y+66);

  /* TAKİPÇİ — koridoru dolduran kütle */
  const Hn=R.hunter;
  if(Hn.alive && Hn.x>cam.x-260){
    cx.save(); cx.translate(Hn.x,Hn.y);
    const pl=0.5+Math.sin(time*9)*0.5;
    // arkasındaki karanlık duvar (koridoru yutan)
    const gg=cx.createLinearGradient(0,0,-420,0);
    gg.addColorStop(0,'rgba(6,4,10,0.94)'); gg.addColorStop(1,'rgba(6,4,10,1)');
    cx.fillStyle=gg; cx.fillRect(-460,-160,460,320);
    // kütle
    cx.fillStyle='rgba(10,7,14,0.95)';
    cx.beginPath(); cx.ellipse(0,0,58+pl*7,88+pl*9,0,0,7); cx.fill();
    // sac büken uzuvlar
    cx.strokeStyle='rgba(16,11,20,0.95)'; cx.lineWidth=11; cx.lineCap='round';
    for(let i=0;i<6;i++){
      const aa=time*3.4+i*1.05;
      cx.beginPath(); cx.moveTo(-10,0);
      cx.lineTo(Math.cos(aa)*(74+Math.sin(time*7+i)*20), Math.sin(aa)*(84+Math.cos(time*6+i)*20));
      cx.stroke();
    }
    // kızıl odak
    cx.fillStyle=`rgba(255,60,70,${0.6+pl*0.4})`;
    cx.beginPath(); cx.arc(14,-12,9+pl*3,0,7); cx.fill();
    cx.restore();
  }

  /* OYUNCU */
  cx.save(); cx.translate(player.x,player.y); cx.rotate(player.dir+Math.PI/2);
  cx.fillStyle='rgba(0,0,0,0.4)'; cx.beginPath(); cx.ellipse(3,4,11,14,0,0,7); cx.fill();
  cx.fillStyle= player.slowT>0 ? '#5a4030' : '#455239';
  cx.beginPath(); cx.ellipse(0,0,10,14,0,0,7); cx.fill();
  cx.fillStyle='#2c2620'; cx.beginPath(); cx.arc(0,-6,6,0,7); cx.fill();
  cx.strokeStyle='#111'; cx.lineWidth=3; cx.beginPath(); cx.arc(0,-6,7,Math.PI*0.8,Math.PI*2.2); cx.stroke();
  cx.restore();

  cx.restore();

  /* hafif karanlık (koridor loş ama görülür — kaçışta görüş şart) */
  dk.clearRect(0,0,W,H);
  dk.fillStyle='rgba(1,2,4,0.72)'; dk.fillRect(0,0,W,H);
  dk.globalCompositeOperation='destination-out';
  const px=player.x-cam.x+sx, py=player.y-cam.y+sy;
  let gr=dk.createRadialGradient(px,py,30,px,py,300);
  gr.addColorStop(0,'rgba(0,0,0,0.95)'); gr.addColorStop(1,'rgba(0,0,0,0)');
  dk.fillStyle=gr; dk.beginPath(); dk.arc(px,py,300,0,7); dk.fill();
  const ex=door.x+35-cam.x, ey=door.y+60-cam.y;
  if(ex>-150&&ex<W+150){
    gr=dk.createRadialGradient(ex,ey,6,ex,ey,140);
    gr.addColorStop(0,'rgba(0,0,0,0.75)'); gr.addColorStop(1,'rgba(0,0,0,0)');
    dk.fillStyle=gr; dk.beginPath(); dk.arc(ex,ey,140,0,7); dk.fill();
  }
  dk.globalCompositeOperation='source-over';
  cx.drawImage(dark,0,0);

  /* takipçi yakınlık: kızıl kenar */
  const dd=Hn.alive?(player.x-Hn.x):9999;
  if(dd<430){
    const p=1-dd/430;
    cx.fillStyle=`rgba(160,15,10,${p*0.18+Math.sin(time*10)*p*0.05})`;
    cx.fillRect(0,0,W,H);
  }
  /* yavaşlama uyarısı */
  if(player.slowT>0){
    cx.fillStyle='rgba(200,120,40,0.10)'; cx.fillRect(0,0,W,H);
  }
  postProcess();
}

function renderVent(){
  const R=ch3;
  cx.fillStyle='#07090c'; cx.fillRect(0,0,W,H);
  /* AI ARKA PLAN: havalandırma odası konsept görseli */
  if(IMG.roomVent && IMG.roomVent.complete && IMG.roomVent.naturalWidth){
    cx.drawImage(IMG.roomVent, 0,0, W,H);
    cx.fillStyle='rgba(3,5,8,0.5)'; cx.fillRect(0,0,W,H);
    cx.fillStyle=`rgba(120,20,15,${0.04+Math.sin(time*2.2)*0.025})`; cx.fillRect(0,0,W,H);
  } else {
    cx.fillStyle='#0e1216'; cx.fillRect(40,80,W-80,H-140);
    cx.strokeStyle='#1c242b'; cx.lineWidth=3; cx.strokeRect(40,80,W-80,H-140);
    cx.strokeStyle='#161d23'; cx.lineWidth=10;
    for(const y of [100, 130]){ cx.beginPath(); cx.moveTo(40,y); cx.lineTo(W-40,y); cx.stroke(); }
  }

  /* kanal ağızları */
  for(const v of R.vents){
    cx.fillStyle='#05070a'; cx.fillRect(v.x-46,v.y-34,92,68);
    cx.strokeStyle='#26313a'; cx.lineWidth=3; cx.strokeRect(v.x-46,v.y-34,92,68);
    for(let i=0;i<5;i++){ cx.strokeStyle='#1a2229'; cx.lineWidth=2;
      cx.beginPath(); cx.moveTo(v.x-40,v.y-26+i*13); cx.lineTo(v.x+40,v.y-26+i*13); cx.stroke(); }
  }

  /* fanlar (görev) */
  for(const f of R.fans){
    const spin = f.done ? time*12 : time*(0.5+f.prog/40);
    cx.save(); cx.translate(f.x,f.y);
    cx.strokeStyle= f.done?'#4dbd6e':'#3a4650'; cx.lineWidth=4;
    cx.beginPath(); cx.arc(0,0,46,0,7); cx.stroke();
    cx.rotate(spin);
    cx.fillStyle= f.done?'rgba(77,189,110,0.7)':'rgba(120,140,155,0.5)';
    for(let i=0;i<4;i++){ cx.rotate(Math.PI/2);
      cx.beginPath(); cx.ellipse(0,-24,10,22,0,0,7); cx.fill(); }
    cx.restore();
    // progress
    if(!f.done){
      cx.fillStyle='rgba(10,16,14,0.85)'; cx.fillRect(f.x-40,f.y+58,80,10);
      cx.fillStyle='#ffb03b'; cx.fillRect(f.x-40,f.y+58,80*f.prog/100,10);
      cx.strokeStyle='#2c3a31'; cx.strokeRect(f.x-40,f.y+58,80,10);
    } else {
      cx.fillStyle='#4dbd6e'; cx.font='bold 12px Courier New'; cx.fillText('✓',f.x-4,f.y+66);
    }
  }

  /* yaratıklar — kanaldan merkeze süzülen karaltılar */
  const tx=W/2, ty=H-220;
  for(const c of R.creeps){
    const cxp=c.x+(tx-c.x)*c.prog, cyp=c.y+(ty-c.y)*c.prog;
    const s=0.5+c.prog*1.3; // yaklaştıkça büyür
    const lit = mouse.down && R.flash>0 && Math.hypot(mouse.x-cxp,mouse.y-cyp)<110;
    cx.save(); cx.translate(cxp,cyp);
    // gövde: buruşuk karaltı
    cx.fillStyle= lit ? '#3a2f3d' : '#15121a';
    cx.beginPath(); cx.ellipse(0,0,22*s,30*s,Math.sin(time*3+c.x)*0.2,0,7); cx.fill();
    // pençeler
    cx.strokeStyle= lit?'#2c2430':'#0e0b12'; cx.lineWidth=4*s; cx.lineCap='round';
    const wig=Math.sin(time*14+c.y)*6*s;
    cx.beginPath(); cx.moveTo(-14*s,0); cx.lineTo(-26*s,14*s+wig); cx.stroke();
    cx.beginPath(); cx.moveTo(14*s,0); cx.lineTo(26*s,14*s-wig); cx.stroke();
    // parlayan çift göz çukuru (ışıkta kısılır)
    const eg = lit ? 0.25 : 0.5+Math.sin(time*8)*0.4;
    cx.fillStyle=`rgba(255,70,90,${eg})`;
    cx.beginPath(); cx.arc(-7*s,-8*s,3.4*s,0,7); cx.arc(7*s,-8*s,3.4*s,0,7); cx.fill();
    // ışık yiyorsa büzülme efekti
    if(lit){ cx.strokeStyle=`rgba(140,220,240,${0.4+Math.sin(time*22)*0.3})`;
      cx.lineWidth=2; cx.beginPath(); cx.arc(0,0,34*s,0,7); cx.stroke(); }
    cx.restore();
  }

  /* karanlık + fener (fare konumunda ışık) */
  dk.clearRect(0,0,W,H);
  dk.fillStyle='rgba(1,2,4,0.93)'; dk.fillRect(0,0,W,H);
  dk.globalCompositeOperation='destination-out';
  // hafif ortam: fan bölgesi
  let gr=dk.createRadialGradient(W/2,H-190,20,W/2,H-190,320);
  gr.addColorStop(0,'rgba(0,0,0,0.45)'); gr.addColorStop(1,'rgba(0,0,0,0)');
  dk.fillStyle=gr; dk.beginPath(); dk.arc(W/2,H-190,320,0,7); dk.fill();
  if(mouse.down && R.flash>0){
    gr=dk.createRadialGradient(mouse.x,mouse.y,20,mouse.x,mouse.y,150);
    gr.addColorStop(0,'rgba(0,0,0,0.98)'); gr.addColorStop(1,'rgba(0,0,0,0)');
    dk.fillStyle=gr; dk.beginPath(); dk.arc(mouse.x,mouse.y,150,0,7); dk.fill();
  }
  dk.globalCompositeOperation='source-over';
  cx.drawImage(dark,0,0);
  if(mouse.down && R.flash>0){
    cx.fillStyle='rgba(140,220,240,0.07)';
    cx.beginPath(); cx.arc(mouse.x,mouse.y,150,0,7); cx.fill();
  }

  /* HUD */
  cx.fillStyle='rgba(4,8,8,0.75)'; cx.fillRect(18,18,330,86);
  cx.fillStyle='#ffb03b'; cx.font='bold 15px Courier New';
  cx.fillText('HAVALANDIRMA — FANLARI TAMİR ET', 30, 42);
  cx.fillStyle='#9fb3a4'; cx.font='11px Courier New';
  cx.fillText('FARE = fener yönü  [SOL TIK basılı] = ışık tut', 30, 62);
  cx.fillText('Yaratıklara ışık tut → geri kaçarlar!', 30, 78);
  const done=R.fans.filter(f=>f.done).length;
  cx.fillStyle='#4dbd6e'; cx.font='bold 13px Courier New';
  cx.fillText(`FAN: ${done}/3`, 30, 96);
  // fener pili
  cx.fillStyle='rgba(4,8,8,0.75)'; cx.fillRect(W-220,18,200,52);
  cx.fillStyle= R.flash<25?'#ff4b3e':'#6fc7d9'; cx.font='bold 13px Courier New';
  cx.fillText(`FENER %${R.flash|0}`, W-208, 40);
  cx.fillStyle='rgba(10,16,14,0.9)'; cx.fillRect(W-208,48,176,10);
  cx.fillStyle= R.flash<25?'#ff4b3e':'#6fc7d9'; cx.fillRect(W-208,48,176*R.flash/100,10);
  if(R.ventDone){
    cx.fillStyle=`rgba(77,189,110,${0.5+Math.sin(time*6)*0.3})`;
    cx.font='bold 26px Courier New';
    cx.fillText('HAVALANDIRMA AKTİF — SİS TEMİZLENİYOR...', W/2-320, H/2);
  }
  // hint alanı
  const h=document.getElementById('hint').textContent;
  if(h){ cx.fillStyle='rgba(4,8,8,0.7)'; cx.fillRect(W/2-180,H-60,360,26);
    cx.fillStyle='#e8f0e6'; cx.font='13px Courier New';
    cx.textAlign='center'; cx.fillText(h, W/2, H-42); cx.textAlign='left'; }
}

/* güvenlik odası & kamera render */
function renderCh3Room(){
  const R=ch3;
  cx.fillStyle='#07090c'; cx.fillRect(0,0,W,H);

  /* AI ARKA PLAN: güvenlik odası konsept görseli */
  const bgOk = IMG.roomSecurity && IMG.roomSecurity.complete && IMG.roomSecurity.naturalWidth;
  if(bgOk){
    cx.drawImage(IMG.roomSecurity, 0,0, W,H);
    // karanlık ton + titreşen acil ışığı
    cx.fillStyle='rgba(3,5,8,0.45)'; cx.fillRect(0,0,W,H);
    cx.fillStyle=`rgba(120,20,15,${0.05+Math.sin(time*1.8)*0.03})`; cx.fillRect(0,0,W,H);
  } else {
    cx.fillStyle='#10141a'; cx.fillRect(80,120,W-160,H-200);
    cx.strokeStyle='#1c242b'; cx.lineWidth=3; cx.strokeRect(80,120,W-160,H-200);
  }
  // masa & monitörler (sadece arka plan yoksa kutu çiz; varsa yalnız canlı tarama çizgisi)
  if(!bgOk){
    cx.fillStyle='rgba(16,22,28,0.85)'; cx.fillRect(W/2-160,H-260,320,90);
    for(let i=0;i<3;i++){
      cx.fillStyle = R.cam ? '#1e3a2a' : '#0c1210';
      cx.fillRect(W/2-140+i*100, H-250, 80, 55);
      cx.strokeStyle='#2c3a41'; cx.strokeRect(W/2-140+i*100, H-250, 80, 55);
      if(R.cam){ cx.fillStyle='rgba(120,255,170,0.25)';
        cx.fillRect(W/2-140+i*100+4, H-246+((time*40+i*20)%47), 72, 3); }
    }
    // pencere (üst orta)
    cx.fillStyle='rgba(5,7,10,0.75)'; cx.fillRect(W/2-110,120,220,110);
    cx.strokeStyle='#26313a'; cx.lineWidth=4; cx.strokeRect(W/2-110,120,220,110);
  } else if(R.cam){
    // arka plandaki monitörlerde hafif yeşil parıltı
    cx.fillStyle=`rgba(120,255,170,${0.05+Math.sin(time*6)*0.02})`;
    cx.fillRect(W/2-170,H-300,340,110);
  }
  // Seyirci pencerede mi?
  if(watcher.cam===-1 && R.watcherWinT>5){
    const wr=Math.min(1,(R.watcherWinT-5)/6);
    // yaklaşan siluet: uzun boyunlu, tek büyük göz çukuru
    cx.fillStyle=`rgba(30,26,34,${0.5+wr*0.5})`;
    const wy=230-wr*40;
    cx.beginPath(); cx.ellipse(W/2,wy,34+wr*26,50+wr*36,0,0,7); cx.fill();
    cx.fillStyle=`rgba(200,60,80,${0.3+wr*0.7})`;
    cx.beginPath(); cx.arc(W/2,wy-14,6+wr*7,0,7); cx.fill(); // parlayan tek nokta
    if(Math.sin(time*20)>0.6){ cx.fillStyle=`rgba(255,80,90,${wr*0.25})`; cx.fillRect(0,0,W,H); }
    cx.fillStyle='#ff4b3e'; cx.font='bold 13px Courier New';
    cx.fillText('!! PENCEREDE — KAMERAYA BAK [S] !!', W/2-140, 100);
  }

  /* kapılar (sol & sağ) — YUKARIDAN İNEN ÇELİK PERDE ANİMASYONU */
  for(const S of stalkers){
    const isL=S.side==='L';
    const dx0=isL?80:W-180;
    const pos = isL?R.doorLpos:R.doorRpos;   // 0=açık, 1=kapalı
    const fy=H/2-140, fh=280;                 // çerçeve
    const movingDoor = (isL?R.doorL:R.doorR) ? pos<1 : pos>0;
    // çerçeve + motor kutusu: SADECE arka plan görseli yoksa çiz
    if(!bgOk){
      cx.fillStyle='#0a0d11'; cx.fillRect(dx0,fy,100,fh);
      cx.strokeStyle='#26313a'; cx.lineWidth=4; cx.strokeRect(dx0,fy,100,fh);
      cx.fillStyle='#1b232b'; cx.fillRect(dx0-4,fy-26,108,26);      // motor kutusu
      cx.strokeStyle='#30404c'; cx.strokeRect(dx0-4,fy-26,108,26);
    }
    // motor uyarı lambası: sadece kapı hareket ederken görünür
    if(movingDoor && Math.sin(time*18)>0){
      cx.fillStyle='#ffb03b';
      cx.beginPath(); cx.arc(dx0+50,fy-13,5,0,7); cx.fill();
    }

    /* --- 1) arkadaki koridor (kapının altında kalan açık kısım) --- */
    const openH = fh-12 - (fh-12)*pos; // görünen koridor yüksekliği (alttan)
    if(openH>2){
      const peeking = R.peek===S.side;
      cx.save(); cx.beginPath();
      cx.rect(dx0+6, fy+6+(fh-12)*pos, 88, openH); cx.clip();
      // koridor karanlığı: arka plan varken sadece fenerle bakınca ışık kat
      if(!bgOk || peeking){
        const g=cx.createLinearGradient(dx0,0,dx0+(isL?-160:260),0);
        g.addColorStop(0, peeking?'rgba(140,220,240,0.25)':'rgba(3,4,6,1)');
        g.addColorStop(1,'rgba(0,0,0,1)');
        cx.fillStyle=g; cx.fillRect(dx0+6,fy+6,88,fh-12);
      }
      // GÖLGE kapıdaysa ve bakıyorsan görürsün
      if(S.atDoor){
        if(peeking || S.retreatFlash>0){
          const sx=dx0+50, sy=H/2;
          cx.fillStyle='#1e1a22';
          cx.beginPath(); cx.ellipse(sx,sy,30,95,0,0,7); cx.fill();
          cx.strokeStyle='#16121a'; cx.lineWidth=9; cx.lineCap='round';
          cx.beginPath(); cx.moveTo(sx-8,sy-60); cx.lineTo(dx0+4,H/2-120); cx.stroke();
          cx.beginPath(); cx.moveTo(sx-8,sy+60); cx.lineTo(dx0+4,H/2+120); cx.stroke();
          cx.fillStyle='#2a2430'; cx.beginPath(); cx.arc(sx,sy-78,20,0,7); cx.fill();
          const g2=0.6+Math.sin(time*12)*0.4;
          cx.fillStyle=`rgba(${180+g2*70|0},90,200,0.9)`;
          cx.beginPath(); cx.ellipse(sx+(isL?12:-12),sy-80,10,17,isL?0.4:-0.4,0,7); cx.fill();
        } else if(Math.sin(time*3)>0){
          cx.fillStyle='rgba(255,80,60,0.5)'; cx.font='24px Courier New';
          cx.fillText('◉', dx0+40, H/2);
        }
      }
      cx.restore();
      if(S.atDoor && (R.peek===S.side || S.retreatFlash>0)){
        cx.fillStyle='#ff4b3e'; cx.font='bold 12px Courier New';
        cx.fillText(isL?'!! SOL KAPIDA !!':'!! SAĞ KAPIDA !!', dx0-6, H/2-160);
      }
    }

    /* --- 2) inen çelik perde (üstten pos oranında) --- */
    const dh=(fh-12)*pos; // perdenin görünen yüksekliği
    if(dh>1){
      const dty=fy+6;
      // gövde
      const dg=cx.createLinearGradient(dx0+6,0,dx0+94,0);
      dg.addColorStop(0,'#232c34'); dg.addColorStop(0.5,'#323e48'); dg.addColorStop(1,'#1e262d');
      cx.fillStyle=dg; cx.fillRect(dx0+6,dty,88,dh);
      // yatay lameller (çelik perde şeritleri)
      cx.strokeStyle='#141b21'; cx.lineWidth=2;
      for(let ly=dty+12; ly<dty+dh; ly+=16){
        cx.beginPath(); cx.moveTo(dx0+8,ly); cx.lineTo(dx0+92,ly); cx.stroke();
        cx.strokeStyle='rgba(90,110,125,0.25)';
        cx.beginPath(); cx.moveTo(dx0+8,ly+2); cx.lineTo(dx0+92,ly+2); cx.stroke();
        cx.strokeStyle='#141b21';
      }
      // çizik/aşınma detayı
      cx.strokeStyle='rgba(140,150,160,0.10)'; cx.lineWidth=1;
      cx.beginPath(); cx.moveTo(dx0+22,dty+4); cx.lineTo(dx0+30,dty+dh-6); cx.stroke();
      cx.beginPath(); cx.moveTo(dx0+66,dty+2); cx.lineTo(dx0+58,dty+dh-4); cx.stroke();
      // alt kenar: kalın taban çubuğu + tehlike şeritleri
      cx.fillStyle='#0f1419'; cx.fillRect(dx0+4,dty+dh-8,92,8);
      cx.save(); cx.beginPath(); cx.rect(dx0+4,dty+dh-8,92,8); cx.clip();
      for(let sx2=dx0-8; sx2<dx0+100; sx2+=16){
        cx.fillStyle='#8f7a1e';
        cx.beginPath(); cx.moveTo(sx2,dty+dh); cx.lineTo(sx2+8,dty+dh-8);
        cx.lineTo(sx2+16,dty+dh-8); cx.lineTo(sx2+8,dty+dh); cx.fill();
      }
      cx.restore();
      // iniş anında hafif titreşim + toz
      if(movingDoor && (isL?R.doorL:R.doorR)){
        cx.fillStyle='rgba(160,170,175,0.12)';
        for(let i=0;i<3;i++)
          cx.fillRect(dx0+10+rand(0,75), dty+dh+rand(0,6), rand(2,5), rand(1,3));
      }
      // tam kapandı: kilit parlar
      if(pos>=1){
        cx.fillStyle=`rgba(255,75,62,${0.5+Math.sin(time*5)*0.3})`;
        cx.beginPath(); cx.arc(dx0+50,dty+dh-16,4,0,7); cx.fill();
      }
    }
    // kapı etiketi + durum (animasyon aşamasına göre)
    cx.fillStyle='#7d8f82'; cx.font='11px Courier New';
    cx.fillText(isL?'[A] SOL KAPI':'[D] SAĞ KAPI', dx0+4, H/2+165);
    const stTxt = pos>=1 ? 'KAPALI' : pos<=0 ? 'AÇIK'
                : (isL?R.doorL:R.doorR) ? 'İNİYOR...' : 'AÇILIYOR...';
    cx.fillStyle = pos>=1 ? '#ff4b3e' : pos<=0 ? '#4dbd6e' : '#ffb03b';
    cx.fillText(stTxt, dx0+4, H/2+180);
    cx.fillStyle='#5c6a60';
    cx.fillText(isL?'[Q] fenerle bak':'[E] fenerle bak', dx0+4, H/2+195);
  }

  /* Deniz masada (sırttan) */
  cx.fillStyle='#2c2620'; cx.beginPath(); cx.arc(W/2,H-190,16,0,7); cx.fill();
  cx.strokeStyle='#111'; cx.lineWidth=4;
  cx.beginPath(); cx.arc(W/2,H-190,18,Math.PI*1.15,Math.PI*1.85); cx.stroke();
  cx.fillStyle='#455239'; cx.fillRect(W/2-24,H-176,48,50);

  /* KAMERA GÖRÜNÜMÜ */
  if(R.cam) renderCamView();

  /* HUD */
  const hb=R.power<=25;
  cx.fillStyle='rgba(4,8,8,0.7)'; cx.fillRect(18,H-72,240,56);
  cx.fillStyle= hb?'#ff4b3e':'#4dbd6e'; cx.font='bold 22px Courier New';
  cx.fillText(`GÜÇ %${R.power|0}`, 30, H-45);
  cx.fillStyle='#7d8f82'; cx.font='11px Courier New';
  let drains='tüketim:'; if(R.doorL)drains+=' +kapıL'; if(R.doorR)drains+=' +kapıR';
  if(R.peek)drains+=' +fener'; if(R.cam)drains+=' +kamera';
  cx.fillText(drains, 30, H-26);
  // saat
  cx.fillStyle='#ffb03b'; cx.font='bold 26px Courier New';
  cx.fillText(`0${R.hour}:00`, W-130, 50);
  cx.fillStyle='#7d8f82'; cx.font='11px Courier New';
  cx.fillText('03:00\'TE BÖLÜM 4 BAŞLAR', W-210, 70);
  cx.fillText('[S] kamera  [W] kamera değiştir', W/2-110, H-16);
  if(R.power<=0){
    cx.fillStyle=`rgba(0,0,0,${0.5+Math.sin(time*2)*0.2})`; cx.fillRect(0,0,W,H);
    cx.fillStyle='#ff4b3e'; cx.font='bold 30px Courier New';
    cx.fillText('GÜÇ BİTTİ', W/2-80, H/2);
  }
}

function renderCamView(){
  const R=ch3;
  const camNames=['KAM-01 KORİDOR', 'KAM-02 JENERATÖR', 'KAM-03 ÇATI', 'KAM-04 ALT KAT'];
  // ekran çerçevesi
  cx.fillStyle='rgba(2,6,4,0.92)'; cx.fillRect(60,60,W-120,H-160);
  cx.strokeStyle='#2c4a38'; cx.lineWidth=3; cx.strokeRect(60,60,W-120,H-160);
  // görüntü: her kamera farklı sahne çizimi
  cx.save(); cx.beginPath(); cx.rect(64,64,W-128,H-168); cx.clip();
  cx.fillStyle='#0a120c'; cx.fillRect(64,64,W-128,H-168);
  const cxm=W/2, cym=H/2-40;
  cx.strokeStyle='rgba(120,200,150,0.25)'; cx.lineWidth=2;
  if(R.camIdx===0){ // koridor
    cx.strokeRect(cxm-260,cym-120,520,240);
    cx.beginPath(); cx.moveTo(cxm-260,cym+120); cx.lineTo(cxm-80,cym-20); cx.lineTo(cxm+80,cym-20); cx.lineTo(cxm+260,cym+120); cx.stroke();
  } else if(R.camIdx===1){ // jeneratör
    for(let i=0;i<3;i++) cx.strokeRect(cxm-200+i*150,cym-60,100,140);
  } else if(R.camIdx===2){ // çatı
    cx.beginPath(); cx.moveTo(cxm-280,cym+90); cx.lineTo(cxm,cym-130); cx.lineTo(cxm+280,cym+90); cx.stroke();
    cx.strokeRect(cxm-30,cym-130,60,220);
  } else { // alt kat
    cx.strokeRect(cxm-240,cym-100,480,200);
    for(let i=0;i<5;i++){ cx.beginPath(); cx.moveTo(cxm-240+i*120,cym-100); cx.lineTo(cxm-240+i*120,cym+100); cx.stroke(); }
  }
  // SEYİRCİ bu kamerada mı?
  if(watcher.cam===R.camIdx){
    const g2=0.5+Math.sin(time*8)*0.5;
    cx.fillStyle='#1e1a24';
    cx.beginPath(); cx.ellipse(cxm+Math.sin(time*0.7)*60,cym+20,36,85,0,0,7); cx.fill();
    cx.fillStyle=`rgba(220,70,90,${0.5+g2*0.5})`;
    cx.beginPath(); cx.arc(cxm+Math.sin(time*0.7)*60,cym-40,8,0,7); cx.fill();
    cx.fillStyle='rgba(255,80,90,0.12)'; cx.fillRect(64,64,W-128,H-168);
    cx.fillStyle='#ff8f8f'; cx.font='13px Courier New';
    cx.fillText('bir şey seni izliyor...', cxm-90, cym+140);
  }
  // statik
  const st=Math.max(0.06, R.camStatic);
  for(let i=0;i<120;i++){
    cx.fillStyle=`rgba(180,255,200,${rand(0,st)})`;
    cx.fillRect(rand(64,W-70),rand(64,H-110),2,2);
  }
  cx.fillStyle=`rgba(120,255,170,0.07)`;
  cx.fillRect(64, 64+((time*160)%(H-172)), W-128, 4);
  cx.restore();
  // etiketler
  cx.fillStyle='#8fd9a8'; cx.font='bold 15px Courier New';
  cx.fillText(camNames[R.camIdx], 82, 92);
  cx.fillStyle='#ff3323'; cx.beginPath(); cx.arc(W-110,86,7,0,7); 
  if(Math.sin(time*4)>0) cx.fill();
  cx.fillStyle='#5c8a6a'; cx.font='11px Courier New';
  cx.fillText('[W] SONRAKİ KAMERA   [S] KAPAT', 82, H-114);
  // seyirci hangi kamerada göstergesi
  for(let i=0;i<4;i++){
    cx.strokeStyle= i===R.camIdx?'#8fd9a8':'#2c4a38';
    cx.strokeRect(W-330+i*56, H-136, 44, 26);
    cx.fillStyle='#5c8a6a'; cx.font='10px Courier New';
    cx.fillText('C'+(i+1), W-318+i*56, H-119);
  }
}

/* ---------------- NOTE UI ---------------- */
function openNote(txt){
  state='note';
  document.getElementById('noteText').innerHTML=txt;
  document.getElementById('noteui').classList.remove('hidden');
  AU.blip(600,0.15,0.08,'triangle');
}
document.getElementById('btnNoteClose').onclick=closeNote;
function closeNote(){
  document.getElementById('noteui').classList.add('hidden');
  state='play';
}
addEventListener('keydown',e=>{ if(state==='note'&&e.code==='KeyE'&&!keys._noteE){ closeNote(); } keys._noteE=state==='note'; });

/* ============================================================
   RENDER
   ============================================================ */
const dark = document.createElement('canvas');
dark.width=W; dark.height=H;
const dk = dark.getContext('2d');

function drawListener(L){
  if(!L.alive){
    cx.fillStyle='#141a17'; cx.beginPath(); cx.ellipse(L.x,L.y,20,10,L.dir,0,7); cx.fill();
    cx.fillStyle='rgba(120,40,80,0.35)'; cx.beginPath(); cx.ellipse(L.x+4,L.y+4,14,7,L.dir,0,7); cx.fill();
    return;
  }
  const tw = L.twitch>0 ? Math.sin(time*60)*0.22 : 0;
  cx.save(); cx.translate(L.x,L.y); cx.rotate(L.dir+Math.PI/2+tw);
  // shadow
  cx.fillStyle='rgba(0,0,0,0.45)'; cx.beginPath(); cx.ellipse(4,5,15,20,0,0,7); cx.fill();
  // hunched body w/ spine ridges
  cx.fillStyle = L.stun>0?'#232833':'#352c33';
  cx.beginPath(); cx.ellipse(0,0,13,18,0,0,7); cx.fill();
  cx.strokeStyle='#4d3f47'; cx.lineWidth=2;
  for(let i=-1;i<=2;i++){ cx.beginPath(); cx.arc(0,i*6-2,7,Math.PI*1.15,Math.PI*1.85); cx.stroke(); }
  // long clawed arms
  cx.strokeStyle='#2b2229'; cx.lineWidth=4; cx.lineCap='round';
  const armSw = Math.sin(time*5+L.drool)*3;
  cx.beginPath(); cx.moveTo(-11,-2); cx.lineTo(-19,10+armSw); cx.stroke();
  cx.beginPath(); cx.moveTo(11,-2); cx.lineTo(19,10-armSw); cx.stroke();
  cx.strokeStyle='#1c1519'; cx.lineWidth=1.6;
  for(const s of [-1,1]){
    for(let f=0;f<3;f++){ cx.beginPath(); cx.moveTo(s*19,10+(s<0?armSw:-armSw)); cx.lineTo(s*19+s*(3+f*2),16+(s<0?armSw:-armSw)+f*2); cx.stroke(); }
  }
  // giant veiny ear-dishes (pulse with hearGlow)
  const g = L.hearGlow, pulse=0.5+Math.sin(time*10)*0.5;
  const er=12+g*4*pulse;
  for(const s of [-1,1]){
    cx.fillStyle = `rgb(${115+g*140|0},${60+g*45|0},${135+g*120|0})`;
    cx.beginPath(); cx.ellipse(s*14,-4,8+g*2,er,s*0.4,0,7); cx.fill();
    // inner folds
    cx.strokeStyle=`rgba(${200+g*55|0},120,${210},0.55)`; cx.lineWidth=1.4;
    cx.beginPath(); cx.ellipse(s*14,-4,5,er*0.65,s*0.4,0,7); cx.stroke();
    cx.beginPath(); cx.ellipse(s*14,-4,2.6,er*0.35,s*0.4,0,7); cx.stroke();
    // veins
    cx.strokeStyle=`rgba(255,${100+g*80|0},220,${0.25+g*0.5})`;
    cx.beginPath(); cx.moveTo(s*8,-4); cx.lineTo(s*18,-4-er*0.6); cx.stroke();
    cx.beginPath(); cx.moveTo(s*9,-1); cx.lineTo(s*19,4+er*0.4); cx.stroke();
  }
  // eyeless head, skin stretched over sockets
  cx.fillStyle='#4a4148'; cx.beginPath(); cx.arc(0,-9,8,0,7); cx.fill();
  cx.fillStyle='#3a3238';
  cx.beginPath(); cx.ellipse(-3,-11,2.6,1.6,0.3,0,7); cx.fill();
  cx.beginPath(); cx.ellipse(3,-11,2.6,1.6,-0.3,0,7); cx.fill();
  // gaping mouth when chasing
  if(L.state==='chase'){
    const mo = 3+Math.sin(time*20)*2;
    cx.fillStyle='#12060a'; cx.beginPath(); cx.ellipse(0,-5,3.4,mo,0,0,7); cx.fill();
    cx.strokeStyle='#7c2b3a'; cx.lineWidth=1; cx.stroke();
  } else {
    // stitched-looking mouth
    cx.strokeStyle='#241c22'; cx.lineWidth=1.4;
    cx.beginPath(); cx.moveTo(-3,-4.5); cx.lineTo(3,-4.5); cx.stroke();
    for(let i=-2;i<=2;i++){ cx.beginPath(); cx.moveTo(i*1.5,-6); cx.lineTo(i*1.5,-3); cx.stroke(); }
  }
  // drool
  const dr=(L.drool%3)/3;
  if(L.state!=='patrol'||dr>0.5){
    cx.strokeStyle=`rgba(190,220,200,${0.5-dr*0.4})`; cx.lineWidth=1.2;
    cx.beginPath(); cx.moveTo(1,-3); cx.lineTo(1,-3+dr*14); cx.stroke();
  }
  cx.restore();
  // halo + state icons
  if(L.hearGlow>0.05){ cx.fillStyle=`rgba(210,120,255,${L.hearGlow*0.2})`;
    cx.beginPath(); cx.arc(L.x,L.y,34,0,7); cx.fill(); }
  if(L.scream>0){ // scream rings
    cx.strokeStyle=`rgba(255,60,80,${L.scream})`; cx.lineWidth=2;
    cx.beginPath(); cx.arc(L.x,L.y,(0.6-L.scream)*90+20,0,7); cx.stroke();
  }
  if(L.stun>0){ cx.fillStyle='#6fc7d9'; cx.font='14px Courier New'; cx.fillText('✶ ✶',L.x-12,L.y-30); }
  if(L.state==='chase'){ cx.fillStyle='#ff4b3e'; cx.font='bold 20px Courier New'; cx.fillText('!',L.x-4,L.y-30); }
  else if(L.state==='investigate'){ cx.fillStyle='#ffb03b'; cx.font='bold 16px Courier New'; cx.fillText('?',L.x-4,L.y-30); }
}

function drawMaw(M){
  if(!M.alive){
    cx.fillStyle='#141a17'; cx.beginPath(); cx.ellipse(M.x,M.y,28,14,0,0,7); cx.fill();
    cx.fillStyle='rgba(150,50,90,0.4)'; cx.beginPath(); cx.ellipse(M.x,M.y,18,9,0,0,7); cx.fill();
    return;
  }
  const tw = M.twitch>0 ? Math.sin(time*50)*0.15 : 0;
  cx.save(); cx.translate(M.x,M.y); cx.rotate(M.dir+Math.PI/2+tw);
  cx.fillStyle='rgba(0,0,0,0.5)'; cx.beginPath(); cx.ellipse(5,6,24,30,0,0,7); cx.fill();
  cx.fillStyle = M.stun>0?'#232833':'#3d2b34';
  cx.beginPath(); cx.ellipse(0,0,22,28,0,0,7); cx.fill();
  // exposed rib flare
  cx.strokeStyle='#1e161c'; cx.lineWidth=3;
  for(let i=-2;i<=2;i++){
    cx.beginPath(); cx.moveTo(-16,i*7); cx.quadraticCurveTo(0,i*7+3,16,i*7); cx.stroke();
  }
  // chest membrane — pulses, glows violently on charge
  const p = M.charge>0 ? 0.5+Math.sin(time*30)*0.5 : 0.25+Math.sin(M.hum*4)*0.15;
  const memG = M.charge>0 ? 1 : 0.4;
  cx.fillStyle=`rgba(255,${90+p*40|0},170,${0.35+p*0.55*memG})`;
  cx.beginPath(); cx.ellipse(0,2,12+p*6,16+p*7,0,0,7); cx.fill();
  // membrane veins
  cx.strokeStyle=`rgba(255,200,230,${0.3+p*0.4})`; cx.lineWidth=1.2;
  cx.beginPath(); cx.moveTo(0,-12); cx.lineTo(0,16); cx.stroke();
  cx.beginPath(); cx.moveTo(-8,-6); cx.lineTo(8,10); cx.stroke();
  cx.beginPath(); cx.moveTo(8,-6); cx.lineTo(-8,10); cx.stroke();
  // three throat lumps
  cx.fillStyle='#4d3540';
  for(const s of [-6,0,6]){ cx.beginPath(); cx.arc(s,-16,4+Math.sin(M.hum*6+s)*1.2,0,7); cx.fill(); }
  // small collapsed head, ears sunken
  cx.fillStyle='#2e2229'; cx.beginPath(); cx.arc(0,-22,8,0,7); cx.fill();
  cx.fillStyle='#1a1216';
  cx.beginPath(); cx.ellipse(-5,-22,2,3.4,0,0,7); cx.fill();
  cx.beginPath(); cx.ellipse(5,-22,2,3.4,0,0,7); cx.fill();
  cx.restore();
  // hum ring
  cx.strokeStyle=`rgba(255,120,180,${0.12+Math.sin(M.hum*4)*0.08})`;
  cx.lineWidth=1.5; cx.beginPath(); cx.arc(M.x,M.y,40+Math.sin(M.hum*4)*8,0,7); cx.stroke();
  if(M.charge>0){ cx.fillStyle='#ff4b3e'; cx.font='bold 13px Courier New';
    cx.fillText('▶ GÖĞÜS ZARI AÇIK — VUR! ◀',M.x-88,M.y-48); }
  if(M.stun>0){ cx.fillStyle='#6fc7d9'; cx.font='14px Courier New'; cx.fillText('✶ ✶ ✶',M.x-18,M.y-44); }
}

function drawCrawler(Cw){
  if(!Cw.alive){
    cx.fillStyle='#141a17'; cx.beginPath(); cx.ellipse(Cw.x,Cw.y,15,8,Cw.dir,0,7); cx.fill();
    return;
  }
  cx.save(); cx.translate(Cw.x,Cw.y); cx.rotate(Cw.dir+Math.PI/2);
  cx.fillStyle='rgba(0,0,0,0.45)'; cx.beginPath(); cx.ellipse(3,3,13,16,0,0,7); cx.fill();
  // low, spider-like crawling body
  const br = Cw.state==='sleep' ? Math.sin(Cw.breathT*2)*1.5 : 0;
  cx.fillStyle = Cw.stun>0?'#232833': Cw.state==='sleep'?'#2c2830':'#3a2f36';
  cx.beginPath(); cx.ellipse(0,0,10+br*0.5,14+br,0,0,7); cx.fill();
  // 6 splayed limbs
  cx.strokeStyle='#241c22'; cx.lineWidth=3; cx.lineCap='round';
  const crawl = Cw.state==='lunge'||Cw.state==='hunt' ? Math.sin(time*22)*4 : 0;
  for(const [sx,sy,ex,ey] of [[-8,-8,-17,-13],[8,-8,17,-13],[-9,0,-19,2],[9,0,19,2],[-7,8,-15,14],[7,8,15,14]]){
    cx.beginPath(); cx.moveTo(sx,sy); cx.lineTo(ex+(ex>0?crawl:-crawl)*0.4,ey+crawl*0.3); cx.stroke();
  }
  // head is mostly a MOUTH — jaw splits open when hunting
  cx.fillStyle='#463840'; cx.beginPath(); cx.arc(0,-10,7,0,7); cx.fill();
  if(Cw.state==='lunge'||Cw.state==='hunt'||Cw.state==='wake'){
    const jaw=4+Math.sin(time*26)*2.5;
    cx.fillStyle='#0e0508';
    cx.beginPath(); cx.ellipse(0,-9,4.5,jaw,0,0,7); cx.fill();
    cx.strokeStyle='#87313f'; cx.lineWidth=1; cx.stroke();
    // needle teeth
    cx.strokeStyle='#cfc7bb'; cx.lineWidth=0.8;
    for(let i=-2;i<=2;i++){
      cx.beginPath(); cx.moveTo(i*1.6,-9-jaw*0.8); cx.lineTo(i*1.6,-9-jaw*0.8+2.4); cx.stroke();
      cx.beginPath(); cx.moveTo(i*1.6,-9+jaw*0.8); cx.lineTo(i*1.6,-9+jaw*0.8-2.4); cx.stroke();
    }
  } else {
    cx.strokeStyle='#241c22'; cx.lineWidth=1.2;
    cx.beginPath(); cx.moveTo(-3,-9); cx.lineTo(3,-9); cx.stroke();
  }
  cx.restore();
  if(Cw.hearGlow>0.05){ cx.fillStyle=`rgba(255,120,140,${Cw.hearGlow*0.2})`;
    cx.beginPath(); cx.arc(Cw.x,Cw.y,26,0,7); cx.fill(); }
  if(Cw.state==='sleep' && dist(Cw,player)<220){
    cx.fillStyle=`rgba(160,180,170,${0.3+Math.sin(Cw.breathT*2)*0.2})`;
    cx.font='11px Courier New'; cx.fillText('z',Cw.x+10,Cw.y-14);
  }
  if(Cw.state==='wake'){ cx.fillStyle='#ff4b3e'; cx.font='bold 18px Courier New'; cx.fillText('▲',Cw.x-6,Cw.y-22); }
  if(Cw.stun>0){ cx.fillStyle='#6fc7d9'; cx.font='12px Courier New'; cx.fillText('✶',Cw.x-4,Cw.y-22); }
}

function render(){
  if(chapter>=3 && ch3 && ch3.phase==='room'){ renderCh3Room(); return; }
  if(chapter>=3 && ch3 && ch3.phase==='vent'){ renderVent(); return; }
  if(chapter>=3 && ch3 && ch3.phase==='maze'){ renderMaze(); return; }
  const shakeMul = settings.shake/100;
  const sx = shake>0 ? rand(-shake,shake)*8*shakeMul : 0;
  const sy = shake>0 ? rand(-shake,shake)*8*shakeMul : 0;

  if(chapter>=3){ // kaçış kamerası: oyuncuyu solda tut
    cam.x = clamp(player.x-W*0.35, 0, WORLD.w-W);
    cam.y = clamp(player.y-H/2, 0, Math.max(0,WORLD.h-H));
  }
  cx.save(); cx.translate(-cam.x+sx, -cam.y+sy);

  if(groundReady) cx.drawImage(ground,0,0);

  if(chapter>=3){
    // koridor duvarları
    for(const w of walls){
      cx.fillStyle='#151b21'; cx.fillRect(w.x,w.y,w.w,w.h);
      cx.strokeStyle='#0c1114'; cx.strokeRect(w.x,w.y,w.w,w.h);
    }
    // patlayan tavan lambaları
    for(let x=200;x<WORLD.w;x+=300){
      const on = Math.sin(time*7+x)>((x/WORLD.w)*1.6-0.3);
      cx.fillStyle= on?'rgba(255,200,120,0.7)':'#1a1512';
      cx.fillRect(x-14,318,28,8);
      if(on){ cx.fillStyle='rgba(255,200,120,0.06)';
        cx.beginPath(); cx.moveTo(x-14,326); cx.lineTo(x-50,566); cx.lineTo(x+50,566); cx.lineTo(x+14,326); cx.fill(); }
    }
    // güvenlik odası kapısı (hedef)
    cx.fillStyle='#22303a'; cx.fillRect(door.x-10,door.y-20,60,140);
    cx.fillStyle=`rgba(77,189,110,${0.5+Math.sin(time*6)*0.4})`;
    cx.font='bold 14px Courier New';
    cx.fillText('GÜVENLİK', door.x-16, door.y-34);
    cx.fillStyle='#4dbd6e'; cx.beginPath(); cx.arc(door.x+20,door.y-52,6,0,7); cx.fill();
  }
  else if(chapter===1){
    /* station exterior */
    cx.fillStyle='#131a1e'; cx.fillRect(1050,60,500,180);
    cx.fillStyle='#0d1316'; cx.fillRect(1050,220,500,22);
    cx.strokeStyle='#232f35'; cx.lineWidth=3; cx.strokeRect(1050,60,500,180);
    cx.fillStyle = fuseCount>=3 ? '#3d4f37' : '#22292c';
    cx.fillRect(door.x-door.w/2, door.y, door.w, door.h+18);
    if(Math.sin(time*3)>0){ cx.fillStyle='#ff4b3e'; cx.beginPath(); cx.arc(1300,80,6,0,7); cx.fill();
      cx.fillStyle='rgba(255,60,40,0.15)'; cx.beginPath(); cx.arc(1300,80,26,0,7); cx.fill(); }
    cx.strokeStyle='#1d272c'; cx.lineWidth=6;
    cx.beginPath(); cx.moveTo(1300,220); cx.lineTo(1260,-140); cx.moveTo(1300,220); cx.lineTo(1340,-140);
    cx.moveTo(1268,80); cx.lineTo(1332,80); cx.moveTo(1276,0); cx.lineTo(1324,0); cx.stroke();
    cx.fillStyle='#9aa8ad'; cx.font='11px Courier New';
    cx.fillText('KANAL-9 RADYOLİNK İSTASYONU', 1170, 155);
    cx.fillText('SESSİZLİK = GÜVENLİK', 1205, 175);
  } else {
    /* interior walls */
    for(const w of walls){
      if(w.x+w.w<cam.x-50||w.x>cam.x+W+50||w.y+w.h<cam.y-50||w.y>cam.y+H+50) continue;
      cx.fillStyle='#1a2126'; cx.fillRect(w.x,w.y,w.w,w.h);
      cx.fillStyle='#232d33'; cx.fillRect(w.x,w.y,w.w,Math.min(6,w.h));
      cx.strokeStyle='#0c1114'; cx.lineWidth=2; cx.strokeRect(w.x,w.y,w.w,w.h);
    }
    /* glass piles */
    for(const G of glassPiles){
      if(!vis(G.x,G.y,G.r+20)) continue;
      for(let i=0;i<10;i++){
        const a=(i/10)*6.28+G.x;
        cx.fillStyle=`rgba(${170+((i*37)%60)|0},200,210,0.28)`;
        cx.save(); cx.translate(G.x+Math.cos(a)*G.r*0.6*((i%3)/3+0.3), G.y+Math.sin(a)*G.r*0.6*((i%4)/4+0.3));
        cx.rotate(a); cx.fillRect(-3,-1.5,6,3); cx.restore();
      }
      cx.strokeStyle='rgba(150,190,200,0.12)'; cx.beginPath(); cx.arc(G.x,G.y,G.r,0,7); cx.stroke();
    }
    /* transmitter console */
    cx.fillStyle='#151d22'; cx.fillRect(1050,180,270,90);
    cx.strokeStyle='#2c3a41'; cx.strokeRect(1050,180,270,90);
    for(let i=0;i<8;i++){
      cx.fillStyle = finalSeq ? (Math.sin(time*10+i)>0?'#ff4b3e':'#3a1512') : (Math.sin(time*2+i*1.3)>0?'#4dbd6e':'#1c3a26');
      cx.fillRect(1065+i*32,195,18,10);
    }
    cx.fillStyle='#8fd9a8'; cx.font='12px Courier New';
    cx.fillText('ANA VERİCİ — 87.9 MHz', 1095, 235);
    if(finalSeq){
      cx.fillStyle=`rgba(255,80,60,${0.4+Math.sin(time*12)*0.3})`;
      cx.font='bold 14px Courier New'; cx.fillText('!! KAPANIYOR !!', 1120, 255);
    }
    /* red emergency lights along corridors */
    for(const [lx2,ly2] of [[1180,1780],[860,1300],[1540,1300],[1180,900],[420,740],[1980,740]]){
      cx.fillStyle=`rgba(255,50,40,${0.25+Math.sin(time*2+lx2)*0.15})`;
      cx.beginPath(); cx.arc(lx2,ly2,7,0,7); cx.fill();
    }
  }

  /* fuses / tapes */
  for(const F of fuses){ if(F.got||!vis(F.x,F.y)) continue;
    cx.fillStyle='rgba(255,200,80,0.12)'; cx.beginPath(); cx.arc(F.x,F.y,20+Math.sin(time*4)*4,0,7); cx.fill();
    if(chapter===1){ cx.fillStyle='#ffb03b'; cx.fillRect(F.x-5,F.y-9,10,18);
      cx.fillStyle='#7a5a20'; cx.fillRect(F.x-5,F.y-3,10,6); }
    else { cx.fillStyle='#caa84e'; cx.fillRect(F.x-10,F.y-7,20,14);
      cx.fillStyle='#211a10'; cx.beginPath(); cx.arc(F.x-4,F.y,3,0,7); cx.arc(F.x+4,F.y,3,0,7); cx.fill(); }
  }
  /* pickups */
  for(const P of pickups){ if(P.got||!vis(P.x,P.y)) continue;
    if(P.type==='bat'){ cx.fillStyle='#6fc7d9'; cx.fillRect(P.x-6,P.y-8,12,16); cx.fillRect(P.x-3,P.y-11,6,4); }
    else { cx.fillStyle='#c98fd9'; cx.beginPath(); cx.arc(P.x,P.y,8,0,7); cx.fill(); }
  }
  /* notes */
  for(const N of notes){ if(N.got||!vis(N.x,N.y)) continue;
    cx.save(); cx.translate(N.x,N.y); cx.rotate(0.15);
    cx.fillStyle='#d8cba8'; cx.fillRect(-8,-10,16,20);
    cx.strokeStyle='#8a7f60'; cx.lineWidth=1;
    for(let i=-6;i<=6;i+=3){ cx.beginPath(); cx.moveTo(-5,i); cx.lineTo(5,i); cx.stroke(); }
    cx.restore();
    cx.fillStyle=`rgba(255,230,160,${0.1+Math.sin(time*3)*0.05})`;
    cx.beginPath(); cx.arc(N.x,N.y,18,0,7); cx.fill();
  }
  /* radios */
  for(const R of radios){
    if(!vis(R.x,R.y)) continue;
    cx.fillStyle='#20282c'; cx.fillRect(R.x-14,R.y-10,28,20);
    cx.fillStyle=R.on?'#ffb03b':'#3a4a44'; cx.fillRect(R.x-10,R.y-6,12,8);
    cx.strokeStyle='#39454a'; cx.beginPath(); cx.moveTo(R.x+8,R.y-10); cx.lineTo(R.x+16,R.y-26); cx.stroke();
    if(R.on){ cx.strokeStyle=`rgba(255,176,59,${0.4+Math.sin(time*8)*0.3})`;
      cx.beginPath(); cx.arc(R.x,R.y,18+Math.sin(time*8)*4,0,7); cx.stroke(); }
  }
  /* orbs */
  for(const O of orbs){
    cx.fillStyle = O.playT>0?'#ff8fd9':'#c98fd9';
    cx.beginPath(); cx.arc(O.x,O.y,9,0,7); cx.fill();
    if(O.playT>0){ cx.strokeStyle='rgba(255,140,220,0.5)';
      cx.beginPath(); cx.arc(O.x,O.y,16+Math.sin(time*12)*5,0,7); cx.stroke(); }
  }
  /* noise rings */
  for(const n of noises){
    cx.strokeStyle = n.src==='player'? `rgba(255,255,255,${n.life*0.35})`
                   : n.src==='maw'||n.src==='siren' ? `rgba(255,80,60,${n.life*0.5})`
                   : `rgba(255,176,59,${n.life*0.4})`;
    cx.lineWidth=2; cx.beginPath(); cx.arc(n.x,n.y,n.r,0,7); cx.stroke();
  }
  /* trees — SADECE EKRANDAKİLER çizilir (culling) */
  for(const t of trees){
    if(!vis(t.x,t.y,t.r+40)) continue;
    const sway = Math.sin(time*0.7 + t.x*0.01)*t.r*0.06;
    cx.fillStyle='rgba(0,0,0,0.45)';
    cx.beginPath(); cx.ellipse(t.x+t.r*0.35, t.y+t.r*0.45, t.r*1.05, t.r*0.8, 0.3, 0, 7); cx.fill();
    cx.fillStyle='#0a140e';
    cx.beginPath(); cx.arc(t.x+sway, t.y, t.r, 0, 7); cx.fill();
    cx.fillStyle='#101f15';
    for(let k=0;k<3;k++){
      const a=k*2.09 + t.x;
      cx.beginPath();
      cx.arc(t.x+sway+Math.cos(a)*t.r*0.3, t.y+Math.sin(a)*t.r*0.3, t.r*0.55, 0, 7);
      cx.fill();
    }
    cx.fillStyle='#1a2c1f';
    cx.beginPath(); cx.arc(t.x+sway-t.r*0.28, t.y-t.r*0.28, t.r*0.45, 0, 7); cx.fill();
    cx.strokeStyle='rgba(140,170,160,0.10)'; cx.lineWidth=2;
    cx.beginPath(); cx.arc(t.x+sway, t.y, t.r-1, Math.PI*1.05, Math.PI*1.75); cx.stroke();
  }

  for(const Cw of crawlers) if(vis(Cw.x,Cw.y,60)) drawCrawler(Cw);
  for(const L of listeners) if(vis(L.x,L.y,60)) drawListener(L);
  for(const M of maws) if(vis(M.x,M.y,80)) drawMaw(M);

  /* PLAYER */
  cx.save(); cx.translate(player.x,player.y); cx.rotate(player.dir+Math.PI/2);
  cx.fillStyle='rgba(0,0,0,0.4)'; cx.beginPath(); cx.ellipse(3,4,12,15,0,0,7); cx.fill();
  cx.fillStyle=sneak?'#33402e':'#455239'; cx.beginPath(); cx.ellipse(0,0,11,15,0,0,7); cx.fill();
  cx.fillStyle='#2c2620'; cx.beginPath(); cx.arc(0,-6,7,0,7); cx.fill();
  cx.strokeStyle='#111'; cx.lineWidth=3; cx.beginPath(); cx.arc(0,-6,8,Math.PI*0.8,Math.PI*2.2); cx.stroke();
  cx.strokeStyle='#8a8f93'; cx.lineWidth=3;
  cx.beginPath(); cx.moveTo(8,2); cx.lineTo(8,-26); cx.stroke();
  cx.fillStyle='#6fc7d9'; cx.beginPath(); cx.arc(8,-27,3,0,7); cx.fill();
  cx.restore();

  cx.restore();

  /* darkness + lights */
  dk.clearRect(0,0,W,H);
  dk.fillStyle= cheats.bright ? 'rgba(2,5,7,0.25)'
              : chapter===2 ? 'rgba(1,2,4,0.965)' : 'rgba(2,5,7,0.94)';
  dk.fillRect(0,0,W,H);
  dk.globalCompositeOperation='destination-out';
  const px=player.x-cam.x+sx, py=player.y-cam.y+sy;
  let gr=dk.createRadialGradient(px,py,10,px,py,chapter===2?110:130);
  gr.addColorStop(0,'rgba(0,0,0,0.85)'); gr.addColorStop(1,'rgba(0,0,0,0)');
  dk.fillStyle=gr; dk.beginPath(); dk.arc(px,py,chapter===2?110:130,0,7); dk.fill();
  const fl=chapter===2?300:340, a=player.dir, torchOn=keys.KeyF&&torchCharge>0;
  gr=dk.createRadialGradient(px,py,20,px,py,fl);
  gr.addColorStop(0,'rgba(0,0,0,0.95)'); gr.addColorStop(1,'rgba(0,0,0,0)');
  dk.fillStyle=gr; dk.beginPath(); dk.moveTo(px,py);
  dk.arc(px,py,fl,a-(torchOn?0.45:0.32),a+(torchOn?0.45:0.32)); dk.closePath(); dk.fill();
  for(const R of radios){ if(!R.on) continue;
    const rx=R.x-cam.x, ry=R.y-cam.y;
    gr=dk.createRadialGradient(rx,ry,4,rx,ry,70);
    gr.addColorStop(0,'rgba(0,0,0,0.7)'); gr.addColorStop(1,'rgba(0,0,0,0)');
    dk.fillStyle=gr; dk.beginPath(); dk.arc(rx,ry,70,0,7); dk.fill(); }
  if(chapter===1){
    const lx=1300-cam.x, ly=80-cam.y;
    gr=dk.createRadialGradient(lx,ly,5,lx,ly,120);
    gr.addColorStop(0,'rgba(0,0,0,0.6)'); gr.addColorStop(1,'rgba(0,0,0,0)');
    dk.fillStyle=gr; dk.beginPath(); dk.arc(lx,ly,120,0,7); dk.fill();
  } else {
    for(const [ex,ey] of [[1180,1780],[860,1300],[1540,1300],[1180,900],[420,740],[1980,740],[1180,225]]){
      const rx=ex-cam.x, ry=ey-cam.y;
      if(rx<-100||rx>W+100||ry<-100||ry>H+100) continue;
      gr=dk.createRadialGradient(rx,ry,3,rx,ry,80);
      gr.addColorStop(0,'rgba(0,0,0,0.5)'); gr.addColorStop(1,'rgba(0,0,0,0)');
      dk.fillStyle=gr; dk.beginPath(); dk.arc(rx,ry,80,0,7); dk.fill();
    }
  }
  dk.globalCompositeOperation='source-over';
  cx.drawImage(dark,0,0);

  if(torchOn){
    cx.save(); cx.translate(px,py); cx.rotate(a);
    const bg=cx.createLinearGradient(0,0,fl,0);
    bg.addColorStop(0,'rgba(120,220,240,0.18)'); bg.addColorStop(1,'rgba(120,220,240,0)');
    cx.fillStyle=bg; cx.beginPath(); cx.moveTo(0,0); cx.arc(0,0,fl,-0.45,0.45); cx.closePath(); cx.fill();
    cx.restore();
  }

  /* red emergency tint in interior */
  if(chapter===2){
    cx.fillStyle=`rgba(120,20,15,${0.03+Math.sin(time*1.5)*0.015})`;
    cx.fillRect(0,0,W,H);
  }
  /* çok katmanlı hacimsel sis */
  drawFog();
  if(markedT>0){
    cx.fillStyle=`rgba(180,20,10,${0.08+Math.sin(time*8)*0.05})`;
    cx.fillRect(0,0,W,H);
  }
  if(finalSeq){
    cx.fillStyle=`rgba(255,40,30,${0.05+Math.sin(time*10)*0.04})`;
    cx.fillRect(0,0,W,H);
  }

  /* sinematik post-process: gren + renk derecelendirme */
  postProcess();

  /* ---------- ESP OVERLAY ---------- */
  if(cheats.esp) renderESP();
}

/* ============================================================
   SİNEMATİK KATMANLAR: sis, gren, renk
   ============================================================ */
const grainCv = document.createElement('canvas');
grainCv.width=160; grainCv.height=90;   // küçük buffer = ucuz üretim
const grainCtx = grainCv.getContext('2d');
let grainT=0;
function makeGrain(){
  const d=grainCtx.createImageData(160,90);
  for(let i=0;i<d.data.length;i+=4){
    const v=(Math.random()*255)|0;
    d.data[i]=v; d.data[i+1]=v; d.data[i+2]=v; d.data[i+3]=22;
  }
  grainCtx.putImageData(d,0,0);
}
makeGrain();

/* STATİK post-process katmanı: vinyet + soğuk renk tonu TEK SEFER üretilir,
   her karede tek drawImage — eski multiply/overlay blend'lerin yükü yok */
const ppCv = document.createElement('canvas');
ppCv.width=W; ppCv.height=H;
(function(){
  const p=ppCv.getContext('2d');
  // soğuk mavi-yeşil ton (eski multiply etkisinin ucuz taklidi)
  const cg=p.createLinearGradient(0,0,0,H);
  cg.addColorStop(0,'rgba(40,70,95,0.10)');
  cg.addColorStop(1,'rgba(30,60,60,0.12)');
  p.fillStyle=cg; p.fillRect(0,0,W,H);
  // derin köşe vinyeti
  const vg=p.createRadialGradient(W/2,H/2,H*0.42,W/2,H/2,H*0.85);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.5)');
  p.fillStyle=vg; p.fillRect(0,0,W,H);
})();

function drawFog(){
  // 2 katman, 3'er elips — eski 12 elipsin görsel etkisinin ~%90'ı, yarı maliyet
  const layers = chapter===2
    ? [ [0.028, 14, 380, 90], [0.030, 38, 190, 50] ]
    : [ [0.045, 12, 420,110], [0.038, 40, 210, 60] ];
  cx.fillStyle = chapter===2 ? 'rgba(110,125,135,0.03)' : 'rgba(135,158,150,0.04)';
  for(let li=0; li<2; li++){
    const [alpha, spd, rw, rh] = layers[li];
    cx.globalAlpha=1;
    cx.fillStyle = chapter===2
      ? `rgba(110,125,135,${alpha})` : `rgba(135,158,150,${alpha})`;
    for(let i=0;i<3;i++){
      const fx=((time*spd + i*(W/2.2) + li*260) % (W+rw*2)) - rw;
      const fy= 140+li*230 + i*110 + Math.sin(time*0.35+i*2+li)*46;
      cx.beginPath(); cx.ellipse(fx, fy, rw, rh, 0, 0, 7); cx.fill();
    }
  }
  // 87.9 sinyal paraziti (ucuz, sadece kule civarı)
  const sigY = chapter===1 ? 300 : 350;
  if(cam.y < sigY+400){
    cx.globalAlpha=0.05+Math.sin(time*9)*0.03;
    cx.fillStyle='#9fb8c8';
    for(let i=0;i<4;i++) cx.fillRect(rand(0,W), rand(0,H*0.4), rand(30,140), 1.5);
    cx.globalAlpha=1;
  }
}

function postProcess(){
  // statik ton+vinyet: tek ucuz drawImage
  cx.drawImage(ppCv,0,0);
  // film greni: normal blend, seyrek yenileme (overlay/multiply YOK — GPU dostu)
  if(settings.grain>0){
    grainT+=1;
    if(grainT%6===0) makeGrain();
    cx.save(); cx.globalAlpha=0.30*(settings.grain/55);
    cx.drawImage(grainCv,0,0,W,H);
    cx.restore();
  }
}

function espTag(wx,wy,label,color){
  const x=wx-cam.x, y=wy-cam.y;
  if(x<-40||x>W+40||y<-40||y>H+40){
    // edge arrow for offscreen targets
    const cxs=W/2, cys=H/2;
    const a=Math.atan2(y-cys,x-cxs);
    const ex=cxs+Math.cos(a)*(W/2-30), ey=cys+Math.sin(a)*(H/2-30);
    cx.fillStyle=color; cx.save(); cx.translate(ex,ey); cx.rotate(a);
    cx.beginPath(); cx.moveTo(10,0); cx.lineTo(-4,-6); cx.lineTo(-4,6); cx.closePath(); cx.fill();
    cx.restore();
    return;
  }
  cx.strokeStyle=color; cx.lineWidth=1.5;
  cx.strokeRect(x-16,y-16,32,32);
  cx.fillStyle=color; cx.font='10px Courier New';
  cx.fillText(label, x-16, y-20);
}
function renderESP(){
  for(const F of fuses) if(!F.got) espTag(F.x,F.y, chapter===1?'SİGORTA':'BANT', '#ffd24d');
  for(const P of pickups) if(!P.got) espTag(P.x,P.y, P.type==='bat'?'AKÜ':'KÜRE', '#6fc7d9');
  for(const N of notes) if(!N.got) espTag(N.x,N.y,'NOT','#d8cba8');
  for(const L of listeners) if(L.alive) espTag(L.x,L.y,'DİNLEYİCİ','#ff5b4e');
  for(const M of maws) if(M.alive) espTag(M.x,M.y,'AĞIZ','#ff8fd9');
  for(const Cw of crawlers) if(Cw.alive) espTag(Cw.x,Cw.y,'EMEKLEYEN','#ffa04d');
  espTag(door.x,door.y+30, chapter===1?'KAPI':'VERİCİ', '#4dbd6e');
  // hearing ranges
  cx.save(); cx.globalAlpha=0.15;
  for(const L of listeners){ if(!L.alive) continue;
    cx.strokeStyle='#ff5b4e'; cx.beginPath(); cx.arc(L.x-cam.x,L.y-cam.y,90,0,7); cx.stroke(); }
  cx.restore();
}

/* ============================================================
   GAME FLOW
   ============================================================ */
function kill(by){
  if(state!=='play') return;
  if(cheats.god || cheats.ghost){ return; } // god/ghost: untouchable
  state='jumpscare';
  AU.jumpscareSound(); shake=2;
  const js=document.getElementById('jumpscare');
  js.classList.remove('hidden');
  const img=js.querySelector('img');
  img.style.animation='none'; void img.offsetWidth; img.style.animation='';
  document.getElementById('hud').classList.add('hidden');
  setTimeout(()=>{
    js.classList.add('hidden');
    state='dead';
    document.getElementById('dead').classList.remove('hidden');
    document.getElementById('deadQuote').innerHTML =
      by==='maw' ? '"Göğsündeki zar son bir kez gerildi.<br>Duyduğun son ses, kendi çığlığın oldu."'
    : by==='crawler' ? '"Karanlıkta uyuyordu. Sen uyandırdın.<br>İğne dişler, fısıltıdan hızlıydı."'
    : by==='stalker' ? '"Kapı açıktı. Karanlık, davetiyeyi kabul etti.<br>Fener sadece gördüğünü korkutabilir."'
    : by==='watcher' ? '"Pencere. Hep pencereydi.<br>Sen kameralara bakarken, o SANA bakıyordu."'
    : by==='ventcreep' ? '"Işığı bir saniye indirdin.<br>Kanallarda bir saniye, bir ömürdür."'
    : by==='hunter' ? '"Kanallarda durmak yoktur.<br>Sacların ezilme sesi... hep bir adım gerideydi."'
    : '"Kulak çanakları kafana kapandı.<br>Ve dünyadaki bütün sesler tek bir frekansa indi: 87.9"';
  }, 1400);
}

function winGame(){
  if(chapter===2){
    // Bölüm 2 bitti → SİNEMATİK BAŞLIK + BÖLÜM 3
    startChapter3TitleDrop();
    return;
  }
  state='win';
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('finalbar').classList.add('hidden');
  document.getElementById('win').classList.remove('hidden');
  if(chapter>=3){
    AU.stopMusic(3);
    AU.blip(87.9*4,1.5,0.2,'sine');
    document.getElementById('winText').innerHTML =
    `Kapağı omzunla ittin ve kanallardan dışarı, şafağın<br>
    ilk ışığına yuvarlandın. Arkandaki metal uğultu —<br>
    sacları büken o ŞEY — kapakta durdu. Işığa çıkamadı.<br><br>
    Temiz hava fanlardan bütün binaya yayılıyordu.<br>
    87.9'un son kalıntıları duvarlardan sökülüp gitti.<br><br>
    Ve cebindeki telsizden, parazitsiz, tertemiz bir ses:<br><br>
    <i>"Deniz? Beni... duyuyor musun?"</i><br><br>
    Bu sefer ses tersine çevrilmemişti.<br>
    Bu sefer gerçekti.<br><br>
    — SON —<br>
    <span style="color:#6f7f74;font-size:12px">SESSİZ FREKANS'ı bitirdin. Okunan not: ${notesRead}/7</span>`;
  } else {
    AU.blip(87.9*4,1.5,0.2,'sine');
    document.getElementById('winText').innerHTML = `— PERDE SONU —`;
  }
}

/* ============================================================
   BÖLÜM 3 GEÇİŞİ: MÜZİK + BAŞLIK EKRANI
   ============================================================ */
function startChapter3TitleDrop(){
  state='titledrop';
  hideAll();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('finalbar').classList.add('hidden');
  const td=document.getElementById('titledrop');
  td.classList.remove('hidden');
  // animasyonları yeniden tetikle
  for(const el of td.querySelectorAll('.td-freq,.td-title,.td-sub,.td-quote')){
    el.style.animation='none'; void el.offsetWidth; el.style.animation='';
  }
  AU.startMusic();
  // 87.9 sinyal vuruşu
  AU.blip(87.9*2,2,0.15,'sine');
  setTimeout(()=>AU.blip(87.9*4,1.5,0.12,'sine'), 1200);
  setTimeout(()=>{
    td.classList.add('hidden');
    startChapter3();
  }, 7000);
}
function startChapter3(){
  hideAll(); buildChapter3(); state='play';
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('btnCh3').classList.remove('hidden');
  setHint('VERİCİ SUSTU AMA ONLAR SUSMADI — KOŞ! (W A S D)',5);
}

/* ---------------- INTRO / CHAPTER CARDS ---------------- */
const introPages = [
`RADYO POYRAZ 92.4 — GECE 03:47

"Saat dördü on üç geçiyor, hâlâ uyuyamayanlar...
ben Gece Kuşu. Hatlar açık. Bu gece kimse yalnız değil."

Telefon hattı ışığı yanıp söndü.
Hatta kimse konuşmuyordu. Sadece cızırtı...
ve cızırtının içinde, ters çevrilmiş bir ses.`,
`Kayıt masasında sesi düzelttim.
Ve kanım dondu.

Bu... Elif'in sesiydi. Yedi yıl önce kaybolan kız kardeşim.

<span class="red">"Deniz... frekansı kapat... sakın dinleme...
87.9'u sakın dinleme... hâlâ yayındayım..."</span>`,
`Sinyalin yönünü kestirdim: Ormanın derinliklerindeki
terk edilmiş KANAL-9 Radyolink İstasyonu.
Elif'in kaybolduğu dağ. Aynı dağ.

Üç gün sonra, şafaktan önceki en karanlık saatte,
arabam devrilmiş bir ağacın önünde durdu.

Ve ormandaki bütün kuşlar aynı anda sustu.`,
`GÖREV: 3 SİGORTA bul, istasyonun kapısını aç.

Onlar tamamen kör. Ama her adımını duyarlar.
Radyoları aç — dikkatlerini dağıt.
Yankı Küresi fırlat — onları kandır.
AĞIZ'a dikkat et: seni duyamaz ama titreşimini
HİSSEDER ve sürüye işaretler.
Notları oku — Elif'in izini sürüyorsun.

<span class="red">Ses çıkarma.</span>`];

const ch2Pages = [
`BÖLÜM 2 — İSTASYONUN İÇİ

Kapı arkamdan kapandığında anladım:
buranın karanlığı, ormanınkinden farklıydı.

Ormanın karanlığı boştu.
Buranınki... DOLUYDU.`,
`Beton koridorlar her fısıltıyı büyütüyor.
İçeride sesim dışarıdakinden çok daha uzağa gidiyor.

Yerde cam kırıkları var — üstüne basma.

Ve köşelerde bir şeyler UYUYOR.
Küçükler. Hızlılar. Sese fırlıyorlar.
Uyuyanı uyandırma. Uyandırdıysan... kıpırdama.`,
`Elif'in planını buldum, duvara kazınmış:

"3 DOĞRULAMA BANDI olmadan ana konsol açılmaz.
Jeneratör odası. Arşiv. Laboratuvar."

Vericiyi kapattığımda çok ses çıkacakmış.
Hepsi gelecekmiş. Hepsi.

<span class="red">Olsun. Bu sefer dinliyorum.</span>`];

let introIdx=0, introSet=null;

function showCards(pages, after){
  introSet={pages, after}; introIdx=0;
  document.getElementById('title').classList.add('hidden');
  const iv=document.getElementById('intro');
  iv.classList.remove('hidden');
  // konsept görselini bölüme göre arka plana koy
  const bg = pages===ch2Pages ? 'assets/level2.png'
           : pages===introPages ? 'assets/concept_forest.png' : '';
  iv.style.background = bg
    ? `linear-gradient(rgba(2,4,5,0.82), rgba(2,4,5,0.94)), url('${bg}') center/cover`
    : 'rgba(2,4,5,0.94)';
  typePage();
}
function typePage(){
  const el=document.getElementById('introText');
  const txt=introSet.pages[introIdx];
  el.innerHTML=''; let i=0;
  clearInterval(window._tw);
  window._tw=setInterval(()=>{
    i+=2; el.innerHTML=txt.slice(0,i);
    if(i%14===0) AU.blip(rand(700,900),0.02,0.02);
    if(i>=txt.length){ el.innerHTML=txt; clearInterval(window._tw); }
  },16);
}
function endCards(){
  clearInterval(window._tw);
  document.getElementById('intro').classList.add('hidden');
  introSet.after();
}

function startChapter1(){
  hideAll(); buildChapter1(); state='play';
  document.getElementById('hud').classList.remove('hidden');
  setHint('C = sessiz yürüyüş. Kuzeydeki kuleye ulaş.',5);
}
function startChapter2(){
  hideAll(); buildChapter2(); state='play';
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('btnCh2').classList.remove('hidden');
  setHint('İçerisi sesi BÜYÜTÜR. Cam kırıklarına dikkat. Uyuyanları uyandırma.',6);
}
function startChapter2Card(){
  state='intro';
  document.getElementById('hud').classList.add('hidden');
  showCards(ch2Pages, startChapter2);
}
function hideAll(){
  for(const id of ['title','intro','dead','win','noteui','jumpscare','pause','admin','titledrop'])
    document.getElementById(id).classList.add('hidden');
}

/* ============================================================
   PAUSE MENU + ADMIN PANEL (şifre: 4747)
   ============================================================ */
const $ = id=>document.getElementById(id);

function flashBtn(id){
  const b=$(id); if(!b) return;
  const old=b.style.background;
  b.style.background='rgba(77,189,110,0.6)';
  setTimeout(()=>{ b.style.background=old; },220);
}

function openPause(){
  state='pause';
  $('pause').classList.remove('hidden');
  $('pwRow').classList.add('hidden');
  $('pwErr').textContent='';
  AU.blip(400,0.08,0.08);
}
function closePause(){
  $('pause').classList.add('hidden');
  $('admin').classList.add('hidden');
  state='play';
  AU.blip(600,0.08,0.08);
}
function openAdmin(){
  $('pause').classList.add('hidden');
  $('admin').classList.remove('hidden');
  state='admin';
  AU.blip(1200,0.15,0.1,'sine');
  refreshToggles();
}

/* --- P key (veya ESC): pause / unpause --- */
addEventListener('keydown', e=>{
  const isP = e.code==='KeyP' || e.key==='p' || e.key==='P';
  const isEsc = e.code==='Escape';
  if(!isP && !isEsc) return;
  // şifre kutusuna yazarken karışma
  if(document.activeElement && document.activeElement.id==='pwInput') return;
  if(state==='play'){ e.preventDefault(); openPause(); }
  else if(state==='pause' || state==='admin'){ e.preventDefault(); closePause(); }
}, true);

/* --- pause buttons --- */
$('btnResume').onclick=closePause;

/* --- settings UI --- */
$('btnSettings').onclick=()=>{
  $('settingsRow').classList.toggle('hidden');
  AU.blip(700,0.06,0.08);
};
const setDefs=[
  ['setBright','bright','setBrightVal'],
  ['setVol','vol','setVolVal'],
  ['setShake','shake','setShakeVal'],
  ['setGrain','grain','setGrainVal'],
];
function refreshSettingsUI(){
  for(const [inp,key,lbl] of setDefs){
    $(inp).value=settings[key];
    $(lbl).textContent='%'+settings[key];
  }
}
for(const [inp,key,lbl] of setDefs){
  $(inp).addEventListener('input',()=>{
    settings[key]=+$(inp).value;
    $(lbl).textContent='%'+settings[key];
    applySettings(); saveSettings();
    if(key==='vol') AU.blip(600,0.05,0.1); // sesli önizleme
  });
  // kaydırıcı oyun tuşlarını tetiklemesin
  $(inp).addEventListener('keydown',e=>e.stopPropagation());
}
$('btnSetReset').onclick=()=>{
  Object.assign(settings,{bright:100,vol:80,shake:100,grain:55});
  refreshSettingsUI(); applySettings(); saveSettings();
  AU.blip(900,0.1,0.1);
};
refreshSettingsUI(); applySettings();

/* ============================================================
   İLK AÇILIŞ: PARLAKLIK KALİBRASYONU (logo ile)
   ============================================================ */
(function initCalib(){
  let done=false;
  try{ done = localStorage.getItem('sf_calibrated')==='1'; }catch(e){}
  if(done) return;
  const cal=$('calib');
  cal.classList.remove('hidden');
  $('title').classList.add('hidden');
  const rng=$('calibRange'), val=$('calibVal'), logo=$('calibLogo');
  rng.value=settings.bright;
  const upd=()=>{
    settings.bright=+rng.value;
    val.textContent='%'+settings.bright;
    // logo önizlemesi: parlaklık ayarını logoya birebir uygula
    logo.style.filter=`brightness(${(settings.bright/100)*0.5})`;
    applySettings(); saveSettings();
  };
  upd();
  rng.addEventListener('input',upd);
  rng.addEventListener('keydown',e=>e.stopPropagation());
  $('btnCalibDone').onclick=()=>{
    try{ localStorage.setItem('sf_calibrated','1'); }catch(e){}
    cal.classList.add('hidden');
    $('title').classList.remove('hidden');
    refreshSettingsUI();
  };
})();
$('btnRestartCh').onclick=()=>{ hideAll(); if(chapter===2) startChapter2(); else startChapter1(); };
$('btnMainMenu').onclick=()=>{ hideAll(); state='title'; $('title').classList.remove('hidden'); };

/* --- password flow --- */
$('btnAdminOpen').onclick=()=>{
  if(adminUnlocked){ openAdmin(); return; }
  $('pwRow').classList.remove('hidden');
  $('pwInput').value=''; $('pwInput').focus();
};
function tryPassword(){
  const v=$('pwInput').value.trim();
  if(v===ADMIN_PASS){
    adminUnlocked=true;
    $('pwErr').textContent='';
    AU.blip(880,0.2,0.15,'sine'); AU.blip(1320,0.3,0.12,'sine');
    openAdmin();
  } else {
    const el=$('pwErr');
    el.textContent='ERİŞİM REDDEDİLDİ';
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    AU.blip(160,0.25,0.15,'sawtooth');
    $('pwInput').value=''; $('pwInput').focus();
  }
}
$('btnPwOk').onclick=tryPassword;
$('pwInput').addEventListener('keydown',e=>{
  e.stopPropagation(); // oyun tuşlarını tetiklemesin
  if(e.key==='Enter') tryPassword();
});

/* --- admin actions --- */
$('btnAdminClose').onclick=closePause;

$('admSkip').onclick=()=>{
  hideAll();
  if(chapter===1){ startChapter2Card(); }
  else if(chapter===2){ startChapter3TitleDrop(); }
  else if(chapter===3){ startChapter4(); }
  else if(chapter===4){ startChapter5(); }
  else { winGame(); }
};
$('admObjective').onclick=()=>{
  for(const F of fuses) F.got=true;
  fuseCount=3;
  setHint(chapter===1?'Sigortalar tamamlandı — kapıya git!':'Bantlar tamamlandı — vericiye git!',4);
  AU.blip(1200,0.2,0.15); flashBtn('admObjective');
};
$('admFull').onclick=()=>{
  batteries=9; orbCount=9; torchCharge=100; stamina=100; tired=false; markedT=0;
  if(chapter>=3 && ch3){ ch3.power=100; ch3.blackoutT=0; if(ch3.flash!==undefined) ch3.flash=100; }
  setHint('Her şey fulllendi: 9 akü, 9 küre, fener %100, stamina %100, güç %100',4);
  AU.blip(1000,0.2,0.15); flashBtn('admFull');
};
$('admKillAll').onclick=()=>{
  let n=0;
  for(const L of listeners) if(L.alive){L.alive=false;n++;}
  for(const M of maws) if(M.alive){M.alive=false;n++;}
  for(const Cw of crawlers) if(Cw.alive){Cw.alive=false;n++;}
  if(chapter>=3 && ch3 && ch3.phase==='room'){
    for(const S of stalkers){ S.atDoor=false; S.pos=0; S.waitT=999; S.killT=0; }
    watcher.moveT=999; watcher.cam=0; ch3.watcherWinT=0; n+=3;
  }
  if(chapter>=3 && ch3 && ch3.phase==='vent'){
    n+=ch3.creeps.length; ch3.creeps=[]; ch3.spawnT=999;
  }
  if(chapter>=3 && ch3 && ch3.phase==='maze' && ch3.hunter && ch3.hunter.alive){
    ch3.hunter.alive=false; n++;
  }
  setHint(`${n} düşman etkisiz hale getirildi.`,4);
  AU.thud(0.6); flashBtn('admKillAll');
};
$('admTeleport').onclick=()=>{
  player.x=door.x; player.y=door.y+70;
  cam.x=clamp(player.x-W/2,0,WORLD.w-W); cam.y=clamp(player.y-H/2,0,WORLD.h-H);
  setHint(chapter===1?'Kapıya ışınlandın.':'Ana vericiye ışınlandın.',3);
  AU.blip(1400,0.15,0.12,'sine'); flashBtn('admTeleport');
};

/* --- toggles --- */
const tglMap = { admGod:'god', admGhost:'ghost', admEsp:'esp', admBright:'bright', admSpeed:'speed', admInf:'inf' };
for(const [btnId,key] of Object.entries(tglMap)){
  $(btnId).onclick=()=>{
    cheats[key]=!cheats[key];
    AU.blip(cheats[key]?900:300,0.1,0.1);
    refreshToggles();
  };
}
function refreshToggles(){
  for(const [btnId,key] of Object.entries(tglMap)){
    const b=$(btnId);
    b.classList.toggle('on',cheats[key]);
    b.querySelector('span').textContent = cheats[key]?'AÇIK':'KAPALI';
  }
  updateCheatBadge();
}
function updateCheatBadge(){
  let badge=$('cheatBadge');
  const list=Object.entries(cheats).filter(([k,v])=>v).map(([k])=>({
    god:'GOD',ghost:'HAYALET',esp:'ESP',bright:'IŞIK',speed:'HIZx2',inf:'SONSUZ'}[k]));
  if(list.length===0){ if(badge) badge.remove(); return; }
  if(!badge){
    badge=document.createElement('div'); badge.id='cheatBadge';
    document.getElementById('wrap').appendChild(badge);
  }
  badge.textContent='⚙ '+list.join(' · ');
}

document.getElementById('btnStart').onclick=()=>{ AU.init(); AU.stopMusic(0.5); state='intro'; showCards(introPages, startChapter1); };
document.getElementById('btnCh2').onclick=()=>{ AU.init(); AU.stopMusic(0.5); startChapter2(); };
document.getElementById('btnCh3').onclick=()=>{ AU.init(); startChapter3TitleDrop(); };
document.getElementById('btnCh4').onclick=()=>{ startChapter4(); };
document.getElementById('btnCh5').onclick=()=>{ startChapter5(); };
document.getElementById('btnNext').onclick=()=>{
  introIdx++;
  if(introIdx>=introSet.pages.length) endCards(); else typePage();
};
document.getElementById('skipIntro').onclick=()=>endCards();
document.getElementById('btnRetry').onclick=()=>{ // checkpoint: restart current chapter
  if(chapter===5) startChapter5();
  else if(chapter===4) startChapter4();
  else if(chapter===3) startChapter3();
  else if(chapter===2) startChapter2();
  else startChapter1();
};
document.getElementById('btnAgain').onclick=()=>{ notesRead=0; AU.stopMusic(1); startChapter1(); };

/* ---------------- LOOP ---------------- */
let last=performance.now();
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if(state==='play'){ update(dt); render(); }
  requestAnimationFrame(loop);
}
buildChapter1(); render();
requestAnimationFrame(loop);
