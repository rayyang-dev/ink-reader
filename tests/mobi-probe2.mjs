import { readFile } from 'node:fs/promises';
const MOBI = 'C:/Users/杨睿/Desktop/甲骨文·冷战史：冷战+以色列总理私人史+九月的十三天+午夜将至+最后的大队+民主德国的秘密读者+铁幕欧洲之新生+摩登时代（全10册 ）.mobi';
const buf = await readFile(MOBI);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);

const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));
const r0 = recOff[0];
console.log('numRecords:', numRec, 'rec0Off:', r0);
console.log('记录0 前 32 字节 hex (应为 PalmDOC 头):');
console.log([...buf.subarray(r0, r0+32)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
console.log('  compression(be16@0):', be16(buf,r0+0), '| textLength(be32@4):', be32(buf,r0+4), '| recordCount(be16@8):', be16(buf,r0+8), '| recordSize(be16@10):', be16(buf,r0+10), '| encryption(be16@12):', be16(buf,r0+12));

// 统计 MOBI / KF8 / BOUNDARY / INDX 出现次数
function count(sig){let c=0,f=0;while(true){const i=buf.indexOf(sig,f);if(i<0)break;c++;f=i+1;}return c;}
console.log('\n"MOBI" 出现次数:', count(Buffer.from('MOBI')));
console.log('"KF8" 出现次数:', count(Buffer.from('KF8')));
console.log('"BOUNDARY" 出现次数:', count(Buffer.from('BOUNDARY')));
console.log('"INDX" 出现次数:', count(Buffer.from('INDX')));
console.log('"HUFF" 出现次数:', count(Buffer.from('HUFF')));
console.log('"CDIC" 出现次数:', count(Buffer.from('CDIC')));

// 列出所有 MOBI 魔数位置
let f=0; const mobiPos=[];
while(true){const i=buf.indexOf(Buffer.from('MOBI'),f);if(i<0)break;mobiPos.push(i);f=i+1;}
console.log('\nMOBI 魔数位置:', mobiPos);

// 看记录 0 里 MOBI 头之后的内容（EXTH? 额外数据?）
const mobiOff = mobiPos[0];
console.log('\nMOBI 头 @', mobiOff, 'headerLen:', be32(buf, mobiOff+4));
// 在记录0 范围内找 EXTH
let ef=0; const exthPos=[];
while(true){const i=buf.indexOf(Buffer.from('EXTH'),r0);if(i<0||i>=recOff[1])break;exthPos.push(i);break;}
console.log('记录0 内 EXTH 位置:', exthPos);

// 记录0 从 mobiOff+headerLen 起 dump 一些字节看是否有 HUFF 内嵌
const hl = be32(buf, mobiOff+4);
console.log('MOBI 头后 (mobiOff+headerLen =', mobiOff+hl, ') 64 字节 hex:');
console.log([...buf.subarray(mobiOff+hl, mobiOff+hl+64)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
