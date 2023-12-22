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
let imageBuffer;
let bufferOffset = 0;
let jsonMessages = [];
let serverSettings = null;
let firstLoad = false;
let isScanning = false;
let expectingSize = true;
let currentState = 'AWAITING_SIZE';
let accumulatedData = Buffer.alloc(0);
let imageSize = 0;  

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
    accumulatedData = Buffer.concat([accumulatedData, data]);

    while (accumulatedData.length) {
        // Attempt to read the header from the accumulated data
        const headerEndIndex = accumulatedData.indexOf('\n');
        if (headerEndIndex === -1) {
            // No complete header found in the data yet, wait for more data
            break;
        }

        // Extract and process the header
        const header = accumulatedData.slice(0, headerEndIndex).toString();
        console.log(`Header received: ${header}`);

        // Remove the processed header from the accumulated data
        accumulatedData = accumulatedData.slice(headerEndIndex + 1);

        if (header === 'JSON') {
            // Process JSON Data
            handleJsonData();
        } else if (header === 'IMAGE') {
            // Process Image Data
            handleImageData();
        } else {
            console.log(`Unknown header type: ${header}`);
            // Implement additional header types or error handling here if needed
        }
    }
});

function handleJsonData() {
    const jsonEndIndex = accumulatedData.indexOf('<END_OF_JSON>');
    
    if (jsonEndIndex === -1) {
        console.log("Awaiting more data for complete JSON...");
        return;
    }

    const jsonData = accumulatedData.slice(0, jsonEndIndex).toString();
    try {
        let parsedData = JSON.parse(jsonData);
        console.log("Parsed JSON data: ", parsedData);

        if (serverSettings) {
            serverSettings = { 
                film_type: jsonData.film_type, 
                look: settings.look, 
                border: jsonData.border, 
                file_format: jsonData.file_format,
                state: jsonData.state
            };
        }

        if (firstLoad === false) {
            console.log('Received initial data from server:', jsonData);

            if (settings.film_type !== serverSettings.film_type || 
                settings.border !== serverSettings.border || 
                settings.file_format !== serverSettings.file_format) {
                console.log('\x1b[31m%s\x1b[0m', 'Client and server settings are not in sync');
                compareAndProcessSettings();
            } else {
                console.log('\x1b[32m%s\x1b[0m', 'Client and server settings are in sync');
                input();
            }
        }
        
        firstLoad = true;

        accumulatedData = accumulatedData.slice(jsonEndIndex + '<END_OF_JSON>'.length);
    } catch (e) {
        console.error('Error parsing JSON:', e);
    }
}

function handleImageData(data) {
    console.log('Received image data: ', accumulatedData.length + ' bytes');
    accumulatedData = Buffer.concat([accumulatedData, data]);

    while (true) {
        if (currentState === 'AWAITING_SIZE') {
            const sizeEndIndex = accumulatedData.indexOf('\nENDSIZE\n');
            if (sizeEndIndex !== -1) {
                const sizeInfo = accumulatedData.slice(0, sizeEndIndex).toString();
                const sizeMatch = sizeInfo.match(/SIZE:(\d+)/);
                if (sizeMatch) {
                    imageSize = parseInt(sizeMatch[1], 10);
                    console.log('Expected image size:', imageSize);
                    currentState = 'AWAITING_IMAGE';
                    accumulatedData = accumulatedData.slice(sizeEndIndex + '\nENDSIZE\n'.length);
                    console.log('Size info processed, start downloading image...');
                } else {
                    console.error('Invalid image size received:', sizeInfo);
                    currentState = 'AWAITING_SIZE';
                    break;
                }
            } else {
                console.log('Awaiting more data for size info...');
                break;
            }
        }

        if (currentState === 'AWAITING_IMAGE') {
            if (accumulatedData.length >= imageSize) {
                console.log('Full image data received');
                const imageData = accumulatedData.slice(0, imageSize);
                
                fs.writeFileSync('../public/screenshots/screenshot.png', imageData);
                console.log('Image written to file.');

                currentState = 'AWAITING_SIZE';
                accumulatedData = accumulatedData.slice(imageSize);
                console.log('Image processed, awaiting next screenshot size');
                accumulatedData = Buffer.alloc(0);
                
            } else {
                break;
            }
        }
    }

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
