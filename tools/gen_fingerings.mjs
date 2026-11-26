// 運指の表（fingerings.mjs）を作る道具。2026-11-26 第2版（本人「音階の上りって基本0で下りはおさえたりすることが多いじゃん？」）。
// もう一度流すと fingerings.mjs を書き直す。手で直した後は別名に出して見比べる: node tools/gen_fingerings.mjs /tmp/x.mjs
//
// 決め方（指は音名で数える。ポジション p で、開放弦から n 度上の音は n-(p-1) の指。半ポジション＝1の指が開放弦の♯の音）:
// 1. 開放弦と同じ高さの音（C3・G3・D4・A4）は、上行は開放弦（0）、下行は下の弦の4の指。本人の指定。
//    下の弦がその4と同じ手の形に収まらない時（例 嬰ハ短調のD線は半ポジション）と、最後の主音（C3・G3）は下行も0。
//    資料の確認: 集めた楽譜（tonebase・FPS）は上下とも0か上下とも4で、この組み合わせを書いた楽譜は見つからない。
// 2. 下の3本（C・G・D線）は第1ポジション（届かない弦だけ半ポジション）。ホ長調・ロ長調は第2、嬰ヘ長調は第3ポジション（開放弦を使わない）。
//    出典: tonebase「The Violist's Guide to Scales & Arpeggios」p.03（2オクターブ長調8調の指番号。ホ・ロは第2、嬰ヘは第3から1234）。
// 3. A線: 2オクターブ目の上の4音（5〜8度）を 1-2-3-4 で取るように、5度の音で1の指へ移動する（tonebase のト・イ・ロ長調と同じ）。
//    変ロ・ロ短調・変ロ短調は第1ポジションから届かないので、3度と5度の2回（2→1、2→1）。
//    ハ・変ニ（嬰ハ）・ニ・変ホ・ホ・嬰ヘ長調は頂上まで届くので移動しない（tonebase の本文「2オクターブでは移動が要らない」・Spieker の楽譜に記号なし）。
//    ヘ長調・ヘ短調・嬰ヘ短調は6度で第3ポジションへ（頂上が レ1 ミ2 ファ3。FPS・Spieker のヘ長調の頂上の指と同じ。ただし両者はD線で移動）。
//    ヘ・変イ（嬰ト）・変ロ長調と全短調の移動の場所は、この型で決めた（本の運指と照らしていない）。
//    参考: Spieker「Two Octave Scales」(IMSLP) と FPS は、ト・ヘ・イ・変ロ長調などでD線で移動する（A線の開放弦を使わない流儀）。本人の「上りは0」を優先して取らなかった。
// 4. 旋律的短音階は上行が旋律的、下行が自然的の音。下行の移動の場所は上行と同じ度。
import {writeFileSync} from 'node:fs';
import {OPEN_MIDI} from '../instrument.mjs';
const SN=['C','G','D','A'];
const OPEN_DIA=[21,25,29,33]; // C3・G3・D4・A4 の全音階番号
const LETTER_PC=[0,2,4,5,7,9,11];
const EN=['C','D','E','F','G','A','B'];
const SHAPE={major:[0,2,4,5,7,9,11],harmonic:[0,2,3,5,7,8,11],melodic:[0,2,3,5,7,9,11],natural:[0,2,3,5,7,8,10]};
const TONICS={major:[['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],['F',1],['G',0],['A',-1],['A',0],['B',-1],['B',0]],
 minor:[['C',0],['C',1],['D',0],['E',-1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['B',-1],['B',0]]};
// A線で1の指へ移る音（15音の中の番号。11＝2オクターブ目の5度、9＝3度）
function shiftsFor(kind,L,a){
 const pc=(LETTER_PC[EN.indexOf(L)]+a+12)%12;
 if([0,1,2,3,4].includes(pc)||(kind==='major'&&pc===6))return [];          // ハ・変ニ/嬰ハ・ニ・変ホ・ホ・嬰ヘ長調（第3ポジションで頂上まで）
 if(pc===10)return [9,11];                         // 変ロ（長・短）
 if(pc===11)return kind==='major'?[11]:[9,11];     // ロ長調は第2ポジションから1回、ロ短調は第1から2回
 if(pc===5||pc===6)return [12];                    // ヘ（長・短）・嬰ヘ短調: 6度で第3ポジションへ（頂上 レ1 ミ2 ファ3。FPS・Spieker のヘ長調の頂上と同じ）
 return [11];                                      // ト・変イ/嬰ト・イ
}
// 下の弦の手の位置（ポジション−1）。ホ・ロ長調は第2、嬰ヘ長調は第3（tonebase p.03 のとおり。どれも開放弦の音を含まないか、A4だけ）
const BASE_O={'major-E':1,'major-B':1,'major-Fs':2};
const baseO=(kind,L,a)=>BASE_O[`${kind}-${L}${a<0?'b':a>0?'s':''}`]||0;
// 音名で数えた指（o＝ポジション−1。半ポジションは −1）
const fingerOf=(n,s,o)=>n.dia-OPEN_DIA[s]-o;
const fits=(seg,s,o)=>seg.every(n=>{const f=fingerOf(n,s,o);return f>=1&&f<=4;});
// 手の形の候補: （下行は上行で使った形）→ 基本のポジション → （第1の時だけ）半ポジション。
// 第1ポジションで1の指が開放弦から3半音上（増2度の「高い1」）になる時は、半ポジション（0→2）が収まればそちらを取る（例 嬰ハ短調の A0 シ♯2 ド♯3）
const highOne=(seg,s)=>seg.some(n=>fingerOf(n,s,0)===1&&n.midi-OPEN_MIDI[s]>=3);
function frameFor(seg,s,prefer,keep){
 if(keep!=null&&fits(seg,s,keep))return keep;
 if(prefer===0&&fits(seg,s,0)&&highOne(seg,s)&&fits(seg,s,-1))return -1;
 for(const o of [prefer,...(prefer===0?[-1]:[])])if(fits(seg,s,o))return o;return null;}
function plan(notes,{up,bo,shifts,keep}){
 const b2=bo>0;
 // notes: 15音（上行は低→高、下行は高→低の順で渡す）。返り値は同じ順の {s,f,p}
 const out=new Array(notes.length);
 const lastIdx=up?-1:notes.length-1;
 // 1) 弦を決める
 const str=notes.map(n=>{
  if(b2){for(let s=0;s<3;s++){const f=fingerOf(n,s,bo);if(f>=1&&f<=4)return s;}return 3;}
  let s=0;for(let k=0;k<4;k++)if(OPEN_MIDI[k]<=n.midi)s=k;return s;
 });
 const isOpen=(n,i)=>!b2&&n.midi===OPEN_MIDI[str[i]];
 // 2) 下の3本: 弦ごとのまとまりで手の形を決める
 const prefer=bo;
 const used={};
 for(let s=0;s<3;s++){
  const idx=notes.map((n,i)=>i).filter(i=>str[i]===s&&!isOpen(notes[i],i));
  if(!idx.length)continue;
  const o=frameFor(idx.map(i=>notes[i]),s,prefer);used[s]=o;if(o===null)throw new Error(`${SN[s]}線に収まらない`);
  for(const i of idx)out[i]={s,f:fingerOf(notes[i],s,o),p:Math.max(1,o+1),o};
 }
 // 3) A線: 移動の音で区切る
 const aIdx=notes.map((n,i)=>i).filter(i=>str[i]===3&&!isOpen(notes[i],i));
 const groups=[];let cur=[];
 for(const i of (up?aIdx:[...aIdx].reverse())){const deg=up?i:14-i;if(shifts.includes(deg)&&cur.length){groups.push(cur);cur=[];}cur.push(i);}
 if(cur.length)groups.push(cur);
 groups.forEach((g,k)=>{
  const seg=g.map(i=>notes[i]);let o;
  if(k===0&&!shifts.includes(up?g[0]:14-g[0])){o=frameFor(seg,3,prefer,shifts.length?null:keep?.[3]);used[3]=o;} // 折り返しがこの組にある時（移動の無い調）だけ上行の形を持ち越す
  else o=seg[0].dia-OPEN_DIA[3]-1; // 移動した組は最初の音が1の指
  if(o===null||!fits(seg,3,o))throw new Error('A線の組が届かない '+seg.map(n=>n.midi));
  for(const i of g)out[i]={s:3,f:fingerOf(notes[i],3,o),p:Math.max(1,o+1),o};
 });
 // 4) 開放弦の音
 notes.forEach((n,i)=>{
  if(!isOpen(n,i))return;
  const s=str[i];
  if(up||i===lastIdx||s===0){out[i]={s,f:0,p:0};return;}
  // 下行: 下の弦の4の指。下の弦のまとまりが第1ポジションの形で、この音が4に当たる時だけ
  const below=notes.map((m,j)=>j).filter(j=>out[j]&&out[j].s===s-1&&out[j].f>0);
  const seg=[n,...below.map(j=>notes[j])];
  if(fits(seg,s-1,0)&&fingerOf(n,s-1,0)===4&&below.every(j=>out[j].o===0))out[i]={s:s-1,f:4,p:1};
  else out[i]={s,f:0,p:0};
 });
 if(out.some(x=>!x))throw new Error('抜け');
 out.used=used;
 return out;
}
const tok=n=>`${SN[n.s]}${n.f}@${n.p}`;
function notesFor(L,a,shape,up){
 const letter=EN.indexOf(L),tonic=48+((LETTER_PC[letter]+a+12)%12),tonicDia=21+letter;
 const ns=Array.from({length:15},(_,i)=>({midi:tonic+shape[i%7]+12*Math.floor(i/7),dia:tonicDia+i}));
 return up?ns:[...ns].reverse();
}
let src=`// ビオラ2オクターブ音階の運指。tools/gen_fingerings.mjs（第2版）が作った表。\n// 1行 = [上行15音（低→高）, 下行15音（頂上→主音。頂上の音は上行の物を使う）]。\n// 1音 = 弦 指 @ ポジション（0は開放弦）。例 A1@3 = A線・1の指・第3ポジション。決め方と出典は tools/gen_fingerings.mjs の頭。\nconst T={\n`;
for(const kind of ['major','harmonic','melodic','natural'])for(const [L,a] of TONICS[kind==='major'?'major':'minor']){
 const id=`${kind}-${L}${a<0?'b':a>0?'s':''}`,opt={bo:baseO(kind,L,a),shifts:shiftsFor(kind,L,a)};
 try{
  const up=plan(notesFor(L,a,SHAPE[kind],true),{...opt,up:true});
  const down=plan(notesFor(L,a,SHAPE[kind==='melodic'?'natural':kind],false),{...opt,up:false,keep:up.used}); // 折り返しで手の形を変えない
  src+=` '${id}':['${up.map(tok).join(' ')}','${down.map(tok).join(' ')}'],\n`;
 }catch(e){throw new Error(id+': '+e.message);}
}
src+=`};
const SI={C:0,G:1,D:2,A:3};
const parse=t=>{const m=/^([CGDA])([0-4])@(\\d+)$/.exec(t);if(!m)throw new Error('運指の字 '+t);return {s:SI[m[1]],f:+m[2],p:+m[3]};};
export const FINGERING_SOURCE='上行は開放弦（0）、下行は同じ音を下の弦の4の指で取る（本人の指定。下の弦が4に届く形でない所と最後の主音は0）。下の3本は第1ポジション（ホ長調・ロ長調は第2、嬰ヘ長調は第3ポジション）。A線では2オクターブ目の5〜8度を1-2-3-4で取るように5度の音で移動する（tonebase のト・イ・ロ長調の型。ヘ長調・ヘ短調・嬰ヘ短調は6度で第3ポジションへ、変ロ・ロ短調・変ロ短調は3度と5度で2回）。ハ・変ニ・ニ・変ホ・ホ・嬰ヘ長調は移動なし。ハ・ニ・ホ・嬰ヘ・ト・イ・ロ・嬰ハ長調は tonebase の楽譜と照らした（開放弦の音の0と4だけが違う）。短調とヘ・変イ・変ロ長調の移動の場所は同じ型で決めたもので、本の運指と照らしていない';
const rows=Object.fromEntries(Object.entries(T).map(([k,[u,d]])=>{const up=u.split(' ').map(parse),down=d.split(' ').map(parse).reverse();if(up.length!==15||down.length!==15)throw new Error(k+' は15音でない');return [k,{up,down}];}));
export const FINGERINGS=rows;
export const fingeringFor=(form,id)=>rows[form+'-'+id]||null;
`;
writeFileSync(process.argv[2]||new URL('../fingerings.mjs',import.meta.url),src);
console.log(src.split('\n').filter(l=>l.startsWith(" '")).join('\n'));
