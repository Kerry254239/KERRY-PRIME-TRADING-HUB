require("dotenv").config();

const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

const app = express();

app.use(cors());
app.use(express.json());

// =====================================
// SETTINGS
// =====================================

const PORT = 5000;
const WINDOW_SIZE = 30;

let currentMarket = "R_100";
let socket = null;

// =====================================
// MEMORY
// =====================================

let digits = [];

let signal = {

    status: "COLLECTING 30 TICKS",
    prediction: "WAIT",
    strength: 0,
    trend: "STABLE",
    pressure: "NONE",
    stability: "UNKNOWN",
    ticks: 0

};

let entry = {

    status: "WAITING FOR SIGNAL",
    prediction: "WAIT",
    candidates: [],
    entryDigit: null,
    confirmations: 0,
    patterns: [],
    confirmationTicks: [],
    waitingConfirmation: false

};

let previousStrength = 0;

// =====================================
// RESET FUNCTIONS
// =====================================

function resetSignal() {

    signal = {

        status: "COLLECTING 30 TICKS",
        prediction: "WAIT",
        strength: 0,
        trend: "STABLE",
        pressure: "NONE",
        stability: "UNKNOWN",
        ticks: 0

    };

}

function resetEntry() {

    entry = {

        status: "WAITING FOR SIGNAL",
        prediction: signal.prediction,
        candidates: [],
        entryDigit: null,
        confirmations: 0,
        patterns: [],
        confirmationTicks: [],
        waitingConfirmation: false

    };

}

function resetAll() {

    digits = [];

    previousStrength = 0;

    resetSignal();

    resetEntry();

}

// =====================================
// TICK ENGINE
// =====================================

function addTick(digit) {

    digits.push(digit);

    if (digits.length > WINDOW_SIZE) {

        digits.shift();

    }

    signal.ticks = digits.length;

}

// =====================================
// DIGIT STATISTICS
// =====================================

function calculateDigitStats() {

    const stats = {};

    for (let i = 0; i <= 9; i++) {

        stats[i] = 0;

    }

    for (const digit of digits) {

        stats[digit]++;

    }

    // Convert counts to percentages
    const total = digits.length || 1;

    for (let i = 0; i <= 9; i++) {

        stats[i] = Number(
            ((stats[i] / total) * 100).toFixed(2)
        );

    }

    return stats;

}
// =====================================
// SIGNAL SCANNER V4
// =====================================

function analyzeSignal() {

    if (digits.length < WINDOW_SIZE) {

        signal.status = "COLLECTING 30 TICKS";
        signal.prediction = "WAIT";
        signal.strength = 0;

        return;

    }

    const stats = calculateDigitStats();

    const low = [

        stats[0],

        stats[1],

        stats[2]

    ];

    const high = [

        stats[7],

        stats[8],

        stats[9]

    ];

    // Count weak digits

    const weakLow = low.filter(x => x < 7).length;

    const weakHigh = high.filter(x => x < 7).length;

    signal.status = "SIGNAL NOT READY";

    signal.prediction = "WAIT";

    signal.strength = 0;

    // OVER 2

    if (weakLow >= 2) {

        signal.prediction = "OVER 2";

        signal.status = "SIGNAL CONFIRMED";

        signal.strength = weakLow;

    }

    // UNDER 7

    else if (weakHigh >= 2) {

        signal.prediction = "UNDER 7";

        signal.status = "SIGNAL CONFIRMED";

        signal.strength = weakHigh;

    }

    // Trend

    if (signal.strength > previousStrength)

        signal.trend = "GAINING";

    else if (signal.strength < previousStrength)

        signal.trend = "LOSING";

    else

        signal.trend = "STABLE";

    previousStrength = signal.strength;

}
// =====================================
// ENTRY SCANNER
// =====================================

function chooseEntry() {

    if (entry.candidates.length < 5) return;

    let counts = {};

    entry.candidates.forEach(d => {

        counts[d] = (counts[d] || 0) + 1;

    });

    let bestDigit = null;
    let lowestCount = 999;

    Object.keys(counts).forEach(d => {

        if (counts[d] < lowestCount) {

            lowestCount = counts[d];
            bestDigit = Number(d);

        }

    });

    entry.entryDigit = bestDigit;

    entry.status = "WAITING FOR ENTRY DIGIT " + bestDigit;

}

function checkConfirmation() {

    let valid = true;

    for (const d of entry.confirmationTicks) {

        if (
            entry.prediction === "OVER 2" &&
            d <= 2
        ) {
            valid = false;
        }

        if (
            entry.prediction === "UNDER 7" &&
            d >= 7
        ) {
            valid = false;
        }

    }

    if (valid) {

        entry.confirmations++;

        entry.patterns.push({

            trigger: entry.entryDigit,
            ticks: [...entry.confirmationTicks]

        });

        if (entry.confirmations >= 3) {

            entry.status = "ENTRY FOUND";

        } else {

            entry.status =
                "CONFIRMATION " +
                entry.confirmations +
                "/3";

        }

    } else {

        resetEntry();
        return;

    }

    entry.confirmationTicks = [];
    entry.waitingConfirmation = false;

}

function updateEntry(digit) {

    if (signal.prediction === "WAIT") {

        resetEntry();
        return;

    }

    if (entry.entryDigit === null) {

        entry.candidates.push(digit);

        entry.status = "COLLECTING 5 CANDIDATES";

        if (entry.candidates.length >= 5) {

            chooseEntry();

        }

        return;

    }

    if (!entry.waitingConfirmation) {

        if (digit === entry.entryDigit) {

            entry.waitingConfirmation = true;

            entry.confirmationTicks = [];

            entry.status =
                "COLLECTING CONFIRMATION";

        }

        return;

    }

    entry.confirmationTicks.push(digit);

    if (entry.confirmationTicks.length === 3) {

        checkConfirmation();

    }

}
// =====================================
// ENTRY SCANNER
// =====================================

function chooseEntry() {

    if (entry.candidates.length < 5) return;

    let counts = {};

    entry.candidates.forEach(d => {

        counts[d] = (counts[d] || 0) + 1;

    });

    let bestDigit = null;
    let lowestCount = 999;

    Object.keys(counts).forEach(d => {

        if (counts[d] < lowestCount) {

            lowestCount = counts[d];
            bestDigit = Number(d);

        }

    });

    entry.entryDigit = bestDigit;

    entry.status = "WAITING FOR ENTRY DIGIT " + bestDigit;

}

function checkConfirmation() {

    let valid = true;

    for (const d of entry.confirmationTicks) {

        if (
            entry.prediction === "OVER 2" &&
            d <= 2
        ) {
            valid = false;
        }

        if (
            entry.prediction === "UNDER 7" &&
            d >= 7
        ) {
            valid = false;
        }

    }

    if (valid) {

        entry.confirmations++;

        entry.patterns.push({

            trigger: entry.entryDigit,
            ticks: [...entry.confirmationTicks]

        });

        if (entry.confirmations >= 3) {

            entry.status = "ENTRY FOUND";

        } else {

            entry.status =
                "CONFIRMATION " +
                entry.confirmations +
                "/3";

        }

    } else {

        resetEntry();
        return;

    }

    entry.confirmationTicks = [];
    entry.waitingConfirmation = false;

}

function updateEntry(digit) {

    if (signal.prediction === "WAIT") {

        resetEntry();
        return;

    }

    if (entry.entryDigit === null) {

        entry.candidates.push(digit);

        entry.status = "COLLECTING 5 CANDIDATES";

        if (entry.candidates.length >= 5) {

            chooseEntry();

        }

        return;

    }

    if (!entry.waitingConfirmation) {

        if (digit === entry.entryDigit) {

            entry.waitingConfirmation = true;

            entry.confirmationTicks = [];

            entry.status =
                "COLLECTING CONFIRMATION";

        }

        return;

    }

    entry.confirmationTicks.push(digit);

    if (entry.confirmationTicks.length === 3) {

        checkConfirmation();

    }

}
// =====================================
// DERIV CONNECTION
// =====================================

function connectDeriv() {

    if (socket) {

        socket.close();

    }

    socket = new WebSocket(

        "wss://ws.derivws.com/websockets/v3?app_id=1089"

    );

    socket.on("open", () => {

        console.log("Connected to", currentMarket);

        socket.send(JSON.stringify({

            ticks: currentMarket,

            subscribe: 1

        }));

    });

    socket.on("message", (msg) => {

        const data = JSON.parse(msg);

        if (!data.tick) return;

        const digit = Number(

            String(data.tick.quote).slice(-1)

        );

        // Save tick
        addTick(digit);

        // Analyze market every tick
        analyzeSignal();

        // Update entry every tick
        updateEntry(digit);

        console.log(
            currentMarket,
            "| Digit:", digit,
            "| Signal:", signal.prediction,
            "| Status:", signal.status
        );

    });

    socket.on("close", () => {

        console.log("Disconnected");

    });

    socket.on("error", (err) => {

        console.log(err.message);

    });

}
// =====================================
// ROUTES
// =====================================

app.get("/digits", (req, res) => {

    res.json({

        market: currentMarket,

        digits

    });

});

app.get("/signal", (req, res) => {

    res.json({

        signal,

        entry

    });

});

app.post("/change-market/:symbol", (req, res) => {

    currentMarket = req.params.symbol;

    resetAll();

    connectDeriv();

    res.json({

        success: true,

        market: currentMarket

    });

});

app.post("/reset", (req, res) => {

    resetAll();

    res.json({

        success: true

    });

});

// =====================================
// START SERVER
// =====================================

app.listen(PORT, () => {

    console.log(`Kerry Prime Trading Hub running on port ${PORT}`);

    connectDeriv();

});