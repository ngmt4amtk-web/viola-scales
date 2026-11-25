import {allKeys,buildScale} from '../scales.mjs';
import {renderScore} from '../score.mjs';
let total=0,ng=0;
function check(ok,msg){total++;if(!ok){ng++;console.error('NG',msg);}}
const sharp=[3,0,4,1,5,2,6],flat=[6,2,5,1,4,0,3];
check(allKeys().length===48,`音階数 ${allKeys().length}`);
for(const key of allKeys()){
 const scale=buildScale(...key), html=renderScore(scale,{width:402}), systems=html.match(/<svg\b[\s\S]*?<\/svg>/g)||[];
 let seen=0, shifts=0;
 const initial=scale.notes.find(n=>n.finger!==0)?.position; let position=initial;
 const expectedBands=scale.notes.filter(n=>{if(n.finger!==0)position=n.position;return position!==initial;}).map(n=>n.index);
 const bands=[...html.matchAll(/data-band-index="(\d+)"/g)].map(m=>+m[1]);
 check(JSON.stringify(bands)===JSON.stringify(expectedBands),`${scale.id}: 黄色帯 ${bands} != ${expectedBands}`);
 for(const count of [1,5,8,29]){
  const actual=[...renderScore(scale,{width:402,notesPerSystem:count}).matchAll(/data-band-index="(\d+)"/g)].map(m=>+m[1]);
  check(JSON.stringify(actual)===JSON.stringify(expectedBands),`${scale.id}: ${count}音/段の黄色帯`);
 }
 for(const svg of systems){
  const state=new Map();
  for(const m of svg.matchAll(/<g data-index="(\d+)" data-accidental="([^"]+)" data-step="(-?\d+)"[^>]*>([\s\S]*?)<\/g>(?=<g data-index|<\/svg>)/g)){
   const n=scale.notes[+m[1]], step=+m[3], sig=(scale.signature>0?sharp:flat).slice(0,Math.abs(scale.signature)).includes(n.letter)?Math.sign(scale.signature):0;
   let a=state.has(step)?state.get(step):sig;
   if(m[2]!=='none') a=({flat:-1,natural:0,sharp:1,doublesharp:2})[m[2]];
   state.set(step,a);check(a===n.alter,`${scale.id} ${n.index}: ${a} != ${n.alter}`);
   check(/data-role="finger"/.test(m[4]),`${scale.id} ${n.index}: 指なし`);
   shifts+=(m[4].match(/data-role="shift"/g)||[]).length;seen++;
  }
 }
 check(seen===29,`${scale.id}: 音 ${seen}`);
 check(shifts===scale.notes.filter(n=>n.shift).length,`${scale.id}: 移動 ${shifts}`);
 if(scale.id==='harmonic-Gs')check(html.includes('data-accidental="doublesharp"'),'嬰ト短調の重嬰');
 if(scale.id==='melodic-D')check([...html.matchAll(/data-index="(\d+)" data-accidental="natural"/g)].some(m=>+m[1]>14),'ニ短調の下行のナチュラル');
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
