import {buildScale,TONICS,noteName,STRING_COLORS,STRING_NAMES,targetFor,FINGERING_SOURCE} from './scales.mjs';
import {DIFFICULTIES,centsBetween,detectedName} from './intonation.mjs';
import {AudioEngine,Microphone,MIC_LEVELS,AUDIO_CUES} from './engine.mjs';
import {BRAVURA_LICENSE} from './glyphs.mjs';
import {renderScore,renderOne} from './score.mjs';
MIC_LEVELS.maximum={minRms:.0002,confidence:.6};
const defaults={form:'major',letter:0,alter:0,mode:'mic',view:'detail',refTempo:100,refBeats:4,tempo:60,beats:1,click:true,difficulty:'easy',sensitivity:'maximum',advance:'next',scoreRef:'off',a4:442,volume:.8,correction:true};
let saved={};try{saved=JSON.parse(localStorage.getItem('viola-scales-v1')||'{}')}catch{}let s={...defaults,...saved};
const app=document.querySelector('#app'),audio=new AudioEngine(),mic=new Microphone(audio),test=new URLSearchParams(location.search).has('test');
let wakeLock=null,wakeRequest=0,wakePending=0,starting=false,audioBlocked=false,micProblem=false;
let scale,index=0,phase='setup',results=[],lastCents=null,judgement=null,run=0,paused=false,error='',raf=0;
if(test)window.__viola={phase,index,lastCents,judgement};
function expose(){if(test)Object.assign(window.__viola,{phase,index,lastCents,judgement});}
function save(){try{localStorage.setItem('viola-scales-v1',JSON.stringify(s))}catch{}}
function updateScale(){scale=buildScale(s.form,+s.letter,+s.alter)}
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(key,items)=>`<select data-setting="${key}">${items.map(([v,t])=>`<option value="${v}" ${String(s[key])===String(v)?'selected':''}>${t}</option>`).join('')}</select>`;
const row=(label,control)=>`<label class="setting"><span>${label}</span>${control}</label>`;
function scoreWidth(){return Math.min(688,Math.max(280,app.clientWidth-64))}
const viewButtons=()=>`<div class="view-buttons" aria-label="画面">${[['detail','1音ずつ詳しく'],['score','全体の楽譜']].map(([v,t])=>`<button data-view="${v}" class="${s.view===v?'selected':''}" aria-pressed="${s.view===v}">${t}</button>`).join('')}</div>`;
function setup(){phase='setup';expose();updateScale();const letters='CDEFGAB';app.innerHTML=`<header><h1>ビオラ 2オクターブ音階</h1><div class="subtitle">ハ音記号・A=${s.a4}</div></header><section><h2>調を選ぶ</h2><div class="forms">${[['major','長調'],['harmonic','和声的短音階'],['melodic','旋律的短音階'],['natural','自然的短音階']].map(([v,t])=>`<button data-form="${v}" class="${s.form===v?'selected':''}" aria-pressed="${s.form===v}">${t}</button>`).join('')}</div><div class="tonics">${TONICS[s.form==='major'?'major':'minor'].map(([l,a])=>{let i=letters.indexOf(l);return `<button data-tonic="${l}" data-letter="${i}" data-alter="${a}" class="${i==s.letter&&a==s.alter?'selected':''}">${noteName(i,a)}</button>`}).join('')}</div><div class="key-label">${scale.label}</div></section><section><h2>練習の方法</h2><div class="modes"><button data-mode="mic" class="${s.mode==='mic'?'selected':''}">1音ずつ測る<br>（マイク）</button><button data-mode="tempo" class="${s.mode==='tempo'?'selected':''}">テンポで鳴らす<br>（測らない）</button></div><div class="view-setting">画面: ${viewButtons()}</div>${error?`<p class="error">${esc(error)}</p>`:''}</section><section><h2>全体の楽譜</h2><div class="score">${renderScore(scale,{width:scoreWidth()})}</div></section><button id="start" class="primary">はじめる</button><section><h2>設定</h2>${row('お手本のテンポ',`<input type="number" min="30" max="240" data-setting="refTempo" value="${s.refTempo}">`)}${row('お手本の長さ',options('refBeats',[[1,'1拍'],[2,'2拍'],[4,'4拍'],[8,'8拍']]))}${row('テンポで鳴らす速さ',`<input type="number" min="30" max="240" data-setting="tempo" value="${s.tempo}">`)}${row('1音の長さ',options('beats',[[1,'1拍'],[2,'2拍'],[4,'4拍']]))}${row('拍のクリック',options('click',[[true,'オン'],[false,'オフ']]))}${row('合格の幅',options('difficulty',[['easy','緩め ±15¢'],['normal','普通 ±8¢'],['strict','厳しめ ±5¢']]))}${row('マイクの感度',options('sensitivity',[['maximum','最高'],['ultra','とても高め'],['high','高め'],['normal','ふつう']]))}${row('外れた時',options('advance',[['next','次の音へ進む'],['repeat','合うまで同じ音']]))}${row('全体の楽譜の時のお手本',options('scoreRef',[['off','鳴らさない（4拍なし）'],['on','最初と外れた時だけ鳴らす']]))}${row('外れた時の正しい音',options('correction',[[true,'鳴らす'],[false,'鳴らさない']]))}${row('基準のラ',options('a4',[[442,'442 Hz'],[440,'440 Hz']]))}${row('音量',`<input type="range" min="0.2" max="1" step="0.05" data-setting="volume" value="${s.volume}">`)}</section><section class="fine"><h2>この運指について</h2><p>${esc(FINGERING_SOURCE)}</p><p>フレッシュ・小野アンナの本は読めておらず、その運指の写しではありません。照らした楽譜は tonebase のビオラ音階ガイドの2オクターブ長調8調で、開放弦の音（0と4）以外は同じ指です。音程の目標は Answer Tuner と同じ（独奏の旋律＝Aから純正5度で数えたピタゴラスの高さ。開放弦はAから純正5度で調弦）。</p><p>音声は端末の中だけで処理し、録音・送信しません。</p><details><summary>Bravura のライセンス</summary><pre>${esc(BRAVURA_LICENSE)}</pre></details></section>`;}
function performance(){
 const n=scale.notes[index],next=scale.notes[index+1];
 const entering=!document.querySelector('#performance-score');
 if(entering)app.innerHTML=`<div class="practice view-${s.view} mode-${s.mode}"><div class="sticky-practice"><div class="topbar"><button data-action="back" aria-label="戻る">×</button><strong>${scale.label}</strong><span id="progress"></span></div>${viewButtons()}<div class="compact-current"></div><section class="tuner"><div id="phase" class="phase"></div><div class="tuner-body"><div class="track-area"><div class="track"></div>${Array.from({length:9},(_,i)=>`<i class="tick" style="left:${i*12.5}%"></i>`).join('')}<div class="target-window" style="width:${2*DIFFICULTIES[s.difficulty]}%"><i></i><span>目標</span></div><div id="pitch-dot" class="pitch-dot"></div></div><div class="track-labels"><span>♭ 低い</span><span>♯ 高い</span></div><div id="pitch-status">—</div><div id="pitch-distance"></div><div id="pitch-note"></div><div class="level-track"><span id="level" style="width:0%"></span></div></div></section></div><section class="current"></section><section class="full-score"><h2>全体の楽譜</h2><div class="score" id="performance-score">${renderScore(scale,{width:scoreWidth()})}</div></section><div class="controls"><button data-action="pause"></button><button data-action="restart">やり直し</button><button data-action="prev">前の音</button><button data-action="next">次の音</button></div></div>`;
 document.querySelector('.compact-current').innerHTML=`<span class="compact-finger" style="color:${STRING_COLORS[n.string]}">${n.place.short}</span><span>${STRING_NAMES[n.string]}線 ${n.finger===0?'開放弦':`第${n.position}ポジション`}</span><strong>${n.name}</strong>${n.shift?`<b class="shift-badge">${n.shift.dir==='up'?'↗':'↘'}${n.shift.to}ポジへ移動</b>`:''}`;
 document.querySelector('.current').innerHTML=`<div class="fingerline"><span class="finger" style="color:${STRING_COLORS[n.string]}">${n.place.short}</span><span class="stringinfo">${STRING_NAMES[n.string]}線<br>${n.finger===0?'開放弦':`第${n.position}ポジション`}</span></div><div class="notename">${n.name} <small>${n.nameEn}</small></div><div class="one">${renderOne(n,scale)}</div><div class="hints">${n.hints.map(h=>`<div class="hint ${h.kind==='shift'?'shift':['placeHigh','placeLow','kuttsuku','hanasu','ookiku','hikuku'].includes(h.kind)?'strong':''}">${esc(h.text)}</div>`).join('')}</div>${next?`<div class="next">次: ${next.place.short} ${next.name} ${next.shift?`<b>次は移動 ${next.shift.dir==='up'?'↗':'↘'}${next.shift.to}</b>`:''}</div>`:''}`;
 document.querySelector('#progress').textContent=`${index+1} / ${scale.notes.length}`;
 document.querySelector('[data-action="pause"]').textContent=paused?'再開':'一時停止';
 const score=document.querySelector('#performance-score');
 score.querySelector('[data-current]')?.remove();
 const note=score.querySelector(`[data-index="${index}"]`);
 if(note){
  const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  for(const [key,value] of Object.entries({'data-current':'true',cx:note.dataset.centerX,cy:note.dataset.centerY,r:13,fill:note.dataset.color,'fill-opacity':.12,stroke:note.dataset.color,'stroke-opacity':.6,'stroke-width':2}))circle.setAttribute(key,value);
  note.prepend(circle);
 }
 showPhase();
 const id=run;
 requestAnimationFrame(()=>{
  if(id!==run||!note?.isConnected)return;
  const system=note.closest('svg'),rect=system.getBoundingClientRect();
  if(s.view!=='score')return;
  const top=document.querySelector('.sticky-practice').getBoundingClientRect().bottom;
  const bottom=document.querySelector('.controls').getBoundingClientRect().top;
  // 貼り付いた帯の下〜操作ボタンの上の見える所の真ん中へ送る（帯の裏に隠さない）
  const low=Math.min(innerHeight,bottom>top?bottom:innerHeight);
  if(rect.top<top||rect.bottom>low)window.scrollBy({top:(rect.top+rect.bottom)/2-(top+low)/2});
 });
}
let meterSeen=0;
function updateMeter(frequency,target,n,force=false){
 const dot=document.querySelector('#pitch-dot'),status=document.querySelector('#pitch-status'),distance=document.querySelector('#pitch-distance'),note=document.querySelector('#pitch-note');
 if(!dot?.classList)return;
 // 読めない瞬間が1〜2回挟まっても点を消さない（0.35秒は前の位置のまま）
 if(!frequency){if(!force&&Date.now()-meterSeen<350)return;dot.classList.remove('visible');status.textContent='—';status.style.color='';distance.textContent='';note.textContent='';return;}
 meterSeen=Date.now();
 const cents=centsBetween(frequency,target),color=Math.abs(cents)<=DIFFICULTIES[s.difficulty]?'#2e9e6a':Math.abs(cents)<=25?'#e48a2a':'#e04a3a';
 dot.style.left=`${50+Math.max(-50,Math.min(50,cents))}%`;dot.style.transform='translate(-50%,-50%)'; // 幅が変わっても位置が合うよう割合で置く
if(!dot.classList.contains('visible')){void dot.offsetWidth;dot.classList.add('visible');}dot.style.background=color;dot.style.color=color;
 status.textContent=Math.abs(cents)<=DIFFICULTIES[s.difficulty]?'合う':cents>0?'高め':'低め';status.style.color=color;distance.style.color=color;distance.textContent=`目標まで ${signed(cents)}¢`;
 const midi=Math.round(69+12*Math.log2(frequency/+s.a4)),names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];note.textContent=`${detectedName(frequency,+s.a4,n.key)} ${names[(midi%12+12)%12]}${Math.floor(midi/12)-1} ・ ${frequency.toFixed(1)} Hz`;
}
function showPhase(text){const p=document.querySelector('#phase');if(p)p.innerHTML=micProblem?'マイクが止まりました。もう一度はじめるを押してください <button data-action="restart">はじめる</button>':audioBlocked?'音が止まっています。画面を押すと再開します':text||({reference:'お手本（聴く）',tail:'余韻を待っています',listening:scoreNoRef()?'弾いてください（合うとピロン）':'お手本のあとに弾いてください',measuring:'測っています',countdown:'準備',playing:'演奏中',paused:'一時停止'}[phase]||phase);expose()}
function finish(){phase='finished';cancelAnimationFrame(raf);mic.stop();audio.stop();releaseWakeLock();expose();app.innerHTML=`<section><h1>おつかれさまでした</h1>${s.mode==='mic'?`<p>1回目で合った音 ${results.filter(r=>r?.first==='合う').length} / 29</p><table><thead><tr><th>音名</th><th>指</th><th>測定値</th><th>判定</th></tr></thead><tbody>${scale.notes.map((n,i)=>`<tr><td>${n.name}</td><td>${n.place.short}</td><td>${results[i]?signed(results[i].cents)+'¢':'—'}</td><td>${results[i]?.judgement||'—'}</td></tr>`).join('')}</tbody></table>`:'<p>最後まで鳴らしました。</p>'}<p><button data-action="restart">もう一度</button> <button data-action="back">調を選び直す</button></p></section>`}
const signed=n=>n>0?'+'+Math.round(n):n<0?'−'+Math.abs(Math.round(n)):'0';
// A pending request may resolve after pause/back; invalidate it before releasing.
async function acquireWakeLock(){
 if(wakeLock||wakePending||!navigator.wakeLock?.request||document.visibilityState!=='visible')return;
 const request=++wakeRequest;wakePending=request;
 try{
  const lock=await navigator.wakeLock.request('screen');
  if(request!==wakeRequest||paused||document.visibilityState!=='visible'||['setup','finished'].includes(phase)){await lock.release();return;}
  wakeLock=lock;
  lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null});
 }catch{}finally{if(wakePending===request)wakePending=0;}
}
function releaseWakeLock(){++wakeRequest;wakePending=0;const lock=wakeLock;wakeLock=null;try{lock?.release()?.catch(()=>{})}catch{}}
audio.onstate=state=>{
 if(!['setup','finished'].includes(phase)&&state!=='running'){audioBlocked=true;showPhase();}
};
mic.onhealth=health=>{
 if(health==='ended'||health==='muted'){
  micProblem=true;++run;cancelAnimationFrame(raf);audio.stop();releaseWakeLock();showPhase();
 }
};
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState!=='visible'){releaseWakeLock();return;}
 if(['setup','finished'].includes(phase))return;
 const id=run,interrupted=audioBlocked||audio.state!=='running';
 runningClock(id,true).then(ok=>{
  if(id!==run||!ok||['setup','finished'].includes(phase))return;
  if(paused){showPhase();return;}
  if(interrupted)resumePractice(++run,false);
  else acquireWakeLock();
 });
});
function wait(ms,id){return new Promise(resolve=>setTimeout(()=>resolve(id===run&&!paused),ms))}
async function runningClock(id,allowPaused=false){
 if(audio.state!=='running'){audioBlocked=true;showPhase();}
 let ok=false;try{ok=await audio.ensureRunning();}catch{}
 if(id!==run||(!allowPaused&&paused))return false;
 const at=audio.time;
 // A running state alone does not prove the audio clock has resumed (Safari).
 for(let i=0;ok&&i<20;i++){
  await new Promise(resolve=>setTimeout(resolve,25));
  if(id!==run||(!allowPaused&&paused))return false;
  if(audio.state!=='running')break;
  if(audio.time>at){audioBlocked=false;return true;}
 }
 audioBlocked=true;showPhase();return false;
}
async function resumePractice(id,count){
 cancelAnimationFrame(raf);audio.stop();
 if(micProblem)return;
 if(!await runningClock(id))return;
 acquireWakeLock();
 if(s.mode==='tempo')tempoRun(id,count);else measure(id);
}
async function start(){
 if(starting)return;
 starting=true;error='';audioBlocked=false;micProblem=false;
 const mode=s.mode;
 const controls=app.querySelectorAll('#start,[data-form],[data-tonic],[data-mode],[data-setting]');
 controls.forEach(button=>button.disabled=true);
 try{
  await audio.init();audio.master.gain.value=+s.volume;
  if(mode==='mic')await mic.start();
  if(s.mode!=='mic')mic.stop();
  index=0;results=[];lastCents=null;judgement=null;paused=false;
  phase=s.mode==='tempo'?'countdown':'reference';acquireWakeLock();
  const id=++run;performance();
  resumePractice(id,true);
 }catch(e){
  mic.stop();audio.stop();releaseWakeLock();
  error='マイクや音声を使えません: '+e.message+'。ブラウザのマイク許可と端末の設定を確認してください。テンポで鳴らすモードは利用できます。';setup();
 }finally{starting=false;controls.forEach(button=>button.disabled=false);}
}
// flow: 全体の楽譜でお手本を鳴らさずに聞く時。quiet＝ピロンなどが鳴っている秒（その間と0.1秒は聞かない）、prevHz＝弾き続けている前の音。
const scoreNoRef=()=>s.view==='score'&&s.scoreRef==='off';
async function measure(id,flow=null){
 if(!flow&&scoreNoRef())flow={quiet:0};
 if(id!==run||paused)return;
 if(index>=29){finish();return;}
 const n=scale.notes[index],target=targetFor(n,{a4:+s.a4,difficulty:s.difficulty}).targetHz;
 updateMeter(null,target,n,true);
 if(!flow?.keep)audio.stop(); // 合った直後はピロンを切らない
 const dur=flow?flow.quiet:60/Math.max(30,+s.refTempo)*+s.refBeats,at=audio.time,readyAt=at+dur+(flow?.1:.35);
 phase=flow?'listening':'reference';performance();if(!flow)audio.toneHz(target,dur,at,.65);
 let tail=[],previous=null;
 const reading=()=>{
  const r=mic.read(s.sensitivity),fresh=!previous||r.rms!==previous.rms||r.frequency!==previous.frequency;
  previous={rms:r.rms,frequency:r.frequency};
  return {r,fresh:fresh&&audio.state==='running'};
 };
 // Both the reference and its tail follow the audio clock, including a delayed/frozen clock.
 while(id===run&&!paused&&audio.time<=readyAt){
  if(audio.state==='running'){
   audioBlocked=false;
   const t=audio.time,{r,fresh}=reading();
   if(flow){}
   else if(t>=at+dur){phase='tail';showPhase();if(t>=readyAt-.15&&fresh)tail.push(r.rms);}
   else{
    const beat=Math.min(+s.refBeats,Math.floor((t-at)/(60/+s.refTempo))+1);
    showPhase(`お手本（聴く） <span class="beat">${Array.from({length:+s.refBeats},(_,i)=>i+1===beat?'●':'○').join(' ')}</span>`);
   }
  }else{audioBlocked=true;showPhase();}
  if(!await wait(25,id))return;
 }
 if(id!==run||paused)return;
 const baseline=tail.reduce((a,b)=>a+b,0)/Math.max(1,tail.length);
 phase='listening';showPhase();
 let since=null,onset=null,samples=[],cfg=MIC_LEVELS[s.sensitivity],guardHz=flow?.prevHz??null,quietSince=null;
 while(id===run&&!paused){
  const now=audio.time*1000,{r,fresh}=reading();
  let valid=fresh&&r.frequency&&r.rms>=cfg.minRms&&r.confidence>=cfg.confidence;
  // 前の音を弾き続けている間は、次の音として測らない。高さが前の音から50¢（次の音との中ほど）離れるか、音が150ms切れたら見張りを外す
  if(guardHz){if(fresh&&r.rms<cfg.minRms){quietSince??=now;if(now-quietSince>=150)guardHz=null;}else{quietSince=null;if(valid&&Math.abs(centsBetween(r.frequency,guardHz))>=50)guardHz=null;}if(guardHz)valid=false;}
  if(test)window.__viola.reading=r;
  if(audio.state!=='running'){audioBlocked=true;showPhase();}
  else if(audioBlocked){audioBlocked=false;showPhase();}
  const level=document.querySelector('#level');
  if(level)level.style.width=Math.min(100,r.rms*500)+'%';
  updateMeter(valid?r.frequency:null,target,n);
  if(!fresh){if(onset!==null){phase='listening';showPhase();}since=null;onset=null;samples=[];}
  if(onset===null){
   const threshold=audio.time-readyAt<.6?Math.max(cfg.minRms,baseline*1.5):cfg.minRms;
   if(valid&&r.rms>=threshold){since??=now;if(now-since>=120){onset=since;phase='measuring';showPhase();}}
   else since=null;
  }else if(now-onset>=150&&now-onset<=850&&valid)samples.push(centsBetween(r.frequency,target));
  if(onset!==null&&now-onset>850){if(samples.length){samples.sort((a,b)=>a-b);lastCents=samples[Math.floor(samples.length/2)];updateMeter(target*Math.pow(2,lastCents/1200),target,n); // 計器も判定と同じ中央値にそろえる
judgement=Math.abs(lastCents)<=DIFFICULTIES[s.difficulty]?'合う':lastCents>0?'高い':'低い';results[index]={cents:lastCents,judgement,first:results[index]?.first??judgement};phase='result';let heard=Math.abs(lastCents)>=50&&Math.round(12*Math.log2(target*Math.pow(2,lastCents/1200)/+s.a4))!==Math.round(12*Math.log2(target/+s.a4))?` ${detectedName(target*Math.pow(2,lastCents/1200),+s.a4,n.key)}に聞こえる`:'';const heardHz=target*Math.pow(2,lastCents/1200);if(judgement==='合う'&&s.view==='score'){index++;if(index>=29){finish();audio.success();return}audio.success();measure(id,{prevHz:heardHz,quiet:AUDIO_CUES.success.duration,keep:true});return} // 全体の楽譜: ピロンを鳴らして間を置かず次の音へ
showPhase(`<span class="${judgement==='合う'?'result-good':'result-bad'}">${judgement==='合う'?'✓ ':''}${judgement} ${signed(lastCents)}¢${heard}</span>`);if(judgement!=='合う'&&s.correction)audio.toneHz(target,1,audio.time,.65);if(!await wait(1200,id))return;const moved=judgement==='合う'||s.advance==='next';if(moved)index++;measure(id,scoreNoRef()?{prevHz:moved?heardHz:null,quiet:.25}:null);return}onset=null;since=null;phase='listening';showPhase()}if(!await wait(25,id))return}
}
function tempoRun(id,count){
 cancelAnimationFrame(raf);
 const beat=60/+s.tempo,duration=beat*+s.beats,fromIndex=index;
 // A small lead gives every source the same future origin, including count-in.
 const start=audio.time+.06,notesAt=start+(count?4*beat:0);
 if(count)for(let b=0;b<4;b++)audio.click(start+b*beat,b===0);
 for(let i=fromIndex;i<scale.notes.length;i++){
  const at=notesAt+(i-fromIndex)*duration;
  audio.toneHz(targetFor(scale.notes[i],{a4:+s.a4,difficulty:s.difficulty}).targetHz,duration,at,.65);
  if(s.click)for(let b=0;b<+s.beats;b++)audio.click(at+b*beat,b===0);
 }
 const end=notesAt+(scale.notes.length-fromIndex)*duration;
 if(test){window.__viola.tempoSchedule={start,notesAt,beat,duration,fromIndex};window.__viola.tempoTransitions=[];}
 phase=count?'countdown':'playing';performance();
 let displayed=-1,lastCount=0;
 const tick=()=>{
  if(id!==run||paused)return;
  const now=audio.time;
  if(now>=end){finish();return;}
  if(now<notesAt&&count){
   const b=Math.max(1,Math.min(4,Math.floor((now-start)/beat)+1));
   if(b!==lastCount){lastCount=b;showPhase(`カウント <span class="beat">${b} / 4</span>`);}
  }else if(now>=notesAt){
   const active=fromIndex+Math.floor((now-notesAt)/duration);
   if(active!==displayed){
    displayed=active;index=active;phase='playing';performance();
    if(test)window.__viola.tempoTransitions.push({index,time:now});
   }
  }
  raf=requestAnimationFrame(tick);
 };
 raf=requestAnimationFrame(tick);
}
app.addEventListener('click',e=>{
 const t=e.target.closest('button');
 if(starting)return;
 if(audioBlocked&&!micProblem&&!['setup','finished'].includes(phase)&&!t?.dataset.action&&!t?.dataset.view){
  paused=false;resumePractice(++run,false);return;
 }
 if(!t)return;
 if(t.dataset.form){s.form=t.dataset.form;const ts=TONICS[s.form==='major'?'major':'minor'];if(!ts.some(([l,a])=>'CDEFGAB'.indexOf(l)==s.letter&&a==s.alter)){s.letter=0;s.alter=0}save();setup();}
 else if(t.dataset.tonic){s.letter=+t.dataset.letter;s.alter=+t.dataset.alter;save();setup();}
 else if(t.dataset.mode){s.mode=t.dataset.mode;save();setup();}
 else if(t.dataset.view){s.view=t.dataset.view;save();const practice=document.querySelector('.practice');if(practice){practice.classList.toggle('view-detail',s.view==='detail');practice.classList.toggle('view-score',s.view==='score');practice.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===s.view);b.setAttribute('aria-pressed',b.dataset.view===s.view)});if(s.view==='score')document.querySelector('[data-current]')?.closest('svg')?.scrollIntoView({block:'center'});if(s.mode==='mic'&&!paused&&['reference','tail'].includes(phase)&&scoreNoRef()){++run;audio.stop();resumePractice(run,false);}}else setup();} // お手本の途中で全体の楽譜へ移ったら、お手本を止めて同じ音をすぐ聞く
 else if(t.id==='start')start();
 else if(t.dataset.action){
  const a=t.dataset.action;++run;cancelAnimationFrame(raf);audio.stop();releaseWakeLock();
  if(a==='back'){mic.stop();paused=false;audioBlocked=false;micProblem=false;setup();}
  else if(a==='restart'){mic.stop();start();}
  else if(a==='pause'){
   paused=audioBlocked?false:!paused;
   if(paused){phase='paused';performance();}
   else resumePractice(run,false);
  }else if(a==='prev'||a==='next'){
   index=Math.max(0,Math.min(28,index+(a==='prev'?-1:1)));paused=false;performance();resumePractice(run,false);
  }
 }
});
app.addEventListener('change',e=>{if(starting)return;let k=e.target.dataset.setting;if(!k)return;let v=e.target.value;s[k]=['click','correction'].includes(k)?v==='true':['refTempo','refBeats','tempo','beats','a4','volume'].includes(k)?+v:v;if(['tempo','refTempo'].includes(k))s[k]=Math.max(30,Math.min(240,s[k]||60));save();if(k==='a4')setup()});
setup();
