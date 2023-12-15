const net = require('net');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = 3000;

let clickQueue = [];
let isProcessingClicks = false;
let isImageSize = true;
let imageSize = 0;
let imageBuffer;
let bufferOffset = 0;
let settings = {
    film_type: "colour",
    look: "soft",
    border: 0,
    file_format: "JPEG"
};

function updateSettings(film_type, look, border, file_format) {
    settings = {
        film_type: film_type,
        look: look,
        border: border,
        file_format: file_format
    };
}

console.log("PROGRAM STARTED");

function readSettings() {
    requestScreenshot();
}

app.use(express.static('../public'));

// WebSocket connection with clients
wss.on('connection', (ws) => {
    console.log('WebSocket Client connected');

    ws.on('close', () => {
        console.log('WebSocket Client disconnected');
    });
});

const client = new net.Socket();
client.on('error', (err) => console.error('Socket error:', err));

app.use(express.static('../public'));

app.get('/screenshot', (req, res) => {
    const screenshotPath = path.join(__dirname, '../public/screenshots/screenshot.png');
    if (fs.existsSync(screenshotPath)) {
        res.sendFile(screenshotPath);
    } else {
        res.status(404).send('Screenshot not found');
    }
});

server.listen(port, () => console.log(`Server listening at http://localhost:${port}`));

client.on('error', (err) => console.error('Socket error:', err));

client.connect(8080, '192.168.1.20', () => {
    console.log('Connected to VM');
    updateSettings("colour", "soft", 0, "JPEG");

    if (settings.film_type === "colour") {
        addClick(301, 173);
        addClick(279, 279);
    } else {
        addClick(301, 173);
        addClick(404, 289);
    }

    if (settings.border === 1) {
        addClick(612, 109);
    } else { //IF NO BORDER
        addClick(487, 114);
    }

    if (settings.file_format === "TIFF") {
        addClick(450, 405);
        addClick(214, 262);
        addClick(615, 191);
    } else { // IF JPEG
        addClick(450, 405);
        addClick(217, 247);
        addClick(615, 191);
    }
    processClickQueue();
    
});

client.on('data', (data) => {
    try {
        if (isImageSize) {
            // Parse the image size and prepare the buffer
            imageSize = parseInt(data.toString());
            isImageSize = false;
            imageBuffer = Buffer.alloc(imageSize);
            bufferOffset = 0;
        } else {
            // Accumulate the image data into the buffer
            data.copy(imageBuffer, bufferOffset);
            bufferOffset += data.length;

            if (bufferOffset >= imageSize) {
                console.log('Received image data');
                const imgBuffer = imageBuffer.slice(0, bufferOffset); // Slice the buffer to actual size
                fs.writeFileSync('../public/screenshots/screenshot.png', imgBuffer);
                isImageSize = true;
        
                // Send the image data to all connected WebSocket clients
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(imgBuffer);
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error handling data:', error);
    }
});


function requestScreenshot() {
    client.write(JSON.stringify({ type: 'screenshot' }) + '\n');
}

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
    readSettings();
}

function sendClick(x, y) {
    client.write(JSON.stringify({ type: 'click', x: x, y: y }) + '\n');
    console.log('Sent click at ' + x + ', ' + y);
    setTimeout(processClickQueue, 1000); // Delay between clicks
}

client.on('data', (data) => console.log('Received: ' + data));
client.on('close', () => {
    isProcessingClicks = false;
    console.log('Connection closed');
});
