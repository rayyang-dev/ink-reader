// 真实文件探查：EPUB 能否被现有解析器吃下；MOBI 是哪种类型、是否加密。
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const fflate = require(path.resolve('www/js/vendor/fflate.js'));
globalThis.window = { fflate };
if (typeof globalThis.btoa !== 'function') globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const importers = await import(pathToFileURL(path.resolve('www/js/importers.js')).href);

const EPUB = 'C:/Users/杨睿/Desktop/失败的帝国：从斯大林到戈尔巴乔夫.epub';
const MOBI = 'C:/Users/杨睿/Desktop/甲骨文·冷战史：冷战+以色列总理私人史+九月的十三天+午夜将至+最后的大队+民主德国的秘密读者+铁幕欧洲之新生+摩登时代（全10册 ）.mobi';

function makeFile(name, buf) {
  return { name, async arrayBuffer() { const ab = new ArrayBuffer(buf.length); new Uint8Array(ab).set(buf); return ab; } };
}

function inspectMobi(buf) {
  const name = buf.slice(0, 32).toString('latin1').replace(/\0/g, '').trim();
  const r = { size: buf.length, dbName: name };
  // Palm DB 头布局：0-31 库名；60-63 type("BOOK")；76 numRecords(uint16)；78 记录列表起始
  r.type = buf.slice(60, 64).toString('latin1');
  const numRec = buf.readUInt16BE(76);
  const rec0Off = buf.readUInt32BE(78);
  r.numRecords = numRec;
  r.record0Offset = rec0Off;
  r.record0Magic = buf.slice(rec0Off, rec0Off + 4).toString('latin1');
  r.mobiType = buf.readUInt32BE(rec0Off + 8);
  // MOBI 头内 drm_offset 位于记录0 偏移 + 0x68（104）
  const drmOffset = buf.readUInt32BE(rec0Off + 0x68);
  r.drmOffset = drmOffset;
  r.drmLikely = drmOffset !== 0xffffffff && drmOffset !== 0;
  return r;
}

function stripTags(s) { return s.replace(/<[^>]+>/g, ''); }

async function main() {
  console.log('=== 真实文件探查 ===\n');

  console.log('--- EPUB ---');
  try {
    const buf = await readFile(EPUB);
    const book = await importers.parseEpub(makeFile('失败的帝国：从斯大林到戈尔巴乔夫.epub', buf));
    console.log('  ✅ 解析成功');
    console.log('  书名:', book.title, '| 作者:', book.author, '| 章节数:', book.chapters.length);
    let withText = 0;
    for (let i = 0; i < book.chapters.length; i++) {
      const txt = stripTags(book.chapters[i].html).replace(/\s+/g, '').length;
      if (txt > 0) withText++;
    }
    console.log('  有正文字符的章节:', withText, '/', book.chapters.length);
    // 打印前 3 章的标题与字数
    for (let i = 0; i < Math.min(3, book.chapters.length); i++) {
      const c = book.chapters[i];
      const txt = stripTags(c.html).replace(/\s+/g, '').slice(0, 40);
      console.log(`   [${i}] "${c.title}" 字符数=${stripTags(c.html).replace(/\s+/g, '').length} 片段:"${txt}"`);
    }
  } catch (e) {
    console.log('  ❌ 解析失败:', e.message);
  }

  console.log('\n--- MOBI ---');
  try {
    const buf = await readFile(MOBI);
    const info = inspectMobi(buf);
    console.log('  大小:', (info.size / 1024 / 1024).toFixed(1) + ' MB');
    console.log('  PalmDB 库名:', info.dbName);
    console.log('  type(60-63):', info.type);
    console.log('  记录数:', info.numRecords);
    console.log('  rec0Offset:', info.record0Offset);
    console.log('  记录0 标识:', JSON.stringify(info.record0Magic), '| mobiType:', info.mobiType);
    const head = buf.slice(info.record0Offset, info.record0Offset + 16);
    console.log('  记录0 前16字节(hex):', [...head].map((b) => b.toString(16).padStart(2, '0')).join(' '));
    console.log('  DRM 疑似加密:', info.drmLikely, '(drmOffset=' + info.drmOffset + ')');
    const kind = info.record0Magic === 'AZW3' || info.record0Magic === 'KF8'
      ? 'AZW3/KF8（KF8 压缩格式，浏览器内几乎无法解析）'
      : info.record0Magic === 'MOBI' ? '老式 MOBI（无压缩，理论上可解但工程量大）'
      : '未知子类型(' + info.record0Magic + ')';
    console.log('  类型判定:', kind);
  } catch (e) {
    console.log('  ❌ 读取失败:', e.message);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
