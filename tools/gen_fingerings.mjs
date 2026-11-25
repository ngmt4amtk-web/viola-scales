// 運指の表（fingerings.mjs）を作る道具。出した表は手で1行ずつ直せる。
// もう一度流すと fingerings.mjs を書き直すので、手で直した後は別名に出して見比べる: node tools/gen_fingerings.mjs /tmp/x.mjs
//
// 型（2026-11-26 決定。フレッシュ・小野アンナの本の運指の写しではない。本はこの機械に無い）:
// 1. 第1ポジションから始め、C・G・D線はそのポジションのまま弦を渡る（シ♭・シで始まる調だけ、主音を1の指で取る第2ポジションから。
//    第2ポジションでは4の指が次の弦の開放弦より1音上まで届く＝G線のE♭4・E4）。
//    1本の弦に、そのポジションで届く音を4つまで置く（4の指は次の弦の開放弦と同じ音まで）。開放弦は、主音がド・ソの時と、
//    1本の弦に収まらない音が次の弦の開放弦に当たる時だけ（例 ホ長調・ホ短調・嬰ヘ短調の途中のA線やD線の開放弦）。
//    出典: tonebase のビオラ音階ガイド（ド線から1の指で始まる調は2オクターブの途中で移動が要らない。検索結果の抜粋のみで本体は未照合）
// 2. A線では、フレッシュの上の弦の型「1-2-移動-1-2」で上がる（2→1で移動）。
//    A線の音が4つ以上なら2つずつの組に分け（4音でも分ける。ミ♭・ミの調は届くが移動を入れる）、最後の組だけ2〜4音にする。
//    A線が5音以上なら最後の組は3か4音。A線が3音以下なら移動しない（ド・レ♭・レの長調、ド・ド♯・レの短調）。
//    出典: violinist.com の Mark Rush のブログが Flesch の E線の型として書く、と検索結果の抜粋にある（2026-11-26 にページ本体は読めず未照合）
// 3. 下行は上行と同じ道を戻る（Cora Cooper の運指表で長調は「下行も同じ」）。旋律的短音階の下行は6・7度が下がるので、
//    自然的短音階を同じ型で作った道（melodicDown-）を逆にたどる（Cooper の表でも旋律的短音階は上下で運指が違う）。
// ポジションの番号は、1の指の音名が開放弦から何度上か（A線でD＝第3ポジション）。C・G・D線は全部第1ポジション。
import {writeFileSync} from 'node:fs';
import {OPEN_MIDI,OPEN_LETTERS} from '../instrument.mjs';
const SN=['C','G','D','A'];
const LETTER_PC=[0,2,4,5,7,9,11];
const EN=['C','D','E','F','G','A','B'];
const FORMS={major:[0,2,4,5,7,9,11],harmonic:[0,2,3,5,7,8,11],melodic:[0,2,3,5,7,9,11],melodicDown:[0,2,3,5,7,8,10]};
const tonics={major:[['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],['F',1],['G',0],['A',-1],['A',0],['B',-1],['B',0]],
 minor:[['C',0],['C',1],['D',0],['E',-1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['B',-1],['B',0]]};
// 第1ポジションで各指が届く所（開放弦から何半音か）。第2ポジションは全部+2。
// 1: 低い1・ふつうの1／2: 1にくっつく2〜高い2／3: 低い3〜高い3／4: 低い4〜ふつうの4（次の弦の開放弦と同じ音）
const RANGE1={1:[1,2],2:[2,4],3:[4,6],4:[5,7]};
const CENTER={1:1.6,2:3.5,3:5.3,4:7};
const OFF={2:[1,2,3],3:[2,3,4,5],4:[4,5,6]}; // 1の指から見た幅（A線の組）
const inRange=(x,f,p)=>{const [lo,hi]=RANGE1[f],d=(p-1)*2;return x>=lo+d&&x<=hi+d;};
// その弦で、並んだ音に増える順の指を付ける。届かなければ null。
function fingersFor(xs,p,minFinger=1){
 let best=null;
 const rec=(i,from,acc)=>{
  if(i===xs.length){
   let cost=0;for(let k=0;k<xs.length;k++)cost+=Math.abs(xs[k]-CENTER[acc[k]]-(p-1)*2);
   for(let k=1;k<xs.length;k++){const d=xs[k]-xs[k-1],df=acc[k]-acc[k-1];if(df===1&&(d<1||d>3))return;if(df>=2&&d<2)return;}
   if(!best||cost<best.cost)best={cost,f:[...acc]};return;
  }
  for(let f=from;f<=4;f++)if(inRange(xs[i],f,p))rec(i+1,f+1,[...acc,f]);
 };
 rec(0,minFinger,[]);
 return best?best.f:null;
}
function groupsFor(r){
 if(r<=3)return [r];
 if(r===4)return [2,2];
 const g=[];let left=r;while(left>4){g.push(2);left-=2;}
 if(left<3){g.pop();left+=2;}
 g.push(left);return g;
}
function plan(midis,letters){
 const out=new Array(15);let i=0;
 const s0=midis[0]>=OPEN_MIDI[1]?1:0;
 // シ♭・シで始まる調は、主音を1の指で取る第2ポジションから（A線の移動を2回までにするため）
 const p0=s0===1&&midis[0]-OPEN_MIDI[1]>=3?2:1;
 for(let s=s0;s<3;s++){
  const o=OPEN_MIDI[s];
  if(midis[i]===o){out[i]={s,f:0,p:0};i++;}
  // この弦に置ける一番多い音の数（4まで）を取る
  let took=0;
  for(let k=Math.min(4,15-i);k>=1;k--){
   const xs=midis.slice(i,i+k).map(m=>m-o);
   if(xs.some(x=>x<1))continue;
   const fs=fingersFor(xs,p0);
   if(fs){fs.forEach((f,j)=>out[i+j]={s,f,p:p0});took=k;break;}
  }
  if(!took&&!(out[i-1]&&out[i-1].s===s))throw new Error('弦に置けない '+SN[s]+' '+midis);
  i+=took;
 }
 // A線: 最初の組は下の弦と同じポジション（届く指から）、あとはフレッシュの「1-2-移動-1-2」
 const o=OPEN_MIDI[3];
 if(midis[i]===o){out[i]={s:3,f:0,p:0};i++;}
 // 最初の組: 今のポジションで届く所まで（最大で4の指まで）。ただしフレッシュの型で2音で区切る
 const r=15-i;
 const groups=groupsFor(r);
 let first=true;
 for(const g of groups){
  const st=i,xs=midis.slice(st,st+g).map(m=>m-o);
  let p,fs;
  if(first){p=p0;fs=fingersFor(xs,p0);if(!fs)throw new Error('A線の最初の組が届かない '+midis);}
  else{p=((letters[st]-OPEN_LETTERS[3])%7+7)%7+(xs[0]>=12?7:0);fs=xs.map((x,k)=>k+1);
   for(let k=1;k<g;k++)if(!OFF[fs[k]].includes(xs[k]-xs[0]))throw new Error('A線の組が届かない '+midis);}
  for(let k=0;k<g;k++)out[st+k]={s:3,f:fs[k],p};
  i+=g;first=false;
 }
 if(out.some(n=>!n))throw new Error('抜け '+midis);
 return out;
}
const tok=n=>`${SN[n.s]}${n.f}@${n.p}`;
let src=`// ビオラ2オクターブ音階の運指（上行15音。下行は上行を逆にたどる）。tools/gen_fingerings.mjs が作った表。\n// 1音 = 弦 指 @ ポジション（0は開放弦）。例 A1@3 = A線・1の指・第3ポジション。手で直す時はこの行を直す。\n// 型の決め方と出典は tools/gen_fingerings.mjs の頭に書いた。\nconst T={\n`;
for(const kind of ['major','harmonic','melodic','melodicDown'])for(const [L,a] of tonics[kind==='major'?'major':'minor']){
 const letter=EN.indexOf(L),tonic=48+((LETTER_PC[letter]+a+12)%12),form=FORMS[kind];
 const midis=Array.from({length:15},(_,i)=>tonic+form[i%7]+12*Math.floor(i/7));
 const letters=Array.from({length:15},(_,i)=>(letter+i)%7);
 src+=` '${kind}-${L}${a<0?'b':a>0?'s':''}':'${plan(midis,letters).map(tok).join(' ')}',\n`;
}
src+=`};\nconst SI={C:0,G:1,D:2,A:3};\nconst parse=t=>{const m=/^([CGDA])([0-4])@(\\d+)$/.exec(t);if(!m)throw new Error('運指の字 '+t);return {s:SI[m[1]],f:+m[2],p:+m[3]};};\nexport const FINGERING_SOURCE='第1ポジション（シ♭・シで始まる調は第2ポジション）で弦を渡り、A線はフレッシュの型とされる「1-2-移動-1-2」（原典と未照合）。下行は同じ道（旋律的短音階の下行は自然的短音階の道）。本の運指の写しではない';\nexport const FINGERINGS=Object.fromEntries(Object.entries(T).map(([k,v])=>{const up=v.trim().split(/\\s+/).map(parse);if(up.length!==15)throw new Error(k+' は15音でない');return [k,{up}];}));\nexport const fingeringFor=(form,id)=>{const up=FINGERINGS[(form==='natural'?'melodicDown':form)+'-'+id];if(!up)return null;const down=form==='melodic'?FINGERINGS['melodicDown-'+id]:up;return {up:up.up,down:down.up};};\n`;
writeFileSync(process.argv[2]||new URL('../fingerings.mjs',import.meta.url),src);
console.log(src.split('\n').filter(l=>l.startsWith(" '")).join('\n'));
