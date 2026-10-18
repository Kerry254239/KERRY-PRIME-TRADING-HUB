import React, { useEffect, useState } from "react";
import "./App.css";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

const MARKETS = [
"R_10", "R_25", "R_50", "R_75", "R_100",
"1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"
];

export default function App() {
const [market, setMarket] = useState("R_100");
const [digits, setDigits] = useState([]);
const [signal, setSignal] = useState({});
const [entry, setEntry] = useState({});
const [connection, setConnection] = useState("CONNECTING");
const [error, setError] = useState("");

useEffect(() => {
let active = true;


async function refresh() {
  try {
    const [digitResponse, signalResponse] = await Promise.all([
      fetch(`${API}/digits`),
      fetch(`${API}/signal`)
    ]);

    if (!digitResponse.ok) {
      throw new Error(`Digits endpoint: HTTP ${digitResponse.status}`);
    }

    if (!signalResponse.ok) {
      throw new Error(`Signal endpoint: HTTP ${signalResponse.status}`);
    }

    const digitData = await digitResponse.json();
    const signalData = await signalResponse.json();

    if (!active) return;

    const received = Array.isArray(digitData)
      ? digitData
      : digitData.digits || digitData.history || [];

    setDigits(received.slice(-40).reverse());
    setSignal(signalData.signal || signalData);
    setEntry(signalData.entry || {});
    setConnection("CONNECTED");
    setError("");
  } catch (err) {
    if (active) {
      setConnection("DISCONNECTED");
      setError(err.message || "Unable to reach backend.");
    }
  }
}

refresh();

const timer = setInterval(refresh, 1500);

return () => {
  active = false;
  clearInterval(timer);
};
}, [market]);

async function changeMarket(event) {
const selected = event.target.value;
setMarket(selected);
setDigits([]);
setError("");

try {
  const response = await fetch(
    `${API}/change-market/${encodeURIComponent(selected)}`,
    { method: "POST" }
  );

  if (!response.ok) {
    throw new Error(`Market change failed: HTTP ${response.status}`);
  }
} catch (err) {
  setError(err.message);
}

}

function digitValue(item) {
if (item && typeof item === "object") {
if (item.digit !== undefined) return item.digit;
if (item.last_digit !== undefined) return item.last_digit;
if (item.quote !== undefined) {
return String(item.quote).slice(-1);
}
}

return item;

}

const latestDigit = digits.length
? digitValue(digits[digits.length - 1])
: "—";

const prediction =
signal.prediction || signal.direction || "WAIT";

const signalStatus =
signal.status || "COLLECTING DATA";

const cardStyle = {
background: "#111c2e",
border: "1px solid #263750",
borderRadius: "12px",
padding: "22px",
minWidth: 0
};

const labelStyle = {
color: "#9aadc5",
fontSize: "12px",
letterSpacing: "1px",
marginBottom: "12px"
};

return (
<div style={{
minHeight: "100vh",
background: "#0b1220",
color: "#edf4ff",
fontFamily: "Arial, sans-serif",
padding: "24px",
boxSizing: "border-box"
}}>
<div style={{ maxWidth: "1400px", margin: "0 auto" }}>
    <header style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "20px",
      marginBottom: "30px"
    }}>
      <div>
        <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0 }}>
          KERRY PRIME
        </h1>
        <p style={{
          margin: "6px 0",
          color: "#20c7c9",
          letterSpacing: "3px"
        }}>
          TRADING HUB
        </p>
        <small style={{ color: "#94a3b8" }}>
          TRADE WITH CONFIDENCE
        </small>
      </div>

      <div style={{
        padding: "12px 16px",
        borderRadius: "8px",
        background: connection === "CONNECTED" ? "#123a2b" : "#40202a",
        color: connection === "CONNECTED" ? "#4ade80" : "#fda4af",
        fontWeight: "bold",
        fontSize: "13px"
      }}>
        ● {connection}
      </div>
    </header>

    {error && (
      <div style={{
        padding: "14px",
        marginBottom: "20px",
        borderRadius: "8px",
        background: "#401e28",
        color: "#fecaca",
        overflowWrap: "anywhere"
      }}>
        {error}
      </div>
    )}

    <section style={{
      ...cardStyle,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "15px",
      marginBottom: "20px"
    }}>
      <div>
        <div style={labelStyle}>ACTIVE MARKET</div>

        <select
          value={market}
          onChange={changeMarket}
          style={{
            padding: "12px",
            borderRadius: "7px",
            background: "#0b1220",
            border: "1px solid #35465e",
            color: "white",
            minWidth: "160px"
          }}
        >
          {MARKETS.map(item => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div style={labelStyle}>LATEST DIGIT</div>
        <strong style={{
          fontSize: "36px",
          color: "#20c7c9"
        }}>
          {latestDigit}
        </strong>
      </div>

      <div>
        <div style={labelStyle}>DIGITS LOADED</div>
        <strong style={{ fontSize: "30px" }}>
          {digits.length}
        </strong>
      </div>
    </section>

    <section style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: "18px",
      marginBottom: "20px"
    }}>
      <div style={cardStyle}>
        <div style={labelStyle}>SIGNAL PREDICTION</div>
        <h2 style={{
          color: "#20c7c9",
          fontSize: "27px",
          margin: "10px 0"
        }}>
          {prediction}
        </h2>
        <p style={{ color: "#9aadc5" }}>
          Confidence: {signal.confidence ?? signal.strength ?? 0}
          {signal.confidence !== undefined ? "%" : ""}
        </p>
      </div>

      <div style={cardStyle}>
        <div style={labelStyle}>ANALYSIS STATUS</div>
        <h2 style={{ fontSize: "21px" }}>
          {signalStatus}
        </h2>
        <p style={{ color: "#9aadc5" }}>
          Ticks analyzed: {signal.ticks ?? digits.length}
        </p>
      </div>

      <div style={cardStyle}>
        <div style={labelStyle}>ENTRY SCANNER</div>
        <h2 style={{
          fontSize: "21px",
          overflowWrap: "anywhere"
        }}>
          {entry.status || "WAITING"}
        </h2>
        <p style={{ color: "#9aadc5" }}>
          Entry digit: {entry.entryDigit ?? "—"}
        </p>
        <p style={{ color: "#9aadc5" }}>
          Confirmations: {entry.confirmations ?? 0}
        </p>
      </div>
    </section>

    <section style={{
      ...cardStyle,
      marginBottom: "20px"
    }}>
      <h2 style={{ fontSize: "20px" }}>
        Recent Digits
      </h2>

      <p style={{
        color: "#9aadc5",
        fontSize: "13px"
      }}>
        Latest digit history received from the backend.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(45px, 1fr))",
        gap: "9px"
      }}>
        {digits.length > 0 ? digits.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "48px",
              borderRadius: "8px",
              background: index === 0 ? "#087f8c" : "#1e2b40",
              border: "1px solid #33465f",
              fontSize: "20px",
              fontWeight: "bold"
            }}
          >
            {digitValue(item)}
          </div>
        )) : (
          <p style={{ color: "#fbbf24" }}>
            Waiting for live digits from the backend...
          </p>
        )}
      </div>
    </section>

    <section style={cardStyle}>
      <h2 style={{ fontSize: "20px" }}>
        Connection Information
      </h2>

      <p style={{ color: "#9aadc5", lineHeight: 1.8 }}>
        Dashboard API: {API}<br />
        Active market: {market}<br />
        Backend status: {connection}<br />
        Live digits received: {digits.length}
      </p>
    </section>

    <footer style={{
      textAlign: "center",
      color: "#64748b",
      fontSize: "12px",
      marginTop: "30px"
    }}>
      KERRY PRIME TRADING HUB · TRADE WITH CONFIDENCE
    </footer>
  </div>
</div>
);
}
