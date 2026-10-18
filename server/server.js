require("dotenv").config();

const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const JWT_SECRET = process.env.JWT_SECRET;
const LOGIN_USERNAME = process.env.LOGIN_USERNAME;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;

const DERIV_WS_URL =
  process.env.DERIV_WS_URL ||
  "wss://api.derivws.com/trading/v1/options/ws/public";

const MARKETS = [
  "R_10",
  "R_25",
  "R_50",
  "R_75",
  "R_100",
  "1HZ10V",
  "1HZ25V",
  "1HZ50V",
  "1HZ75V",
  "1HZ100V",
];

const HISTORY_LIMIT = 500;
const ANALYSIS_SIZE = 100;

let currentMarket = "R_100";
let derivSocket = null;
let reconnectTimer = null;
let reconnectDelay = 3000;
let nextRequestId = 1;
let connected = false;
let lastError = null;

const marketData = {};

for (const symbol of MARKETS) {
  marketData[symbol] = {
    history: [],
    lastTick: null,
    lastUpdated: null,
  };
}

// --------------------------------------------------
// MARKET DATA HELPERS
// --------------------------------------------------

function getMarket(symbol) {
  return marketData[symbol] || null;
}

function extractLastDigit(quote) {
  const text = String(quote);

  const decimalPart = text.includes(".")
    ? text.split(".")[1]
    : "";

  if (!decimalPart.length) {
    return Number(text.slice(-1));
  }

  return Number(decimalPart.slice(-1));
}

function saveTick(symbol, quote, epoch) {
  const market = getMarket(symbol);

  if (!market) return;

  const digit = extractLastDigit(quote);

  const tick = {
    symbol,
    quote: Number(quote),
    digit,
    epoch: Number(epoch) || Math.floor(Date.now() / 1000),
  };

  market.history.push(tick);

  if (market.history.length > HISTORY_LIMIT) {
    market.history.shift();
  }

  market.lastTick = tick;
  market.lastUpdated = new Date().toISOString();
}

// --------------------------------------------------
// DIGIT ANALYSIS
// --------------------------------------------------

function analyzeMarket(symbol) {
  const market = getMarket(symbol);

  if (!market) {
    return {
      symbol,
      ready: false,
      message: "Unknown market.",
    };
  }

  const history = market.history;
  const digits = history.map((tick) => tick.digit);

  const frequencies = Array(10).fill(0);

  for (const digit of digits) {
    frequencies[digit]++;
  }

  const total = digits.length;

  const frequencyTable = frequencies.map((count, digit) => ({
    digit,
    count,
    percentage: total
      ? Number(((count / total) * 100).toFixed(2))
      : 0,
  }));

  const sortedFrequencies = [...frequencyTable].sort(
    (a, b) => b.count - a.count
  );

  if (total < ANALYSIS_SIZE) {
    return {
      symbol,
      ready: false,
      ticksCollected: total,
      ticksRequired: ANALYSIS_SIZE,
      message: `Collecting data: ${total}/${ANALYSIS_SIZE} ticks.`,
      lastDigit: market.lastTick ? market.lastTick.digit : null,
      frequencies: frequencyTable,
      mostFrequent: sortedFrequencies.slice(0, 3),
      signals: [],
    };
  }

  const recent100 = digits.slice(-100);
  const previous20 = digits.slice(-40, -20);
  const recent20 = digits.slice(-20);
  const recent10 = digits.slice(-10);

  function percentageWhere(list, predicate) {
    if (!list.length) return 0;

    const matches = list.filter(predicate).length;

    return (matches / list.length) * 100;
  }

  const over2Recent = percentageWhere(recent20, (d) => d > 2);
  const over2Previous = percentageWhere(previous20, (d) => d > 2);

  const under7Recent = percentageWhere(recent20, (d) => d < 7);
  const under7Previous = percentageWhere(previous20, (d) => d < 7);

  const evenRecent = percentageWhere(recent20, (d) => d % 2 === 0);
  const evenPrevious = percentageWhere(previous20, (d) => d % 2 === 0);

  const oddRecent = percentageWhere(recent20, (d) => d % 2 !== 0);
  const oddPrevious = percentageWhere(previous20, (d) => d % 2 !== 0);

  const signals = [];

  function addSignal(name, recent, previous, description) {
    const difference = recent - previous;

    let status = "WAIT";

    if (recent >= 65 && difference >= 10) {
      status = "GAINING_POWER";
    } else if (recent >= 60 && difference >= 5) {
      status = "BUILDING";
    } else if (recent <= 40 && difference <= -10) {
      status = "LOSING_POWER";
    }

    signals.push({
      name,
      status,
      recentPercentage: Number(recent.toFixed(2)),
      previousPercentage: Number(previous.toFixed(2)),
      change: Number(difference.toFixed(2)),
      description,
    });
  }

  addSignal(
    "OVER 2",
    over2Recent,
    over2Previous,
    "Digits 3-9"
  );

  addSignal(
    "UNDER 7",
    under7Recent,
    under7Previous,
    "Digits 0-6"
  );

  addSignal(
    "EVEN",
    evenRecent,
    evenPrevious,
    "Digits 0, 2, 4, 6, 8"
  );

  addSignal(
    "ODD",
    oddRecent,
    oddPrevious,
    "Digits 1, 3, 5, 7, 9"
  );

  let overallStatus = "WAITING FOR A CLEAR PATTERN";

  const strongest = signals
    .filter((signal) => signal.status === "GAINING_POWER")
    .sort((a, b) => b.change - a.change);

  if (strongest.length > 0) {
    overallStatus = `${strongest[0].name} IS GAINING POWER`;
  }

  return {
    symbol,
    ready: true,
    ticksCollected: total,
    lastTick: market.lastTick,
    lastUpdated: market.lastUpdated,
    overallStatus,
    frequencies: frequencyTable,
    mostFrequent: sortedFrequencies.slice(0, 3),
    recentDigits: recent100.slice(-20),
    signals,
    explanation:
      "Analysis describes recent digit frequencies and changes. It cannot predict the next digit or guarantee a profitable trade.",
  };
}

// --------------------------------------------------
// DERIV WEBSOCKET CONNECTION
// --------------------------------------------------

function connectToDeriv() {
  if (
    derivSocket &&
    (derivSocket.readyState === WebSocket.OPEN ||
      derivSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  clearTimeout(reconnectTimer);

  console.log("Connecting to Deriv...");

  try {
    derivSocket = new WebSocket(DERIV_WS_URL);
  } catch (error) {
    lastError = error.message;
    scheduleReconnect();
    return;
  }

  derivSocket.on("open", () => {
    connected = true;
    lastError = null;
    reconnectDelay = 3000;

    console.log("Deriv WebSocket connected.");

    subscribeToMarket(currentMarket);
  });

  derivSocket.on("message", (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      return;
    }

    if (message.error) {
      lastError = message.error.message || "Deriv API error";

      console.error("Deriv API error:", lastError);
      return;
    }

    if (message.msg_type === "tick" && message.tick) {
      const tick = message.tick;

      const symbol = tick.symbol || currentMarket;

      if (marketData[symbol]) {
        saveTick(symbol, tick.quote, tick.epoch);
      }

      return;
    }

    if (message.msg_type === "history" && message.history) {
      const symbol = message.echo_req?.ticks_history || currentMarket;
      const market = getMarket(symbol);

      if (!market) return;

      const prices = message.history.prices || [];
      const times = message.history.times || [];

      market.history = [];

      for (let i = 0; i < prices.length; i++) {
        saveTick(symbol, prices[i], times[i]);
      }

      return;
    }
  });

  derivSocket.on("error", (error) => {
    lastError = error.message;
    console.error("Deriv WebSocket error:", error.message);
  });

  derivSocket.on("close", () => {
    connected = false;
    derivSocket = null;

    console.log("Deriv WebSocket disconnected.");

    scheduleReconnect();
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(() => {
    connectToDeriv();
  }, reconnectDelay);

  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
}

function sendDerivRequest(payload) {
  if (!derivSocket || derivSocket.readyState !== WebSocket.OPEN) {
    return false;
  }

  derivSocket.send(
    JSON.stringify({
      ...payload,
      req_id: nextRequestId++,
    })
  );

  return true;
}

function subscribeToMarket(symbol) {
  if (!MARKETS.includes(symbol)) {
    return false;
  }

  currentMarket = symbol;

  const market = getMarket(symbol);

  if (market) {
    market.history = [];
    market.lastTick = null;
    market.lastUpdated = null;
  }

  if (!connected) {
    return false;
  }

  console.log("Subscribing to market:", symbol);

  sendDerivRequest({
    forget_all: "ticks",
  });

  sendDerivRequest({
    ticks_history: symbol,
    count: ANALYSIS_SIZE,
    end: "latest",
    style: "ticks",
  });

  sendDerivRequest({
    ticks: symbol,
    subscribe: 1,
  });

  return true;
}

// --------------------------------------------------
// API ROUTES
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    name: "Kerry Prime Trading Hub API",
    status: "running",
    connectedToDeriv: connected,
    endpoints: [
      "/status",
      "/markets",
      "/tick",
      "/digits",
      "/analysis",
      "/scanner",
    ],
  });
});

app.get("/status", (req, res) => {
  res.json({
    status: "running",
    connectedToDeriv: connected,
    currentMarket,
    lastError,
    timestamp: new Date().toISOString(),
  });
});

app.get("/markets", (req, res) => {
  res.json({
    currentMarket,
    markets: MARKETS,
  });
});

app.post("/change-market", (req, res) => {
  const { symbol } = req.body || {};

  if (!symbol || !MARKETS.includes(symbol)) {
    return res.status(400).json({
      error: "Please provide a valid market symbol.",
      allowedMarkets: MARKETS,
    });
  }

  subscribeToMarket(symbol);

  return res.json({
    success: true,
    currentMarket: symbol,
    connectedToDeriv: connected,
    message: connected
      ? "Market subscription requested."
      : "Market selected. Waiting for Deriv connection.",
  });
});

app.get("/change-market/:symbol", (req, res) => {
  const symbol = req.params.symbol;

  if (!MARKETS.includes(symbol)) {
    return res.status(400).json({
      error: "Invalid market symbol.",
      allowedMarkets: MARKETS,
    });
  }

  subscribeToMarket(symbol);

  return res.json({
    success: true,
    currentMarket: symbol,
    connectedToDeriv: connected,
  });
});

app.get("/tick", (req, res) => {
  const symbol = req.query.symbol || currentMarket;
  const market = getMarket(symbol);

  if (!market) {
    return res.status(400).json({
      error: "Invalid market symbol.",
      allowedMarkets: MARKETS,
    });
  }

  res.json({
    symbol,
    tick: market.lastTick,
    connectedToDeriv: connected,
  });
});

app.get("/digits", (req, res) => {
  const symbol = req.query.symbol || currentMarket;
  const market = getMarket(symbol);

  if (!market) {
    return res.status(400).json({
      error: "Invalid market symbol.",
      allowedMarkets: MARKETS,
    });
  }

  res.json({
    symbol,
    currentMarket,
    connectedToDeriv: connected,
    history: market.history,
    lastTick: market.lastTick,
    count: market.history.length,
    analysis: analyzeMarket(symbol),
  });
});
app.get("/signal", (req, res) => {
const symbol = req.query.symbol || currentMarket;

if (!MARKETS.includes(symbol)) {
return res.status(400).json({
error: "Invalid market symbol.",
allowedMarkets: MARKETS,
});
}

const analysis = analyzeMarket(symbol);

const signals = analysis.signals || [];

const strongest = signals
.filter((signal) => signal.status === "GAINING_POWER")
.sort((a, b) => b.change - a.change)[0];

return res.json({
...analysis,
prediction: strongest ? strongest.name : null,
status: analysis.ready
? analysis.overallStatus
: "COLLECTING DATA",
confidence: strongest ? strongest.recentPercentage : 0,
});
});

app.get("/analysis", (req, res) => {
  const symbol = req.query.symbol || currentMarket;

  if (!MARKETS.includes(symbol)) {
    return res.status(400).json({
      error: "Invalid market symbol.",
      allowedMarkets: MARKETS,
    });
  }

  res.json(analyzeMarket(symbol));
});

app.get("/scanner", (req, res) => {
  const symbol = req.query.symbol || currentMarket;

  if (!MARKETS.includes(symbol)) {
    return res.status(400).json({
      error: "Invalid market symbol.",
      allowedMarkets: MARKETS,
    });
  }

  const analysis = analyzeMarket(symbol);

  res.json({
    symbol,
    ready: analysis.ready,
    overallStatus:
      analysis.overallStatus || "COLLECTING MARKET DATA",
    signals: analysis.signals || [],
    ticksCollected: analysis.ticksCollected,
    ticksRequired: analysis.ticksRequired || ANALYSIS_SIZE,
    message: analysis.message || analysis.explanation,
  });
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post("/login", (req, res) => {
  if (!JWT_SECRET || !LOGIN_USERNAME || !LOGIN_PASSWORD) {
    return res.status(500).json({
      error: "Login environment variables are not configured on the server.",
    });
  }

  const { username, password } = req.body || {};

  if (
    username !== LOGIN_USERNAME ||
    password !== LOGIN_PASSWORD
  ) {
    return res.status(401).json({
      success: false,
      error: "Invalid username or password.",
    });
  }

  const token = jwt.sign(
    { username },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  return res.json({
    success: true,
    token,
    expiresIn: "12h",
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Kerry Prime Trading Hub API listening on port ${PORT}`);

  connectToDeriv();
});

function shutdown() {
  console.log("Shutting down server...");

  clearTimeout(reconnectTimer);

  if (derivSocket) {
    derivSocket.removeAllListeners();
    derivSocket.close();
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);