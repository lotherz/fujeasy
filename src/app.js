const net = require('net');
const express = require('express');

const app = express();
const port = 3000;

app.use(express.static('../public'));
app.listen(port, () => console.log(`Server listening at http://localhost:${port}`));

const client = new net.Socket();
client.on('error', (err) => console.error('Socket error:', err));

let clickQueue = [];
let isProcessingClicks = false;

client.connect(8080, '192.168.1.20', () => {
    console.log('Connected to VM');
    addClick(301, 173);
    addClick(404, 289);
    processClickQueue();
});

function addClick(x, y) {
    clickQueue.push({ x, y });
    if (!isProcessingClicks) {
        processClickQueue();
    }
}

function processClickQueue() {
    if (clickQueue.length === 0) {
        client.end(); // Close the connection when all clicks are processed
        return;
    }

    isProcessingClicks = true;
    let click = clickQueue.shift();
    sendClick(click.x, click.y);
}

function sendClick(x, y) {
    client.write(JSON.stringify({ type: 'click', x: x, y: y }) + '\n');
    console.log('Sent click at ' + x + ', ' + y);
    setTimeout(processClickQueue, 2000); // Delay between clicks
}

client.on('data', (data) => console.log('Received: ' + data));
client.on('close', () => {
    isProcessingClicks = false;
    console.log('Connection closed');
});
