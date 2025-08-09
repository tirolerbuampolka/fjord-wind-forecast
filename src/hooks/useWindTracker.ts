import { useEffect, useMemo, useRef, useState } from "react";
import { formatISO } from "date-fns";

export type WindPayload = {
  stationId: number;
  stationName: string;
  dateTime: string; // ISO or "YYYY-MM-DD HH:mm:ss"
  wind: {
    speed: number; // m/s
    gust: number; // m/s
    min: number; // m/s
    unit: string; // "m/s"
    direction: number; // degrees
  };
  humidity?: number;
  pressure?: number;
  rain?: number;
  temperature?: number;
};

export type HistoricPoint = {
  t: string; // ISO time
  speed: number;
  gust: number;
};

export const STATIONS = {
  drobak: { id: 101, name: "Drøbak" },
  lysaker: { id: 201, name: "Lysaker" },
} as const;

function toISO(dateTime: string) {
  // Try to normalize to ISO
  if (dateTime.includes("T")) return dateTime;
  // Assume "YYYY-MM-DD HH:mm:ss"
  return dateTime.replace(" ", "T");
}

function randBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// Simple random-walk simulator for development/demo when API is absent
function simulateCurrent(
  station: keyof typeof STATIONS,
  prev?: WindPayload
): WindPayload {
  const baseSpeed = station === "drobak" ? 5 : 3;
  const drift = station === "drobak" ? randBetween(-0.3, 0.9) : randBetween(-0.4, 0.6);
  const prevSpeed = prev?.wind.speed ?? baseSpeed + randBetween(-1, 1);
  const speed = clamp(prevSpeed + drift, 0, 20);
  const gust = clamp(speed + randBetween(0.2, 2.5), speed, speed + 4);
  const min = clamp(speed - randBetween(0.1, 1), 0, speed);
  const direction = station === "drobak" ? 190 + randBetween(-20, 20) : 200 + randBetween(-25, 25);
  const now = new Date();
  return {
    stationId: STATIONS[station].id,
    stationName: STATIONS[station].name,
    dateTime: formatISO(now),
    wind: { speed, gust, min, unit: "m/s", direction },
    humidity: 60 + randBetween(-15, 15),
    pressure: 1015 + randBetween(-8, 8),
    rain: randBetween(0, 0.2),
    temperature: 12 + randBetween(-2, 8),
  };
}

function simulateHistoric(
  current: WindPayload,
  minutes = 180
): HistoricPoint[] {
  const pts: HistoricPoint[] = [];
  let speed = current.wind.speed;
  let gust = current.wind.gust;
  const now = new Date();
  for (let i = minutes; i >= 0; i -= 5) {
    // drift backward to create plausible history
    speed = clamp(speed + randBetween(-0.5, 0.6), 0, 22);
    gust = clamp(Math.max(gust, speed) + randBetween(-0.4, 0.9), speed, speed + 5);
    const t = new Date(now.getTime() - i * 60_000);
    pts.push({ t: formatISO(t), speed: Number(speed.toFixed(2)), gust: Number(gust.toFixed(2)) });
  }
  return pts;
}

async function fetchJSON<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function useWindTracker({
  baseUrl,
  pollIntervalMs = 30000,
}: {
  baseUrl?: string;
  pollIntervalMs?: number;
}) {
  const [current, setCurrent] = useState<Record<number, WindPayload>>({});
  const [historic, setHistoric] = useState<Record<number, HistoricPoint[]>>({});
  const lastAlertRef = useRef<number>(0);

  const fetchAll = async () => {
    const stations: (keyof typeof STATIONS)[] = ["drobak", "lysaker"];
    const nextCurrent: Record<number, WindPayload> = { ...current };
    const nextHistoric: Record<number, HistoricPoint[]> = { ...historic };

    for (const key of stations) {
      const id = STATIONS[key].id;
      try {
        if (baseUrl) {
          const payload = await fetchJSON<WindPayload>(`${baseUrl.replace(/\/$/, "")}/current?stationId=${id}`);
          payload.dateTime = toISO(payload.dateTime);
          nextCurrent[id] = payload;
        } else {
          nextCurrent[id] = simulateCurrent(key, current[id]);
        }
      } catch {
        nextCurrent[id] = simulateCurrent(key, current[id]);
      }

      try {
        if (baseUrl) {
          nextHistoric[id] = await fetchJSON<HistoricPoint[]>(
            `${baseUrl.replace(/\/$/, "")}/historic?stationId=${id}&hours=6`
          );
        } else {
          nextHistoric[id] = simulateHistoric(nextCurrent[id]);
        }
      } catch {
        nextHistoric[id] = simulateHistoric(nextCurrent[id]);
      }
    }

    setCurrent(nextCurrent);
    setHistoric(nextHistoric);
  };

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, pollIntervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, pollIntervalMs]);

  // Compute simple trends (slope over last N historic points)
  function slope(points: HistoricPoint[], lookback = 6) {
    // last 6 points (~30min if 5min step)
    if (!points || points.length < lookback) return 0;
    const tail = points.slice(-lookback);
    const first = tail[0]?.speed ?? 0;
    const last = tail[tail.length - 1]?.speed ?? 0;
    return (last - first) / lookback; // m/s per sample
  }

  const drobak = current[STATIONS.drobak.id];
  const lysaker = current[STATIONS.lysaker.id];
  const drobakHist = historic[STATIONS.drobak.id] || [];
  const lysakerHist = historic[STATIONS.lysaker.id] || [];

  const drobakSlope = useMemo(() => slope(drobakHist), [drobakHist]);
  const lysakerSlope = useMemo(() => slope(lysakerHist), [lysakerHist]);

  const isBuildingAtDrobak = drobak ? drobakSlope > 0.08 && drobak.wind.speed >= 4 : false;

  // Simple propagation estimate Drøbak -> Lysaker
  const distanceKm = 25; // approx.
  const etaMinutes = useMemo(() => {
    const spd = drobak?.wind.speed ?? 0;
    if (!isBuildingAtDrobak || spd <= 0.5) return null;
    // front speed ~ baseline + factor * wind
    const frontKmh = clamp(10 + spd * 1.5, 8, 45);
    return Math.round((distanceKm / frontKmh) * 60);
  }, [drobak, isBuildingAtDrobak]);

  return {
    drobak,
    lysaker,
    drobakHist,
    lysakerHist,
    drobakSlope,
    lysakerSlope,
    isBuildingAtDrobak,
    etaMinutes,
    lastAlertRef,
  } as const;
}

export function degToCardinal(deg?: number) {
  if (deg == null || Number.isNaN(deg)) return "N/A";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const ix = Math.round(((deg % 360) / 22.5)) % 16;
  return dirs[ix];
}

export function recommendGear(weightKg: number, windMs: number) {
  // Approximate mapping inspired by example
  const sail = clamp(12 - 0.45 * windMs - 0.012 * (weightKg - 75), 4.0, 9.8);
  const boardWidth = clamp(112 - 3.2 * windMs - 0.12 * (weightKg - 75), 58, 100);
  const fin = clamp(54 - 2.2 * windMs, 28, 52);
  // Round to typical sizes
  const round = (n: number, step = 0.2) => Math.round(n / step) * step;
  const roundInt = (n: number, step = 1) => Math.round(n / step) * step;
  return {
    sailM2: Number(round(sail, 0.2).toFixed(1)),
    boardWidthCm: roundInt(boardWidth, 1),
    finCm: roundInt(fin, 1),
  } as const;
}
