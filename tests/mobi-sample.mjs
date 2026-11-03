import { readFile } from 'node:fs/promises';
const FILE = process.argv[2] || 'tests/samples/test.mobi';
const buf = await readFile(FILE);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);

const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));
const r0 = recOff[0];
const compression = be16(buf, r0+0);
console.log('numRecords:', numRec, 'compression:', compression, 'dbName:', buf.toString('latin1',0,32).replace(/\0/g,'').trim());

// 找 HUFF / CDIC
let huffIdx=-1, cdicIdxs=[];
for (let i=0;i<recOff.length;i++){
  const o=recOff[i];
  const m=buf.toString('latin1',o,o+4);
  if(m==='HUFF') huffIdx=i;
  if(m==='CDIC') cdicIdxs.push(i);
}
console.log('HUFF record #:', huffIdx, '| CDIC records:', cdicIdxs.length, cdicIdxs.slice(0,5));

// MOBI 头字段
let mobiOff=-1; for(let i=r0;i<r0+64;i++){ if(buf.toString('latin1',i,i+4)==='MOBI'){mobiOff=i;break;} }
const mobiType=be32(buf,mobiOff+8), enc=be32(buf,mobiOff+12);
const hoff=be32(buf,mobiOff+96), fcr=be32(buf,mobiOff+100), lcr=be32(buf,mobiOff+104);
console.log('mobiType:',mobiType,'enc:',enc,'huffmanRecordOffset:',hoff,'firstContent:',fcr,'lastContent:',lcr);

if (huffIdx>=0) {
  const huff = buf.subarray(recOff[huffIdx], recOff[huffIdx+1]);
  const cdics = cdicIdxs.map(i=>buf.subarray(recOff[i], recOff[i+1]||buf.length));
  console.log('HUFF len:', huff.length, '| first CDIC len:', cdics[0] && cdics[0].length);
}
