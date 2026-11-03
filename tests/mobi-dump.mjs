import { readFile } from 'node:fs/promises';
const FILE = process.argv[2] || 'tests/samples/test.mobi';
const buf = await readFile(FILE);
const be32 = (b,o)=>b.readUInt32BE(o), be16=(b,o)=>b.readUInt16BE(o);
const numRec = be16(buf, 76);
const recOff = []; for (let i=0;i<numRec;i++) recOff.push(be32(buf,78+i*8));
const r0 = recOff[0];
console.log('rec0Off:', r0, '| 记录0 前 16 字节 hex:');
console.log([...buf.subarray(r0, r0+16)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
console.log('  -> compression(be16@0):', be16(buf,r0), '| textLength(be32@4):', be32(buf,r0+4), '| recordCount(be16@8):', be16(buf,r0+8));

// MOBI 头 (rec0Off+16)
const mo = r0+16;
console.log('\nMOBI 头 @', mo, '| magic:', buf.toString('latin1',mo,mo+4), '| headerLen:', be32(buf,mo+4), '| mobiType:', be32(buf,mo+8), '| enc:', be32(buf,mo+12));
console.log('  huffmanRecordOffset(+0x60):', be32(buf,mo+96), '| firstContent(+0x64):', be32(buf,mo+100), '| lastContent(+0x68):', be32(buf,mo+104), '| firstImage(+0x5c):', be32(buf,mo+92));

// 末尾若干记录的 magic 与样本
console.log('\n=== 末尾记录 (200..'+(numRec-1)+') ===');
for (let i=Math.max(1,numRec-14); i<numRec; i++){
  const o=recOff[i], next=i+1<recOff.length?recOff[i+1]:buf.length;
  const m=buf.toString('latin1',o,o+4);
  const hex=[...buf.subarray(o,o+12)].map(b=>b.toString(16).padStart(2,'0')).join(' ');
  let txt=''; try{ txt=buf.toString('latin1',o,Math.min(o+60,next)).replace(/[^\x20-\x7e]/g,'.'); }catch{}
  console.log(`  #${i} len=${next-o} magic="${m}" hex=${hex} | ${txt.slice(0,50)}`);
}

// 记录 #209 (最大) 样本
const big = recOff.map((o,i)=>({i,size:(i+1<recOff.length?recOff[i+1]:buf.length)-o})).sort((a,b)=>b.size-a.size)[0];
const bo=recOff[big.i], bn=big.i+1<recOff.length?recOff[big.i+1]:buf.length;
console.log(`\n=== 最大记录 #${big.i} len=${big.size} ===`);
console.log('  hex:', [...buf.subarray(bo,bo+24)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
let bt=''; try{ bt=buf.toString('latin1',bo,Math.min(bo+200,bn)).replace(/[^\x20-\x7e]/g,'.'); }catch{}
console.log('  txt:', bt.slice(0,120));
