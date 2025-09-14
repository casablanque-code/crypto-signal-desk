// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Zap, Activity, TrendingUp, Bell, Settings2, Search, X, Star, StarOff, ArrowUpDown } from "lucide-react";
import { connectBybitTickers } from "./lib/wsBybit";

// ====== АКТИВЫ ======
const SYMBOLS = [
  "BTCUSDT","ETHUSDT","SOLUSDT","DOGEUSDT","HYPEUSDT","XRPUSDT","APTUSDT","SEIUSDT","ADAUSDT",
  "AVAXUSDT","ENAUSDT","BNBUSDT","TRUMPUSDT","MNTUSDT","LTCUSDT","TRXUSDT","ARBUSDT"
];
const LABEL = (sym) => sym.replace("USDT", "");

// ====== ТАЙМФРЕЙМЫ ======
const TF_OPTS = [
  { key: "5",  label: "5m"  },
  { key: "15", label: "15m" },
  { key: "60", label: "1h"  },
  { key: "D",  label: "1d"  },
];
const TF_MS = { "5": 5*60*1000, "15": 15*60*1000, "60": 60*60*1000, "D": 24*60*60*1000 };

// ====== УТИЛЫ ======
const ls = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// стартовые значения
const INITIAL = SYMBOLS.map((sym) => ({ sym, label: LABEL(sym), price: null, ch: null }));

function Card({ children, className = "" }) {
  return <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 ${className}`}>{children}</div>;
}
function CardBody({ children, className = "" }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
function Badge({ children, className = "" }) {
  return <span className={`inline-flex items-center rounded-xl border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs ${className}`}>{children}</span>;
}
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState(ls.get("csd.query", ""));
  const [onlyFutures, setOnlyFutures] = useState(ls.get("csd.onlyFutures", false));
  const [minConf, setMinConf] = useState(ls.get("csd.minConf", 50));
  const [watch, setWatch] = useState(() => ls.get("csd.watch", INITIAL));
  const [favorites, setFavorites] = useState(() => new Set(ls.get("csd.favs", [])));
  const [selected, setSelected] = useState(ls.get("csd.selected", "SOLUSDT"));
  const [sortBy, setSortBy] = useState(ls.get("csd.sortBy", "fav-ch"));
  const [wsStatus, setWsStatus] = useState("idle"); // idle | connecting | live | reconnecting | error
  const [tf, setTf] = useState(ls.get("csd.tf", "15"));

  // ===== данные =====
  const lastQuoteRef = useRef(new Map()); // sym -> { price, ch }
  const selectedRef = useRef(selected); useEffect(() => { selectedRef.current = selected; }, [selected]);

  const [history, setHistory] = useState([]); // [{t, p}]
  const MAX_POINTS = 360;

  // ===== WS один раз (подписка батчами ≤10 в wsBybit.js) =====
  useEffect(() => {
    setWsStatus("connecting");

    const disconnect = connectBybitTickers({
      spot: SYMBOLS,
      linear: [],
      onOpen: () => setWsStatus("connecting"),
      onClose: () => setWsStatus("reconnecting"),
      onError: () => setWsStatus("error"),
      onTick: (t) => {
        if (!t || !t.symbol) return;
        const prev = lastQuoteRef.current.get(t.symbol) || {};
        const price = typeof t.last === "number" ? t.last : prev.price;
        const ch = typeof t.ch24p === "number" ? t.ch24p : prev.ch;
        lastQuoteRef.current.set(t.symbol, { price, ch });
        if (wsStatus !== "live") setWsStatus("live");
      },
    });

    // батч-обновление таблицы цен
    const flushWatch = setInterval(() => {
      const map = lastQuoteRef.current; if (map.size === 0) return;
      setWatch((prev) => {
        let changed = false;
        const next = prev.map((row) => {
          const lq = map.get(row.sym); if (!lq) return row;
          const nprice = lq.price ?? row.price;
          const nch = lq.ch ?? row.ch;
          if (nprice !== row.price || nch !== row.ch) { changed = true; return { ...row, price: nprice, ch: nch }; }
          return row;
        });
        if (changed) ls.set("csd.watch", next);
        return changed ? next : prev;
      });
    }, 300);

    return () => { disconnect && disconnect(); clearInterval(flushWatch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== История свечей с Bybit REST при смене тикера/TF =====
  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        const limit = 300;
        const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${selected}&interval=${tf}&limit=${limit}`;
        const res = await fetch(url, { signal: controller.signal });
        const j = await res.json();
        if (aborted) return;
        const list = j?.result?.list || [];
        // Bybit отдаёт новые->старые
        const arr = list.slice().reverse().map((row) => {
          const [start, open, high, low, close] = row;
          return { t: Number(start), p: Number(close) };
        });
        setHistory(arr);
      } catch {}
    })();

    return () => { aborted = true; controller.abort(); };
  }, [selected, tf]);

  // ===== «Достройка» текущей свечи из живой цены раз в 1s =====
  useEffect(() => {
    const frameMs = TF_MS[tf] ?? 15 * 60 * 1000;
    const tick = setInterval(() => {
      const sym = selectedRef.current;
      const lq = lastQuoteRef.current.get(sym);
      if (!lq || typeof lq.price !== "number") return;
      setHistory((prev) => {
        if (prev.length === 0) return prev;
        const now = Date.now();
        const curStart  = Math.floor(now / frameMs) * frameMs;
        const lastStart = Math.floor(prev[prev.length - 1].t / frameMs) * frameMs;
        if (curStart === lastStart) {
          // обновляем последнюю точку — без скачков шкалы
          const copy = prev.slice();
          copy[copy.length - 1] = { t: now, p: lq.price };
          return copy;
        } else {
          const arr = [...prev, { t: curStart, p: lq.price }];
          if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
          return arr;
        }
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [tf]);

  // persist
  useEffect(() => { ls.set("csd.selected", selected); }, [selected]);
  useEffect(() => { ls.set("csd.query", query); }, [query]);
  useEffect(() => { ls.set("csd.onlyFutures", onlyFutures); }, [onlyFutures]);
  useEffect(() => { ls.set("csd.minConf", minConf); }, [minConf]);
  useEffect(() => { ls.set("csd.favs", Array.from(favorites)); }, [favorites]);
  useEffect(() => { ls.set("csd.sortBy", sortBy); }, [sortBy]);
  useEffect(() => { ls.set("csd.tf", tf); }, [tf]);

  const selObj = watch.find((w) => w.sym === selected);

  const chartData = useMemo(
    () => history.map((pt) => ({
      t: new Date(pt.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      price: pt.p,
    })), [history]
  );

  // стабильный домен с паддингом
  const yDomain = useMemo(() => {
    if (history.length < 2) return ["auto", "auto"];
    const prices = history.map((x) => x.p);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = Math.max((max - min) * 0.08, (min + max) * 0.0005); // ~8% окна, минимум 0.05%
    return [min - pad, max + pad];
  }, [history]);

  // мок-сигналы
  const signals = [
    { id: 1, ts: "14:02", sym: "SOL", type: "Futures", side: "Short", reason: "Funding > 0.04%, OI +7% (перегрев)", conf: 0.62 },
    { id: 2, ts: "13:47", sym: "BTC", type: "Spot",   side: "Buy",   reason: "Сильный откуп 61k, дельта > $120M", conf: 0.58 },
    { id: 3, ts: "13:20", sym: "ETH", type: "Futures", side: "Long",  reason: "Пробой 2340 на объёме", conf: 0.55 },
  ];
  const filt = useMemo(
    () => signals.filter(
      (s) => (!onlyFutures || s.type === "Futures")
        && s.conf * 100 >= minConf
        && (query.trim() === "" || s.sym.toLowerCase().includes(query.toLowerCase()))
    ), [onlyFutures, minConf, query]
  );

  // сортировка/фильтр watchlist
  const watchFilteredSorted = useMemo(() => {
    let arr = watch.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));
    const fav = (x) => (favorites.has(x.sym) ? 0 : 1);
    if (sortBy === "fav-ch") {
      arr = arr.sort((a, b) => fav(a) - fav(b) || (b.ch ?? -Infinity) - (a.ch ?? -Infinity));
    } else if (sortBy === "ch") {
      arr = arr.sort((a, b) => (b.ch ?? -Infinity) - (a.ch ?? -Infinity));
    } else if (sortBy === "price") {
      arr = arr.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } else {
      arr = arr.sort((a, b) => a.label.localeCompare(b.label));
    }
    return arr;
  }, [watch, query, favorites, sortBy]);

  const toggleFav = (sym) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <Zap className="h-5 w-5" />
          <div className="font-semibold tracking-tight">Crypto Signal Desk</div>
          <Badge className="ml-2">MVP</Badge>
          <div className="ml-3 text-xs px-2 py-1 rounded-lg border border-zinc-800">
            WS: <span className={
              wsStatus === "live" ? "text-emerald-400" :
              wsStatus === "reconnecting" ? "text-amber-300" :
              wsStatus === "error" ? "text-rose-400" : "text-zinc-400"
            }>{wsStatus}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                className="h-9 w-56 rounded-lg bg-zinc-900 border border-zinc-800 pl-8 pr-8 text-sm outline-none focus:border-zinc-600"
                placeholder="Фильтр по тикеру…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {!!query && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setQuery("")} title="Очистить">
                  <X className="h-4 w-4 text-zinc-500" />
                </button>
              )}
            </div>
            <button className="h-9 rounded-lg border border-zinc-700 px-3 text-sm hover:bg-zinc-800" onClick={() => location.reload()}>
              Обновить
            </button>
            <button className="h-9 rounded-lg border border-zinc-700 px-3 text-sm flex items-center gap-2 hover:bg-zinc-800">
              <Settings2 className="h-4 w-4" />
              Настройки
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-4 py-6 grid gap-6">
        {/* Верхние метрики */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">{selObj?.label ?? "—"} (спот)</div>
                <Activity className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="mt-2 flex items-end gap-2">
                <div className="text-2xl font-semibold">{selObj?.price ? `$${selObj.price.toLocaleString()}` : "—"}</div>
                <span className={`${(selObj?.ch ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"} text-xs`}>
                  {(selObj?.ch ?? 0) >= 0 ? "+" : ""}{(selObj?.ch ?? 0)?.toFixed(2)}%
                </span>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">Тренд (визуально)</div>
                <TrendingUp className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {chartData.length > 1
                  ? chartData[chartData.length - 1].price > chartData[0].price ? "Up" : "Down"
                  : "—"}
              </div>
            </CardBody>
          </Card>
          <Card><CardBody><div className="text-sm text-zinc-400">OI 24h</div><div className="mt-2 text-2xl font-semibold">—</div></CardBody></Card>
          <Card><CardBody><div className="text-sm text-zinc-400">Market Heat</div><div className="mt-2 text-2xl font-semibold">Neutral</div></CardBody></Card>
        </section>

        {/* Сетка: слева стек (чарт → метрики → сигналы → AI), справа Watchlist */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          {/* ЛЕВАЯ СТОРОНА */}
          <div className="xl:col-span-2 min-w-0 w-full flex flex-col gap-6">
            <Card className="w-full">
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">
                    {(selObj?.label ?? selected)} / USDT — {TF_OPTS.find(x => x.key === tf)?.label}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>WebSocket • spot</span>
                    <div className="hidden sm:flex items-center gap-1">
                      {TF_OPTS.map(o => (
                        <button
                          key={o.key}
                          onClick={() => setTf(o.key)}
                          className={`h-7 px-2 rounded-md border text-xs transition
                            ${tf === o.key
                              ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800/80"}`}
                          title={`Таймфрейм ${o.label}`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ left: 6, right: 6, top: 6, bottom: 0 }}>
                      <XAxis hide dataKey="t" />
                      <YAxis hide domain={yDomain} />
                      <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid #27272a" }} />
                      <Line
                        type="linear"
                        dataKey="price"
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            {/* Сопр/Поддержка */}
            <Card className="w-full">
              <CardBody>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Row label="Сопротивление" value="—" />
                  <Row label="Поддержка" value="—" />
                  <Row label="Фандинг" value="—" />
                  <Row label="Риск" value={<span className="text-amber-300">Средний</span>} />
                </div>
              </CardBody>
            </Card>

            {/* Сигналы */}
            <Card className="w-full">
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">Сигналы</div>
                  <div className="flex items-center gap-4">
                    <label className="text-sm text-zinc-400 flex items-center gap-2 select-none">
                      <input type="checkbox" className="accent-zinc-500" checked={onlyFutures} onChange={(e) => setOnlyFutures(e.target.checked)} />
                      Только фьючи
                    </label>
                    <div className="w-52">
                      <div className="text-xs text-zinc-400 mb-1">Мин. уверенность: {minConf}%</div>
                      <input type="range" min={40} max={90} step={5} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="w-full" />
                    </div>
                    <button className="h-8 rounded-lg border border-zinc-700 px-3 text-sm flex items-center gap-2 hover:bg-zinc-800">
                      <Bell className="h-4 w-4" /> Алёрты
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {filt.map((s) => (
                    <div key={s.id} className="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-xl border border-zinc-800 px-3 py-2">
                      <Badge className="w-14 justify-center">{s.sym}</Badge>
                      <div>
                        <div className="text-sm font-medium">{s.type} • {s.side}</div>
                        <div className="text-xs text-zinc-400">{s.reason}</div>
                      </div>
                      <div className="text-xs text-right">
                        <div className="text-zinc-400">{s.ts}</div>
                        <div className="font-medium">{Math.round(s.conf * 100)}%</div>
                      </div>
                    </div>
                  ))}
                  {filt.length === 0 && (
                    <div className="text-sm text-zinc-400 py-6 text-center">Нет сигналов под фильтр</div>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* AI-инсайт */}
            <Card className="w-full">
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium flex items-center gap-2"><Zap className="h-4 w-4" />AI-инсайт</div>
                </div>
                <div className="text-sm leading-relaxed text-zinc-300">
                  Кликни тикер в Watchlist — график переключится. Funding/OI добавим позже.
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button className="w-full rounded-lg bg-emerald-500 text-black font-medium py-2 text-sm hover:bg-emerald-400 transition">Сгенерировать план</button>
                  <button className="w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-200">Backtest (скоро)</button>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* ПРАВАЯ — Watchlist */}
          <Card className="self-start">
            <CardBody>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Watchlist</div>
                <button
                  className="text-xs inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                  onClick={() =>
                    setSortBy((s) => (s === "fav-ch" ? "ch" : s === "ch" ? "price" : s === "price" ? "alpha" : "fav-ch"))
                  }
                  title="Смена сортировки"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {sortBy}
                </button>
              </div>
              <div className="space-y-2">
                {watchFilteredSorted.map((a) => (
                  <div
                    key={a.sym}
                    className={`w-full text-left flex items-center justify-between rounded-xl border px-3 py-2 transition
                                ${selected === a.sym ? "border-zinc-600 bg-zinc-800/60" : "border-zinc-800 hover:bg-zinc-900/60"}`}
                  >
                    <button onClick={() => setSelected(a.sym)} className="flex-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="w-16 justify-center">{a.label}</Badge>
                        <div className="text-sm text-zinc-300">{a.price ? `$${a.price.toLocaleString()}` : "—"}</div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className={(a.ch ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {(a.ch ?? 0) >= 0 ? "+" : ""}{(a.ch ?? 0)?.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                    <button
                      className="ml-3 shrink-0 rounded-lg border border-zinc-700 p-1 hover:bg-zinc-800"
                      onClick={() => toggleFav(a.sym)}
                      title={favorites.has(a.sym) ? "Убрать из избранного" : "В избранное"}
                    >
                      {favorites.has(a.sym) ? <Star className="h-4 w-4" /> : <StarOff className="h-4 w-4 text-zinc-400" />}
                    </button>
                  </div>
                ))}
                {watchFilteredSorted.length === 0 && (
                  <div className="text-sm text-zinc-400 py-6 text-center">Нет активов под фильтр</div>
                )}
              </div>
            </CardBody>
          </Card>
        </section>

        <footer className="py-6 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} Crypto Signal Desk — MVP.
        </footer>
      </main>
    </div>
  );
}
