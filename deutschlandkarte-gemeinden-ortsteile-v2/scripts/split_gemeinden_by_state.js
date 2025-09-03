#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const SRC = '/project/workspace/deutschlandkarte-gemeinden-ortsteile/public/data/gemeinden.geojson';
const DEST_DIR = path.resolve(process.cwd(), 'public/data/gemeinden-split');

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }

function main(){
  const raw = fs.readFileSync(SRC,'utf-8');
  const fc = JSON.parse(raw);
  const by = new Map();
  for(const f of fc.features){
    const ags = (f.properties?.ags || f.properties?.id || '').toString();
    const state = ags.slice(0,2);
    if(!by.has(state)) by.set(state, []);
    by.get(state).push(f);
  }
  ensureDir(DEST_DIR);
  const codes = Array.from(by.keys()).sort();
  for(const code of codes){
    const out = { type:'FeatureCollection', features: by.get(code)};
    fs.writeFileSync(path.join(DEST_DIR, `de-${code}.geojson`), JSON.stringify(out));
    console.error(`wrote ${code} -> ${out.features.length}`);
  }
}

main();
