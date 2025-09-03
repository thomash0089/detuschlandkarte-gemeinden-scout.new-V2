import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, GeoJSON, Tooltip, Pane } from "react-leaflet";
import L from "leaflet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Minimal types
 type FProps = {
  id: string;
  name: string;
  county?: string;
  ags?: string;
  pop?: number | null;
  area_km2?: number | null;
  density?: number | null;
  kind: "gemeinde" | "ortsteil";
  rank?: number;
};

type GFeat = {
  type: "Feature";
  properties: FProps;
  geometry: any;
};

type FC = { type: "FeatureCollection"; features: GFeat[] };

function fmt(n?: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("de-DE");
}

const COLORS = ["#7f0000","#cc0000","#ff66a3","#cc5500","#ff9900","#ffff00","#add8e6","#0000ff","#90ee90","#008000"] as const;

function colorForPop(pop?: number | null) {
  const p = pop ?? -1;
  if (p < 0) return "#cccccc";
  if (p <= 5000) return COLORS[0];
  if (p <= 10000) return COLORS[1];
  if (p <= 20000) return COLORS[2];
  if (p <= 30000) return COLORS[3];
  if (p <= 40000) return COLORS[4];
  if (p <= 50000) return COLORS[5];
  if (p <= 60000) return COLORS[6];
  if (p <= 80000) return COLORS[7];
  if (p <= 100000) return COLORS[8];
  return COLORS[9];
}

function colorForDensity(d?: number | null) {
  const v = d ?? -1;
  if (v < 0) return "#cccccc";
  if (v <= 50) return COLORS[0];
  if (v <= 100) return COLORS[1];
  if (v <= 200) return COLORS[2];
  if (v <= 400) return COLORS[3];
  if (v <= 800) return COLORS[4];
  if (v <= 1200) return COLORS[5];
  if (v <= 2000) return COLORS[6];
  if (v <= 3000) return COLORS[7];
  if (v <= 4000) return COLORS[8];
  return COLORS[9];
}

export default function App() {
  const [gemeinden, setGemeinden] = useState<FC | null>(null);
  const [ortsteile, setOrtsteile] = useState<FC | null>(null);
  const [query, setQuery] = useState("");
  const [showGemeinden, setShowGemeinden] = useState(true);
  const [showOrtsteile, setShowOrtsteile] = useState(false);
  const [colorMode, setColorMode] = useState<"pop" | "density">("pop");

  useEffect(() => {
    const codes = ["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16"];
    Promise.all(
      codes.map(c => fetch(`/data/gemeinden-split/de-${c}.geojson`).then(r=>r.ok?r.json():{type:"FeatureCollection",features:[]}).catch(()=>({type:"FeatureCollection",features:[]})))
    ).then((parts)=>{
      const all = { type:"FeatureCollection", features: parts.flatMap(p=>p.features) } as FC;
      setGemeinden(all);
    });
    fetch("/data/ortsteile.geojson").then(r=>r.json()).then(setOrtsteile).catch(()=>{});
  }, []);

  const combined = useMemo(() => {
    const arr: GFeat[] = [];
    if (gemeinden) arr.push(...gemeinden.features);
    if (ortsteile) arr.push(...ortsteile.features);
    // Recompute density if missing
    for (const f of arr) {
      const p = f.properties as any;
      if ((p.density === null || p.density === undefined) && Number.isFinite(p.pop) && Number.isFinite(p.area_km2) && p.area_km2 > 0) {
        p.density = p.pop / p.area_km2;
      }
    }
    // Default: sort by population DESC to show aussagekräftige Werte zuerst
    const sorted = arr.slice().sort((a,b)=>{
      const pa = (a.properties.pop ?? -1) as number;
      const pb = (b.properties.pop ?? -1) as number;
      return pb - pa;
    });
    let rank = 1;
    return sorted.map(f=>({
      ...f,
      properties: { ...f.properties, rank: Number.isFinite(f.properties.pop as number) ? rank++ : undefined }
    }));
  }, [gemeinden, ortsteile]);

  const listItemsRaw = useMemo(()=>combined, [combined]);

  const gemeindenOnly: FC | null = useMemo(()=>{
    if (!gemeinden) return null; return { type: "FeatureCollection", features: combined.filter(f=>f.properties.kind==="gemeinde") } as FC;
  }, [combined, gemeinden]);

  const ortsteileOnly: FC | null = useMemo(()=>{
    if (!ortsteile) return null; return { type: "FeatureCollection", features: combined.filter(f=>f.properties.kind==="ortsteil") } as FC;
  }, [combined, ortsteile]);

  const listItems = useMemo(()=>{
    const norm = (s:string)=> s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu,'')
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
    const m = (s:string)=> norm(s).includes(norm(query));
    const base = (showGemeinden ? (gemeindenOnly?.features ?? []) : (ortsteileOnly?.features ?? []));
    const filtered = (query.trim().length===0)
      ? base
      : base.filter(f=>{ const p=f.properties; return m(p.name) || (p.county && m(p.county)) || (p.ags && m(p.ags)); });
    return filtered.slice().sort((a,b)=> (b.properties.pop ?? -1) - (a.properties.pop ?? -1));
  }, [showGemeinden, gemeindenOnly, ortsteileOnly, query]);

  const mapRef = useRef<any>(null);

  useEffect(()=>{
    if (!mapRef.current) return;
    if (query.trim().length === 0) return;
    if (listItems.length === 0) return;
    try {
      const layer = L.geoJSON(listItems[0] as any);
      const b = layer.getBounds();
      if (b.isValid()) mapRef.current.fitBounds(b.pad(0.5));
    } catch {}
  }, [query, listItems]);

  return (
    <div className="h-screen w-screen grid grid-cols-[360px_1fr]">
      <div className="border-r border-border flex flex-col">
        <div className="p-4 space-y-3">
          <div className="text-xl font-serif">Deutschlandkarte – Gemeinden & Ortsteile</div>
          <div className="text-sm text-muted-foreground">Gemeinden, Städte und Ortsteile</div>
          <div className="flex items-center gap-2">
            <Label htmlFor="cm">Färbung nach</Label>
            <Switch id="cm" checked={colorMode==="density"} onCheckedChange={(v)=>setColorMode(v?"density":"pop")} />
            <span className="text-sm text-muted-foreground">{colorMode==="pop"?"Einwohnerzahl":"Bevölkerungsdichte"}</span>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Switch checked={showGemeinden} onCheckedChange={setShowGemeinden} id="g" />
            <Label htmlFor="g">Gemeinden/Städte</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showOrtsteile} onCheckedChange={setShowOrtsteile} id="o" />
            <Label htmlFor="o">Ortsteile</Label>
          </div>
          <Input placeholder="Suchen nach Name, Gemeinde, Kreis" value={query} onChange={(e)=>setQuery(e.target.value)} />
        </div>
        <Tabs defaultValue="liste" className="flex flex-1 min-h-0 flex-col">
          <TabsList className="mx-4">
            <TabsTrigger value="liste">Liste</TabsTrigger>
            <TabsTrigger value="legende">Legende</TabsTrigger>
          </TabsList>
          <TabsContent value="liste" className="flex-1 min-h-0">
            <ScrollArea className="h-full px-4">
              <div className="space-y-2 pb-6">
                {listItems.map((f)=>{
                  const p = f.properties;
                  const dens = (p.density ?? ((p.pop && p.area_km2) ? (p.pop / (p.area_km2||0)) : null));
                  return (
                    <div key={`${p.kind}-${p.id}`} className="rounded-lg border p-3 hover:bg-accent cursor-pointer" onClick={()=>{
                      try{ const layer=L.geoJSON(f as any); const b=layer.getBounds(); if (mapRef.current && b.isValid()) mapRef.current.fitBounds(b.pad(0.5)); }catch{}
                    }}>
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.rank ? `#${p.rank}` : "#–"}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{p.county ?? ""}</div>
                      <div className="mt-1 text-sm">Einwohner: {fmt(p.pop)}</div>
                      <div className="text-sm">Dichte: {dens ? `${fmt(Math.round(dens))} je km²` : "–"}</div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="legende" className="px-4">
            <div className="grid grid-cols-1 gap-2 pb-6">
              {(colorMode === "pop"
                ? [
                    { label: "0 – 5.000", color: COLORS[0] },
                    { label: "5.001 – 10.000", color: COLORS[1] },
                    { label: "10.001 – 20.000", color: COLORS[2] },
                    { label: "20.001 – 30.000", color: COLORS[3] },
                    { label: "30.001 – 40.000", color: COLORS[4] },
                    { label: "40.001 – 50.000", color: COLORS[5] },
                    { label: "50.001 – 60.000", color: COLORS[6] },
                    { label: "60.001 – 80.000", color: COLORS[7] },
                    { label: "80.001 – 100.000", color: COLORS[8] },
                    { label: "100.001+", color: COLORS[9] },
                  ]
                : [
                    { label: "0 – 50", color: COLORS[0] },
                    { label: "51 – 100", color: COLORS[1] },
                    { label: "101 – 200", color: COLORS[2] },
                    { label: "201 – 400", color: COLORS[3] },
                    { label: "401 – 800", color: COLORS[4] },
                    { label: "801 – 1.200", color: COLORS[5] },
                    { label: "1.201 – 2.000", color: COLORS[6] },
                    { label: "2.001 – 3.000", color: COLORS[7] },
                    { label: "3.001 – 4.000", color: COLORS[8] },
                    { label: "4.001+", color: COLORS[9] },
                  ]).map(b=> (
                <div key={b.label} className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-sm" style={{ background: b.color }} />
                  <div className="text-sm">{b.label} {colorMode === "pop" ? "Einwohner" : "Einwohner je km²"}</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <div className="relative">
        <MapContainer center={[51.2, 10.5]} zoom={6} style={{ width: "100%", height: "100%" }} preferCanvas whenCreated={(m)=>{(mapRef as any).current=m;}}>
          <TileLayer
            attribution="© OpenStreetMap-Mitwirkende"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {showGemeinden && gemeindenOnly && (
            <Pane name="gemeinden" style={{ zIndex: 450 }}>
              <GeoJSON
                data={gemeindenOnly as any}
                style={(feat: any) => ({
                  color: "#555",
                  weight: 0.3,
                  fillColor: colorMode === "pop" ? colorForPop(feat?.properties?.pop) : colorForDensity(feat?.properties?.density),
                  fillOpacity: 0.55,
                }) as any}
                onEachFeature={(feature: any, layer: any) => {
                  const p = feature.properties as FProps;
                  const html = `
                    <div style="line-height:1.2">
                      <div style="font-weight:600">${p.name}</div>
                      <div style="font-size:12px">Einwohner: ${fmt(p.pop)}</div>
                      <div style="font-size:12px">Dichte: ${p.density ? fmt(Math.round(p.density)) + " je km²" : "–"}</div>
                    </div>`;
                  layer.bindTooltip(html, { direction: "auto", sticky: true });
                }}
              />
            </Pane>
          )}
          {showOrtsteile && ortsteileOnly && (
            <Pane name="ortsteile" style={{ zIndex: 440 }}>
              <GeoJSON
                data={ortsteileOnly as any}
                style={(feat: any) => ({
                  color: "#333",
                  weight: 0.5,
                  fillColor: colorMode === "pop" ? colorForPop((feat as any)?.properties?.pop) : colorForDensity((feat as any)?.properties?.density),
                  fillOpacity: 0.45,
                }) as any}
                onEachFeature={(feature: any, layer: any) => {
                  const p = feature.properties as FProps;
                  const html = `
                    <div style=\"line-height:1.2\">
                      <div style=\"font-weight:600\">${p.name}</div>
                      <div style=\"font-size:12px\">Einwohner: ${fmt(p.pop)}</div>
                      <div style=\"font-size:12px\">Dichte: ${p.density ? fmt(Math.round(p.density)) + " je km²" : "–"}</div>
                    </div>`;
                  layer.bindTooltip(html, { direction: "auto", sticky: true });
                }}
              />
            </Pane>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
