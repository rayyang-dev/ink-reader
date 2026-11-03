// 深度探查：全局搜索 HUFF/CDIC，dump 记录 1/2 内容
import { readFile } from 'node:fs/promises';

const MOBI = 'C:/Users/杨睿/Desktop/甲骨文·冷战史：冷战+以色列总理私人史+九月的十三天+午夜将至+最后的大队+民主德国的秘密读者+铁幕欧洲之新生+摩登时代（全10册 ）.mobi';

function be32(b, o) { return b.readUInt32BE(o); }
function be16(b, o) { return b.readUInt16BE(o); }

const buf = await readFile(MOBI);

// 全局搜索 HUFF / CDIC 魔数
function findAll(sig) {
  const res = [];
  let from = 0;
  while (true) {
    const i = buf.indexOf(sig, from);
    if (i < 0) break;
    res.push(i);
    from = i + 1;
  }
  return res;
}
console.log('全局 "HUFF" 出现位置:', findAll(Buffer.from('HUFF')).slice(0, 10));
console.log('全局 "CDIC" 出现位置:', findAll(Buffer.from('CDIC')).slice(0, 10));
console.log('全局 "\\x1f\\x8b"(gzip) 出现位置(前5):', findAll(Buffer.from([0x1f, 0x8b])).slice(0, 5));

// 记录列表
const numRec = be16(buf, 76);
const recOff = [];
for (let i = 0; i < numRec; i++) recOff.push(be32(buf, 78 + i * 8));
console.log('\nnumRecords:', numRec, '| 记录0 偏移:', recOff[0]);

// dump 记录 1 与 2 的头部 hex + 尝试 UTF-8 解码
for (const idx of [1, 2, 3, 80]) {
  const o = recOff[idx];
  const next = idx + 1 < recOff.length ? recOff[idx + 1] : buf.length;
  const rec = buf.subarray(o, next);
  const head = rec.subarray(0, 32);
  const hex = [...head].map(b => b.toString(16).padStart(2, '0')).join(' ');
  let txt = '';
  try { txt = rec.toString('utf8', 0, Math.min(rec.length, 200)).replace(/[^\x20-\x7e　-〿一-鿿]/g, '.'); } catch (e) {}
  console.log(`\n#${idx} off=${o} len=${rec.length}`);
  console.log('  hex:', hex);
  console.log('  txt:', txt.slice(0, 120));
}

// 看看记录 1 是否本身就是可读 HTML（完整解码前 500 字节）
const r1 = buf.subarray(recOff[1], recOff[2]);
console.log('\n=== 记录1 前 500 字节 UTF-8 ===');
console.log(r1.toString('utf8', 0, 500));
