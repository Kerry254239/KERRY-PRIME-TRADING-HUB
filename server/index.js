const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

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

let currentMarket = "R_100";
let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let connected = false;
let lastError = "";

const digits = [];
const prices = [];

const signal = {
  status: "COLLECTING 100 TICKS",
  prediction: "WAIT",
  confidence: 0,
  strength: 0,
  trend: "STABLE",
  pressure: "NONE",
  stability: "UNKNOWN",
  ticks: 0,
  digitStats: {},
};

let entry = createEntry();

function createEntry() {
  return {
    status: "WAITING FOR SIGNAL",
    prediction: "WAIT",
    candidates: [],
    entryDigit: null,
    confirmations: 0,
    patterns: [],
    confirmationTicks: [],
    waitingConfirmation: false,
  };
}

function resetAnalysis() {
  digits.length = 0;
  prices.length = 0;

  Object.assign(signal, {
    status: "COLLECTING 100 TICKS",
    prediction: "WAIT",
    confidence: 0,
    strength: 0,
    trend: "STABLE",
    pressure: "NONE",
    stability: "UNKNOWN",
    ticks: 0,
    digitStats: {},
  });

  entry = createEntry();
}

function getPipSize(quote) {
  const text = String(quote);
  const decimalPart = text.split(".")[1];
  return decimalPart ? decimalPart.length : 0;
}

function getLastDigit(quote, pipSize) {
  const formatted = Number(quote).toFixed(pipSize);
  return Number(formatted.slice(-1));
}

function calculateStats() {
  const stats = {};

  for (let i = 0; i <= 9; i++) {
    stats[i] = 0;
  }

  for (const item of digits) {
    stats[item.digit]++;
  }

  const total = digits.length || 1;

  for (let i = 0; i <= 9; i++) {
    stats[i] = Number(((stats[i] / total) * 100).toFixed(2));
  }

  return stats;
}

function analyzeSignal() {
  const total = digits.length;
  signal.ticks = total;
  signal.digitStats = calculateStats();

  if (total < 100) {
    signal.status = "COLLECTING 100 TICKS";
    signal.prediction = "WAIT";
    signal.confidence = 0;
    signal.strength = 0;
    entry = createEntry();
    return;
  }

  const stats = signal.digitStats;

  const over2 = digits.filter((item) => item.digit > 2).length;
  const under7 = digits.filter((item) => item.digit < 7).length;

  const overPercentage = (over2 / total) * 100;
  const underPercentage = (under7 / total) * 100;

  if (overPercentage > underPercentage) {
    signal.prediction = "OVER 2";
    signal.confidence = Number(overPercentage.toFixed(2));
    signal.strength = Number((overPercentage - 50).toFixed(2));
  } else if (underPercentage > overPercentage) {
    signal.prediction = "UNDER 7";
    signal.confidence = Number(underPercentage.toFixed(2));
    signal.strength = Number((underPercentage - 50).toFixed(2));
  } else {
    signal.prediction = "WAIT";
    signal.confidence = 0;
    signal.strength = 0;
  }

  signal.status =
    signal.prediction === "WAIT" ? "SIGNAL NOT READY" : "ANALYSIS READY";

  const recent = digits.slice(-20);
  const recentOver = recent.filter((item) => item.digit > 2).length;
  const recentUnder = recent.filter((item) => item.digit < 7).length;

  signal.trend =
    recentOver > recentUnder
      ? "OVER PRESSURE"
      : recentUnder > recentOver
        ? "UNDER PRESSURE"
        : "STABLE";

  signal.pressure = signal.trend;
  signal.stability = total >= 100 ? "100 TICKS AVAILABLE" : "COLLECTING";

  updateEntry(digits[digits.length - 1].digit);
}

function updateEntry(digit) {
  if (signal.prediction === "WAIT") {
    entry = createEntry();
    return;
  }

  if (entry.prediction !== signal.prediction) {
    entry = createEntry();
    entry.prediction = signal.prediction;
  }

  if (entry.confirmations >= 3) {
    entry.status = "ENTRY CONFIRMED - WAITING FOR NEW SIGNAL";
    return;
  }

  if (entry.entryDigit === null) {
    entry.candidates.push(digit);

    if (entry.candidates.length > 5) {
      entry.candidates.shift();
    }

    entry.status = `COLLECTING CANDIDATES ${entry.candidates.length}/5`;

    if (entry.candidates.length === 5) {
      const counts = {};

      for (const candidate of entry.candidates) {
        counts[candidate] = (counts[candidate] || 0) + 1;
      }

      // Select the least frequent candidate digit.
      let bestDigit = 0;
      let lowestCount = Infinity;

      for (let i = 0; i <= 9; i++) {
        if ((counts[i] || 0) < lowestCount) {
          lowestCount = counts[i] || 0;
          bestDigit = i;
        }
      }

      entry.entryDigit = bestDigit;
      entry.status = `WAITING FOR ENTRY DIGIT ${bestDigit}`;
    }

    return;
  }

  if (!entry.waitingConfirmation) {
    if (digit === entry.entryDigit) {
      entry.waitingConfirmation = true;
      entry.confirmationTicks = [];
      entry.status = "COLLECTING 3 CONFIRMATION TICKS";
    }

    return;
  }

  entry.confirmationTicks.push(digit);

  if (entry.confirmationTicks.length < 3) {
    return;
  }

  const valid =
    signal.prediction === "OVER 2"
      ? entry.confirmationTicks.every((d) => d > 2)
      : entry.confirmationTicks.every((d) => d < 7);

  if (valid) {
    entry.confirmations++;

    entry.patterns.push({
      trigger: entry.entryDigit,
      ticks: [...entry.confirmationTicks],
    });

    entry.status =
      entry.confirmations >= 3
        ? "ENTRY FOUND"
        : `CONFIRMATION ${entry.confirmations}/3`;
  } else {
    entry.status = "CONFIRMATION FAILED - WAITING FOR ENTRY DIGIT";
  }

  entry.confirmationTicks = [];
  entry.waitingConfirmation = false;
}

function saveTick(quote, epoch) {
  const pipSize = getPipSize(quote);
  const digit = getLastDigit(quote, pipSize);

  const item = {
    digit,
    quote: Number(quote),
    epoch: Number(epoch) || Math.floor(Date.now() / 1000),
  };

  digits.push(item);
  prices.push({
    quote: item.quote,
    epoch: item.epoch,
  });

  if (digits.length > 100) digits.shift();
  if (prices.length > 500) prices.shift();

  analyzeSignal();
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  connected = false;

  reconnectAttempts++;
  const delay = Math.min(15000, reconnectAttempts * 2000);

  console.log(`Reconnecting to Deriv in ${delay / 1000} seconds...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectDeriv();
  }, delay);
}

function connectDeriv() {
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.terminate();
    } catch (_) {}

    socket = null;
  }

  connected = false;

  console.log(`Connecting to Deriv for ${currentMarket}...`);

  const ws = new WebSocket(
    "wss://ws.derivws.com/websockets/v3?app_id=1089",
    {
      handshakeTimeout: 15000,
    }
  );

  socket = ws;

  ws.on("open", () => {
    if (socket !== ws) return;

    reconnectAttempts = 0;
    connected = true;
    lastError = "";

    console.log("Deriv WebSocket connected.");

    ws.send(
      JSON.stringify({
        ticks: currentMarket,
        subscribe: 1,
      })
    );
  });

  ws.on("message", (message) => {
    if (socket !== ws) return;

    let data;

    try {
      data = JSON.parse(message.toString());
    } catch (_) {
      return;
    }

    if (data.error) {
      lastError = data.error.message || "Deriv returned an error.";
      console.error("Deriv API error:", lastError);
      return;
    }

    if (data.tick) {
      saveTick(data.tick.quote, data.tick.epoch);
    }
  });

  ws.on("error", (error) => {
    if (socket !== ws) return;

    lastError = error.message || "WebSocket connection failed.";
    connected = false;

    console.error("Deriv WebSocket error:", lastError);
  });

  ws.on("close", () => {
    if (socket !== ws) return;

    connected = false;
    socket = null;

    console.log("Deriv WebSocket disconnected.");

    scheduleReconnect();
  });
}

// =====================================
// API ROUTES
// =====================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    application: "Kerry Prime Trading Hub",
    message: "Backend is running.",
    endpoints: ["/health", "/digits", "/signal", "/status"],
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    server: "ONLINE",
    timestamp: new Date().toISOString(),
  });
});

app.get("/status", (req, res) => {
  res.json({
    success: true,
    backend: "CONNECTED",
    deriv: connected ? "CONNECTED" : "DISCONNECTED",
    market: currentMarket,
    error: lastError,
  });
});

app.get("/digits", (req, res) => {
  res.json({
    success: true,
    market: currentMarket,
    digits: digits.map((item) => item.digit),
    history: digits,
    prices,
    ticks: prices,
    pip_size: prices.length
      ? getPipSize(prices[prices.length - 1].quote)
      : 2,
    connected,
    error: lastError,
  });
});

app.get("/signal", (req, res) => {
  res.json({
    success: true,
    signal,
    entry,
    digitStats: signal.digitStats,
    market: currentMarket,
    connected,
    error: lastError,
  });
});

app.post("/change-market/:symbol", (req, res) => {
  const symbol = req.params.symbol;

  if (!MARKETS.includes(symbol)) {
    return res.status(400).json({
      success: false,
      error: "Unsupported market.",
      allowedMarkets: MARKETS,
    });
  }

  currentMarket = symbol;
  resetAnalysis();
  reconnectAttempts = 0;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  connectDeriv();

  return res.json({
    success: true,
    market: currentMarket,
    message: "Market changed.",
  });
});

app.post("/reset", (req, res) => {
  resetAnalysis();

  res.json({
    success: true,
    message: "Analysis reset.",
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found.",
    path: req.originalUrl,
  });
});

const server = app.listen(PORT, () => {
  console.log(`Kerry Prime Trading Hub running on port ${PORT}`);
  connectDeriv();
});

function shutdown() {
  console.log("Shutting down server...");

  if (reconnectTimer) clearTimeout(reconnectTimer);

  if (socket) {
    try {
      socket.terminate();
    } catch (_) {}
  }

  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

