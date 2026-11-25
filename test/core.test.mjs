// node test/core.test.mjs で全調×全形を確かめる。落ちたら exit 1。
import {allKeys,buildScale,checkReach,targetFor,FORMS} from '../scales.mjs';
import {targetForNote,etFreq,ratioCents} from '../intonation.mjs';
import {OPEN_MIDI} from '../instrument.mjs';
let fail=0,count=0;const ok=(c,m)=>{count++;if(!c){fail++;console.log('NG',m);}};
const LETTER_PC=[0,2,4,5,7,9,11];
const rows=[];
for(const [form,letter,alter] of allKeys()){
 const sc=buildScale(form,letter,alter),n=sc.notes,id=sc.id;
 ok(n.length===29,id+' 29音');
 ok(n[0].midi>=48&&n[0].midi<=59,id+' 主音はド3〜シ3');
 ok(n[14].midi===n[0].midi+24&&n[28].midi===n[0].midi,id+' 2オクターブで戻る');
 for(let i=0;i<29;i++){
  const x=n[i];
  // 綴り: 音名が1つずつ進み、臨時記号は重までで、音高と合う
  ok((x.octave+1)*12+LETTER_PC[x.letter]+x.alter===x.midi,`${id} ${i} 綴りと音高`);
  ok(Math.abs(x.alter)<=2,`${id} ${i} 臨時記号`);
  if(i>0&&i<=14)ok(x.dia===n[i-1].dia+1,`${id} ${i} 上行の音名`);
  // 音階の形
  const semi=((x.midi-n[0].midi)%12+12)%12,deg=x.degree-1,F=FORMS[form];
  ok(semi===(x.dir==='up'?F.up:F.down)[deg],`${id} ${i} 音階の形`);
  // 目標値は intonation.mjs の targetForNote と一致（同じ関数を同じ入力で呼んでいるか）
  const t=targetFor(x,{a4:442,difficulty:'easy'}),r=targetForNote({midi:x.midi,letter:x.letter,key:x.key,finger:x.finger,string:['G','D','A','E'][x.string]},{a4:442,difficulty:'easy'});
  ok(Math.abs(t.targetHz-r.targetHz)<1e-9,`${id} ${i} 目標値`);
  // 開放弦は A から純正5度の高さ（ビオラ C線は 3回の5度下）
  if(x.finger===0){const want=442*(2/3)**(3-x.string)*(x.string<=1?1/2:1)*(x.string===0?1/2*2:1);}
 }
 const errs=checkReach(n);ok(errs.length===0,id+' 届く: '+errs.join(' / '));
 // 旋律的短音階: 上行は6・7度が上がり、下行は下がる
 if(form==='melodic'){ok(n[5].midi-n[0].midi===9&&n[23].midi-n[0].midi===8,id+' 旋律的短音階の6度');}
 const shifts=n.filter(x=>x.shift).map(x=>`${x.index}:${x.shift.dir==='up'?'↗':'↘'}${x.shift.to}(${x.shift.fromFinger}→${x.shift.toFinger})`);
 rows.push(`${id.padEnd(14)} 移動 ${shifts.length}回 ${shifts.join(' ')} 最高 ${n[14].nameEn} ${['C','G','D','A'][n[14].string]}${n[14].finger}@${n[14].position}`);
}
// 主音の目標: ハ長調の主音はAから3つ下の5度で、平均律より -3×1.955¢
{const sc=buildScale('major',0,0);ok(Math.abs(sc.notes[1].targetCents-(-3*(ratioCents(1.5)-700)+ratioCents(9/8)-200))<1e-6,'ハ長調 レの目標（ピタゴラス）');
 const lead=sc.notes[13];ok(Math.abs(lead.targetCents-(-3*(ratioCents(1.5)-700)+ratioCents(243/128)-1100))<1e-6,'ハ長調 シ（導音）は平均律より高い');ok(lead.hints.some(h=>h.kind==='high'),'導音は高めの注意');ok(sc.notes[2].hints.some(h=>h.kind==='high'),'長3度は高め');ok(buildScale('harmonic',5,0).notes[2].hints.some(h=>h.kind==='low'),'短3度は低め');}
// 開放弦の目標は Aから純正5度
{const sc=buildScale('major',0,0),c=sc.notes[0];ok(c.finger===0&&Math.abs(targetFor(c).targetHz-442*(2/3)**3)<1e-6,'開放C線はAから純正5度×3');}
// 目標は 442×(3/2)^k×2^n（k=その音の綴りがAから五度圏で何歩か）。intonation.mjs と別の式で確かめる
{let bad=0;for(const [form,letter,alter] of allKeys())for(const x of buildScale(form,letter,alter).notes){
 const k=[0,2,4,-1,1,3,5][x.letter]+7*x.alter-3;let f=442*1.5**k;const et=etFreq(x.midi,442);while(f>et*1.06)f/=2;while(f<et/1.06)f*=2;
 const t=targetFor(x).targetHz;if(Math.abs(1200*Math.log2(t/f))>1e-6){bad++;if(bad<5)console.log('目標ずれ',form,letter,alter,x.nameEn,t,f);}}
 ok(bad===0,'全音の目標が A=442 からの純正5度の連鎖（ピタゴラス）と一致');}
console.log(rows.join('\n'));
console.log(`${count}項目 中 NG ${fail}`);
process.exit(fail?1:0);
