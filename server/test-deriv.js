const WebSocket = require("ws");

const URL = "wss://api.derivws.com/trading/v1/options/ws/public";

console.log("KERRY PRIME TRADING HUB");
console.log("NEW DERIV CONNECTION TEST");
console.log("Endpoint:", URL);

let socket;

try {
    socket = new WebSocket(URL);
} catch (error) {
    console.log("Connection setup failed:", error.message);
    process.exit(1);
}

const timeout = setTimeout(() => {
    console.log("Connection timed out.");
    socket.terminate();
}, 15000);

socket.on("open", () => {
    console.log("CONNECTED!");

    socket.send(JSON.stringify({
        ticks: "R_100",
        subscribe: 1
    }));
});

socket.on("message", (data) => {
    console.log("Server response:", data.toString());
});

socket.on("unexpected-response", (request, response) => {
    console.log("Connection rejected.");
    console.log("HTTP status:", response.statusCode);
});

socket.on("error", (error) => {
    console.log("WebSocket error:", error.message);
});

socket.on("close", (code, reason) => {
    console.log("Connection closed:", code, reason.toString());
    clearTimeout(timeout);
});
