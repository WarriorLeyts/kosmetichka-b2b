/** Prepare compressed display copies for all referenced product photos. Originals remain intact.
 * Run with the app environment: node scripts/prepare-product-thumbs.js
 * Sequential, resumable, and safe to repeat: existing fresh copies are skipped.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const base = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'), '1c');
const widths = [160, 480, 800];
sharp.cache(false);
sharp.concurrency(1);
async function main() {
  const images = await prisma.productImage.findMany({ select: { path: true }, orderBy: { id: 'desc' } });
  const paths = [...new Set(images.map(x => x.path))];
  const report = { photos: paths.length, originalsBytes: 0, displayBytes480: 0, displayBytes800: 0, built: 0, cached: 0, missing: 0, skipped: 0, failed: 0 };
  for (const [i, rel] of paths.entries()) {
    const src = path.resolve(base, rel);
    if (!src.startsWith(base + path.sep) || !/\.(jpe?g|png|webp)$/i.test(rel) || /^https?:/i.test(rel)) { report.skipped++; continue; }
    let stat;
    try { stat = await fs.stat(src); } catch { report.missing++; continue; }
    report.originalsBytes += stat.size;
    for (const width of widths) {
      const dest = path.join(base, '.thumbs', `w${width}`, rel + '.webp');
      const cached = await fs.stat(dest).catch(() => null);
      if (cached && cached.mtimeMs >= stat.mtimeMs) {
        report.cached++;
        if (width !== 160) report[`displayBytes${width}`] += cached.size;
        continue;
      }
      const tmp = `${dest}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      try {
        const buf = await sharp(src, { failOn: 'none' }).rotate()
          .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 }).toBuffer();
        // An exchange may replace an original while this script is running.
        const latest = await fs.stat(src);
        if (latest.mtimeMs !== stat.mtimeMs || latest.size !== stat.size) { report.skipped++; continue; }
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(tmp, buf);
        await fs.rename(tmp, dest);
        report.built++;
        if (width !== 160) report[`displayBytes${width}`] += buf.length;
      } catch (error) {
        report.failed++;
        console.error('Thumbnail failed:', rel, width, error.message);
      } finally { await fs.unlink(tmp).catch(() => {}); }
    }
    if ((i + 1) % 250 === 0) console.log(JSON.stringify({ processed: i + 1, ...report }));
  }
  console.log(JSON.stringify({ complete: true, ...report }));
  if (report.failed) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
