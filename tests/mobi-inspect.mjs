// MOBI 探查 + Huffman 解码尝试（针对真实 .mobi 文件）
import { readFile } from 'node:fs/promises';

const MOBI = 'C:/Users/杨睿/Desktop/甲骨文·冷战史：冷战+以色列总理私人史+九月的十三天+午夜将至+最后的大队+民主德国的秘密读者+铁幕欧洲之新生+摩登时代（全10册 ）.mobi';

function be32(b, o) { return b.readUInt32BE(o); }
function be16(b, o) { return b.readUInt16BE(o); }
function magic(b, o) { return b.toString('latin1', o, o + 4); }

// ---------- 1. PalmDB 头 ----------
function inspect(buf) {
  const out = {};
  out.dbName = buf.toString('latin1', 0, 32).replace(/\0/g, '').trim();
  out.type = buf.toString('latin1', 60, 64);
  out.creator = buf.toString('latin1', 64, 68);
  const numRec = be16(buf, 76);
  out.numRecords = numRec;
  // 记录列表：从 78 开始，每条 8 字节（4 偏移 + 1 attr + 3 uid）
  const recOff = [];
  for (let i = 0; i < numRec; i++) recOff.push(be32(buf, 78 + i * 8));
  out.recOff = recOff;
  out.rec0Off = recOff[0];

  // PalmDOC 头（记录0 内，前 16 字节）
  const d = out.rec0Off;
  out.palmdoc = {
    compression: be16(buf, d + 0),
    textLength: be32(buf, d + 4),
    recordCount: be16(buf, d + 8),
    recordSize: be16(buf, d + 10),
    encryption: be16(buf, d + 12),
  };

  // 找到 MOBI 头（在记录0 内搜索 "MOBI" 魔数）
  let mobiOff = -1;
  for (let i = d; i < d + 64; i++) {
    if (buf.toString('latin1', i, i + 4) === 'MOBI') { mobiOff = i; break; }
  }
  out.mobiOff = mobiOff;
  if (mobiOff >= 0) {
    out.mobi = {
      headerLen: be32(buf, mobiOff + 4),
      mobiType: be32(buf, mobiOff + 8),
      encoding: be32(buf, mobiOff + 12),
      huffmanRecordOffset: be32(buf, mobiOff + 96),   // @0x60 rel MOBI
      firstContentRecord: be32(buf, mobiOff + 100),   // @0x64
      lastContentRecord: be32(buf, mobiOff + 104),    // @0x68
      firstImageIndex: be32(buf, mobiOff + 92),
      exthFlags: be32(buf, mobiOff + 148),
      fullNameOffset: be32(buf, mobiOff + 68),
      fullNameLength: be32(buf, mobiOff + 72),
    };
    // 书名
    const fnOff = out.rec0Off + out.mobi.fullNameOffset;
    out.fullName = buf.toString('utf8', fnOff, fnOff + out.mobi.fullNameLength).replace(/\0/g, '').trim();
  }
  return out;
}

// ---------- 2. 记录魔数扫描 ----------
function scanRecords(buf, recOff) {
  const res = [];
  for (let i = 0; i < recOff.length; i++) {
    const o = recOff[i];
    const next = i + 1 < recOff.length ? recOff[i + 1] : buf.length;
    const m = magic(buf, o);
    res.push({ i, off: o, len: next - o, magic: m });
  }
  return res;
}

// ---------- 3. Huffman 解码器（移植 calibre huffcdic.py） ----------
class Reader {
  loadHuff(huff) {
    const off1 = be32(huff, 8);
    const off2 = be32(huff, 12);
    this.dict1 = [];
    for (let i = 0; i < 256; i++) {
      const v = be32(huff, off1 + i * 4);
      const codelen = v & 0x1F;
      const term = (v & 0x80) !== 0;
      const maxcode = ((BigInt(v >>> 8) + 1n) << BigInt(32 - codelen)) - 1n;
      this.dict1.push({ codelen, term, maxcode });
    }
    const dict2 = [];
    for (let i = 0; i < 64; i++) dict2.push(be32(huff, off2 + i * 4));
    this.mincode = [0n];
    this.maxcode = [0n];
    for (let codelen = 1; codelen <= 32; codelen++) {
      this.mincode.push(BigInt(dict2[(codelen - 1) * 2]) << BigInt(32 - codelen));
      this.maxcode.push(((BigInt(dict2[(codelen - 1) * 2 + 1]) + 1n) << BigInt(32 - codelen)) - 1n);
    }
    this.dictionary = [];
  }
  loadCdic(cdic) {
    const phrases = be32(cdic, 8);
    const bits = be32(cdic, 12);
    const n = Math.min(1 << bits, phrases - this.dictionary.length);
    const idxOff = 16;
    const offsets = [];
    for (let i = 0; i < n; i++) offsets.push(be16(cdic, idxOff + i * 2));
    const getslice = (off) => {
      const blen = be16(cdic, 16 + off);
      const slice = cdic.subarray(18 + off, 18 + off + (blen & 0x7FFF));
      return [slice, blen & 0x8000];
    };
    for (let i = 0; i < n; i++) this.dictionary.push(getslice(offsets[i]));
  }
  unpack(data) {
    const padded = Buffer.alloc(data.length + 8);
    data.copy(padded, 0);
    let V = 0n;
    for (let i = 0; i < padded.length; i++) V = (V << 8n) | BigInt(padded[i]);
    const totalBits = data.length * 8;
    const paddedBits = padded.length * 8;
    let bitPos = 0;
    const s = [];
    while (true) {
      if (bitPos > totalBits) break;
      const shift = BigInt(paddedBits - bitPos - 32);
      const codeNum = Number((V >> shift) & 0xFFFFFFFFn);
      const d = this.dict1[codeNum >>> 24];
      let codelen = d.codelen;
      let maxcode = d.maxcode;
      const codeBig = BigInt(codeNum);
      if (!d.term) {
        while (codeBig < this.mincode[codelen]) codelen++;
        maxcode = this.maxcode[codelen];
      }
      bitPos += codelen;
      if (bitPos > totalBits) break;
      const r = Number((maxcode - codeBig) >> BigInt(32 - codelen));
      let slice_ = this.dictionary[r];
      if (!slice_[1]) {
        this.dictionary[r] = null;
        const unpacked = this.unpack(slice_[0]);
        this.dictionary[r] = [unpacked, 1];
        slice_ = this.dictionary[r];
      }
      s.push(slice_[0]);
    }
    return Buffer.concat(s);
  }
}

async function main() {
  const buf = await readFile(MOBI);
  const info = inspect(buf);
  console.log('=== PalmDB ===');
  console.log('  dbName:', info.dbName);
  console.log('  type/creator:', info.type, '/', info.creator);
  console.log('  numRecords:', info.numRecords);
  console.log('  rec0Off:', info.rec0Off);
  console.log('  PalmDOC:', JSON.stringify(info.palmdoc));
  console.log('  MOBI off:', info.mobiOff, '| headerLen:', info.mobi && info.mobi.headerLen);
  if (info.mobi) {
    console.log('  MOBI:', JSON.stringify(info.mobi));
    console.log('  fullName:', JSON.stringify(info.fullName));
  }

  const recs = scanRecords(buf, info.recOff);
  console.log('\n=== 记录魔数（前 12 + HUFF/CDIC/INDX 区域）===');
  for (const r of recs.slice(0, 12)) console.log(`  #${r.i} off=${r.off} len=${r.len} magic=${r.magic}`);
  const special = recs.filter(r => ['HUFF','CDIC','INDX','INDX','SRCS','FLIS','FCIS','EOF','BOUN','CRES','MOBI','TEXT','AUDI','VIDE'].includes(r.magic));
  console.log('  特殊记录:', special.map(r => `#${r.i}:${r.magic}(len ${r.len})`).join(', '));
  const huff = recs.find(r => r.magic === 'HUFF');
  const cdics = recs.filter(r => r.magic === 'CDIC');
  console.log('  HUFF 记录:', huff ? `#${huff.i} off=${huff.off} len=${huff.len}` : '无');
  console.log('  CDIC 记录数:', cdics.length, cdics.map(c => `#${c.i}`).join(','));

  if (huff) {
    const huffRecord = buf.subarray(huff.off, huff.off + huff.len);
    const cdicRecords = cdics.map(c => buf.subarray(c.off, c.off + c.len));
    const reader = new Reader();
    reader.loadHuff(huffRecord);
    for (const c of cdicRecords) reader.loadCdic(c);
    console.log('\n  字典条目数(dictionary 长度):', reader.dictionary.length);

    // 文本记录：尝试 [firstContentRecord .. lastContentRecord]
    let first = info.mobi ? info.mobi.firstContentRecord : 1;
    let last = info.mobi ? info.mobi.lastContentRecord : huff.i - 1;
    console.log(`\n  尝试解码文本记录 [${first} .. ${last}] (共 ${last - first + 1} 条)`);
    const parts = [];
    let errCount = 0;
    for (let i = first; i <= last; i++) {
      const o = info.recOff[i];
      const next = i + 1 < info.recOff.length ? info.recOff[i + 1] : buf.length;
      const rec = buf.subarray(o, next);
      try {
        const dec = reader.unpack(rec);
        parts.push(dec);
      } catch (e) {
        errCount++;
        if (errCount <= 3) console.log(`  ❌ 记录 #${i} 解码异常:`, e.message);
      }
    }
    const all = Buffer.concat(parts);
    console.log('  解码字节数:', all.length, '| 解码异常记录:', errCount);
    // 统计 CJK
    const txt = all.toString('utf8');
    const cjk = (txt.match(/[一-鿿]/g) || []).length;
    console.log('  其中 CJK 字符数:', cjk);
    const sample = txt.slice(0, 600);
    console.log('  --- 前 600 字符样本 ---');
    console.log(sample);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
