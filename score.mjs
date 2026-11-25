import { C_CLEF_PATH, SHARP_PATH, FLAT_PATH, NATURAL_PATH, NOTEHEAD_PATH } from './glyphs.mjs';
import { STRING_COLORS } from './scales.mjs';

const sharpSteps = [7,4,8,5,2,6,3], flatSteps = [3,6,2,5,1,4,0];
const sharpLetters = [3,0,4,1,5,2,6], flatLetters = [6,2,5,1,4,0,3];
const paths = {sharp:SHARP_PATH, flat:FLAT_PATH, natural:NATURAL_PATH};
const names = {'-1':'flat', '0':'natural', '1':'sharp', '2':'doublesharp'};
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function signatureAlter(letter, signature) {
 const letters = signature > 0 ? sharpLetters : flatLetters;
 return letters.slice(0, Math.abs(signature)).includes(letter) ? Math.sign(signature) : 0;
}
function glyph(path,x,y,scale=10,fill='#28332f') {
 return `<path d="${path}" transform="translate(${x} ${y}) scale(${scale})" fill="${fill}"/>`;
}
function system(notes, scale, width, current, isOne = false) {
 const sig = scale.signature, gap=10, prefix=52+Math.abs(sig)*9, right=15;
 const maxStep=Math.max(8,...notes.map(n=>n.dia-24));
 // Preserve room for the highest finger and its position/shift annotation.
 const bottom=Math.max(126, 60+maxStep*gap/2), height=bottom+36;
 const y=step=>bottom-step*gap/2;
 const area=width-prefix-right, spacing=area/Math.max(notes.length,1);
 const xAt=i=>prefix+spacing*(i+.5);
 let out=`<svg class="score-system" data-system-start="${notes[0]?.index ?? 0}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(isOne?'現在の音':`${(notes[0]?.index??0)+1}音目からの楽譜`)}">`;
 // Open strings inherit the most recent fingered position, including across systems.
 const initialPosition=scale.notes.find(n=>n.finger!==0)?.position;
 let position=initialPosition;
 const positions=scale.notes.map(n=>{if(n.finger!==0) position=n.position; return position;});
 notes.forEach((n,i)=>{ if(positions[n.index]!==initialPosition) out+=`<rect data-band-index="${n.index}" x="${Math.max(prefix,xAt(i)-spacing/2)}" y="${bottom-47}" width="${spacing}" height="51" fill="#fff3bc" opacity=".65"/>`; });
 for(let i=0;i<5;i++) out+=`<path d="M8 ${bottom-i*gap}H${width-8}" stroke="#a0a9a4" stroke-width="1"/>`;
 out+=glyph(C_CLEF_PATH,13,y(4),gap);
 const steps=sig>0?sharpSteps:flatSteps;
 for(let i=0;i<Math.abs(sig);i++) out+=glyph(sig>0?SHARP_PATH:FLAT_PATH,44+i*9,y(steps[i]),gap);
 const state=new Map(); let firstFingered=true;
 notes.forEach((n,i)=>{
  const x=xAt(i), step=n.dia-24, yy=y(step), color=STRING_COLORS[n.string], prior=state.has(step)?state.get(step):signatureAlter(n.letter,sig);
  const acc=n.alter===prior?'none':names[n.alter]; state.set(step,n.alter);
  out+=`<g data-index="${n.index}" data-accidental="${acc}" data-step="${step}" data-center-x="${x}" data-center-y="${yy}" data-color="${color}">`;
  if(n.index===current)out+=`<circle cx="${x}" cy="${yy}" r="13" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-opacity=".6" stroke-width="2"/>`;
  if(n.shift){out+=`<path d="M${x-spacing*.48} ${bottom-43}V${bottom+4}" stroke="#202722" stroke-width="3"/>`;out+=`<g data-role="shift"><rect x="${x-12}" y="${yy-43}" width="27" height="15" rx="3" fill="#202722"/><text x="${x+1.5}" y="${yy-32}" text-anchor="middle" font-size="10" fill="white" font-weight="700">${n.shift.dir==='up'?'↗':'↘'}${n.shift.to}</text></g>`;}
  if(firstFingered && n.finger!==0){firstFingered=false;out+=`<text x="${x}" y="${bottom+23}" text-anchor="middle" font-size="9" fill="#555">${n.position}ポジ</text>`;}
  for(let s=10;s<=step;s+=2)out+=`<path d="M${x-9} ${y(s)}h18" stroke="#69736d" stroke-width="1.3"/>`;
  for(let s=-2;s>=step;s-=2)out+=`<path d="M${x-9} ${y(s)}h18" stroke="#69736d" stroke-width="1.3"/>`;
  if(acc==='doublesharp')out+=`<path d="M${x-20} ${yy-5}l9 10m0 -10l-9 10" stroke="#28332f" stroke-width="3.4"/>`;
  else if(acc!=='none')out+=glyph(paths[acc],x-19,yy,gap);
  out+=glyph(NOTEHEAD_PATH,x-6,yy,gap,color);
  out+=`<text data-role="finger" x="${x}" y="${yy-12}" text-anchor="middle" font-weight="700" font-size="12" fill="${color}">${esc(n.place?.short??n.finger)}</text>`;
  if(n.spacing?.kind==='kuttsuku')out+=`<text x="${x-spacing/2}" y="${Math.min(yy,y(notes[i-1]?.dia-24??step))-24}" text-anchor="middle" font-size="8" font-weight="700">くっつく</text>`;
  if(n.spacing?.kind==='hikuku')out+=`<text x="${x}" y="${yy-24}" text-anchor="middle" font-size="8" font-weight="700">ひくく</text>`;
  if(n.index===14)out+=`<path d="M${x+spacing/2} ${bottom-43}V${bottom+3}" stroke="#89938e" stroke-width="1"/>`;
  out+='</g>';
 });
 return out+'</svg>';
}
export function renderScore(scale,{width=402,current=-1,notesPerSystem}={}) {
 width=Math.max(250,Math.round(Number(width)||402));
 const prefix=52+Math.abs(scale.signature)*9;
 const most=Math.max(1,Math.min(29,notesPerSystem||Math.floor((width-prefix-15)/36)));
 // 段の数は幅で決め、音は段に均等に配る（最後の段が1音だけにならないように）
 const count=Math.ceil(scale.notes.length/Math.ceil(scale.notes.length/most));
 const out=[];for(let i=0;i<scale.notes.length;i+=count)out.push(system(scale.notes.slice(i,i+count),scale,width,current));
 return out.join('');
}
export function renderOne(note,scale){return system([note],scale,220,-1,true);}
