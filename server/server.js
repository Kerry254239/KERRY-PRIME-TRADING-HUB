require("dotenv").config();


const app = express();

const PORT = process.env.PORT || 5000;

const DERIV_WS_URL =
    "wss://api.derivws.com/trading/v1/options/ws/public";

const JWT_SECRET =
    process.env.JWT_SECRET || "kerry_prime_secret_key_2026";

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME || "kerryprime";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "kerryprime2026";

const WINDOW_SIZE = 100;

const MARKETS = [
    { symbol: "R_10", name: "Volatility 10 Index" },
    { symbol: "R_25", name: "Volatility 25 Index" },
    { symbol: "R_50", name: "Volatility 50 Index" },
    { symbol: "R_75", name: "Volatility 75 Index" },
    { symbol: "R_100", name: "Volatility 100 Index" },
    { symbol: "1HZ10V", name: "Volatility 10 (1s) Index" },
    { symbol: "1HZ25V", name: "Volatility 25 (1s) Index" },
    { symbol: "1HZ50V", name: "Volatility 50 (1s) Index" },
    { symbol: "1HZ75V", name: "Volatility 75 (1s) Index" },
    { symbol: "1HZ100V", name: "Volatility 100 (1s) Index" }
];

app.use(cors());
app.use(express.json());

/* =========================================
   MARKET DATA
========================================= */

const marketData = {};

for (const market of MARKETS) {
    marketData[market.symbol] = {
        symbol: market.symbol,
        name: market.name,
        digits: [],
        lastQuote: null,
        lastDigit: null,
        lastTickTime: null,
        connected: false
    };
}

let currentMarket = "R_100";
let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let manualClose = false;
let lastError = null;

function getCurrentMarket() {
    return marketData[currentMarket];
}

/* =========================================
   DIGIT EXTRACTION
========================================= */

function extractLastDigit(quote, pipSize = 2) {
    const decimals = Number.isInteger(Number(pipSize))
        ? Math.min(Math.max(Number(pipSize), 0), 10)
        : 2;

    const fixedQuote = Number(quote).toFixed(decimals);
    const digitsOnly = fixedQuote.replace(/\D/g, "");

    return Number(digitsOnly.slice(-1));
}

/* =========================================
   LIVE DERIV CONNECTION
========================================= */

function connectDeriv() {
    manualClose = false;

    if (
        socket &&
        (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        )
    ) {
        return;
    }

    console.log("Connecting to Deriv...");
    console.log("Endpoint:", DERIV_WS_URL);

    try {
        socket = new WebSocket(DERIV_WS_URL);
    } catch (error) {
        lastError = error.message;
        console.error("Unable to create WebSocket:", error.message);
        scheduleReconnect();
        return;
    }

    const thisSocket = socket;

    thisSocket.on("open", () => {
        if (socket !== thisSocket) return;

        reconnectAttempts = 0;
        lastError = null;

        console.log("CONNECTED TO DERIV!");

        const market = getCurrentMarket();

        thisSocket.send(JSON.stringify({
            ticks: market.symbol,
            subscribe: 1
        }));

        console.log("Subscribed to:", market.symbol);
    });

    thisSocket.on("message", (rawData) => {
        if (socket !== thisSocket) return;

        let data;

        try {
            data = JSON.parse(rawData.toString());
        } catch (error) {
            console.error("Invalid Deriv response.");
            return;
        }

        if (data.error) {
            lastError = data.error.message;
            console.error("Deriv API error:", lastError);
            return;
        }

        if (data.msg_type !== "tick" || !data.tick) {
            return;
        }

        const tick = data.tick;
        const symbol = tick.symbol;

        if (!marketData[symbol]) {
            return;
        }

        const market = marketData[symbol];

        const digit = extractLastDigit(
            tick.quote,
            tick.pip_size
        );

        market.lastQuote = Number(tick.quote);
        market.lastDigit = digit;
        market.lastTickTime = tick.epoch;
        market.connected = true;

        market.digits.push(digit);

        if (market.digits.length > WINDOW_SIZE) {
            market.digits.shift();
        }

        // Update stability checks only when a fresh live tick arrives.
        updateMarketAnalysis(market);

        lastError = null;

        console.log(
            `[${symbol}] Quote: ${tick.quote} | Last digit: ${digit}`
        );
    });

    thisSocket.on("error", (error) => {
        if (socket !== thisSocket) return;

        lastError = error.message;
        console.error("Deriv WebSocket error:", error.message);
    });

    thisSocket.on("close", (code, reason) => {
        if (socket !== thisSocket) return;

        console.log(
            "Deriv disconnected:",
            code,
            reason.toString()
        );

        for (const market of Object.values(marketData)) {
            market.connected = false;
        }

        socket = null;

        if (!manualClose) {
            scheduleReconnect();
        }
    });
}

/* =========================================
   AUTOMATIC RECONNECTION
========================================= */

function scheduleReconnect() {
    if (manualClose || reconnectTimer) {
        return;
    }

    reconnectAttempts++;

    const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempts - 1),
        30000
    );

    console.log(
        `Reconnecting in ${delay / 1000} seconds...`
    );

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectDeriv();
    }, delay);
}

/* =========================================
   CHANGE MARKET
========================================= */

function changeMarket(symbol) {
    const market = marketData[symbol];

    if (!market) {
        return {
            success: false,
            message: "Unsupported market."
        };
    }

    currentMarket = symbol;

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (socket) {
        manualClose = true;

        const oldSocket = socket;
        socket = null;

        oldSocket.removeAllListeners();
        oldSocket.close();

        manualClose = false;
    }

    for (const item of Object.values(marketData)) {
        item.connected = false;
    }

    connectDeriv();

    return {
        success: true,
        market: market.name,
        symbol: market.symbol
    };
}

/* =========================================
   MARKET STRENGTH + STABILITY ANALYSIS
========================================= */

// Confirmation advances only when a NEW Deriv tick arrives.
// Repeated browser/API polling does not create extra confirmations.

const strategyStateByMarket = {};

const STRATEGY_CONFIG = {
    over2: {
        name: "OVER 2",
        matcher: digit => digit > 2,
        fullWindowThreshold: 75,
        recentWindowThreshold: 75
    },

    under7: {
        name: "UNDER 7",
        matcher: digit => digit < 7,
        fullWindowThreshold: 75,
        recentWindowThreshold: 75
    },

    even: {
        name: "EVEN",
        matcher: digit => digit % 2 === 0,
        fullWindowThreshold: 60,
        recentWindowThreshold: 60
    },

    odd: {
        name: "ODD",
        matcher: digit => digit % 2 !== 0,
        fullWindowThreshold: 60,
        recentWindowThreshold: 60
    }
};

const RECENT_WINDOW_SIZE = 20;
const REQUIRED_CONFIRMATION_TICKS = 5;

function percentageFor(digits, matcher) {
    if (!digits.length) return 0;

    const matches = digits.filter(matcher).length;

    return Number(
        ((matches / digits.length) * 100).toFixed(2)
    );
}

function createEmptyStrategyState() {
    const state = {};

    for (const key of Object.keys(STRATEGY_CONFIG)) {
        state[key] = {
            state: "COLLECTING TICKS",
            confirmationCount: 0,
            eligibleForSignal: false,
            message: "Waiting for enough live ticks."
        };
    }

    return state;
}

for (const market of MARKETS) {
    strategyStateByMarket[market.symbol] =
        createEmptyStrategyState();
}

/* =========================================
   UPDATE MARKET ANALYSIS
========================================= */

function updateMarketAnalysis(market) {
    const digits = market.digits.slice(-WINDOW_SIZE);

    const states = strategyStateByMarket[market.symbol];

    if (digits.length < WINDOW_SIZE) {
        for (const key of Object.keys(STRATEGY_CONFIG)) {
            states[key] = {
                state: "COLLECTING TICKS",
                confirmationCount: 0,
                eligibleForSignal: false,
                message: `Collecting live ticks (${digits.length}/${WINDOW_SIZE}).`
            };
        }

        return;
    }

    const recent = digits.slice(-RECENT_WINDOW_SIZE);

    const previous = digits.slice(
        -RECENT_WINDOW_SIZE * 2,
        -RECENT_WINDOW_SIZE
    );

    for (const [key, config] of Object.entries(STRATEGY_CONFIG)) {
        const fullPercentage = percentageFor(
            digits,
            config.matcher
        );

        const recentPercentage = percentageFor(
            recent,
            config.matcher
        );

        const previousPercentage = percentageFor(
            previous,
            config.matcher
        );

        const delta = Number(
            (recentPercentage - previousPercentage).toFixed(2)
        );

        const enoughFullStrength =
            fullPercentage >= config.fullWindowThreshold;

        const enoughRecentStrength =
            recentPercentage >= config.recentWindowThreshold;

        const previousState = states[key] || {};

        let nextState;
        let message;
        let confirmationCount = 0;
        let eligibleForSignal = false;

        if (!enoughFullStrength || !enoughRecentStrength) {
            nextState = Math.abs(delta) >= 15
                ? "MARKET UNSTABLE — WAIT"
                : "NO CLEAR ADVANTAGE";

            message = nextState === "MARKET UNSTABLE — WAIT"
                ? "Recent frequency is changing sharply. Wait for conditions to settle."
                : "The measured frequency has not met the configured analysis thresholds.";

        } else if (Math.abs(delta) >= 15) {
            nextState = "MARKET UNSTABLE — WAIT";

            message = "The recent and preceding blocks differ sharply. Wait for conditions to settle.";

        } else if (delta >= 5) {
            nextState = "STRENGTH BUILDING";

            message = "Recent frequency is higher than the preceding 20-tick block. This is not a confirmed signal.";

        } else if (delta <= -5) {
            nextState = "STRENGTH WEAKENING";

            message = "Recent frequency is lower than the preceding 20-tick block. Do not treat this as a confirmed signal.";

        } else {
            nextState = "CONDITIONS STABLE";

            message = "Frequency meets the configured thresholds and is relatively steady. Waiting for repeated confirmation.";

            // A stable state must persist across five separate new ticks.
            confirmationCount =
                previousState.state === "CONDITIONS STABLE" ||
                previousState.state === "SIGNAL CONFIRMED"
                    ? Math.min(
                        (previousState.confirmationCount ||
                            REQUIRED_CONFIRMATION_TICKS) + 1,
                        REQUIRED_CONFIRMATION_TICKS
                    )
                    : 1;

            if (
                confirmationCount >=
                REQUIRED_CONFIRMATION_TICKS
            ) {
                nextState = "SIGNAL CONFIRMED";

                eligibleForSignal = true;

                message = "The configured frequency and stability checks persisted across multiple new ticks. This does not predict or guarantee the next digit.";
            }
        }

        states[key] = {
            state: nextState,
            confirmationCount,
            eligibleForSignal,
            message,
            fullPercentage,
            recentPercentage,
            previousPercentage,
            delta
        };
    }
}

/* =========================================
   CALCULATE INDIVIDUAL STRATEGY
========================================= */

function calculateStrategyForMarket(
    digits,
    key,
    marketSymbol
) {
    const config = STRATEGY_CONFIG[key];

    const total = digits.length;

    const matches = digits.filter(
        config.matcher
    ).length;

    const recent = digits.slice(-RECENT_WINDOW_SIZE);

    const previous = digits.slice(
        -RECENT_WINDOW_SIZE * 2,
        -RECENT_WINDOW_SIZE
    );

    const state =
        strategyStateByMarket[marketSymbol]?.[key] || {
            state: total < WINDOW_SIZE
                ? "COLLECTING TICKS"
                : "NO CLEAR ADVANTAGE",

            confirmationCount: 0,
            eligibleForSignal: false,
            message: "Waiting for analysis."
        };

    return {
        name: config.name,

        matches,

        total,

        percentage: total > 0
            ? Number(
                ((matches / total) * 100).toFixed(2)
            )
            : 0,

        recent20Percentage: percentageFor(
            recent,
            config.matcher
        ),

        previous20Percentage: percentageFor(
            previous,
            config.matcher
        ),

        delta: Number((
            percentageFor(recent, config.matcher) -
            percentageFor(previous, config.matcher)
        ).toFixed(2)),

        state: state.state,

        confirmationCount: state.confirmationCount || 0,

        requiredConfirmationTicks:
            REQUIRED_CONFIRMATION_TICKS,

        eligibleForSignal:
            Boolean(state.eligibleForSignal),

        message:
            state.message || "Waiting for analysis."
    };
}

/* =========================================
   ANALYZE ALL STRATEGIES
========================================= */

function analyzeDigits(
    digits = [],
    marketSymbol = currentMarket
) {
    const validDigits = digits
        .map(Number)
        .filter(
            digit =>
                Number.isInteger(digit) &&
                digit >= 0 &&
                digit <= 9
        )
        .slice(-WINDOW_SIZE);

    const total = validDigits.length;

    const strategies = {
        over2: calculateStrategyForMarket(
            validDigits,
            "over2",
            marketSymbol
        ),

        under7: calculateStrategyForMarket(
            validDigits,
            "under7",
            marketSymbol
        ),

        even: calculateStrategyForMarket(
            validDigits,
            "even",
            marketSymbol
        ),

        odd: calculateStrategyForMarket(
            validDigits,
            "odd",
            marketSymbol
        )
    };

    const confirmedStrategies = Object.values(strategies)
        .filter(strategy => strategy.eligibleForSignal)
        .map(strategy => strategy.name);

    let status;

    if (total < WINDOW_SIZE) {
        status = "COLLECTING TICKS";

    } else if (confirmedStrategies.length > 0) {
        status = "SIGNAL CONFIRMED";

    } else if (
        Object.values(strategies).some(
            strategy =>
                strategy.state === "MARKET UNSTABLE — WAIT"
        )
    ) {
        status = "MARKET UNSTABLE — WAIT";

    } else if (
        Object.values(strategies).some(
            strategy =>
                strategy.state === "STRENGTH BUILDING"
        )
    ) {
        status = "STRENGTH BUILDING — WAIT FOR STABILITY";

    } else {
        status = "WAIT — NO CONFIRMED SIGNAL";
    }

    return {
        status,

        ticks: total,

        requiredTicks: WINDOW_SIZE,

        recentWindowTicks: RECENT_WINDOW_SIZE,

        requiredConfirmationTicks:
            REQUIRED_CONFIRMATION_TICKS,

        strategies,

        confirmedStrategies,

        latestDigits: validDigits.slice(
            -RECENT_WINDOW_SIZE
        ),

        lastDigit: total > 0
            ? validDigits[total - 1]
            : null,

        notice: "Frequency analysis describes recent outcomes only. It cannot predict or guarantee the next digit."
    };
}

/* =========================================
   LOGIN
========================================= */

app.post("/login", (req, res) => {
    const { username, password } = req.body || {};

    if (
        username !== ADMIN_USERNAME ||
        password !== ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            success: false,
            message: "Invalid username or password."
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
        username
    });
});

/* =========================================
   BASIC SERVER STATUS
========================================= */

app.get("/", (req, res) => {
    res.json({
        name: "Kerry Prime Trading Hub",
        status: "running",
        port: PORT,
        market: currentMarket,

        derivConnected: Boolean(
            socket &&
            socket.readyState === WebSocket.OPEN
        )
    });
});

app.get("/status", (req, res) => {
    const market = getCurrentMarket();

    res.json({
        server: "running",

        derivConnected: Boolean(
            socket &&
            socket.readyState === WebSocket.OPEN
        ),

        market: currentMarket,

        marketConnected: market.connected,

        ticksCollected: market.digits.length,

        lastDigit: market.lastDigit,

        lastQuote: market.lastQuote,

        lastError
    });
});

/* =========================================
   AVAILABLE MARKETS
========================================= */

app.get("/markets", (req, res) => {
    res.json({
        currentMarket,
        markets: MARKETS
    });
});

/* =========================================
   CHANGE MARKET API
========================================= */

app.post("/change-market", (req, res) => {
    const { symbol } = req.body || {};

    const result = changeMarket(symbol);

    if (!result.success) {
        return res.status(400).json(result);
    }

    return res.json(result);
});

app.get("/change-market/:symbol", (req, res) => {
    const result = changeMarket(req.params.symbol);

    if (!result.success) {
        return res.status(400).json(result);
    }

    return res.json(result);
});

/* =========================================
   CURRENT TICK
========================================= */

app.get("/tick", (req, res) => {
    const market = getCurrentMarket();

    res.json({
        market: market.name,
        symbol: market.symbol,
        connected: market.connected,
        quote: market.lastQuote,
        lastDigit: market.lastDigit,
        epoch: market.lastTickTime
    });
});

/* =========================================
   RECENT DIGITS
========================================= */

app.get("/digits", (req, res) => {
    const market = getCurrentMarket();

    res.json({
        market: market.name,
        symbol: market.symbol,
        connected: market.connected,
        count: market.digits.length,
        digits: market.digits,
        lastDigit: market.lastDigit
    });
});

/* =========================================
   FOUR-STRATEGY ANALYSIS
========================================= */

app.get("/analysis", (req, res) => {
    const market = getCurrentMarket();

    res.json({
        market: market.name,
        symbol: market.symbol,
        connected: market.connected,
        quote: market.lastQuote,
        lastTickTime: market.lastTickTime,

        analysis: analyzeDigits(
            market.digits,
            market.symbol
        )
    });
});

/* =========================================
   MARKET FREQUENCY SCANNER
========================================= */

app.get("/scanner", (req, res) => {
    const results = MARKETS.map((item) => {
        const market = marketData[item.symbol];

        const analysis = analyzeDigits(
            market.digits,
            market.symbol
        );

        return {
            symbol: item.symbol,
            name: item.name,
            connected: market.connected,
            ticks: market.digits.length,
            strategies: analysis.strategies
        };
    });

    res.json({
        currentMarket,
        markets: results
    });
});

/* =========================================
   START SERVER
========================================= */

const server = app.listen(PORT, () => {
    console.log("====================================");
    console.log("KERRY PRIME TRADING HUB");
    console.log(`Server running on port ${PORT}`);
    console.log("Strategies: OVER 2, UNDER 7, EVEN, ODD");
    console.log("====================================");

    connectDeriv();
});

/* =========================================
   SHUTDOWN
========================================= */

function shutdown() {
    console.log("Shutting down server...");

    manualClose = true;

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (socket) {
        socket.close();
    }

    server.close(() => {
        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);