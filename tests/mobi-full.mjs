import { readFile } from 'node:fs/promises';
const FILE = process.argv[2] || 'tests/samples/test.mobi';
const buf = await readFile(FILE);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);
const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));
const r0 = recOff[0];

function magicAt(i){ const o=recOff[i]; return buf.toString('latin1', o, o+4); }
let textEnd = numRec;
for (let i=1;i<numRec;i++){
  const m = magicAt(i);
  if (['INDX','FLIS','FCIS','HUFF','CDIC','BOUN','SRCS','CRES'].includes(m) ||
      (buf[recOff[i]]===0xFF && buf[recOff[i]+1]===0xD8)) { textEnd = i; break; }
}

function palmDocDecode(data) {
  const out = [];
  let i = 0, n = data.length;
  while (i < n) {
    const c = data[i++];
    if (c === 0) break;
    if (c < 0x09) {
      for (let k = 0; k < c + 1 && i < n; k++) out.push(data[i++]);
    } else if (c < 0x80) {
      out.push(c === 0x09 ? 0x20 : c);
    } else {
      if (i >= n) break;
      const c2 = data[i++];
      let dist, len;
      if (c < 0xC0) { dist = ((c & 0x3F) << 8) | c2; len = 3; }
      else {
        if (i >= n) break;
        const c3 = data[i++];
        dist = ((c & 0x3F) << 8) | c2; len = (c3 & 0x07) + 3;
      }
      if (dist === 0 || out.length - dist < 0) break;
      for (let k = 0; k < len; k++) out.push(out[out.length - dist]);
    }
  }
  return Buffer.from(out);
}

const parts = [];
for (let i=1;i<textEnd;i++){
  const o=recOff[i], next=i+1<recOff.length?recOff[i+1]:buf.length;
  parts.push(palmDocDecode(buf.subarray(o,next)));
}
const full = Buffer.concat(parts);
const txt = full.toString('latin1');
console.log('解码总字节:', full.length);
console.log('包含 "It is a truth universally acknowledged":', txt.includes('It is a truth universally acknowledged'));
console.log('包含 "Pride and Prejudice":', txt.includes('Pride and Prejudice'));
console.log('包含 "Elizabeth":', txt.includes('Elizabeth'));
const idx = txt.indexOf('It is a truth');
console.log('\n样本 (universally acknowledged 附近):');
console.log(txt.slice(idx-40, idx+120).replace(/\n/g,' '));
