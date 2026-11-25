// ビオラ2オクターブ音階の中心。綴り・音高・指番号・音程の目標・注意点をここ1か所で作る。
// 音程の目標は intonation.mjs（Answer Tuner の IntonationMath の移植）の targetForNote をそのまま使う。
import {OPEN_MIDI,OPEN_LETTERS} from './instrument.mjs';
import {tonalKey,targetForNote,etFreq,mod12,intervalCentsFromET} from './intonation.mjs';
import {fingeringFor,FINGERING_SOURCE} from './fingerings.mjs';
export {FINGERING_SOURCE};

export const STRING_NAMES=['C','G','D','A'];
export const STRING_KANA=['ド','ソ','レ','ラ'];
// 弦の色: C は 2026-11-09 本人指定の茶。G・D・A は 2026-10-28 に決めた指番号の色（G 青・D オレンジ・A 赤）。
export const STRING_COLORS=['#8B5A2B','#1F5FD1','#EE8A00','#CC1030'];
export const STRING_SOFT=['#f3e9e1','#e6eefb','#fff0dc','#fbe6ea'];
const LETTER_PC=[0,2,4,5,7,9,11];
const KANA=['ド','レ','ミ','ファ','ソ','ラ','シ'];
const EN=['C','D','E','F','G','A','B'];
// 開放弦の全音階番号（オクターブ×7＋音名）。C3=21・G3=25・D4=29・A4=33。
export const OPEN_DIATONIC=OPEN_MIDI.map((m,i)=>Math.floor(m/12-1)*7+OPEN_LETTERS[i]);

export const FORMS={
 major:{label:'長調',short:'長',up:[0,2,4,5,7,9,11],down:[0,2,4,5,7,9,11],keyForm:'major'},
 harmonic:{label:'和声的短音階',short:'和声',up:[0,2,3,5,7,8,11],down:[0,2,3,5,7,8,11],keyForm:'harmonicMinor'},
 melodic:{label:'旋律的短音階',short:'旋律',up:[0,2,3,5,7,9,11],down:[0,2,3,5,7,8,10],keyForm:'melodicMinor'},
 natural:{label:'自然的短音階',short:'自然',up:[0,2,3,5,7,8,10],down:[0,2,3,5,7,8,10],keyForm:'naturalMinor'}
};
// 主音の綴り。長調12・短調12。異名同音は調号の少ない方（F♯長調は6♯、変ホ短調は6♭）。
export const TONICS={
 major:[['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],['F',1],['G',0],['A',-1],['A',0],['B',-1],['B',0]],
 minor:[['C',0],['C',1],['D',0],['E',-1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['B',-1],['B',0]]
};
const ACC={'-2':'𝄫','-1':'♭','0':'','1':'♯','2':'𝄪'};
export function noteName(letter,alter){return KANA[letter]+ACC[alter];}
export function noteNameEn(letter,alter,octave){return EN[letter]+ACC[alter]+(octave??'');}
export function keyId(form,letter,alter){return `${form}-${EN[letter]}${alter<0?'b':alter>0?'s':''}`;}

// 調号（五度圏の数）: 長調は主音から、短調は平行長調（短3度上）から。
const MAJOR_FIFTHS_FROM_C=(letter,alter)=>[0,2,4,-1,1,3,5][letter]+7*alter;
export function keySignature(form,letter,alter){return form==='major'?MAJOR_FIFTHS_FROM_C(letter,alter):MAJOR_FIFTHS_FROM_C(letter,alter)-3;}

export function keyLabel(form,letter,alter){
 const name=noteName(letter,alter);
 return form==='major'?`${name}長調`:`${name}短調（${FORMS[form].label}）`;
}

// 1つの調の29音（上行15・下行14）を作る。主音はド3〜シ3の音域から。
export function buildScale(form,letter,alter){
 const F=FORMS[form];if(!F)throw new Error('form '+form);
 const tonicPc=mod12(LETTER_PC[letter]+alter);
 const tonicMidi=48+tonicPc; // C3〜B3
 const tonicDia=3*7+letter;
 // 主音の五度圏の位置（Aから）。長短どちらも主音そのものの綴りで決まる（Answer Tuner の tonicFifthsFromA）。
 const key=tonalKey(tonicPc,F.keyForm,MAJOR_FIFTHS_FROM_C(letter,alter)-3);
 const fing=fingeringFor(form,keyId(form,letter,alter).split('-')[1]);
 if(!fing)throw new Error('運指がない: '+keyId(form,letter,alter));
 const notes=[];
 for(let i=0;i<29;i++){
  const up=i<=14,deg=up?i:28-i; // 0..14
  const degIn=deg%7,oct=Math.floor(deg/7);
  const semis=(up?F.up:F.down)[degIn]+12*oct;
  const midi=tonicMidi+semis,dia=tonicDia+deg,l=dia%7;
  const al=midi-(Math.floor(dia/7)+1)*12-LETTER_PC[l];
  const f=(up?fing.up:fing.down)[deg]; // 下行は上行の道を戻る（旋律的短音階は自然的短音階の道）
  notes.push({index:i,dir:up?'up':'down',degree:degIn+1,midi,dia,letter:l,alter:al,octave:Math.floor(dia/7),
   name:noteName(l,al),nameEn:noteNameEn(l,al,Math.floor(dia/7)),string:f.s,finger:f.f,position:f.p,key});
 }
 annotate(notes);
 return {id:keyId(form,letter,alter),form,letter,alter,label:keyLabel(form,letter,alter),signature:keySignature(form,letter,alter),key,notes,source:FINGERING_SOURCE};
}

// その音の目標（Hz・平均律からのセント・合格の幅）。開放弦は A から純正5度で取った開放弦の高さ。
export function targetFor(note,{a4=442,difficulty='easy'}={}){
 return targetForNote({midi:note.midi,letter:note.letter,key:note.key,finger:note.finger,string:['G','D','A','E'][note.string]},{a4,difficulty});
}

// 運指が楽器の上で届くか。C・G・D線と A線の最初の組は、そのポジションで各指が届く半音の範囲。
// A線で移動した後の組は、組の1の指から見た幅。tools/gen_fingerings.mjs と同じ物差し。
const RANGE1={1:[1,2],2:[2,4],3:[4,6],4:[5,7]};
const OFF={1:[0],2:[1,2,3],3:[2,3,4,5],4:[4,5,6]};
export function checkReach(notes){
 const errs=[];const base=notes.find(n=>n.finger!==0)?.position??1;
 for(let i=0;i<notes.length;i++){
  const n=notes[i],x=n.midi-OPEN_MIDI[n.string];
  if(x<0){errs.push(i+': 開放弦より低い');continue;}
  if(n.finger===0){if(x!==0)errs.push(i+': 開放弦の音でない');continue;}
  if(n.position===base){const [lo,hi]=RANGE1[n.finger],d=(base-1)*2;if(x<lo+d||x>hi+d)errs.push(`${i}: ${n.nameEn} ${STRING_NAMES[n.string]}${n.finger} は第${base}ポジションで届かない（${x}半音）`);continue;}
  // 同じ弦・同じポジションの1の指を探す
  const one=notes.find(m=>m.string===n.string&&m.position===n.position&&m.finger===1&&m.dir===n.dir);
  if(!one){errs.push(i+': 移動先に1の指がない');continue;}
  const off=n.midi-one.midi;if(!OFF[n.finger].includes(off))errs.push(`${i}: ${n.nameEn} ${n.finger}の指は1から${off}半音で届かない`);
  // ポジションの番号＝1の指の音名が開放弦から何度上か
  const steps=((one.letter-OPEN_LETTERS[n.string])%7+7)%7+(one.midi-OPEN_MIDI[n.string]>=12?7:0);
  if(steps!==n.position)errs.push(`${i}: ポジションの番号が音名と合わない（${steps}と${n.position}）`);
 }
 // 同じ弦・同じポジションでは、音が上がれば指も上がる
 for(const a of notes)for(const b of notes)if(a.dir===b.dir&&a.finger>0&&b.finger>0&&a.string===b.string&&a.position===b.position&&b.midi>a.midi&&b.finger<=a.finger)errs.push(`${a.nameEn}(${a.finger}) と ${b.nameEn}(${b.finger}) の指の順`);
 return errs;
}

// 指の置き場所（高い指・低い指）。czardas-practice-v2 の score.mjs placement() と同じ決め方:
// 第1ポジションの基本の並びは開放弦から [0,2,4,5,7] 半音（1=全音上・2=長3度・3=完全4度・4=完全5度）。2が長3度の所は「高い2」。
// 第2ポジション以上は、その指が押さえる音名の幹音（♯♭なし）を基本にして、半音上なら高い・下なら低い。
const LETTER_PC2=[0,2,4,5,7,9,11];
export function placement(n){
 if(n.finger===0)return {short:'0',word:'開放弦',offset:0};
 let offset;
 if(n.position===1)offset=(n.midi-OPEN_MIDI[n.string])-[0,2,4,5,7][n.finger];
 else{const step=OPEN_DIATONIC[n.string]+n.position+n.finger-1;offset=n.midi-((Math.floor(step/7)+1)*12+LETTER_PC2[step%7]);}
 if(n.position===1&&n.finger===2&&offset===0)return {short:'2↑',word:'高い2',offset:1};
 if(!offset)return {short:String(n.finger),word:`${n.finger}の指`,offset:0};
 return {short:`${n.finger}${offset<0?'↓':'↑'}`,word:`${offset<0?'低い':'高い'}${n.finger}`,offset};
}
const isOpenName=n=>n.alter===0&&OPEN_LETTERS.includes(n.letter);

// 注意点を作る。高め・低め（目標と平均律の差）／くっつく・離す（同じ弦・同じ手の位置の隣の指）／ひくく（開放弦と1の半音）／移動。
export function annotate(notes){
 for(let i=0;i<notes.length;i++){
  const n=notes[i],prev=notes[i-1],next=notes[i+1];
  const t=targetForNote({midi:n.midi,letter:n.letter,key:n.key,finger:n.finger,string:['G','D','A','E'][n.string]},{a4:442,difficulty:'easy'});
  n.targetCents=t.targetCents; // 平均律からの差（セント）
  const hints=[];
  // 手の位置の移動（前の音から）
  n.shift=null;
  if(prev&&n.finger!==0&&prev.finger!==0&&n.position!==prev.position){n.shift={from:prev.position,to:n.position,dir:n.position>prev.position?'up':'down',fromFinger:prev.finger,toFinger:n.finger,sameString:prev.string===n.string};}
  else if(prev&&n.finger!==0&&prev.finger===0){const q=lastFingered(notes,i-1);if(q&&q.position!==n.position)n.shift={from:q.position,to:n.position,dir:n.position>q.position?'up':'down',fromFinger:q.finger,toFinger:n.finger,sameString:false,viaOpen:true};}
  if(n.shift)hints.push({kind:'shift',text:`${n.shift.dir==='up'?'↗':'↘'}${n.shift.to}ポジへ移動（${n.shift.fromFinger}→${n.shift.toFinger}）`});
  // 指の置き場所（高め・低めに置く指）
  n.place=placement(n);
  if(n.finger!==0&&n.place.offset)hints.push({kind:n.place.offset>0?'placeHigh':'placeLow',text:`${n.place.word}（${n.place.offset>0?'高め':'低め'}に置く）`});
  // 隣の指との幅（同じ弦・同じポジション・指が隣り合う時）
  n.spacing=null;
  if(prev&&prev.string===n.string&&!n.shift){
   const gap=Math.abs(n.midi-prev.midi),lo=n.midi>prev.midi?prev:n,hi=n.midi>prev.midi?n:prev;
   if(lo.finger===0&&hi.finger===1&&gap===1)n.spacing={kind:'hikuku',text:'1は開放弦に寄せて ひくく'};
   else if(lo.finger>0&&hi.finger===lo.finger+1){
    if(gap===1)n.spacing={kind:'kuttsuku',text:`${lo.finger}と${hi.finger}は くっつく（半音）`};
    else if(gap===2)n.spacing={kind:'hanasu',text:`${lo.finger}と${hi.finger}は 離す（全音）`};
    else if(gap===3)n.spacing={kind:'ookiku',text:`${lo.finger}と${hi.finger}は 大きく離す（増2度）`};
   }
  }
  if(n.spacing)hints.push({kind:n.spacing.kind,text:n.spacing.text});
  // 高め・低め: 主音から見た音程を、平均律の同じ音程と比べる（旋律の目標＝ピタゴラスの音程）。
  // 目標の高さそのものは主音の位置（Aから5度で数えた所）も足した targetCents。
  const semiFromTonic0=mod12(n.midi-n.key.tonicPitchClass);
  n.tendency=intervalCentsFromET(semiFromTonic0).pyth;
  if(n.finger===0)hints.push({kind:'open',text:'開放弦（Aから純正5度で調弦した高さ）'});
  else if(semiFromTonic0===0)hints.push({kind:'tonic',text:n.index===0?'主音: ここが音階の土台':n.index===28?'主音: 最初の主音と同じ高さに戻る':'主音: 最初の主音とオクターブで合わせる'});
  else{const c=n.tendency,v=Math.round(Math.abs(c));
   const iv=['','短2度','長2度','短3度','長3度','完全4度','増4度','完全5度','短6度','長6度','短7度','長7度'][semiFromTonic0];
   if(c>=5)hints.push({kind:'high',text:`音程は高め: 主音からの${iv}を平均律より+${v}¢広く`});
   else if(c>=2)hints.push({kind:'high',text:`音程は少し高め: 主音からの${iv}を+${v}¢広く`});
   else if(c<=-5)hints.push({kind:'low',text:`音程は低め: 主音からの${iv}を平均律より${v}¢狭く`});
   else if(c<=-2)hints.push({kind:'low',text:`音程は少し低め: 主音からの${iv}を${v}¢狭く`});
   else hints.push({kind:'even',text:`主音からの${iv}は平均律とほぼ同じ幅`});}
  // 導音（長7度）は主音へ寄せる
  const semiFromTonic=mod12(n.midi-n.key.tonicPitchClass);
  if(semiFromTonic===11&&n.dir==='up')hints.push({kind:'lead',text:'導音: 次の主音へ寄せて高く'});
  // 開放弦と同じ音（オクターブ違いも）は響きで確かめられる
  if(n.finger!==0&&isOpenName(n))hints.push({kind:'ring',text:`開放${EN[n.letter]}線と響く高さ（響きで確かめる）`});
  n.hints=hints;
 }
}
function lastFingered(notes,i){for(;i>=0;i--)if(notes[i].finger!==0)return notes[i];return null;}

export function allKeys(){
 const out=[];
 for(const [l,a] of TONICS.major.map(([n,a])=>[EN.indexOf(n),a]))out.push(['major',l,a]);
 for(const form of ['harmonic','melodic','natural'])for(const [l,a] of TONICS.minor.map(([n,a])=>[EN.indexOf(n),a]))out.push([form,l,a]);
 return out;
}
export {etFreq};
