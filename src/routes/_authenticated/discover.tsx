import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROPERTIES } from "@/lib/discover-data";
import { logAction } from "@/lib/consent-log";
import { AlertTriangle, ExternalLink, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/discover")({
  component: DiscoverPage,
});

function DiscoverPage() {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [minBedrooms, setMinBedrooms] = useState<string>("");
  const [minLiUnits, setMinLiUnits] = useState<number | "">("");

  const results = useMemo(() => {
    const c = city.trim().toLowerCase();
    const s = state.trim().toUpperCase();
    return PROPERTIES.filter((p) => {
      if (c && p.city.toLowerCase() !== c) return false;
      if (s && p.state !== s) return false;
      if (minBedrooms && !p.bedroom_mix.toLowerCase().includes(minBedrooms.toLowerCase())) return false;
      if (minLiUnits !== "" && p.low_income_units < minLiUnits) return false;
      return true;
    });
  }, [city, state, minBedrooms, minLiUnits]);

  function apply() {
    logAction(
      "discover.filter",
      `city=${city || "*"} state=${state || "*"} bed=${minBedrooms || "*"} li>=${minLiUnits || "*"}`,
    );
  }

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-5xl overflow-y-auto p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-primary">Stretch</div>
        <h1 className="text-2xl font-semibold">Discover — transparent property list</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Public HUD LIHTC dataset for the Boston-Cambridge-Newton MSA. We show the <b>unfiltered</b> set by
          default. Filters are yours — we never predict acceptance and never rank by protected traits
          or proxies.
        </p>

        <Card className="mt-4 flex items-start gap-2 border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <div>
            <div className="font-medium">Availability is always shown as "unknown"</div>
            <div className="text-xs text-muted-foreground">
              Unless a property publishes a live vacancy feed we can cite, we don't guess.
            </div>
          </div>
        </Card>

        <Card className="mt-4 grid gap-3 p-4 sm:grid-cols-5">
          <div className="sm:col-span-1">
            <Label htmlFor="d-city">City</Label>
            <Input id="d-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Boston" />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="d-state">State (2)</Label>
            <Input
              id="d-state"
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              placeholder="MA"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="d-bed">Bedroom contains</Label>
            <Input
              id="d-bed"
              value={minBedrooms}
              onChange={(e) => setMinBedrooms(e.target.value)}
              placeholder="2BR"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="d-li">Min income-restricted units</Label>
            <Input
              id="d-li"
              type="number"
              min={0}
              value={minLiUnits}
              onChange={(e) => setMinLiUnits(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <div className="sm:col-span-5">
            <Button size="sm" variant="outline" onClick={apply}>
              Log filter selection
            </Button>
          </div>
        </Card>

        <div className="mt-4 text-xs text-muted-foreground">
          Showing {results.length} of {PROPERTIES.length} properties.
        </div>

        <ul className="mt-2 space-y-2">
          {results.map((p) => (
            <li key={p.id}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {p.address}, {p.city}, {p.state} {p.zip}
                    </div>
                  </div>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                    Availability: {p.availability}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <Info k="Total units" v={String(p.total_units || "—")} />
                  <Info k="Income-restricted" v={String(p.low_income_units || "—")} />
                  <Info k="Bedrooms" v={p.bedroom_mix} />
                  <Info k="Placed in service" v={p.year_placed_in_service ? String(p.year_placed_in_service) : "—"} />
                  <Info k="City" v={`${p.city}, ${p.state}`} />
                  <Info k="ZIP" v={p.zip} />
                </dl>
                <a
                  href={p.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {p.source} <ExternalLink className="h-3 w-3" />
                </a>
              </Card>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs text-muted-foreground">
          RenterCompanion never contacts a property on your behalf. Reaching out is your choice.
        </p>
      </div>
    </AppShell>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-[10px] text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
