# orbitune

A Three.js 3D scene that displays a toon-shaded model on a slowly orbiting camera, with a real-time parameter GUI for adjusting lighting, camera, and background.

## Usage

Open `index.html` directly in a browser — no build step required.

## Video export

Renders the scene frame-by-frame using Puppeteer and encodes to H.264 with ffmpeg.

```sh
npm install
node export.mjs <exported-index.html> [startFrame] [output.mp4]
```

## License

MIT
