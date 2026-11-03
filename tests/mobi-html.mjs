import { readFile } from 'node:fs/promises';
const FILE = "C:/Users/杨睿/Desktop/甲骨文·冷战史：冷战+以色列总理私人史+九月的十三天+午夜将至+最后的大队+民主德国的秘密读者+铁幕欧洲之新生+摩登时代（全10册 ）.mobi";
const buf = await readFile(FILE);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);
const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));
const r0 = recOff[0];

function mobipocketDecode(data) {
  const out = []; let i=0; const n=data.length;
  while (i<n){ const c=data[i++]; if(c===0)break;
    if(c<=8){ for(let k=0;k<c&&i<n;k++) out.push(data[i++]); }
    else if(c<0x80){ out.push(c===0x09?0x20:c); }
    else if(c<0xC0){ if(i>=n)break; const c2=data[i++]; const concat=(c<<8)|c2; const dist=(concat>>3)&0x7FF; const len=(concat&7)+3; let s=out.length-dist; if(s<0){len+=s;s=0;} for(let k=0;k<len;k++) out.push(out[s+k]||0x20); }
    else { out.push(0x20); out.push(c^0x80); }
  }
  return Uint8Array.from(out);
}
function magicAt(i){ return buf.toString('latin1', recOff[i], recOff[i]+4); }
let textEnd = numRec;
for (let i=1;i<numRec;i++){ const m=magicAt(i); if(['INDX','FLIS','FCIS','HUFF','CDIC','BOUN','SRCS','CRES'].includes(m)||(buf[recOff[i]]===0xFF&&buf[recOff[i]+1]===0xD8)){textEnd=i;break;} }

const parts=[]; for(let i=1;i<textEnd;i++){ const o=recOff[i],next=i+1<recOff.length?recOff[i+1]:buf.length; parts.push(mobipocketDecode(buf.subarray(o,next))); }
const full = Buffer.concat(parts);
const html = full.toString('utf8');

// 统计结构
console.log('总长度:', html.length);
console.log('<h1>/<h2>/<h3> 数量:', (html.match(/<h[123][ >]/gi)||[]).length);
console.log('<mbp:pagebreak/> 数量:', (html.match(/<mbp:pagebreak/gi)||[]).length);
console.log('<a filepos 数量:', (html.match(/<a [^>]*filepos/gi)||[]).length);
console.log('<p 数量:', (html.match(/<p[ >]/gi)||[]).length);

// 打印前 1500 字符看结构
console.log('\n=== 前 1500 字符 ===');
console.log(html.slice(0,1500));
