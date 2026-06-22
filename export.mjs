import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

if (!process.argv[2]) {
  console.error('Usage: node export.mjs <exported-index.html> [startFrame] [output.mp4]');
  process.exit(1);
}

const HTML_PATH = path.resolve(process.argv[2]);
const HTML_DIR = path.dirname(HTML_PATH);
const START_FRAME = parseInt(process.argv[3] ?? '0', 10);
const WIDTH = 1080;
const HEIGHT = 1080;
const FRAMES_DIR = path.join(process.cwd(), 'frames');
const OUTPUT = process.argv[4] ? path.resolve(process.argv[4]) : path.join(process.cwd(), 'output.mp4');

if (isNaN(START_FRAME) || START_FRAME < 0) {
  console.error('startFrame must be a non-negative integer');
  process.exit(1);
}

async function main() {
  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(FRAMES_DIR);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--allow-file-access-from-files'],
  });

  let fps;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => { window.__orbitune_export__ = true; });
    await page.goto(`file://${HTML_PATH}`);
    await page.waitForFunction(() => window.orbitune?.isLoaded(), { timeout: 30000 });
    await page.evaluate((w, h) => window.orbitune.init(w, h), WIDTH, HEIGHT);

    fps = await page.evaluate(() => window.orbitune.getFps());
    const frameCount = await page.evaluate(() => window.orbitune.getLoopFrameCount());
    console.log(`Rendering ${frameCount} frames (start: ${START_FRAME}, ${WIDTH}x${HEIGHT}, ${fps}fps)`);

    for (let i = 0; i < frameCount; i++) {
      const frameIndex = (START_FRAME + i) % frameCount;
      const dataUrl = await page.evaluate(f => window.orbitune.renderFrame(f), frameIndex);
      const base64 = dataUrl.slice('data:image/png;base64,'.length);
      fs.writeFileSync(
        path.join(FRAMES_DIR, `${String(i).padStart(4, '0')}.png`),
        Buffer.from(base64, 'base64'),
      );
      process.stdout.write(`\r  frame ${i + 1}/${frameCount}`);
    }
    process.stdout.write('\n');
  } finally {
    await browser.close();
  }

  console.log('Encoding...');
  try {
    execSync(
      `ffmpeg -y -framerate ${fps} -i "${FRAMES_DIR}/%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart "${OUTPUT}"`,
      { stdio: 'pipe' },
    );
  } catch (err) {
    process.stderr.write(err.stderr);
    throw err;
  }

  fs.rmSync(FRAMES_DIR, { recursive: true });
  console.log(`Done → ${OUTPUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
