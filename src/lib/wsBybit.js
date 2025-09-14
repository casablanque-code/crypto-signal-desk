// Единый коннектор к Bybit v5 для spot/linear тикеров
// connectBybitTickers({ spot: string[], linear: string[], onOpen, onClose, onError, onTick })
// onTick({ symbol, last, ch24p })

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
  
  function makeSocket(url, topics, handlers) {
    const { onOpen, onClose, onError, onTick } = handlers;
    let ws = null;
    let pingTimer = null;
    let reconnectTimer = null;
    let closedByUser = false;
    let backoff = 1000; // 1s -> 30s
  
    // Bybit: Spot — не более 10 args за один subscribe; шлём батчами
    const subscribeBatched = () => {
      if (!ws || ws.readyState !== 1 || !topics.length) return;
      const isSpot = url.includes("/spot");
      const maxPerReq = isSpot ? 10 : topics.length; // для linear можно пачкой
      const batches = chunk(topics, maxPerReq);
      batches.forEach((args, i) => {
        setTimeout(() => {
          try { ws.send(JSON.stringify({ op: "subscribe", args })); } catch {}
        }, i * 60); // лёгкая рассинхронизация
      });
    };
  
    const clearTimers = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };
  
    const connect = () => {
      ws = new WebSocket(url);
  
      ws.onopen = () => {
        try { onOpen && onOpen(); } catch {}
        clearTimers();
        subscribeBatched();
        // ping раз в 20с (Bybit рекомендует)
        pingTimer = setInterval(() => {
          if (ws && ws.readyState === 1) {
            try { ws.send(JSON.stringify({ op: "ping" })); } catch {}
          }
        }, 20000);
        backoff = 1000;
      };
  
      ws.onmessage = (evt) => {
        let msg; try { msg = JSON.parse(evt.data); } catch { return; }
  
        // служебные ack/ping ответы
        if (msg.op === "pong" || msg.op === "ping" || msg.success === true || msg.event === "subscribed") return;
  
        // Форматы v5 tickers:
        // { topic:"tickers.BTCUSDT", data:{...} }
        // { topic:"tickers.BTCUSDT", type:"snapshot|delta", data:[{...}] }
        // { topic:"tickers", data:[{ symbol:"BTCUSDT", ...}] }
        if (!msg.topic || !msg.data) return;
        if (!String(msg.topic).startsWith("tickers")) return;
  
        const items = Array.isArray(msg.data) ? msg.data : [msg.data];
        for (const d of items) {
          const topicSym = msg.topic.includes(".") ? msg.topic.split(".")[1] : undefined;
          const symbol = d.symbol || topicSym;
          if (!symbol) continue;
  
          const last =
            (d.lastPrice !== undefined ? Number(d.lastPrice) :
            d.last_price !== undefined ? Number(d.last_price) :
            d.lp !== undefined ? Number(d.lp) :
            d.ltp !== undefined ? Number(d.ltp) :
            d.bid1Price !== undefined ? Number(d.bid1Price) :
            undefined);
  
          let ch24p;
          if (d.price24hPcnt !== undefined) {
            const v = Number(d.price24hPcnt); // доля -> %
            ch24p = isNaN(v) ? undefined : v * 100;
          } else if (d.change24hP !== undefined) {
            ch24p = Number(d.change24hP);
          }
  
          if (typeof last === "number" || typeof ch24p === "number") {
            try { onTick && onTick({ symbol, last, ch24p }); } catch {}
          }
        }
      };
  
      ws.onerror = () => { try { onError && onError(); } catch {} };
  
      ws.onclose = () => {
        clearTimers();
        if (closedByUser) { try { onClose && onClose(); } catch {} return; }
        try { onClose && onClose(); } catch {}
        reconnectTimer = setTimeout(() => {
          backoff = Math.min(backoff * 2, 30000);
          connect();
        }, backoff);
      };
    };
  
    connect();
  
    return () => {
      closedByUser = true;
      clearTimers();
      if (ws) { try { ws.close(); } catch {} }
    };
  }
  
  export function connectBybitTickers({ spot = [], linear = [], onOpen, onClose, onError, onTick }) {
    const disconnectors = [];
    const mkArgs = (arr) => arr.map((s) => `tickers.${s}`);
  
    if (spot.length) {
      disconnectors.push(
        makeSocket("wss://stream.bybit.com/v5/public/spot", mkArgs(spot), { onOpen, onClose, onError, onTick })
      );
    }
    if (linear.length) {
      disconnectors.push(
        makeSocket("wss://stream.bybit.com/v5/public/linear", mkArgs(linear), { onOpen, onClose, onError, onTick })
      );
    }
    return () => disconnectors.forEach((fn) => fn && fn());
  }
  