// One-off (re-run only when beat or district boundaries change):
//   npm run build:crosswalk:san_diego
// Estimates what share of each SDPD police beat lies in each council district by sampling a
// ~50 m grid, and writes pipeline/san_diego/beat_districts.json. The collision data only has a
// police beat per record (no coordinates), so this is how crashes get mapped to districts.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BEATS_URL = "https://seshat.datasd.org/gis_police_beats/pd_beats_datasd.geojson";
const DISTRICTS_URL = "https://seshat.datasd.org/gis_city_council_districts/council_districts_datasd.geojson";
const STEP = 0.0005; // degrees, ~50 m

type Ring = number[][];
type Poly = Ring[];
interface Feature {
  properties: Record<string, unknown>;
  geometry: { type: "Polygon"; coordinates: Poly } | { type: "MultiPolygon"; coordinates: Poly[] };
}

async function getFeatures(url: string): Promise<Feature[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return ((await res.json()) as { features: Feature[] }).features;
}

const polys = (f: Feature): Poly[] => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPoly = (x: number, y: number, p: Poly) => inRing(x, y, p[0]!) && !p.slice(1).some((h) => inRing(x, y, h));

function bbox(ps: Poly[]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of ps) for (const [x, y] of p[0]!) {
    x0 = Math.min(x0, x!); x1 = Math.max(x1, x!); y0 = Math.min(y0, y!); y1 = Math.max(y1, y!);
  }
  return [x0, y0, x1, y1];
}

console.log("Downloading boundaries…");
const [beatFeatures, districtFeatures] = await Promise.all([getFeatures(BEATS_URL), getFeatures(DISTRICTS_URL)]);

const districts = districtFeatures.map((f) => {
  const ps = polys(f);
  return { id: Number(f.properties.district), ps, box: bbox(ps) };
});

const counts = new Map<string, Map<number, number>>(); // beat -> district -> samples
for (const f of beatFeatures) {
  const beat = String(f.properties.beat);
  if (beat === "0") continue; // placeholder "San Diego" shape, not a real beat
  const ps = polys(f);
  const [x0, y0, x1, y1] = bbox(ps);
  const tally = counts.get(beat) ?? new Map<number, number>();
  for (let x = Math.ceil(x0 / STEP) * STEP; x <= x1; x += STEP) {
    for (let y = Math.ceil(y0 / STEP) * STEP; y <= y1; y += STEP) {
      if (!ps.some((p) => inPoly(x, y, p))) continue;
      const d = districts.find((d) => x >= d.box[0] && x <= d.box[2] && y >= d.box[1] && y <= d.box[3] && d.ps.some((p) => inPoly(x, y, p)));
      if (d) tally.set(d.id, (tally.get(d.id) ?? 0) + 1);
    }
  }
  counts.set(beat, tally);
}

const beats: Record<string, Record<string, number>> = {};
for (const [beat, tally] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
  const total = [...tally.values()].reduce((s, n) => s + n, 0);
  if (!total) continue; // beat lies outside all council districts
  beats[beat] = Object.fromEntries([...tally].sort(([a], [b]) => a - b).map(([id, n]) => [id, Math.round((n / total) * 1000) / 1000]));
}

const out = join(import.meta.dirname, "san_diego", "beat_districts.json");
writeFileSync(out, JSON.stringify({ step: STEP, sources: [BEATS_URL, DISTRICTS_URL], beats }, null, 1) + "\n");
console.log(`Wrote ${Object.keys(beats).length} beats to ${out}`);
