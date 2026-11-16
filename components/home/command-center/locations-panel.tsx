"use client";

import { Globe2 } from "lucide-react";
import { useState } from "react";

import { BarRow, Panel, Segmented } from "@/components/home/command-center/panel";
import { percentOf, type LocationBreakdown } from "@/lib/home-command-center";

/**
 * The map reuses the repository's GSHHG coastline asset (/world-coastlines.svg,
 * LGPL-3.0): an equirectangular 720×290 frame covering 85°N to 60°S, so
 * x = (lon + 180) × 2 and y = (85 − lat) × 2. Region boxes keep that 720:290
 * aspect ratio so bubbles and coastline stay aligned at every zoom.
 */
const MAP_W = 720;
const MAP_H = 290;

const REGIONS = {
  world: { label: "World", box: [0, 0, 720, 290] },
  asia: { label: "Asia", box: [470, 80, 180, 72.5] },
  europe: { label: "Europe", box: [336, 46, 100, 40.3] },
} as const;

type RegionId = keyof typeof REGIONS;

export function LocationsPanel({ breakdown }: { breakdown: LocationBreakdown | null }) {
  const [view, setView] = useState<"list" | "map">("list");
  const [region, setRegion] = useState<RegionId>("world");
  const rows = breakdown?.rows ?? [];
  const [selected, setSelected] = useState(rows[0]?.name ?? "");
  const known = breakdown?.recognised ?? 0;
  const coverage = breakdown ? percentOf(breakdown.filled, breakdown.total) : "—";
  const top = rows.slice(0, 4);
  const rest = rows.slice(4);
  const restLeads = rest.reduce((sum, row) => sum + row.leads, 0);
  const max = Math.max(1, ...rows.map((row) => row.leads));
  const picked = rows.find((row) => row.name === selected) ?? rows[0];
  const [bx, by, bw, bh] = REGIONS[region].box;

  return (
    <Panel
      id="home-locations"
      icon={<Globe2 size={19} />}
      title="Top locations"
      badge={breakdown ? { text: `${coverage} known`, tone: "warn" } : null}
      controls={
        <Segmented
          label="Location view"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "List" },
            { value: "map", label: "Map" },
          ]}
        />
      }
      className="flex-[1_1_320px]"
    >
      {!rows.length ? (
        <p className="rounded-xl bg-brand-50 px-3 py-6 text-center text-[13px] text-copy-muted">No recognised lead locations yet.</p>
      ) : view === "list" ? (
        <div className="flex flex-col gap-3">
          {top.map((row) => (
            <BarRow key={row.name} label={row.name} value={row.leads} max={max} />
          ))}
          {rest.length ? <BarRow label={`Other (${rest.length})`} value={restLeads} max={max} muted /> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div
            data-testid="home-location-map"
            className="relative w-full overflow-hidden rounded-xl bg-surface-soft"
            style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
          >
            <div
              className="absolute transition-all duration-300 ease-out motion-reduce:transition-none"
              style={{
                width: `${(MAP_W / bw) * 100}%`,
                height: `${(MAP_H / bh) * 100}%`,
                left: `${(-bx / bw) * 100}%`,
                top: `${(-by / bh) * 100}%`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/world-coastlines.svg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full" />
              {rows.map((row) => {
                if (row.lon == null || row.lat == null) return null;
                const left = ((row.lon + 180) * 2 / MAP_W) * 100;
                const topPct = ((85 - row.lat) * 2 / MAP_H) * 100;
                const size = Math.round(12 + Math.sqrt(row.leads) * 4.5);
                const active = row.name === picked?.name;
                return (
                  <button
                    key={row.name}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${row.name}, ${row.leads} leads`}
                    title={`${row.name} · ${row.leads}`}
                    onClick={() => setSelected(row.name)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white transition focus-visible:outline-2 focus-visible:outline-brand-700 ${active ? "bg-brand-800 ring-4 ring-brand-100" : "bg-brand-600/75 hover:bg-brand-700"}`}
                    style={{ left: `${left}%`, top: `${topPct}%`, width: size, height: size }}
                  />
                );
              })}
            </div>
          </div>
          <div role="group" aria-label="Map region" className="flex flex-wrap gap-1.5">
            {(Object.keys(REGIONS) as RegionId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === region}
                onClick={() => setRegion(id)}
                className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition ${id === region ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-surface text-copy-muted hover:text-copy-strong"}`}
              >
                {REGIONS[id].label}
              </button>
            ))}
          </div>
          {picked ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-copy-strong">
              <span>
                <strong>{picked.name}</strong> · {picked.leads.toLocaleString("en-IN")} leads · {percentOf(picked.leads, known)} of known
              </span>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
