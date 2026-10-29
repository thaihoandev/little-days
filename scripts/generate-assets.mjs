import { mkdir, writeFile } from 'node:fs/promises';
const dir = 'apps/web/public';
await mkdir(`${dir}/illustrations`, { recursive: true });
await mkdir(`${dir}/audio`, { recursive: true });
const scenes = [
  `<rect width="600" height="650" fill="#e4c5aa"/><circle cx="465" cy="135" r="65" fill="#f8e8c2"/><path d="M0 370Q160 230 340 390T650 325V650H0" fill="#a8af8b"/><path d="M0 480Q200 315 410 470T650 410V650H0" fill="#6e886c"/><path d="M180 650Q340 510 310 380" stroke="#d9c8a0" stroke-width="55" fill="none"/><path d="M100 360l60-170 60 170zM405 440l70-220 70 220z" fill="#4f6c58"/>`,
  `<rect width="600" height="650" fill="#e1bca8"/><circle cx="180" cy="200" r="82" fill="#f4dec0"/><path d="M0 370Q130 330 300 370T600 365V650H0" fill="#97b3ad"/><path d="M0 450Q110 400 280 450T600 430V650H0" fill="#6c9593"/><path d="M0 560Q200 475 600 555V650H0" fill="#d6c5a2"/><path d="M320 470l10-220 130 220z" fill="#faf1d9"/><path d="M328 465V230" stroke="#846e59" stroke-width="6"/><path d="M270 485h220l-40 40H310z" fill="#8d6653"/>`,
  `<rect width="600" height="650" fill="#d0d9c6"/><rect y="460" width="600" height="190" fill="#b29879"/><rect x="105" y="160" width="390" height="340" rx="8" fill="#f0debd"/><path d="M70 170L300 60l230 110z" fill="#a8654f"/><rect x="250" y="310" width="100" height="190" rx="48" fill="#819173"/><rect x="145" y="235" width="70" height="100" rx="30" fill="#b8c7be"/><rect x="385" y="235" width="70" height="100" rx="30" fill="#b8c7be"/><path d="M0 490q80-110 120 0M480 490q90-160 140 0" fill="#6b815d"/><circle cx="365" cy="115" r="30" fill="#f8eac7"/>`,
];
for (let i = 0; i < scenes.length; i++)
  await writeFile(
    `${dir}/illustrations/demo-${i + 1}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="650" viewBox="0 0 600 650">${scenes[i]}<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="600" height="650" opacity=".06" filter="url(#n)"/></svg>`,
  );
// Original procedural chime bed; no third-party recording or music download.
const rate = 16000,
  seconds = 60,
  samples = rate * seconds;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples * 2, 40);
const notes = [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66];
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  let v = 0;
  for (let j = 0; j < 4; j++) {
    const local = t - j * 0.48;
    const beat = Math.floor(local / 1.35);
    const age = local - beat * 1.35;
    if (local >= 0) {
      const f = notes[(((beat + j * 2) % notes.length) + notes.length) % notes.length];
      v += Math.sin(2 * Math.PI * f * age) * Math.exp(-age * 3) * 0.055;
    }
  }
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
}
await writeFile(`${dir}/audio/gentle.wav`, wav);
console.log('Created 3 original postcard illustrations and a 60-second procedural chime track.');
