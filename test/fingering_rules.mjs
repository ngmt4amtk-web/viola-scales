// node test/fingering_rules.mjs — 運指の表とは別の物差しで「上りは0・下りは押さえる」を数える。
// 開放弦と同じ高さの音（C3・G3・D4・A4）が、上行で0か、下行で下の弦の4か。例外は一覧に出す（落とさない）。
// --strict を付けると、例外の許可リストに無い物があれば exit 1。
import {allKeys,buildScale} from '../scales.mjs';
import {OPEN_MIDI} from '../instrument.mjs';
const S=['C','G','D','A'];
const strict=process.argv.includes('--strict');
// 資料で確かめた例外（調ID:音の番号:理由）。ここに無い例外は --strict で落ちる。
const ALLOW=new Set((process.env.ALLOW||'').split(',').filter(Boolean));
let upOpen=0,upOther=0,downStopped=0,downOpen=0;const ex=[];
for(const [form,l,a] of allKeys()){
 const sc=buildScale(form,l,a);
 for(const n of sc.notes){
  const s=OPEN_MIDI.indexOf(n.midi);if(s<0)continue;
  const tag=`${sc.id}:${n.index}`;
  const where=`${S[n.string]}${n.finger}@${n.position}`;
  if(n.dir==='up'){if(n.finger===0)upOpen++;else{upOther++;ex.push(`${tag} 上行 ${n.nameEn} を ${where}`);}}
  else{
   const last=n.index===28;
   if(n.finger===4&&n.string===s-1)downStopped++;
   else{downOpen++;ex.push(`${tag} 下行 ${n.nameEn} を ${where}${last?'（最後の主音）':''}`);}
  }
 }
}
console.log(`上行の開放弦の音: 0=${upOpen} それ以外=${upOther}`);
console.log(`下行の開放弦の音: 下の弦の4=${downStopped} それ以外=${downOpen}`);
// 旋律的短音階の下行は自然的短音階と同じ音なので、運指も同じでなければならない（12の主音すべて）
// 例外: 嬰ハ旋律的短音階の15音目（シ4）は、頂上 ド♯5 を取った半ポジションの手のまま 2 で降りる（折り返しで手の形を変えない）
const MEL_OK=new Set(['melodic-Cs:15']);
let melBad=0;
for(const [form,l,a] of allKeys()){if(form!=='melodic')continue;
 const m=buildScale('melodic',l,a).notes,n=buildScale('natural',l,a).notes;
 for(let i=15;i<29;i++){const x=m[i],y=n[i];if((x.string!==y.string||x.finger!==y.finger||x.position!==y.position)&&!MEL_OK.has(buildScale('melodic',l,a).id+':'+i)){melBad++;console.log(`NG 旋律的の下行が自然的と違う ${buildScale('melodic',l,a).id} ${i} ${x.nameEn}`);}}}
console.log(`旋律的短音階の下行＝自然的短音階の下行: 違い ${melBad}`);
if(melBad)process.exitCode=1;
const bad=ex.filter(e=>!ALLOW.has(e.split(' ')[0]));
console.log('例外:\n'+ex.join('\n'));
if(strict&&bad.length){console.log('許可の無い例外 '+bad.length);process.exit(1);}
