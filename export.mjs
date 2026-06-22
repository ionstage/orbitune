import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const fpsFlag = process.argv.indexOf('--fps');
const FPS = fpsFlag !== -1 ? parseInt(process.argv[fpsFlag + 1], 10) : 24;
const positional = process.argv.slice(2).filter((a, i, arr) => a !== '--fps' && arr[i - 1] !== '--fps');

if (!positional[0]) {
  console.error('Usage: node export.mjs <exported-index.html> [startFrame] [output.mp4] [--fps <n>]');
  process.exit(1);
}

if (isNaN(FPS) || FPS <= 0) {
  console.error('--fps must be a positive integer');
  process.exit(1);
}

const HTML_PATH = path.resolve(positional[0]);
const HTML_DIR = path.dirname(HTML_PATH);
const START_FRAME = parseInt(positional[1] ?? '0', 10);
const WIDTH = 1080;
const HEIGHT = 1080;
const FRAMES_DIR = path.join(process.cwd(), 'frames');
const OUTPUT = positional[2] ? path.resolve(positional[2]) : path.join(process.cwd(), 'output.mp4');

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

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => { window.__orbitune_export__ = true; });
    if (fpsFlag !== -1) {
      await page.evaluateOnNewDocument(fps => { window.__orbitune_fps__ = fps; }, FPS);
    }
    await page.goto(`file://${HTML_PATH}`);
    await page.waitForFunction(() => window.orbitune?.isLoaded(), { timeout: 30000 });
    await page.evaluate((w, h) => window.orbitune.init(w, h), WIDTH, HEIGHT);

    const frameCount = await page.evaluate(() => window.orbitune.getLoopFrameCount());
    console.log(`Rendering ${frameCount} frames (start: ${START_FRAME}, ${WIDTH}x${HEIGHT}, ${FPS}fps)`);

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
      `ffmpeg -y -framerate ${FPS} -i "${FRAMES_DIR}/%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart "${OUTPUT}"`,
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
