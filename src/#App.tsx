import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Zap, Activity, TrendingUp, Bell, Settings2, Search } from "lucide-react";

const now = Date.now();
const mk = (mins) => new Date(now - mins * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const chart = Array.from({ length: 30 }, (_, i) => ({
  t: mk((30 - i) * 5),
  price: 236 + Math.sin(i / 3) * 4 + (i > 18 ? i * 0.2 : 0),
}));

const watch = [
  { sym: "BTC", price: 61234, ch: +1.2, oi: +2.3, fd: +0.01 },
  { sym: "ETH", price: 2345,  ch: -0.6, oi: +1.1, fd: +0.007 },
  { sym: "SOL", price: 240.8, ch: +4.8, oi: +6.9, fd: +0.042 },
  { sym: "TON", price: 7.12,  ch: +0.9, oi: -0.8, fd: +0.003 },
];

const signals = [
  { id: 1, ts: "14:02", sym: "SOL", type: "Futures", side: "Short", reason: "Funding > 0.04%, OI +7% (перегрев)", conf: 0.62 },
  { id: 2, ts: "13:47", sym: "BTC", type: "Spot",   side: "Buy",   reason: "Сильный откуп 61k, дельта > $120M", conf: 0.58 },
  { id: 3, ts: "13:20", sym: "ETH", type: "Futures", side: "Long",  reason: "Пробой 2340 на объёме", conf: 0.55 },
];

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
  const [query, setQuery] = useState("");
  const [onlyFutures, setOnlyFutures] = useState(false);
  const [minConf, setMinConf] = useState(50);

  const filt = useMemo(
    () =>
      signals.filter(
        (s) =>
          (!onlyFutures || s.type === "Futures") &&
          s.conf * 100 >= minConf &&
          (query.trim() === "" || s.sym.toLowerCase().includes(query.toLowerCase()))
      ),
    [onlyFutures, minConf, query]
  );

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <Zap className="h-5 w-5" />
          <div className="font-semibold tracking-tight">Crypto Signal Desk</div>
          <Badge className="ml-2">MVP</Badge>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                className="h-9 w-48 rounded-lg bg-zinc-900 border border-zinc-800 pl-8 pr-3 text-sm outline-none focus:border-zinc-600"
                placeholder="Фильтр по тикеру…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              className="h-9 rounded-lg border border-zinc-700 px-3 text-sm hover:bg-zinc-800"
              onClick={() => location.reload()}
            >
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
        {/* Top metrics */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">SOL (спот)</div>
                <Activity className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="mt-2 flex items-end gap-2">
                <div className="text-2xl font-semibold">$240.80</div>
                <span className="text-xs text-emerald-400">+4.80%</span>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">Funding (SOL)</div>
                <TrendingUp className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold">0.042%</div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">OI 24h (SOL)</div>
                <TrendingUp className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold">+6.9%</div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">Market Heat</div>
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-semibold">Risk-On</div>
            </CardBody>
          </Card>
        </section>

        {/* Chart + Watchlist */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <CardBody>
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium">SOL / USDT — краткосрочный</div>
                <div className="text-xs text-zinc-500">Mock • 5m</div>
              </div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ left: 6, right: 6, top: 6, bottom: 0 }}>
                    <XAxis hide dataKey="t" />
                    <YAxis hide domain={["dataMin", "dataMax"]} />
                    <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid #27272a" }} />
                    <Line type="monotone" dataKey="price" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Row label="Сопротивление" value="$230–235 / $245–250" />
                <Row label="Поддержка" value="$210–215" />
                <Row label="Фандинг" value="0.042% (лонги платят)" />
                <Row label="Риск сквиза" value={<span className="text-amber-300">Средний</span>} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Watchlist</div>
                <button className="h-8 rounded-lg px-3 text-sm flex items-center gap-2 hover:bg-zinc-800">
                  Фильтры
                </button>
              </div>
              <div className="space-y-2">
                {watch.map((a) => (
                  <div key={a.sym} className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge className="w-14 justify-center">{a.sym}</Badge>
                      <div className="text-sm text-zinc-300">${a.price}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className={a.ch >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {a.ch >= 0 ? "+" : ""}{a.ch}%
                      </span>
                      <span className={a.oi >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        OI {a.oi >= 0 ? "+" : ""}{a.oi}%
                      </span>
                      <span className={a.fd >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        FD {a.fd >= 0 ? "+" : ""}{a.fd}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </section>

        {/* Signals + AI */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <CardBody>
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium">Сигналы</div>
                <div className="flex items-center gap-4">
                  <label className="text-sm text-zinc-400 flex items-center gap-2 select-none">
                    <input
                      type="checkbox"
                      className="accent-zinc-500"
                      checked={onlyFutures}
                      onChange={(e) => setOnlyFutures(e.target.checked)}
                    />
                    Только фьючи
                  </label>
                  <div className="w-52">
                    <div className="text-xs text-zinc-400 mb-1">Мин. уверенность: {minConf}%</div>
                    <input
                      type="range"
                      min={40}
                      max={90}
                      step={5}
                      value={minConf}
                      onChange={(e) => setMinConf(Number(e.target.value))}
                      className="w-full"
                    />
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

          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium flex items-center gap-2"><Zap className="h-4 w-4" />AI-инсайт</div>
              </div>
              <div className="text-sm leading-relaxed text-zinc-300">
                Перекупленность по SOL сохраняется: funding положительный, OI ↑. Ближайшие зоны: 245–250 (риск сквиза), 230–235 (ретест), 210–215 (дип).
                Стратегия: искать слабость у 245–250 для шорта; для спота — частичные покупки на откатах.
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="w-full rounded-lg bg-zinc-100 text-black py-2 text-sm hover:opacity-90">Сгенерировать план</button>
                <button className="w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-200">Backtest (скоро)</button>
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
