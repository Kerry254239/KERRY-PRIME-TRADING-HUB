import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000";

const STRATEGIES = [
  {
    name: "OVER 2",
    description: "Digits greater than 2",
    digits: [3, 4, 5, 6, 7, 8, 9],
  },
  {
    name: "UNDER 7",
    description: "Digits less than 7",
    digits: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    name: "EVEN",
    description: "Even digits",
    digits: [0, 2, 4, 6, 8],
  },
  {
    name: "ODD",
    description: "Odd digits",
    digits: [1, 3, 5, 7, 9],
  },
];

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

function getDigit(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const fixed = Math.abs(number).toFixed(decimals);
  const digitsOnly = fixed.replace(".", "");

  return Number(digitsOnly.slice(-1));
}

function App() {
  const [market, setMarket] = useState("R_100");
  const [digits, setDigits] = useState([]);
  const [quote, setQuote] = useState(null);
  const [connection, setConnection] = useState("Connecting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Read the current market and its recent digits from the backend.
  async function loadData() {
    try {
      const response = await fetch(`${API}/digits`);

      if (!response.ok) {
        throw new Error("Could not retrieve market digits.");
      }

      const data = await response.json();

      // Support several common backend response formats.
      const rawHistory =
        data.digits ??
        data.history ??
        data.lastDigits ??
        data.data?.digits ??
        data.data?.history ??
        [];

      if (Array.isArray(rawHistory)) {
        const parsedDigits = rawHistory
          .map((item) => {
            if (typeof item === "number" || typeof item === "string") {
              const number = Number(item);

              return Number.isInteger(number) &&
                number >= 0 &&
                number <= 9
                ? number
                : null;
            }

            if (item && typeof item === "object") {
              if (item.digit !== undefined) {
                return Number(item.digit);
              }

              if (item.quote !== undefined) {
                return getDigit(item.quote, item.pip_size ?? 2);
              }

              if (item.tick?.quote !== undefined) {
                return getDigit(
                  item.tick.quote,
                  item.tick.pip_size ?? 2
                );
              }
            }

            return null;
          })
          .filter(
            (digit) =>
              Number.isInteger(digit) && digit >= 0 && digit <= 9
          );

        setDigits(parsedDigits.slice(-100));
      }

      if (data.quote !== undefined) {
        setQuote(data.quote);
      }

      setConnection("Connected");
      setError("");
    } catch (err) {
      setConnection("Backend unavailable");
      setError(
        "Cannot read the analysis data. Check that your backend is running."
      );
    } finally {
      setLoading(false);
    }
  }

  // Refresh the digits every second.
  useEffect(() => {
    loadData();

    const timer = setInterval(loadData, 1000);

    return () => clearInterval(timer);
  }, []);

  // Change the market through the existing backend endpoint.
  async function changeMarket(event) {
    const selectedMarket = event.target.value;

    setMarket(selectedMarket);
    setDigits([]);
    setQuote(null);
    setLoading(true);

    try {
      const response = await fetch(`${API}/change-market`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: selectedMarket,
          market: selectedMarket,
        }),
      });

      if (!response.ok) {
        throw new Error("Market change failed.");
      }

      setConnection("Connecting");
      setError("");
    } catch (err) {
      setError(
        "The backend could not change the market. Your existing market may still be active."
      );
    } finally {
      setLoading(false);
    }
  }

  // Calculate each strategy's frequency from the collected digits.
  function analyze(strategy) {
    const total = digits.length;

    const matches = digits.filter((digit) =>
      strategy.digits.includes(digit)
    ).length;

    const percentage =
      total > 0 ? (matches / total) * 100 : 0;

    return {
      total,
      matches,
      percentage,
    };
  }

  const latestDigits = [...digits].reverse().slice(0, 20);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">KP</div>

          <div>
            <h1>KERRY PRIME</h1>
            <p>TRADING HUB</p>
          </div>
        </div>

        <div className="connection">
          <span
            className={`connection-dot ${
              connection === "Connected" ? "online" : ""
            }`}
          />

          <span>{connection}</span>
        </div>
      </header>

      <main className="main">
        <section className="welcome">
          <div>
            <p className="eyebrow">LIVE MARKET ANALYTICS</p>
            <h2>Market Analysis Dashboard</h2>
            <p className="subtitle">
              Monitor digit frequency and compare four trading categories.
            </p>
          </div>

          <div className="market-selector">
            <label htmlFor="market">SELECT MARKET</label>

            <select
              id="market"
              value={market}
              onChange={changeMarket}
            >
              {MARKETS.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </section>

        {error && <div className="error-message">{error}</div>}

        <section className="overview-grid">
          <div className="overview-card">
            <span className="card-label">SELECTED MARKET</span>
            <strong>{market}</strong>
            <span className="muted">Current analysis symbol</span>
          </div>

          <div className="overview-card">
            <span className="card-label">DIGITS COLLECTED</span>
            <strong>{digits.length}</strong>
            <span className="muted">Maximum history: 100 digits</span>
          </div>

          <div className="overview-card">
            <span className="card-label">LATEST DIGIT</span>
            <strong className="latest-number">
              {digits.length > 0 ? digits[digits.length - 1] : "—"}
            </strong>
            <span className="muted">Most recently collected</span>
          </div>

          <div className="overview-card">
            <span className="card-label">CURRENT QUOTE</span>
            <strong className="quote">
              {quote !== null ? quote : "—"}
            </strong>
            <span className="muted">Latest quote, if provided</span>
          </div>
        </section>

        <section className="section-heading">
          <div>
            <h2>Strategy Analysis</h2>
            <p>
              Frequency of each category in the available digit history.
            </p>
          </div>

          <span className="history-badge">
            {digits.length} DIGITS ANALYZED
          </span>
        </section>

        <section className="strategy-grid">
          {STRATEGIES.map((strategy) => {
            const result = analyze(strategy);

            return (
              <article className="strategy-card" key={strategy.name}>
                <div className="strategy-header">
                  <div>
                    <h3>{strategy.name}</h3>
                    <p>{strategy.description}</p>
                  </div>

                  <div className="strategy-symbol">
                    {strategy.name === "OVER 2" && ">"}
                    {strategy.name === "UNDER 7" && "<"}
                    {strategy.name === "EVEN" && "E"}
                    {strategy.name === "ODD" && "O"}
                  </div>
                </div>

                <div className="percentage">
                  {result.total > 0
                    ? `${result.percentage.toFixed(1)}%`
                    : "—"}
                </div>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${result.percentage}%`,
                    }}
                  />
                </div>

                <div className="stats-row">
                  <div>
                    <span className="stat-label">MATCHES</span>
                    <strong>{result.matches}</strong>
                  </div>

                  <div>
                    <span className="stat-label">NON-MATCHES</span>
                    <strong>
                      {result.total - result.matches}
                    </strong>
                  </div>

                  <div>
                    <span className="stat-label">SAMPLE</span>
                    <strong>{result.total}</strong>
                  </div>
                </div>

                <div className="digit-list">
                  {strategy.digits.map((digit) => (
                    <span className="digit-chip" key={digit}>
                      {digit}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </section>

        <section className="history-section">
          <div className="section-heading">
            <div>
              <h2>Latest Digits</h2>
              <p>Newest digit appears first.</p>
            </div>
          </div>

          <div className="digit-history">
            {latestDigits.length > 0 ? (
              latestDigits.map((digit, index) => (
                <span
                  className={`history-digit ${
                    index === 0 ? "latest-history-digit" : ""
                  }`}
                  key={`${index}-${digit}`}
                >
                  {digit}
                </span>
              ))
            ) : (
              <p className="empty-state">
                {loading
                  ? "Loading market digits..."
                  : "Waiting for digit history from the backend..."}
              </p>
            )}
          </div>
        </section>

        <div className="notice">
          <strong>Risk notice:</strong> These percentages describe historical
          frequency in the collected sample. They do not predict or guarantee
          the next result. OVER 2 and UNDER 7 overlap on digits 3–6.
        </div>

        <footer className="footer">
          KERRY PRIME TRADING HUB · MARKET ANALYSIS
        </footer>
      </main>
    </div>
  );
}

export default App;