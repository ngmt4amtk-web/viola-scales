import {allKeys,buildScale} from '../scales.mjs';
import {renderOne,renderScore} from '../score.mjs';
let total=0,ng=0;
function check(ok,msg){total++;if(!ok){ng++;console.error('NG',msg);}}
const sharp=[3,0,4,1,5,2,6],flat=[6,2,5,1,4,0,3];
const accidentalAlter={flat:-1,natural:0,sharp:1,doublesharp:2};
const signatureAlter=(scale,n)=>(scale.signature>0?sharp:flat).slice(0,Math.abs(scale.signature)).includes(n.letter)?Math.sign(scale.signature):0;
check(allKeys().length===48,`音階数 ${allKeys().length}`);
let harmonicTurns=0;
for(const key of allKeys()){
 const scale=buildScale(...key), html=renderScore(scale,{width:402}), systems=html.match(/<svg\b[\s\S]*?<\/svg>/g)||[];
 check(!html.includes('NaN'),`${scale.id}: 全体譜に NaN`);
 for(const width of [338,1280]){
  check(!renderScore(scale,{width}).includes('NaN'),`${scale.id}: 幅 ${width} の全体譜に NaN`);
 }
 for(const note of scale.notes){
  const single=renderOne(note,scale);
  check(!single.includes('NaN'),`${scale.id} ${note.index}: 単音譜に NaN`);
  if(note.spacing?.kind==='kuttsuku'){
   const center=single.match(/data-center-x="([^"]+)"/)?.[1];
   const label=single.match(/<text x="([^"]+)"[^>]*>くっつく<\/text>/)?.[1];
   check(center!==undefined && label===center,`${scale.id} ${note.index}: 単音譜の「くっつく」が音の真上`);
  }
 }
 let seen=0, shifts=0;
 const initial=scale.notes.find(n=>n.finger!==0)?.position; let position=initial;
 const expectedBands=scale.notes.filter(n=>{if(n.finger!==0)position=n.position;return position!==initial;}).map(n=>n.index);
 const bands=[...html.matchAll(/data-band-index="(\d+)"/g)].map(m=>+m[1]);
 check(JSON.stringify(bands)===JSON.stringify(expectedBands),`${scale.id}: 黄色帯 ${bands} != ${expectedBands}`);
 for(const count of [1,5,8,29]){
  const layout=renderScore(scale,{width:402,notesPerSystem:count});
  check(!layout.includes('NaN'),`${scale.id}: ${count}音/段の全体譜に NaN`);
  const actual=[...layout.matchAll(/data-band-index="(\d+)"/g)].map(m=>+m[1]);
  check(JSON.stringify(actual)===JSON.stringify(expectedBands),`${scale.id}: ${count}音/段の黄色帯`);
 }
 for(const svg of systems){
  const state=new Map();
  for(const m of svg.matchAll(/<g data-index="(\d+)" data-accidental="([^"]+)" data-step="(-?\d+)"[^>]*>([\s\S]*?)<\/g>(?=<g data-index|<\/svg>)/g)){
   const n=scale.notes[+m[1]], step=+m[3];
   if(n.shift)state.clear();
   const prior=state.has(step)?state.get(step):signatureAlter(scale,n);
   const a=m[2]==='none'?prior:accidentalAlter[m[2]];
   state.set(step,a);check(a===n.alter,`${scale.id} ${n.index}: ${a} != ${n.alter}`);
   check((m[2]==='none')===(n.alter===prior),`${scale.id} ${n.index}: 臨時記号の有無`);
   if(n.index===14)state.clear();
   check(/data-role="finger"/.test(m[4]),`${scale.id} ${n.index}: 指なし`);
   shifts+=(m[4].match(/data-role="shift"/g)||[]).length;seen++;
  }
 }
 check(seen===29,`${scale.id}: 音 ${seen}`);
 check(shifts===scale.notes.filter(n=>n.shift).length,`${scale.id}: 移動 ${shifts}`);
 if(scale.id==='melodic-D'){
  const unbroken=renderScore(scale,{notesPerSystem:29});
  check(scale.notes[15].nameEn==='C5' && /data-index="15" data-accidental="none"/.test(unbroken),
   '旋律的ニ短調の下行 C5 は調号のナチュラル');
  check(scale.notes[16].nameEn==='B♭4' && /data-index="16" data-accidental="none"/.test(unbroken),
   '旋律的ニ短調の下行 B♭4 は調号の♭');
 }
 if(scale.form==='harmonic'){
  // Keep the ascending and descending sevenths on the same system.
  const unbroken=renderScore(scale,{notesPerSystem:29});
  const descending=scale.notes[15];
  const mark=unbroken.match(/data-index="15" data-accidental="([^"]+)"/)?.[1];
  check(descending.degree===7 && accidentalAlter[mark]===descending.alter &&
    descending.alter===signatureAlter(scale,descending)+1,`${scale.id}: 折り返しの第7音 ${descending.nameEn} に ${mark}`);
  if(scale.id==='harmonic-D')check(descending.nameEn==='C♯5' && mark==='sharp','ニ短調の下行 C♯5 に♯');
  if(scale.id==='harmonic-Gs')check(descending.nameEn==='F𝄪5' && mark==='doublesharp','嬰ト短調の下行 F𝄪5 に重嬰');
  harmonicTurns++;
 }
}
check(harmonicTurns===12,`和声的短音階の折り返し ${harmonicTurns} 調`);
{
 const scale=buildScale('harmonic',1,0); // D minor
 const raised=scale.notes[13];
 const notes=[
  {...raised,index:0,shift:undefined},
  {...raised,index:1,shift:undefined},
  {...raised,index:2,shift:{dir:'up',to:3}}
 ];
 const html=renderScore({...scale,notes},{notesPerSystem:29});
 const marks=[...html.matchAll(/data-accidental="([^"]+)"/g)].map(m=>m[1]);
 check(marks.join(',')==='sharp,none,sharp',`移動線の前後の C♯5 ${marks}`);
}
// Opening and intervening open strings inherit position; returning to the initial position clears the band.
{
 const scale=buildScale(...allKeys()[0]);
 const notes=scale.notes.map((n,i)=>({...n,finger:[0,1,0,2,0,1,0][i]??1,position:[0,1,0,3,0,1,0][i]??1}));
 const html=renderScore({...scale,notes},{notesPerSystem:2});
 const bands=[...html.matchAll(/data-band-index="(\d+)"/g)].map(m=>+m[1]);
 check(JSON.stringify(bands)==='[3,4]',`開放弦と復帰の黄色帯 ${bands}`);
}
console.log(`${total}項目 中 NG ${ng}`);if(ng)process.exitCode=1;
