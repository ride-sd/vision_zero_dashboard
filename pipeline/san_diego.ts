// Generates public/api/san_diego.json from the SDPD collision records on data.sandiego.gov.
//   npm run update:san_diego [-- --year 2025] [-- --file path/to/details.csv]
// Defaults to the latest year present in the data (so the current year, year-to-date).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";
import type { CityData, Counts, District } from "../src/types.ts";

const DATASET_PAGE = "https://data.sandiego.gov/datasets/police-collisions-details/";
const DATA_URL = "https://seshat.datasd.org/traffic_collision_details/pd_collisions_details_datasd.csv";
const OUT = join(import.meta.dirname, "..", "public", "api", "san_diego.json");

const { values: args } = parseArgs({ options: { year: { type: "string" }, file: { type: "string" } } });

interface Row {
  DATE_TIME: string;
  PERSON_ROLE: string;
  PERSON_INJURY_LVL: string;
  POLICE_BEAT: string;
}

const csv = args.file ? readFileSync(args.file, "utf8") : await fetchText(DATA_URL);
const rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true }) as Row[];

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

const latest = rows.reduce((max, r) => (r.DATE_TIME > max ? r.DATE_TIME : max), "");
const year = Number(args.year ?? latest.slice(0, 4));
const asOf = latest.slice(0, 10);

const crosswalk = JSON.parse(readFileSync(join(import.meta.dirname, "san_diego", "beat_districts.json"), "utf8")).beats as Record<string, Record<string, number>>;
const council = JSON.parse(readFileSync(join(import.meta.dirname, "san_diego", "council.json"), "utf8")) as Pick<District, "id" | "member">[];
const ids = council.map((c) => c.id);

type Mode = "pedestrians" | "cyclists";
type Kind = keyof Counts;
const ROLES: Record<string, Mode> = { PEDESTRIAN: "pedestrians", BICYCLIST: "cyclists" };

// exact totals + fractional per-district allocation (beats straddling districts are split by area)
const totals: Record<Mode, Counts> = { pedestrians: { killed: 0, injured: 0 }, cyclists: { killed: 0, injured: 0 } };
const share = {} as Record<`${Mode}.${Kind}`, Map<number, number>>;
for (const m of ["pedestrians", "cyclists"] as const) for (const k of ["killed", "injured"] as const) share[`${m}.${k}`] = new Map(ids.map((id) => [id, 0]));

let unmatched = 0;
for (const r of rows) {
  const mode = ROLES[r.PERSON_ROLE];
  if (!mode || !r.DATE_TIME.startsWith(String(year)) || !r.PERSON_INJURY_LVL) continue;
  // FATAL = killed; every other recorded injury level (the scale was renamed in 2025) = injured
  const kind: Kind = r.PERSON_INJURY_LVL === "FATAL" ? "killed" : "injured";
  totals[mode][kind]++;
  const weights = crosswalk[r.POLICE_BEAT];
  if (!weights) { unmatched++; continue; }
  const map = share[`${mode}.${kind}`];
  for (const [id, w] of Object.entries(weights)) map.set(Number(id), (map.get(Number(id)) ?? 0) + w);
}

/** Round fractional shares to integers that sum to `total` (largest remainder); unmatched beats are spread pro rata. */
function apportion(map: Map<number, number>, total: number): Map<number, number> {
  const assigned = [...map.values()].reduce((s, n) => s + n, 0);
  const exact = new Map([...map].map(([id, n]) => [id, assigned ? (n / assigned) * total : total / map.size]));
  const out = new Map([...exact].map(([id, n]) => [id, Math.floor(n)]));
  let left = total - [...out.values()].reduce((s, n) => s + n, 0);
  for (const [id] of [...exact].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (left-- <= 0) break;
    out.set(id, out.get(id)! + 1);
  }
  return out;
}

const per = (m: Mode, k: Kind) => apportion(share[`${m}.${k}`], totals[m][k]);
const [pk, pi, ck, ci] = [per("pedestrians", "killed"), per("pedestrians", "injured"), per("cyclists", "killed"), per("cyclists", "injured")];

const data: CityData = {
  slug: "san_diego",
  city: "San Diego",
  year,
  asOf,
  source: { name: "San Diego Police Department traffic collisions (data.sandiego.gov)", url: DATASET_PAGE },
  districtName: "District",
  totals,
  districtDataEstimated: true,
  districtDataNote:
    "SDPD reports crashes by police beat, not council district. Beats that straddle district lines are split by area, so district numbers are estimates. Freeway crashes (handled by CHP) are not included.",
  districts: council.map((c) => ({
    id: c.id,
    name: `District ${c.id}`,
    member: c.member,
    pedestrians: { killed: pk.get(c.id)!, injured: pi.get(c.id)! },
    cyclists: { killed: ck.get(c.id)!, injured: ci.get(c.id)! },
  })),
};

writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
console.log(`San Diego ${year} (data through ${asOf}): pedestrians ${JSON.stringify(totals.pedestrians)}, cyclists ${JSON.stringify(totals.cyclists)}; ${unmatched} records on unmapped beats spread pro rata`);
