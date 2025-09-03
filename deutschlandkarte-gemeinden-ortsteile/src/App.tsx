import { useEffect, useMemo, useState } from "react";
import Map, { Layer, Source, Popup, MapLayerMouseEvent } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import { MapLibreGLWorker } from "maplibre-gl/dist/maplibre-gl-csp-worker";
import "maplibre-gl/dist/maplibre-gl.css";
// @ts-ignore - assign CSP-safe worker for strict hosts
(maplibregl as any).workerClass = MapLibreGLWorker;
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FeatureProps = {
  id: string;
  name: string;
  parent?: string;
  county?: string;
  ags?: string;
  pop?: number | null;
  area_km2?: number | null;
  density?: number | null;
  kind: "gemeinde" | "ortsteil";
  rank?: number;
};

type GeoFeature = {
  type: "Feature";
  id?: string | number;
  properties: FeatureProps;
  geometry: any;
};

type FC = { type: "FeatureCollection"; features: GeoFeature[] };

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("de-DE");
}

function colorExpr(): any {
  return [
    "step",
    ["get", "pop"],
    "#7f0000",
    5000, "#cc0000",
    10000, "#ff66a3",
    20000, "#cc5500",
    30000, "#ff9900",
    40000, "#ffff00",
    50000, "#add8e6",
    60000, "#0000ff",
    80000, "#90ee90",
    100000, "#008000",
  ];
}

export default function App() {
  const [gemeinden, setGemeinden] = useState<FC | null>(null);
  const [ortsteile, setOrtsteile] = useState<FC | null>(null);
  const [query, setQuery] = useState("");
  const [showGemeinden, setShowGemeinden] = useState(true);
  const [showOrtsteile, setShowOrtsteile] = useState(true);
  const [hoverF, setHoverF] = useState<GeoFeature | null>(null);
  const [hoverPos, setHoverPos] = useState<{ lng: number; lat: number } | null>(null);

  useEffect(() => {
    fetch("/data/gemeinden.geojson").then((r) => r.json()).then((d) => setGemeinden(d));
    fetch("/data/ortsteile.geojson").then((r) => r.json()).then((d) => setOrtsteile(d));
  }, []);

  const combined = useMemo(() => {
    const feats: GeoFeature[] = [];
    if (gemeinden) feats.push(...gemeinden.features);
    if (ortsteile) feats.push(...ortsteile.features);
    const sorted = feats
      .map((f) => ({ ...f, properties: { ...f.properties, pop: f.properties.pop ?? null } }))
      .sort((a, b) => {
        const pa = a.properties.pop ?? -1;
        const pb = b.properties.pop ?? -1;
        if (pa === -1 && pb === -1) return 0;
        if (pa === -1) return 1;
        if (pb === -1) return -1;
        return pa - pb;
      });
    let rank = 1;
    const ranked = sorted.map((f) => ({
      ...f,
      properties: { ...f.properties, rank: f.properties.pop ? rank++ : undefined },
    }));
    return ranked;
  }, [gemeinden, ortsteile]);

  const listItems = useMemo(() => {
    const nameMatch = (s: string) => s.toLowerCase().includes(query.toLowerCase());
    const arr = combined.filter((f) => {
      const p = f.properties;
      return (
        nameMatch(p.name) ||
        (p.parent && nameMatch(p.parent)) ||
        (p.county && nameMatch(p.county))
      );
    });
    return arr;
  }, [combined, query]);

  const gemeindenFC = useMemo<FC | null>(() => {
    if (!gemeinden) return null;
    return {
      type: "FeatureCollection",
      features: combined.filter((f) => f.properties.kind === "gemeinde"),
    };
  }, [combined, gemeinden]);

  const ortsteileFC = useMemo<FC | null>(() => {
    if (!ortsteile) return null;
    return {
      type: "FeatureCollection",
      features: combined.filter((f) => f.properties.kind === "ortsteil"),
    };
  }, [combined, ortsteile]);

  function onMove(e: MapLayerMouseEvent) {
    const f = e.features && e.features[0];
    if (!f) return setHoverF(null);
    setHoverF(f as any);
    setHoverPos({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  }

  return (
    <div className="h-screen w-screen grid grid-cols-[360px_1fr]">
      <div className="border-r border-border flex flex-col">
        <div className="p-4 space-y-3">
          <div className="text-xl font-serif">Deutschlandkarte – Gemeinden & Ortsteile</div>
          <div className="text-sm text-muted-foreground">Gemeinden, Städte und Ortsteile</div>
          <div className="flex items-center gap-2 pt-2">
            <Switch checked={showGemeinden} onCheckedChange={setShowGemeinden} id="g" />
            <Label htmlFor="g">Gemeinden/Städte</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showOrtsteile} onCheckedChange={setShowOrtsteile} id="o" />
            <Label htmlFor="o">Ortsteile</Label>
          </div>
          <Input placeholder="Suchen nach Name, Gemeinde, Kreis" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Tabs defaultValue="liste" className="flex flex-1 min-h-0 flex-col">
          <TabsList className="mx-4">
            <TabsTrigger value="liste">Liste</TabsTrigger>
            <TabsTrigger value="legende">Legende</TabsTrigger>
          </TabsList>
          <TabsContent value="liste" className="flex-1 min-h-0">
            <ScrollArea className="h-full px-4">
              <div className="space-y-2 pb-6">
                {listItems.map((f) => {
                  const p = f.properties;
                  return (
                    <div key={`${p.kind}-${p.id}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.rank ? `#${p.rank}` : "#–"}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.kind === "ortsteil" ? (p.parent ? p.parent + ", " : "") : ""}
                        {p.county ?? ""}
                      </div>
                      <div className="mt-1 text-sm">Einwohner: {fmt(p.pop)}</div>
                      <div className="text-sm">Dichte: {p.density ? `${fmt(Math.round(p.density))} je km²` : "–"}</div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="legende" className="px-4">
            <div className="grid grid-cols-1 gap-2 pb-6">
              {[{
                label: "0 – 5.000",
                color: "#7f0000",
              }, {
                label: "5.001 – 10.000",
                color: "#cc0000",
              }, {
                label: "10.001 – 20.000",
                color: "#ff66a3",
              }, {
                label: "20.001 – 30.000",
                color: "#cc5500",
              }, {
                label: "30.001 – 40.000",
                color: "#ff9900",
              }, {
                label: "40.001 – 50.000",
                color: "#ffff00",
              }, {
                label: "50.001 – 60.000",
                color: "#add8e6",
              }, {
                label: "60.001 – 80.000",
                color: "#0000ff",
              }, {
                label: "80.001 – 100.000",
                color: "#90ee90",
              }, {
                label: "100.001+",
                color: "#008000",
              }].map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-sm" style={{ background: b.color }} />
                  <div className="text-sm">{b.label} Einwohner</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <div className="relative">
        <Map
          mapLib={maplibregl as any}
          initialViewState={{ longitude: 10.5, latitude: 51.2, zoom: 5.2 }}
          style={{ width: "100%", height: "100%" }}
          mapStyle={{
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution:
                  "© OpenStreetMap-Mitwirkende",
              },
            },
            layers: [
              { id: "osm", type: "raster", source: "osm" },
            ],
          } as any}
          interactiveLayerIds={["gemeinden-fill", "ortsteile-fill"]}
          onMouseMove={onMove}
        >
          {showGemeinden && gemeindenFC && (
            <Source id="gemeinden" type="geojson" data={gemeindenFC} promoteId="properties.id">
              <Layer id="gemeinden-fill" type="fill" paint={{ "fill-color": colorExpr(), "fill-opacity": 0.55, "fill-outline-color": "#555" }} />
            </Source>
          )}
          {showOrtsteile && ortsteileFC && (
            <Source id="ortsteile" type="geojson" data={ortsteileFC} promoteId="properties.id">
              <Layer id="ortsteile-fill" type="fill" paint={{ "fill-color": colorExpr(), "fill-opacity": 0.45, "fill-outline-color": "#333" }} />
            </Source>
          )}
          {hoverF && hoverPos && (
            <Popup longitude={hoverPos.lng} latitude={hoverPos.lat} closeButton={false} closeOnClick={false} anchor="bottom" offset={8}>
              <div className="space-y-0.5">
                <div className="font-medium text-sm flex items-center gap-2">
                  <span>{hoverF.properties.name}</span>
                  <span className="text-xs text-muted-foreground">{hoverF.properties.rank ? `#${hoverF.properties.rank}` : "#–"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {(hoverF.properties.kind === "ortsteil" && hoverF.properties.parent ? hoverF.properties.parent + ", " : "")}
                  {hoverF.properties.county ?? ""}
                </div>
                <div className="text-xs">Einwohner: {fmt(hoverF.properties.pop)}</div>
                <div className="text-xs">Dichte: {hoverF.properties.density ? `${fmt(Math.round(hoverF.properties.density))} je km²` : "–"}</div>
              </div>
            </Popup>
          )}
        </Map>
        {!gemeinden && (
          <div className="absolute left-4 top-4 rounded-md bg-background/90 border px-3 py-2 text-sm shadow">Daten werden geladen …</div>
        )}
      </div>
    </div>
  );
}
