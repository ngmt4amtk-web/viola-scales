// ビオラ専用。violin-nidan の instrument.mjs（2026-11-02 ビオラ版）から、ビオラの値だけを固定で残した。
// 低い方から C・G・D・A。内部名は intonation.mjs に合わせ、OPEN_* は弦の番号 0〜3 で引く。
export const IS_VIOLA=true;
export const INSTRUMENT_NAME='ビオラ';
export const CLEF='alto';
export const STAFF_BASE=24; // ハ音記号の第1線 = F3（全音階番号 3*7+3）
export const OPEN_MIDI=[48,55,62,69];
export const OPEN_LETTERS=[0,4,1,5];
export const OPEN_FIFTHS_FROM_A=[-3,-2,-1,0];
export const OPEN_FIFTHS_FROM_C=[0,1,2,3];
