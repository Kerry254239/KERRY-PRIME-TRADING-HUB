const WebSocket = require("ws");

const ws = new WebSocket(
"wss://ws.derivws.com/websockets/v3?app_id=1089"
);

ws.on("open", () => {
console.log("CONNECTED TO DERIV");

ws.send(JSON.stringify({
ticks: "R_100",
subscribe: 1
}));
});

ws.on("message", (message) => {
const data = JSON.parse(message.toString());

if (data.tick) {
console.log("LIVE PRICE:", data.tick.quote);
} else {
console.log("RESPONSE:", JSON.stringify(data));
}
});

ws.on("unexpected-response", (request, response) => {
console.log("HTTP ERROR:", response.statusCode);
});

ws.on("error", (error) => {
console.log("CONNECTION ERROR:", error.message);
});

setTimeout(() => {
ws.terminate();
process.exit(0);
}, 15000);
