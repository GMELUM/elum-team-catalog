# App catalog

Rebuild the catalog icons with Node.js 20.9 or newer:

```sh
npm install
npm run icons
```

Place PNG files in `source/`, naming each file after the app ID (for example,
`source/7798122.png`). The script creates 150 × 150 PNG icons, crops rectangular
images to a centered square, and applies `Squircle.svg` as an alpha mask with
transparent corners. It stores each icon as `data:image/png;base64,...` in the
matching `apps[].icon` field in `catalog.json`.

For a new ID, the script appends an app with `visible: false`, `new: false`, an
empty `title`, transparent `color: "00000000"`, and the generated icon. Numeric
IDs are stored as numbers when they can be represented exactly.

Existing apps retain all fields except their icons. Apps without a matching PNG
are unchanged. Existing WebP files are ignored. The catalog is replaced only
after all PNG images have been processed
successfully. Running the script again with unchanged inputs does not rewrite it.
