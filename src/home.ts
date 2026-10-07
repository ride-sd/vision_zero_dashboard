import "./styles.css";
import type { CityIndexEntry, Config } from "./types";

const fmt = new Intl.NumberFormat("en-US");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stat(kind: "killed" | "injured", value: number): HTMLElement {
  const wrap = el("div", `stat stat--${kind}`);
  wrap.append(el("div", "stat__num", fmt.format(value)), el("div", "stat__label", kind));
  return wrap;
}

async function main() {
  // Production forwards the root to the default city; the dev server keeps the city list.
  if (import.meta.env.PROD) {
    const { defaultCity }: Config = await (await fetch("/config.json")).json();
    if (defaultCity) {
      location.replace(`/${defaultCity}`);
      return;
    }
  }

  const list = document.getElementById("cities")!;
  const cities: CityIndexEntry[] = await (await fetch("/api/cities.json")).json();
  for (const c of cities) {
    const li = el("li");
    const a = el("a", "city");
    a.href = `/${c.slug}`;
    const head = el("div", "city__head");
    head.append(el("span", "city__name", c.name), el("span", "city__arrow", "→"));
    a.append(head, el("div", "city__year", `${c.year} · pedestrians & cyclists`));
    const stats = el("div", "city__stats");
    stats.append(stat("killed", c.killed), stat("injured", c.injured));
    a.append(stats);
    li.append(a);
    list.append(li);
  }
}

main();
