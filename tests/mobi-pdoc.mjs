import { readFile } from 'node:fs/promises';
const MOBI = 'C:/Users/杨睿/Desktop/甲骨文·冷战史：冷战+以色列总理私人史+九月的十三天+午夜将至+最后的大队+民主德国的秘密读者+铁幕欧洲之新生+摩登时代（全10册 ）.mobi';
const buf = await readFile(MOBI);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);
const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));

// PalmDOC 解码（type 1）
function palmDocDecode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c === 0) break;
    if (c < 0x09) { // 0x01..0x08: 复制 (c+1) 字面字节
      for (let k = 0; k < c + 1 && i < data.length; k++) out.push(data[i++]);
    } else if (c < 0x80) { // 0x09..0x7F: 字面字符（0x09=空格）
      out.push(c);
    } else { // 0x80..0xFF: 后向引用
      if (i >= data.length) break;
      const c2 = data[i++];
      let distance, length;
      if (c < 0xC0) { // 2 字节：距离 11 位，长度 3 位
        distance = ((c & 0x3F) << 8) | c2; // 实际距离公式
        length = 3;
        // 标准：distance = ((c & 0x3F) << 8) | c2 ; 但 length 固定在 3 + ... 
        // 实际 PalmDOC：0x80-0xBF: (distance, length=3)
        const dist = ((c & 0x3F) << 8) | c2;
        let l = 3;
        let pos = out.length - dist;
        if (pos < 0) break;
        for (let k = 0; k < l && pos < out.length; k++) out.push(out[pos++]);
      } else { // 0xC0-0xFF: 3 字节
        if (i >= data.length) break;
        const c3 = data[i++];
        const dist = ((c & 0x3F) << 8) | c2;
        const l = (c3 & 0x07) + 3;
        let pos = out.length - dist;
        if (pos < 0) break;
        for (let k = 0; k < l && pos < out.length; k++) out.push(out[pos++]);
      }
    }
  }
  return Buffer.from(out);
}

for (const idx of [2, 3, 80, 100]) {
  const o = recOff[idx], next = idx+1<recOff.length?recOff[idx+1]:buf.length;
  const rec = buf.subarray(o, next);
  const dec = palmDocDecode(rec);
  const txt = dec.toString('utf8').replace(/[^\x20-\x7e　-〿一-鿿]/g, '.').slice(0, 200);
  console.log(`#${idx} PalmDOC 解码 (${dec.length} 字节):`);
  console.log('  ', txt);
}
