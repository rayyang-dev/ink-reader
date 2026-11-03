// 端到端测试 mobidec.js：解析 + 章节切分
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const mobidec = await import(pathToFileURL(path.resolve('www/js/mobidec.js')).href);

function makeFile(name, buf) {
  return { name, async arrayBuffer() { const ab = new ArrayBuffer(buf.length); new Uint8Array(ab).set(buf); return ab; } };
}
function stripTags(s) { return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ''); }

async function run(label, p) {
  const buf = await readFile(p);
  console.log('\n===== ' + label + ' =====');
  try {
    const book = await mobidec.parseMobi(makeFile(path.basename(p), buf));
    console.log('  书名:', book.title, '| 作者:', book.author, '| 章节数:', book.chapters.length);
    let withText = 0, totalCjk = 0, repl = 0;
    for (const c of book.chapters) {
      const t = stripTags(c.html);
      if (t.length > 30) withText++;
      const cjk = (t.match(/[一-鿿]/g) || []).length;
      totalCjk += cjk;
      repl += (t.match(/�/g) || []).length;
    }
    console.log('  有正文章节:', withText, '/', book.chapters.length, '| 总CJK:', totalCjk, '| 替换符:', repl);
    for (let i = 0; i < Math.min(3, book.chapters.length); i++) {
      const c = book.chapters[i];
      console.log(`   [${i}] "${c.title}" 片段: ${stripTags(c.html).slice(0,50)}`);
    }
  } catch (e) {
    console.log('  ❌ 失败:', e.message);
  }
}

await run('用户 CJK 文件', 'C:/Users/杨睿/Desktop/甲骨文·冷战史：冷战+以色列总理私人史+九月的十三天+午夜将至+最后的大队+民主德国的秘密读者+铁幕欧洲之新生+摩登时代（全10册 ）.mobi');
await run('Gutenberg 英文文件', 'tests/samples/test.mobi');
