#!/usr/bin/env node
/* Fetch VG250-EW (Gemeinden + Kreise) from BKG WFS and write a compact GeoJSON for municipalities with population and county. */
import fs from 'fs';
import path from 'path';
import os from 'os';

const OUT_GEM = path.resolve(process.cwd(), 'public/data/gemeinden.geojson');
const TMP_DIR = path.resolve(process.cwd(), '.tmp-fetch');
fs.mkdirSync(TMP_DIR, { recursive: true });

const BASE = 'https://sgx.geodatenzentrum.de/wfs_vg250-ew?service=WFS&version=2.0.0&request=GetFeature&srsName=EPSG:4326&outputFormat=application/json';
const GEM_TYPE = 'vg250-ew:vg250_gem';
const KRS_TYPE = 'vg250-ew:vg250_krs';

async function fetchPage(typeNames, startIndex, count) {
  const u = `${BASE}&typeNames=${encodeURIComponent(typeNames)}&count=${count}&startIndex=${startIndex}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
  return res.json();
}

async function fetchAll(typeNames, total, count=1000) {
  const pages = Math.ceil(total / count);
  const results = [];
  for (let i = 0; i < pages; i++) {
    const start = i * count;
    process.stderr.write(`Fetching ${typeNames} ${start}..${start+count-1}\n`);
    const j = await fetchPage(typeNames, start, count);
    if (!j.features) throw new Error('No features in response');
    results.push(...j.features);
  }
  return results;
}

async function discoverTotal(typeNames) {
  const j = await fetchPage(typeNames, 0, 1);
  return j.totalFeatures || j.numberMatched || (j.features ? j.features.length : 0);
}

function density(pop, areaKm2) {
  if (!Number.isFinite(pop) || !Number.isFinite(areaKm2) || areaKm2 <= 0) return null;
  return pop / areaKm2;
}

(async () => {
  try {
    const gemTotal = await discoverTotal(GEM_TYPE);
    const krsTotal = await discoverTotal(KRS_TYPE);

    const [gemFeatures, krsFeatures] = await Promise.all([
      fetchAll(GEM_TYPE, gemTotal, 1000),
      fetchAll(KRS_TYPE, krsTotal, 500),
    ]);

    // Build Kreis mapping by ARS (5-stellig)
    const krsBy5 = new Map();
    for (const f of krsFeatures) {
      const p = f.properties || {};
      const ars = String(p.ars || '').padStart(5,'0');
      krsBy5.set(ars, { name: p.gen, bez: p.bez });
    }

    const out = { type: 'FeatureCollection', features: [] };

    for (const f of gemFeatures) {
      const p = f.properties || {};
      const ags = String(p.ags || '').padStart(8,'0');
      const ars12 = String(p.ars || p.sdv_ars || '').padStart(12,'0');
      const ars5 = ars12.slice(0,5);
      const kreis = krsBy5.get(ars5);
      const pop = Number.isFinite(p.ewz) ? p.ewz : (typeof p.ewz === 'string' ? Number(p.ewz.replace(/,/g,'')) : null);
      const area = Number.isFinite(p.kfl) ? p.kfl : (typeof p.kfl === 'string' ? Number(p.kfl.replace(/,/g,'')) : null);

      out.features.push({
        type: 'Feature',
        properties: {
          id: ags,
          name: p.gen,
          county: kreis ? (kreis.bez === 'Kreisfreie Stadt' || /kreisfrei/i.test(kreis.bez || '') ? `${p.gen}` : `${kreis.name || ''}`) : undefined,
          ags: ags,
          pop: Number.isFinite(pop) ? pop : null,
          area_km2: Number.isFinite(area) ? area : null,
          density: Number.isFinite(pop) && Number.isFinite(area) && area>0 ? pop/area : null,
          kind: 'gemeinde',
        },
        geometry: f.geometry,
      });
    }

    fs.mkdirSync(path.dirname(OUT_GEM), { recursive: true });
    fs.writeFileSync(OUT_GEM, JSON.stringify(out));
    console.error(`Wrote ${out.features.length} features to ${OUT_GEM}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
