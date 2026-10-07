// Builds public/data/cities.json from the per-city data files, so cities are declared in one place only.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { CityData, CityIndexEntry } from "../src/types.ts";

const dir = join(import.meta.dirname, "..", "public", "data");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "cities.json");

const cities: CityIndexEntry[] = files.map((file) => {
  const data = JSON.parse(readFileSync(join(dir, file), "utf8")) as Partial<CityData>;
  const slug = basename(file, ".json");
  if (data.slug !== slug) throw new Error(`${file}: "slug" must be "${slug}" (found ${JSON.stringify(data.slug)})`);
  if (!data.city) throw new Error(`${file}: missing "city"`);
  const t = data.totals!;
  return {
    slug,
    name: data.city,
    year: data.year!,
    killed: t.pedestrians.killed + t.cyclists.killed,
    injured: t.pedestrians.injured + t.cyclists.injured,
  };
});

cities.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(dir, "cities.json"), JSON.stringify(cities, null, 2) + "\n");
console.log(`cities.json: ${cities.map((c) => c.slug).join(", ")}`);
