// node test/sources.test.mjs — 表を、資料のページから読んだ指番号（生成の道具とは別に手で写した物）と1音ずつ比べる。
// 違ってよいのは、開放弦と同じ高さの音（C3・G3・D4・A4）だけ（本人の「上りは0・下りは押さえる」で変えた所）。
// 写した元: tonebase「The Violist's Guide to Scales & Arpeggios」PDF 5ページ目（紙面 03）「2-Octave Major Scales Fingering Pattern」
//   research/sources/tonebase_2oct_major_all12_p5.png。下行は頂上の次の音から主音まで14音。
//   FPS Orchestra「VLA Octave Maj. & min. Scales」の上行（1st pos. のまま移動しない調だけ）research/sources/fps_viola_2oct_CGDAFBbEb_major_dA_melminor_p1.png
import {buildScale} from '../scales.mjs';
import {OPEN_MIDI} from '../instrument.mjs';
const L={C:0,D:1,E:2,F:3,G:4,A:5,B:6};
const SRC=[
 ['tonebase','major','C',0,'0 1 2 3 0 1 2 3 0 1 2 3 0 1 2','1 0 3 2 1 0 3 2 1 0 3 2 1 0'],
 ['tonebase','major','G',0,'0 1 2 3 0 1 2 3 0 1 2 1 2 3 4','3 2 1 2 1 0 3 2 1 0 3 2 1 0'],
 ['tonebase','major','D',0,'1 2 3 4 1 2 3 4 1 2 3 4 1 2 3','2 1 4 3 2 1 4 3 2 1 4 3 2 1'],
 ['tonebase','major','A',0,'1 2 3 4 1 2 3 4 1 2 3 1 2 3 4','3 2 1 3 2 1 4 3 2 1 4 3 2 1'],
 ['tonebase','major','E',0,'1 2 3 4 1 2 3 4 1 2 3 4 1 2 3','2 1 4 3 2 1 4 3 2 1 4 3 2 1'],
 ['tonebase','major','B',0,'1 2 3 4 1 2 3 4 1 2 3 1 2 3 4','3 2 1 3 2 1 4 3 2 1 4 3 2 1'],
 ['tonebase','major','F',1,'1 2 3 4 1 2 3 4 1 2 3 4 1 2 3','2 1 4 3 2 1 4 3 2 1 4 3 2 1'],
 ['tonebase','major','D',-1,'1 2 3 4 1 2 3 4 1 2 3 4 1 2 3','2 1 4 3 2 1 4 3 2 1 4 3 2 1'], // 楽譜は嬰ハ長調（同じ指）
 ['FPS','major','C',0,'0 1 2 3 0 1 2 3 0 1 2 3 0 1 2',null],
 ['FPS','major','D',0,'1 2 3 0 1 2 3 0 1 2 3 0 1 2 3',null],
 ['FPS','major','E',-1,'2 3 0 1 2 3 0 1 2 3 4 1 2 3 4',null], // 2音目は楽譜に「4」と読めるが、ファ3は第1ポジションの3（写し誤りか未確認）。比べない
 ['FPS','melodic','D',0,'1 2 3 0 1 2 3 0 1 2 3 0 1 2 3',null],
];
let fail=0,count=0;const diffs=[];
for(const [src,form,l,a,up,down] of SRC){
 const sc=buildScale(form,L[l],a),n=sc.notes;
 const want=[...up.split(' '),...(down?down.split(' '):[])].map(Number);
 for(let i=0;i<want.length;i++){
  if(src==='FPS'&&form==='major'&&l==='E'&&i===1)continue;
  count++;
  const got=n[i].finger;if(got===want[i])continue;
  const open=OPEN_MIDI.includes(n[i].midi);
  const msg=`${src} ${sc.id} ${i} ${n[i].nameEn}: 資料 ${want[i]} ／ 表 ${got}`;
  if(open)diffs.push(msg+'（開放弦の音・本人の規則）');else{fail++;console.log('NG',msg);}
 }
}
console.log(diffs.join('\n'));
console.log(`${count}音を比べた。開放弦の音で違う ${diffs.length}、それ以外で違う ${fail}`);
process.exit(fail?1:0);
