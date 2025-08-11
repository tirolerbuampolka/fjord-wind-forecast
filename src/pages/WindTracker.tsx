import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATIONS, degToCardinal, recommendGear, useWindTracker } from "@/hooks/useWindTracker";
import { toast } from "@/hooks/use-toast";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Wind, Bell, Gauge, Timer } from "lucide-react";

function useSeo(title: string, description: string, path = "/wind") {
  useEffect(() => {
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", description);
    const link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const canonical = `${window.location.origin}${path}`;
    if (link) link.href = canonical; else {
      const l = document.createElement("link");
      l.rel = "canonical"; l.href = canonical; document.head.appendChild(l);
    }
  }, [title, description, path]);
}

function InfoStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default function WindTracker() {
  useSeo(
    "Windsurf Wind Tracker – Drøbak to Lysaker",
    "Live wind from Drøbak to Lysaker with ETA prediction and gear advice for windsurfers.",
    "/wind"
  );

  const [apiBase, setApiBase] = useState<string>(() => localStorage.getItem("wind_api_base") || "");
  const [weight, setWeight] = useState<number>(() => Number(localStorage.getItem("wind_weight") || 85));

  const { drobak, lysaker, drobakHist, lysakerHist, isBuildingAtDrobak, etaMinutes, lastAlertRef } = useWindTracker({
    baseUrl: apiBase || undefined,
  });

  useEffect(() => {
    if (isBuildingAtDrobak && etaMinutes && Date.now() - lastAlertRef.current > 5 * 60_000) {
      lastAlertRef.current = Date.now();
      toast({
        title: "Wind building in Drøbak",
        description: `Estimated arrival at Lysaker in ~${etaMinutes} min. Get ready!`,
      });
    }
  }, [isBuildingAtDrobak, etaMinutes, lastAlertRef]);

  const refSpeed = drobak?.wind.speed ?? 6;
  const gear = useMemo(() => recommendGear(weight, refSpeed), [weight, refSpeed]);

  const savePrefs = () => {
    localStorage.setItem("wind_api_base", apiBase);
    localStorage.setItem("wind_weight", String(weight));
    toast({ title: "Preferences saved", description: apiBase ? "Using your API" : "Using simulated data" });
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/10 via-accent/10 to-background">
      <header className="container py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Windsurf Wind Tracker</h1>
            <p className="text-muted-foreground max-w-2xl mt-2">
              Live wind tracking from <strong>{STATIONS.drobak.name}</strong> to <strong>{STATIONS.lysaker.name}</strong> with ETA
              prediction and personalized gear suggestions.
            </p>
          </div>
          <div className="flex gap-2 items-end">
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="api">API Base URL (optional)</label>
              <Input id="api" placeholder="https://your-api.example.com" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="w">Rider weight (kg)</label>
              <Input id="w" type="number" min={40} max={130} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
            </div>
            <Button onClick={savePrefs} className="self-end">Save</Button>
          </div>
        </div>
      </header>

      <section className="container grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2"><Wind className="size-4" /> {STATIONS.drobak.name} (ID {STATIONS.drobak.id})</CardTitle>
            <span className="text-xs text-muted-foreground">{drobak ? new Date(drobak.dateTime).toLocaleTimeString() : "—"}</span>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-6">
              <InfoStat label="Wind" value={`${drobak?.wind.speed?.toFixed(1) ?? "—"} m/s`} sub={`Gust ${drobak?.wind.gust?.toFixed(1) ?? "—"} m/s`} />
              <InfoStat label="Dir" value={`${Math.round(drobak?.wind.direction ?? 0)}°`} sub={degToCardinal(drobak?.wind?.direction)} />
              <InfoStat label="Trend" value={isNaN((drobak?.wind.speed ?? 0) - (drobakHist.at(-6)?.speed ?? 0)) ? "—" : `${(((drobak?.wind.speed ?? 0) - (drobakHist.at(-6)?.speed ?? 0))).toFixed(1)} m/s`} sub={isBuildingAtDrobak ? "Building" : "Stable/Calm"} />
            </div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={drobakHist} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <XAxis dataKey="t" tick={false} axisLine={false} />
                  <YAxis width={30} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="speed" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="gust" stroke="hsl(var(--ring))" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2"><Gauge className="size-4" /> {STATIONS.lysaker.name} (ID {STATIONS.lysaker.id})</CardTitle>
            <span className="text-xs text-muted-foreground">{lysaker ? new Date(lysaker.dateTime).toLocaleTimeString() : "—"}</span>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-6">
              <InfoStat label="Wind" value={`${lysaker?.wind.speed?.toFixed(1) ?? "—"} m/s`} sub={`Gust ${lysaker?.wind.gust?.toFixed(1) ?? "—"} m/s`} />
              <InfoStat label="Dir" value={`${Math.round(lysaker?.wind.direction ?? 0)}°`} sub={degToCardinal(lysaker?.wind?.direction)} />
              <InfoStat label="Trend" value={isNaN((lysaker?.wind.speed ?? 0) - (lysakerHist.at(-6)?.speed ?? 0)) ? "—" : `${(((lysaker?.wind.speed ?? 0) - (lysakerHist.at(-6)?.speed ?? 0))).toFixed(1)} m/s`} sub={((lysaker?.wind.speed ?? 0) - (lysakerHist.at(-6)?.speed ?? 0)) > 0.08 ? "Building" : "Stable/Calm"} />
            </div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lysakerHist} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <XAxis dataKey="t" tick={false} axisLine={false} />
                  <YAxis width={30} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="speed" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="gust" stroke="hsl(var(--ring))" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="container grid gap-6 my-8">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Timer className="size-4" /> ETA Prediction</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {etaMinutes ? (
              <div className="flex items-center gap-3">
                <div className="text-3xl font-semibold">~{etaMinutes} min</div>
                <div className="text-muted-foreground">from {STATIONS.drobak.name} to {STATIONS.lysaker.name}</div>
              </div>
            ) : (
              <div className="text-muted-foreground">Waiting for wind to build in {STATIONS.drobak.name}…</div>
            )}
            <p className="text-sm text-muted-foreground">Calculated from current wind and recent trend. This is an estimate and may vary with local effects.</p>
            
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Live Camera View</h3>
              <div className="relative rounded-lg overflow-hidden border">
                <img 
                  src={`http://lbk.zapto.org/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=wuuPhkmUCeI9WG7C&user=webcampaanett&password=lbkpasnrd&t=${Math.floor(Date.now() / 300000)}`}
                  alt="Live camera view of wind conditions"
                  className="w-full h-auto max-h-64 object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Updates every 5 minutes</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="container my-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="size-4" /> Gear Recommendations</CardTitle>
            <p className="text-sm text-muted-foreground">Equipment suggestions based on {refSpeed.toFixed(1)} m/s wind speed</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rider Weight</TableHead>
                  <TableHead>Board Width</TableHead>
                  <TableHead>Sail Size</TableHead>
                  <TableHead>Fin Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[55, 65, 75, 85, 95, 105].map((w) => {
                  const g = recommendGear(w, refSpeed);
                  const isCurrentUser = w === weight;
                  return (
                    <TableRow key={w} className={isCurrentUser ? "bg-primary/5" : ""}>
                      <TableCell className="font-medium">{w} kg</TableCell>
                      <TableCell>{g.boardWidthCm} cm</TableCell>
                      <TableCell>{g.sailM2} m²</TableCell>
                      <TableCell>{g.finCm} cm</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-4">Your current weight ({weight} kg) is highlighted.</p>
          </CardContent>
        </Card>
      </section>

      <footer className="container py-10 text-center text-sm text-muted-foreground">
        <span>Data format: </span>
        <code>{`{ stationId, dateTime, wind: { speed, gust, min, unit, direction } }`}</code>. Provide API base to use your live data.
      </footer>
    </main>
  );
}
