import { readFile } from 'node:fs/promises';
const FILE = process.argv[2];
const buf = await readFile(FILE);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);
const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));
const r0 = recOff[0];
const compression = be16(buf, r0+0);
const textRecordCount = be16(buf, r0+8);

// 找文本记录结束（首个 INDX/FLIS/FCIS/图像）
function magicAt(i){ return buf.toString('latin1', recOff[i], recOff[i]+4); }
let textEnd = numRec;
for (let i=1;i<numRec;i++){
  const m = magicAt(i);
  if (['INDX','FLIS','FCIS','HUFF','CDIC','BOUN','SRCS','CRES'].includes(m) ||
      (buf[recOff[i]]===0xFF && buf[recOff[i]+1]===0xD8)) { textEnd = i; break; }
}

function mobipocketDecode(data, litPlusOne) {
  const out = [];
  let i = 0; const n = data.length;
  while (i < n) {
    const c = data[i++];
    if (c === 0) break;
    if (c <= 8) {
      const count = litPlusOne ? c + 1 : c;
      for (let k=0;k<count && i<n;k++) out.push(data[i++]);
    } else if (c < 0x80) {
      out.push(c === 0x09 ? 0x20 : c);
    } else if (c < 0xC0) {
      if (i >= n) break;
      const c2 = data[i++];
      const concat = (c << 8) | c2;
      const distance = (concat >> 3) & 0x7FF;
      const length = (concat & 7) + 3;
      const start = out.length - distance;
      if (start < 0) break;
      for (let k=0;k<length;k++) out.push(out[start + k]);
    } else {
      out.push(0x20);
      out.push(c ^ 0x80);
    }
  }
  return Uint8Array.from(out);
}

for (const litPlusOne of [false, true]) {
  const parts = [];
  for (let i=1;i<textEnd;i++){
    const o=recOff[i], next=i+1<recOff.length?recOff[i+1]:buf.length;
    parts.push(mobipocketDecode(buf.subarray(o,next), litPlusOne));
  }
  const full = Buffer.concat(parts);
  const txt = full.toString('utf8');
  const repl = (txt.match(/�/g)||[]).length;
  const cjk = (txt.match(/[一-鿿]/g)||[]).length;
  console.log(`litPlusOne=${litPlusOne}: 解码字节=${full.length}, CJK=${cjk}, 替换符=${repl}, 替换率=${(repl/(repl+cjk)*100).toFixed(2)}%`);
  const i2 = txt.indexOf('冷战');
  if (i2>=0) console.log('  冷战 上下文:', txt.slice(i2-60, i2+80).replace(/\n/g,' '));
}
