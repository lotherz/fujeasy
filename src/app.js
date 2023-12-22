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
let serverSettings = null;
let firstLoad = 0;
let isScanning = false;

let settings = {
    film_type: "colour",
    look: "standard",
    border: 0,
    file_format: "JPEG",
    state: "settings"
};

function input() {
    rl.question('Enter command: ', (command) => {
        handleCommand(command);
    });
}

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
    'no_border':  [[487, 114]],
    'tiff': [[450, 405], [214, 262], [615, 191]],
    'jpeg': [[450, 405], [217, 247], [615, 191]],
    'start_button': [726, 515],
    'cancel_button': [401, 362],

};

app.use(express.static('../public'));

// WebSocket connection with clients
wss.on('connection', (ws) => {
    console.log('\x1b[37m%s\x1b[0m', 'WebSocket Client connected');
    ws.on('close', () => console.log('\x1b[31m', 'WebSocket Client disconnected'));
});

const client = new net.Socket();
client.on('error', (err) => console.error('\x1b[31m%s\x1b[0m', 'Socket error:', err));
server.listen(port, () => console.log('\x1b[37m%s\x1b[0m', `Server listening at http://localhost:${port}`));

client.on('data', (data) => {
    // Attempt to parse the data as JSON
    try {
        let jsonData = JSON.parse(data.toString());

        if (serverSettings) {
            serverSettings = { 
                film_type: jsonData.film_type, 
                look: settings.look, 
                border: jsonData.border, 
                file_format: jsonData.file_format,
                state: jsonData.state
            };
            
            if (firstLoad > 0) {
                if (settings.film_type !== serverSettings.film_type || settings.border !== serverSettings.border || settings.file_format !== serverSettings.file_format) {
                    console.log('\x1b[31m%s\x1b[0m', 'Client and server are not in sync');
                    compareAndProcessSettings();
                } else {
                    console.log('\x1b[32m%s\x1b[0m', 'Client and server are in sync');
                    input();
                }
            }
        }
        
        firstLoad++

    } catch (e) {
        // If parsing fails, it's likely image data
        handleImageData(data);
    }
});

function handleImageData(data) {

    // Check if we are expecting image size
    if (isImageSize) {
        const sizeData = data.toString().split('\n')[0]; // Assuming the first line is the size
        imageSize = parseInt(sizeData);
        if (isNaN(imageSize)) {
            console.error('Invalid image size received:', sizeData);
            return;
        }
        isImageSize = false;
        return;
    }

    // Initialize imageBuffer if it's the first chunk
    if (!imageBuffer) {
        imageBuffer = Buffer.from(data);
    } else {
        imageBuffer = Buffer.concat([imageBuffer, data]);
    }

    //console.log('Current image buffer size:', imageBuffer.length);

    // Check if we have received the complete image
    if (imageBuffer.length >= imageSize) {

        console.log('Expected image size:', imageSize, 'Received image size:', imageBuffer.length);

        if (imageBuffer.length > imageSize) {
            console.warn('Warning: Received more data than expected. Truncating extra data.');
            imageBuffer = imageBuffer.slice(0, imageSize);
        }

        // Write the image data to a file
        fs.writeFileSync('../public/screenshots/screenshot.png', imageBuffer);
        console.log('Image written to file.');

        // Reset for the next image
        resetImageHandling();
    }
}

function resetImageHandling() {
    isImageSize = true;
    imageSize = 0;
    imageBuffer = null;
}

function requestserverSettings(s) {
    client.write(JSON.stringify({ type: 'get_settings' }) + '<END_OF_JSON>');
}

client.connect(8080, '192.168.1.20', () => {
    console.log('Connected to VM');
    requestserverSettings();
    input();
});

client.on('close', () => {
    isProcessingClicks = false;
    console.log('Connection closed');
});

function processClicksForSetting(setting) {
    const clicks = clickLocations[setting];
    if (clicks) {
        clicks.forEach(([x, y]) => addClick(x, y));
    }
}

function compareAndProcessSettings() {
    if (!serverSettings) {
        console.log('\x1b[31m%s\x1b[0m', 'Current settings not available.');
        return;
    }

    // Compare film_type setting
    if (serverSettings.film_type !== settings.film_type) {
        console.log('\x1b[31m%s\x1b[0m', 'Film type out of sync');
        const filmTypeSetting = settings.film_type === 'colour' ? 'colour' : 'bw';
        processClicksForSetting(filmTypeSetting);
    }

    // Compare border setting
    if (serverSettings.border !== settings.border) {
        console.log('\x1b[31m%s\x1b[0m', 'Border out of sync');
        const borderSetting = settings.border === 1 ? 'border' : 'no_border';
        processClicksForSetting(borderSetting);
    }

    // Compare file_format setting
    if (serverSettings.file_format !== settings.file_format) {
        console.log('\x1b[31m%s\x1b[0m', 'File format out of sync');
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
        if (isProcessingClicks) {
            console.log('All clicks processed');
            isProcessingClicks = false;
            input(); // Ready to accept the next command
        }
        return;
    }

    // Processing clicks
    isProcessingClicks = true;
    const click = clickQueue.shift(); // Remove the first click from the queue
    sendClick(click.x, click.y); // Send the click

    // Set a timeout to process the next click after a delay
    setTimeout(processClickQueue, 2000); // Delay of 0.5 seconds between clicks
}

function sendClick(x, y) {
    const command = JSON.stringify({ type: 'click', x: x, y: y });
    //console.log(`Sending command: ${command}`);  // Debug log
    client.write(command + '<END_OF_JSON>');
}

function requestScreenshot() {
    const command = JSON.stringify({ type: 'screenshot' });
    console.log(`Requesting screenshot...`);  // Debug log
    client.write(command + '<END_OF_JSON>');
}

function handleCommand(command) {
    switch (command) {
        case 'clickqueue':
            console.log(clickQueue)
            input();
            break;
        case 'sync':
            requestserverSettings();
            break;
        case 'clientSettings':
            console.log(settings);
            input();
            break;
        case 'serverSettings':
            requestserverSettings();
            input();
            break;
        case 'start':
        case 'scan':
            //Click start button on VM
            addClick(clickLocations.start_button[0], clickLocations.start_button[1]);
            //Check if film has been inserted
            isScanning = true;
            scan();
            break;
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
                    input();
                });
            });
            break;
        case 'settings':
            rl.question('Enter film type (colour/bw): ', (film_type) => {
                rl.question('Enter border (0/1): ', (border) => {
                    rl.question('Enter file format (JPEG/TIFF): ', (file_format) => {
                        settings = { film_type: film_type, look: settings.look, border: parseInt(border), file_format: file_format };
                        input(); // Prompt for next command
                    });
                });
            });
            break;            
        case 'exit':
            rl.close();
            client.end();
            break;
        default:
            console.log('\x1b[31m%s\x1b[0m', 'Invalid command');
            input();
            break;
    }
}

rl.on('close', () => {
    console.log('User Exit');
    process.exit(0);
});
