// Generate product artwork from the vector.dev SVG mark. Run from the repository root.
import sharp from 'sharp';
import {readdir, readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const mark = (color = '#d7e4c7') => `<path d="M13 18L27 49L51 15M36 15H51V30" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (body, width = 64, height = width) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
const icon = svg(`<rect width="64" height="64" rx="16" fill="#203019"/>${mark()}`);
const monochrome = (color) => svg(mark(color));
const wordmark = (color) => svg(`<text x="240.5" y="78" text-anchor="middle" font-family="Arial,sans-serif" font-size="86" font-weight="700" letter-spacing="-4" fill="${color}">vector.dev</text>`, 481, 105);
const imageRoot = 'apps/ui/sources/assets/images';
const nativeRoot = 'apps/ui/src-tauri/icons';
async function filesIn(dir) {
    const files = [];
    for (const entry of await readdir(dir, {withFileTypes: true})) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await filesIn(path));
        else files.push(path);
    }
    return files;
}
async function render(path, source) {
    const {width, height} = await sharp(await readFile(path)).metadata();
    await writeFile(path, await sharp(Buffer.from(source)).resize(width, height).png().toBuffer());
}
await writeFile(join(imageRoot, 'vector-mark.svg'), icon);
for (const path of await filesIn(imageRoot)) {
    const name = path.split('/').at(-1);
    if (!/^(?:logo|icon(?:-adaptive|-notification|-tauri)?\.|favicon|splash-android)/.test(name) || !name.endsWith('.png')) continue;
    const source = name.startsWith('logotype') ? wordmark(name.includes('light') ? '#ffffff' : '#203019')
        : name.startsWith('logo-') || name.startsWith('splash-') || name.startsWith('icon-notification')
            ? monochrome(name.includes('white') || name.includes('dark') || name.includes('notification') ? '#ffffff' : '#203019')
            : icon;
    await render(path, source);
}
for (const path of [...await filesIn(nativeRoot), ...await filesIn('apps/ui/public/icons')]) {
    if (!path.endsWith('.png')) continue;
    const source = path.includes('/tray/') ? monochrome(path.includes('dark') ? '#ffffff' : '#203019') : icon;
    await render(path, source);
}
// Keep the upstream permission indicator visible over the new favicon.
const activeIcon = svg(`<rect width="64" height="64" rx="16" fill="#203019"/>${mark()}<circle cx="51" cy="13" r="11" fill="#e99b28" stroke="#203019" stroke-width="3"/>`);
await render(join(imageRoot, 'favicon-active.png'), activeIcon);
async function writeIco(path, source) {
    const sizes = [16, 32, 48, 64, 128, 256];
    const images = await Promise.all(sizes.map(size => sharp(Buffer.from(source)).resize(size, size).png().toBuffer()));
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    images.forEach((data, index) => {
        const entry = 6 + index * 16;
        header[entry] = sizes[index] % 256; header[entry + 1] = sizes[index] % 256;
        header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(data.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
        offset += data.length;
    });
    await writeFile(path, Buffer.concat([header, ...images]));
}
await writeIco(join(nativeRoot, 'icon.ico'), icon);
await writeIco('apps/ui/public/favicon-active.ico', activeIcon);
const temp = await mkdtemp(join(tmpdir(), 'vector-icons-'));
try {
    const iconset = join(temp, 'Vector.iconset'); await mkdir(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
        for (const scale of [1, 2]) {
            await sharp(Buffer.from(icon)).resize(size * scale, size * scale).png().toFile(join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
        }
    }
    execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(nativeRoot, 'icon.icns')]);
} finally { await rm(temp, {recursive: true, force: true}); }
const liquidRoot = join(nativeRoot, 'AppIcon.icon');
for (const path of await filesIn(join(liquidRoot, 'Assets'))) await rm(path);
await writeFile(join(liquidRoot, 'Assets/Vector.svg'), svg(mark(), 64));
await writeFile(join(liquidRoot, 'icon.json'), JSON.stringify({fill:{solid:'extended-srgb:0.12549,0.18824,0.09804,1.00000'},groups:[{layers:[{glass:false,'image-name':'Vector.svg',name:'vector.dev',position:{scale:1,'translation-in-points':[0,0]}}],shadow:{kind:'none',opacity:0},specular:false,translucency:{enabled:false,value:0}}],'supported-platforms':{squares:'shared'}}, null, 2) + '\n');
for (const [name, color] of [['logotype-black.svg', '#203019'], ['logotype-white.svg', '#ffffff']]) await writeFile(join('.github', name), wordmark(color));
await writeFile('apps/ui/src-tauri/dmg/dmg-background.png', await sharp(Buffer.from(svg(`<rect width="1246" height="1204" fill="#203019"/><text x="623" y="185" text-anchor="middle" font-family="Arial,sans-serif" font-size="92" font-weight="700" fill="#d7e4c7">vector.dev</text><text x="623" y="320" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" fill="#d7e4c7">Drag vector.dev into Applications</text><path d="M485 610H760M725 575L760 610L725 645" fill="none" stroke="#d7e4c7" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,1246,1204))).png().toBuffer());
console.log('Generated vector.dev UI, web, desktop, tray, and installer artwork.');
