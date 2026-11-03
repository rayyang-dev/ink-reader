import { readFile } from 'node:fs/promises';
const FILE = process.argv[2] || 'tests/samples/test.mobi';
const buf = await readFile(FILE);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);
const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));

function count(sig){let c=0,f=0;while(true){const i=buf.indexOf(sig,f);if(i<0)break;c++;f=i+1;}return c;}
function countFrom(sig,start){let c=0,f=start;while(true){const i=buf.indexOf(sig,f);if(i<0||i>=buf.length)break;c++;f=i+4;}return c;}

console.log('"MOBI" 总数:', count(Buffer.from('MOBI')));
console.log('"KF8" 总数:', count(Buffer.from('KF8')));
console.log('"BOUNDARY" 总数:', count(Buffer.from('BOUNDARY')));
console.log('"HUFF" 总数:', count(Buffer.from('HUFF')));
console.log('"CDIC" 总数:', count(Buffer.from('CDIC')));
console.log('"INDX" 总数:', count(Buffer.from('INDX')));

// 列出所有 MOBI 位置
let f=0; const pos=[];
while(true){const i=buf.indexOf(Buffer.from('MOBI'),f);if(i<0)break;pos.push(i);f=i+1;}
console.log('MOBI 位置:', pos);

// 记录大小分布（前 20 大）
const sizes = recOff.map((o,i)=>({i, size: (i+1<recOff.length?recOff[i+1]:buf.length)-o})).sort((a,b)=>b.size-a.size);
console.log('\n最大记录:', sizes.slice(0,10).map(s=>`#${s.i}:${s.size}`).join(', '));
console.log('前 12 条记录大小:', recOff.map((o,i)=>(i+1<recOff.length?recOff[i+1]:buf.length)-o).slice(0,12).join(', '));

// 第二个 MOBI 头 (如果有) 的字段
if (pos.length > 1) {
  const m2 = pos[1];
  console.log('\n第二个 MOBI 头 @', m2, 'headerLen:', be32(buf,m2+4), 'mobiType:', be32(buf,m2+8));
}
