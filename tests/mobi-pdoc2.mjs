import { readFile } from 'node:fs/promises';
const FILE = process.argv[2] || 'tests/samples/test.mobi';
const buf = await readFile(FILE);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);
const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));
const r0 = recOff[0];

// 找文本记录范围：第一个 INDX/FLIS/FCIS/HUFF/CDIC/图像 之前的记录都当作文本
function magicAt(i){ return buf.toString('latin1', recOff[i], recOff[i]+4); }
let textEnd = numRec;
for (let i=1;i<numRec;i++){
  const m = magicAt(i);
  if (['INDX','FLIS','FCIS','HUFF','CDIC','BOUN','SRCS','CRES'].includes(m) || buf[recOff[i]]===0xFF && buf[recOff[i]+1]===0xD8) {
    textEnd = i; break;
  }
}
console.log('文本记录范围: 1 ..', textEnd-1);

function palmDocDecode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c === 0) { // 0x00 在 PalmDOC 中通常表示字面 NUL 或块结束；保留为字面
      out.push(0); continue;
    }
    if (c < 0x09) {
      for (let k = 0; k < c + 1 && i < data.length; k++) out.push(data[i++]);
    } else if (c < 0x80) {
      // 0x09 = 空格; 0x0A-0x7F = 字面字符
      out.push(c === 0x09 ? 0x20 : c);
    } else {
      if (i >= data.length) break;
      const c2 = data[i++];
      if (c < 0xC0) {
        const dist = ((c & 0x3F) << 8) | c2;
        const len = 3;
        let pos = out.length - dist;
        if (pos < 0) break;
        for (let k = 0; k < len && pos < out.length; k++) out.push(out[pos++]);
      } else {
        if (i >= data.length) break;
        const c3 = data[i++];
        const dist = ((c & 0x3F) << 8) | c2;
        const len = (c3 & 0x07) + 3;
        let pos = out.length - dist;
        if (pos < 0) break;
        for (let k = 0; k < len && pos < out.length; k++) out.push(out[pos++]);
      }
    }
  }
  return Buffer.from(out);
}

for (const idx of [1,2,3,4,5]) {
  if (idx>=textEnd) break;
  const o=recOff[idx], next=idx+1<recOff.length?recOff[idx+1]:buf.length;
  const rec=buf.subarray(o,next);
  const dec=palmDocDecode(rec);
  const txt=dec.toString('latin1').replace(/[^\x20-\x7e]/g,'.').slice(0,160);
  console.log(`\n#${idx} PalmDOC (${dec.length} bytes):`);
  console.log('  ', txt);
}
