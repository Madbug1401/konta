// Gera os ícones da app (PWA/Android, iOS e favicon) a partir de um único
// desenho vetorial. Corre com: node scripts/generate-icons.mjs
//
// Antes disto o projeto só tinha o favicon.ico padrão do Next (16/32px) e
// nenhum manifest — o Android esticava esse ícone minúsculo para 192/512px
// ao instalar a app, daí o aspeto desfocado/distorcido.
//
// Usa o `sharp`, que já vem instalado como dependência do Next.
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

// "K" dourado cujo braço superior é uma seta de crescimento, sobre o
// azul-marinho do tema (cores de src/app/globals.css).
const glyph = `
  <defs>
    <linearGradient id="gold" x1="150" y1="390" x2="390" y2="110" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f2a91e"/>
      <stop offset="1" stop-color="#ffd247"/>
    </linearGradient>
  </defs>
  <g fill="url(#gold)" stroke="url(#gold)" stroke-linecap="round" stroke-linejoin="round">
    <path d="M164 140 V372 M168 292 L308 164 M240 238 L332 372" fill="none" stroke-width="56"/>
    <path d="M364 116 L358 210 L272 128 Z" stroke-width="14"/>
  </g>`;

const background = `
  <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#22273a"/>
    <stop offset="1" stop-color="#12141c"/>
  </linearGradient>`;

// `radius`: cantos arredondados (0 = quadrado cheio, para quem aplica a
// própria máscara). `scale`: encolhe o glifo à volta do centro — os ícones
// "maskable" do Android podem ser recortados até um círculo de 80% do lado.
function svg({ radius, scale = 1 }) {
  const offset = 256 * (1 - scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${background}</defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${glyph}</g>
</svg>
`;
}

const rounded = svg({ radius: 112 });
const fullBleed = svg({ radius: 0 });
const maskable = svg({ radius: 0, scale: 0.8 });

const png = (source, size) => sharp(Buffer.from(source)).resize(size, size).png().toBuffer();

// ICO com entradas PNG embebidas (suportado por todos os browsers atuais).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // tipo: ícone
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const outputs = {
  "src/app/icon.svg": rounded,
  "src/app/apple-icon.png": await png(fullBleed, 180), // o iOS arredonda sozinho
  "public/icons/icon-192.png": await png(rounded, 192),
  "public/icons/icon-512.png": await png(rounded, 512),
  "public/icons/icon-maskable-192.png": await png(maskable, 192),
  "public/icons/icon-maskable-512.png": await png(maskable, 512),
  "src/app/favicon.ico": ico(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(rounded, size) }))),
  ),
};

for (const [path, data] of Object.entries(outputs)) {
  await writeFile(path, data);
  console.log("✓", path);
}
