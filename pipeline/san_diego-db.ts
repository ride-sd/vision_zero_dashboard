// Step 1 of the San Diego pipeline: raw CSV -> SQLite, for inspecting the data by hand.
//   npm run db:san_diego [-- --file path/to/details.csv]
//   sqlite3 pipeline/cache/san_diego.db
// Tables: person (one row per person in a collision, as published) and beat_districts
// (the police beat -> council district crosswalk, one row per beat/district pair).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";

const DATA_URL = "https://seshat.datasd.org/traffic_collision_details/pd_collisions_details_datasd.csv";
const cache = join(import.meta.dirname, "cache");
const csvPath = join(cache, "san_diego_details.csv");
const dbPath = join(cache, "san_diego.db");

const { values: args } = parseArgs({ options: { file: { type: "string" } } });
mkdirSync(cache, { recursive: true });

let csv: string;
if (args.file) {
  csv = readFileSync(args.file, "utf8");
} else {
  console.log(`Downloading ${DATA_URL}`);
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`${DATA_URL}: ${res.status}`);
  csv = await res.text();
  writeFileSync(csvPath, csv);
}

const rows = parse(csv, { columns: (h: string[]) => h.map((c) => c.toLowerCase()), skip_empty_lines: true, bom: true }) as Record<string, string>[];
const columns = Object.keys(rows[0]!);
const INTEGER = new Set(["injured", "killed"]);

rmSync(dbPath, { force: true });
const db = new DatabaseSync(dbPath);

db.exec(`CREATE TABLE person (${columns.map((c) => `${c} ${INTEGER.has(c) ? "INTEGER" : "TEXT"}`).join(", ")})`);
const insert = db.prepare(`INSERT INTO person VALUES (${columns.map(() => "?").join(", ")})`);
db.exec("BEGIN");
for (const r of rows) insert.run(...columns.map((c) => (r[c] === "" ? null : INTEGER.has(c) ? Number(r[c]) : r[c]!)));
db.exec("COMMIT");
db.exec("CREATE INDEX person_date ON person (date_time); CREATE INDEX person_role ON person (person_role); CREATE INDEX person_report ON person (report_id)");

const crosswalk = JSON.parse(readFileSync(join(import.meta.dirname, "san_diego", "beat_districts.json"), "utf8")).beats as Record<string, Record<string, number>>;
db.exec("CREATE TABLE beat_districts (police_beat TEXT, district INTEGER, share REAL)");
const insertBeat = db.prepare("INSERT INTO beat_districts VALUES (?, ?, ?)");
for (const [beat, shares] of Object.entries(crosswalk)) for (const [d, s] of Object.entries(shares)) insertBeat.run(beat, Number(d), s);
db.exec("CREATE INDEX beat_districts_beat ON beat_districts (police_beat)");

db.close();
console.log(`Wrote ${rows.length} people to ${dbPath}`);
