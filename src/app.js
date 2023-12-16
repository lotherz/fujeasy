const net = require('net');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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
let jsonMessages = [];
let currentSettings = null;

let settings = {
    film_type: "colour",
    look: "standard",
    border: 0,
    file_format: "JPEG"
};

// Readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Click locations matrix
const clickLocations = {
    'colour': [[301, 173], [279, 279]],
    'bw': [[301, 173], [404, 289]],
    'border': [[612, 109]],
    'no_border': [[487, 114]],
    'tiff': [[450, 405], [214, 262], [615, 191]],
    'jpeg': [[450, 405], [217, 247], [615, 191]]
};

app.use(express.static('../public'));

// WebSocket connection with clients
wss.on('connection', (ws) => {
    console.log('WebSocket Client connected');
    ws.on('close', () => console.log('WebSocket Client disconnected'));
});

const client = new net.Socket();
client.on('error', (err) => console.error('Socket error:', err));
server.listen(port, () => console.log(`Server listening at http://localhost:${port}`));

client.on('data', (data) => {
    try {
        let jsonData = JSON.parse(data.toString());
        jsonMessages.push(jsonData);
        console.log('JSON Data received:', jsonData);
        if (jsonData.type === 'current_settings') {
            currentSettings = jsonData.settings;
            compareAndProcessSettings();
            input(); // Prompt for the next command
        }
    } catch (e) {
        // Accumulate image data if it's not JSON
        if (isImageSize) {
            // Parse the image size and prepare the buffer
            imageSize = parseInt(data.toString());
            if (isNaN(imageSize)) {
                console.error('Invalid image size received:', data.toString());
                return;
            }
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
    }
});

client.connect(8080, '192.168.1.20', () => {
    console.log('Connected to VM');
});

client.on('close', () => {
    isProcessingClicks = false;
    console.log('Connection closed');
});

function requestCurrentSettings() {
    client.write(JSON.stringify({ type: 'get_current_settings' }) + '\n');
}

function processClicksForSetting(setting) {
    const clicks = clickLocations[setting];
    if (clicks) {
        clicks.forEach(([x, y]) => addClick(x, y));
    }
}

function compareAndProcessSettings() {
    if (!currentSettings) {
        console.log('Current settings not available.');
        return;
    }

    if (currentSettings.film_type !== settings.film_type) {
        const filmTypeSetting = settings.film_type === 'colour' ? 'colour' : 'bw';
        processClicksForSetting(filmTypeSetting);
    }

    if (currentSettings.border !== settings.border) {
        const borderSetting = settings.border === 1 ? 'border' : 'no_border';
        processClicksForSetting(borderSetting);
    }

    if (currentSettings.file_format !== settings.file_format) {
        const fileFormatSetting = settings.file_format === 'TIFF' ? 'tiff' : 'jpeg';
        processClicksForSetting(fileFormatSetting);
    }

    processClickQueue();
}

function addClick(x, y) {
    clickQueue.push({ x, y });
    if (!isProcessingClicks) {
        processClickQueue();
    }
}

function processClickQueue() {
    if (clickQueue.length === 0) {
        //client.end(); // Close the connection when all clicks are processed
        return;
    }

    isProcessingClicks = true;
    let click = clickQueue.shift();
    sendClick(click.x, click.y);
}

function sendClick(x, y) {
    client.write(JSON.stringify({ type: 'click', x: x, y: y }) + '\n');
    console.log('Sent click at ' + x + ', ' + y);
    setTimeout(processClickQueue, 500); // Delay between clicks
}
function handleCommand(command) {
    switch (command) {
        case '?':
        case 'help':
            console.log('Commands: screenshot, click, settings, exit');
            input();
            break;
        case 'screenshot':
            requestScreenshot();
            input();
            break;
        case 'click':
            rl.question('Enter x: ', (x) => {
                rl.question('Enter y: ', (y) => {
                    addClick(parseInt(x, 10), parseInt(y, 10));
                    processClickQueue();
                    input();
                });
            });
            break;
        case 'settings':
                    rl.question('Enter film type (colour/bw): ', (film_type) => {
                rl.question('Enter border (0/1): ', (border) => {
                    rl.question('Enter file format (JPEG/TIFF): ', (file_format) => {
                        let lookTemp = settings.look;
                        settings = { film_type, lookTemp, border, file_format };
                        requestCurrentSettings();
                        input(); // Prompt for next command
                    });
                });
            });
            break;            
        case 'exit':
            rl.close();
            client.end();
            break;
        case 'run':
            requestCurrentSettings();
            input();
            break;
        default:
            console.log('Invalid command');
            input();
            break;
    }
}


function input() {
    rl.question('Enter command: ', (command) => {
        handleCommand(command);
    });
}

input(); // Initial call to start the command input loop

rl.on('close', () => {
    console.log('Exiting program');
    process.exit(0);
});
