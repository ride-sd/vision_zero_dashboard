import "./styles.css";
import type { CityData, Config, CouncilMember, District } from "./types";

const $ = (id: string) => document.getElementById(id)!;
const fmt = new Intl.NumberFormat("en-US");

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- tooltip ---------- */
const tip = $("tip");

function showTip(target: HTMLElement, ped: number, cyc: number) {
  tip.replaceChildren();
  for (const [label, n] of [["Pedestrians", ped], ["Cyclists", cyc]] as const) {
    const line = el("div");
    line.append(`${label}: `, el("b", "", fmt.format(n)));
    tip.append(line);
  }
  tip.hidden = false;
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8);
  const above = r.top - t.height - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${above > 8 ? above : r.bottom + 8}px`;
}

function attachTip(node: HTMLElement, ped: number, cyc: number) {
  node.tabIndex = 0;
  node.addEventListener("mouseenter", () => showTip(node, ped, cyc));
  node.addEventListener("focus", () => showTip(node, ped, cyc));
  node.addEventListener("mouseleave", () => (tip.hidden = true));
  node.addEventListener("blur", () => (tip.hidden = true));
}

/* ---------- helpers ---------- */
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function avatar(member: CouncilMember): HTMLElement {
  const fallback = () => el("div", "avatar", initials(member.name));
  if (!member.photo) return fallback();
  const img = el("img", "avatar");
  img.src = member.photo;
  img.alt = member.name;
  img.loading = "lazy";
  img.addEventListener("error", () => img.replaceWith(fallback()), { once: true });
  return img;
}

function ctaUrl(template: string, district: District): string {
  return (
    district.member.actionUrl ??
    template
      .replaceAll("{district}", encodeURIComponent(district.id))
      .replaceAll("{member}", encodeURIComponent(district.member.name))
  );
}

/* ---------- render ---------- */
function metric(kind: "killed" | "injured", label: string, ped: number, cyc: number, max: number) {
  const total = ped + cyc;
  const wrap = el("div", `metric metric--${kind}`);
  wrap.append(el("div", "metric__label", label));
  const val = el("div", "metric__val", fmt.format(total));
  attachTip(val, ped, cyc);
  wrap.append(val);

  const bar = el("div", "bar");
  const fill = el("div", "bar__fill");
  const p = el("span", "bar__ped");
  const c = el("span", "bar__cyc");
  p.style.width = `${total ? (ped / total) * 100 : 0}%`;
  c.style.width = `${total ? (cyc / total) * 100 : 0}%`;
  fill.append(p, c);
  bar.append(fill);
  wrap.append(bar);
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${max ? (total / max) * 100 : 0}%`)));
  return wrap;
}

function render(city: CityData, cta: Config["cta"]) {
  document.title = `Vision Zero ${city.city}`;
  $("title").textContent = `${city.city}: traffic deaths & injuries`;
  $("subtitle").textContent = `Pedestrians and cyclists, ${city.year}`;

  const t = city.totals;
  for (const [id, key] of [["total-killed", "killed"], ["total-injured", "injured"]] as const) {
    const node = $(id);
    node.textContent = fmt.format(t.pedestrians[key] + t.cyclists[key]);
    attachTip(node, t.pedestrians[key], t.cyclists[key]);
  }

  if (city.districtDataEstimated) {
    $("estimate-note").textContent = city.districtDataNote ?? "District numbers are estimates.";
    $("estimate-note").hidden = false;
  }

  const maxKilled = Math.max(...city.districts.map((d) => d.pedestrians.killed + d.cyclists.killed));
  const maxInjured = Math.max(...city.districts.map((d) => d.pedestrians.injured + d.cyclists.injured));

  const rows = $("rows");
  rows.replaceChildren();
  for (const d of city.districts) {
    const row = el("li", "row");

    const who = el("div", "who");
    who.append(el("div", "who__district", d.name), el("div", "who__member", d.member.name));

    const link = el("a", "cta", cta.label);
    link.href = ctaUrl(cta.url, d);
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `${cta.label} ${d.member.name}, ${d.name}`);

    row.append(
      avatar(d.member),
      who,
      metric("killed", "Killed", d.pedestrians.killed, d.cyclists.killed, maxKilled),
      metric("injured", "Injured", d.pedestrians.injured, d.cyclists.injured, maxInjured),
      link,
    );
    rows.append(row);
  }
}

async function main() {
  try {
    const config = await loadJson<Config>("config.json");
    const slug = location.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!/^[a-z0-9_]+$/.test(slug)) throw new Error("Unknown city");
    const city = await loadJson<CityData>(`data/${slug}.json`).catch(() => {
      throw new Error(`No data for "${slug}"`);
    });
    render(city, config.cta);
  } catch (err) {
    const e = $("error");
    e.textContent = err instanceof Error ? err.message : String(err);
    e.hidden = false;
  }
}

main();
