import { randomUUID } from 'node:crypto';
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('.', import.meta.url));
const catalogPath = join(root, 'catalog.json');
const sourcePath = join(root, 'source');
const maskPath = join(root, 'Squircle.svg');
const iconSize = 100;
const iconQuality = 80;

async function main() {
    const original = await readFile(catalogPath, 'utf8');
    const catalog = JSON.parse(original);
    if (!Array.isArray(catalog.apps)) {
        throw new Error('catalog.json must contain an apps array.');
    }

    const apps = new Map();
    for (const app of catalog.apps) {
        if (!app || !['number', 'string'].includes(typeof app.id)) {
            throw new Error('Every app must have a numeric or string id.');
        }
        const id = String(app.id);
        if (apps.has(id)) {
            throw new Error(`Duplicate app id: ${id}.`);
        }
        apps.set(id, app);
    }

    const files = (await readdir(sourcePath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    const ids = new Set();
    const updates = [];
    const created = [];
    const mask = await sharp(maskPath)
        .resize(iconSize, iconSize)
        .png()
        .toBuffer();

    for (const filename of files) {
        const id = filename.slice(0, -4);
        if (ids.has(id)) {
            throw new Error(`Multiple PNG files for app id: ${id}.`);
        }
        ids.add(id);
        const app = apps.get(id);

        const input = await readFile(join(sourcePath, filename));
        if ((await sharp(input).metadata()).format !== 'png') {
            throw new Error(`${filename} is not a PNG image.`);
        }
        const png = await sharp(input)
            .resize(iconSize, iconSize, { fit: 'cover', position: 'centre' })
            .ensureAlpha()
            .composite([{ input: mask, blend: 'dest-in' }])
            .png({ quality: iconQuality, palette: true, compressionLevel: 9, adaptiveFiltering: true })
            .toBuffer();
        const icon = `data:image/png;base64,${png.toString('base64')}`;
        if (!app) {
            const numericId = Number(id);
            const newApp = {
                id: Number.isSafeInteger(numericId) && String(numericId) === id ? numericId : id,
                title: '',
                color: '00000000',
                new: false,
                visible: false,
                icon,
            };
            catalog.apps.push(newApp);
            apps.set(id, newApp);
            created.push(id);
        } else if (app.icon !== icon) {
            app.icon = icon;
            updates.push(id);
        }
    }

    if (updates.length === 0 && created.length === 0) {
        console.log('No icon changes.');
        return;
    }

    // Finish every image before replacing the catalog, so an error cannot
    // leave it partially updated. Preserve the existing indentation and EOL.
    const indent = original.match(/^[\t ]+(?=")/m)?.[0] ?? '    ';
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const trailingEol = original.endsWith('\n') ? eol : '';
    const output = JSON.stringify(catalog, null, indent).replace(/\n/g, eol) + trailingEol;
    const temporaryPath = join(root, `.catalog-${randomUUID()}.tmp`);
    const { mode } = await stat(catalogPath);
    await writeFile(temporaryPath, output, { flag: 'wx', mode });
    try {
        if (await readFile(catalogPath, 'utf8') !== original) {
            throw new Error('catalog.json changed during processing; run the script again.');
        }
        await rename(temporaryPath, catalogPath);
    } finally {
        await rm(temporaryPath, { force: true });
    }
    if (created.length > 0) {
        console.log(`Created ${created.length} app(s) with visible=false: ${created.join(', ')}.`);
    }
    if (updates.length > 0) {
        console.log(`Updated ${updates.length} icon(s): ${updates.join(', ')}.`);
    }
}

main().catch((error) => {
    console.error(`Failed to update icons: ${error.message}`);
    process.exitCode = 1;
});
