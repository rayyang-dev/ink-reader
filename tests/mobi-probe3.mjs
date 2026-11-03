import { readFile } from 'node:fs/promises';
const MOBI = 'C:/Users/杨睿/Desktop/甲骨文·冷战史：冷战+以色列总理私人史+九月的十三天+午夜将至+最后的大队+民主德国的秘密读者+铁幕欧洲之新生+摩登时代（全10册 ）.mobi';
const buf = await readFile(MOBI);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);

const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));
const mobiOff = 23376;
console.log('=== MOBI 头 uint32 字段 (相对头偏移) ===');
for (let off=0; off<232; off+=4) {
  const v = be32(buf, mobiOff+off);
  console.log(`  +${off} (0x${off.toString(16).padStart(2,'0')}): ${v} (0x${v.toString(16)})`);
}

// EXTH 解析
const exthOff = 23608;
console.log('\n=== EXTH @', exthOff, '===');
console.log('  magic:', buf.toString('latin1', exthOff, exthOff+4));
const exthLen = be32(buf, exthOff+4);
console.log('  EXTH 长度:', exthLen);
let p = exthOff + 8;
const end = exthOff + exthLen;
const exthRecords = [];
while (p + 8 <= end) {
  const type = be32(buf, p);
  const len = be32(buf, p+4);
  if (len < 8) break;
  const data = buf.subarray(p+8, p+len);
  exthRecords.push({ type, len, data: data.slice(0, 40) });
  p += len;
}
console.log('  EXTH 记录数:', exthRecords.length);
for (const r of exthRecords.slice(0, 30)) {
  let s = '';
  try { s = r.data.toString('utf8'); } catch {}
  console.log(`    type=${r.type} len=${r.len} data="${s.replace(/[^\x20-\x7e]/g,'.')}"`);
}

// 检查 2565/2568 等间隙记录 magic
console.log('\n=== 间隙/特殊记录 magic ===');
for (const i of [2564,2565,2566,2567,2568,2569,2906,2907,2908,2909]) {
  if (i >= recOff.length) continue;
  const o = recOff[i];
  const next = i+1<recOff.length?recOff[i+1]:buf.length;
  console.log(`  #${i} off=${o} len=${next-o} magic="${buf.toString('latin1',o,o+4)}" hex=${[...buf.subarray(o,o+8)].map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
}

// 在记录0 范围内搜 HUFF/CDIC
const r0s = recOff[0], r0e = recOff[1];
const sub = buf.subarray(r0s, r0e);
console.log('\n记录0 内 "HUFF":', sub.indexOf(Buffer.from('HUFF')), '| "CDIC":', sub.indexOf(Buffer.from('CDIC')));
// 记录0 整体后段 dump（看是否有表）
console.log('记录0 末 64 字节 hex:');
console.log([...buf.subarray(r0e-64, r0e)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
