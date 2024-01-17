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
let isScanning = false;
let accumulatedData = Buffer.alloc(0);

let settings = {
    film_type: "colour",
    border: 0,
    file_format: "JPEG",
    look: "standard",
};

let serverSettings = null;

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
    'start_scan_btn': [726, 515],
    'cancel_scan_btn': [401, 362],
    'look_soft': [[85, 520], [400, 300], [416, 369], [550, 300]],
    'look_standard': [[85, 520], [400, 300], [416, 383], [550, 300]],
    'look_rich': [[85, 520], [400, 300], [416, 400], [550, 300]],
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
    // Concatenate new data to the accumulated buffer
    accumulatedData = Buffer.concat([accumulatedData, data]);

    // Process status messages
    while(true) {
        const statusStartIndex = accumulatedData.indexOf('{"status":');
        const statusEndIndex = accumulatedData.indexOf('<END_OF_JSON>');

        if (statusStartIndex !== -1 && statusEndIndex > statusStartIndex) {
            // Extract the status message
            const statusData = accumulatedData.slice(statusStartIndex, statusEndIndex).toString();
            try {
                const statusObject = JSON.parse(statusData);
                console.log('Status update from server:', statusObject.status);
            } catch (e) {
                console.error('Error parsing status JSON:', e);
            }
            accumulatedData = accumulatedData.slice(statusEndIndex + '<END_OF_JSON>'.length);
        } else {
            break; // No more complete status messages in buffer
        }
    }

    // Process JSON data
    while (true) {
        const jsonHeaderIndex = accumulatedData.indexOf('JSON\n');
        const jsonEndIndex = accumulatedData.indexOf('<END_OF_JSON>');

        if (jsonHeaderIndex !== -1 && jsonEndIndex > jsonHeaderIndex) {
            handleJsonData(jsonHeaderIndex, jsonEndIndex);
        } else {
            break; // No more complete JSON messages in buffer
        }
    }

    // Process image data
    while (true) {
        const imageHeaderIndex = accumulatedData.indexOf('IMAGE\n');
        const imageEndIndex = accumulatedData.indexOf('<END_OF_IMAGE>');

        if (imageHeaderIndex !== -1 && imageEndIndex > imageHeaderIndex) {
            handleImageData(imageHeaderIndex, imageEndIndex);
        } else {
            break; // No more complete image data in buffer
        }
    }
});


function handleJsonData(jsonHeaderIndex, jsonEndIndex) {
    try {

        const jsonData = accumulatedData.slice(jsonHeaderIndex + 'JSON\n'.length, jsonEndIndex).toString();
        let serverSettings = JSON.parse(jsonData);

        serverSettings = { 
            film_type: serverSettings.film_type, 
            border: serverSettings.border, 
            file_format: serverSettings.file_format,
            look: serverSettings.look
        };

        console.log('Received initial data from server:', serverSettings);
        //console.log('Comparing to client settings: ', settings)

        if (settings.film_type !== serverSettings.film_type || 
            settings.border !== serverSettings.border || 
            settings.file_format !== serverSettings.file_format || settings.look !== serverSettings.look) {
            console.log('\x1b[31m%s\x1b[0m', 'Client and server settings are not in sync');
            compareAndProcessSettings(serverSettings);
        } else {
            console.log('\x1b[32m%s\x1b[0m', 'Client and server settings are in sync');
            serverSettings = settings;
            input();
        }
        accumulatedData = accumulatedData.slice(jsonEndIndex + '<END_OF_JSON>'.length);
    } catch (e) {
        console.error('Error parsing JSON:', e);
    }
}

function handleImageData() {
    // Find the index where the actual image data starts (after 'ENDSIZE\n')
    const imageDataStartIndex = accumulatedData.indexOf('\nENDSIZE\n') + '\nENDSIZE\n'.length;
    const imageDataEndIndex = accumulatedData.indexOf('<END_OF_IMAGE>');

    if (imageDataStartIndex === -1 || imageDataEndIndex === -1 || imageDataStartIndex >= imageDataEndIndex) {
        console.log("Incomplete image data. Awaiting more data...");
        return;
    }

    try {
        console.log("Processing image data...");

        // Extract the actual image data (binary data) from the buffer
        const imageData = accumulatedData.slice(imageDataStartIndex, imageDataEndIndex);

        // Write the binary data to a file
        fs.writeFileSync('../public/screenshots/screenshot.png', imageData, { encoding: 'binary' });
        console.log('\x1b[32m%s\x1b[0m', 'Image written to file.');

        // Clear processed image data from buffer
        accumulatedData = accumulatedData.slice(imageDataEndIndex + '<END_OF_IMAGE>'.length);
    } catch (e) {
        console.error('Error processing image data:', e);
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

function compareAndProcessSettings(serverSettings) {
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

    if (serverSettings.look !== settings.look && settings.film_type !== 'bw') {
        console.log('\x1b[31m%s\x1b[0m', 'Look out of sync');
        switch(serverSettings.look) {
            case 'soft':
                processClicksForSetting('look_soft');
                break;
            case 'standard':
                processClicksForSetting('look_standard');
                break;
            case 'rich':
                processClicksForSetting('look_rich');
                break;
        }
    } else {
        console.log('\x1b[31m%s\x1b[0m', 'Custom looks not available for black and white film');
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
            console.log('\x1b[32m%s\x1b[0m', 'All clicks processed');
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

function scan(isScanning) {
    if (isScanning) {
        addClick(clickLocations.start_scan_btn[0], clickLocations.start_scan_btn[1]);
        const command = JSON.stringify({ type: 'scan' });
        console.log(`Starting scan...`);  // Debug log
        client.write(command + '<END_OF_JSON>');
    } else {
        addClick(clickLocations.cancel_scan_btn[0], clickLocations.cancel_scan_btn[1]);
        console.log(`Ending scan...`);  // Debug log
    }
}

function handleCommand(command) {
    switch (command) {
        case 'sync':
            requestserverSettings();
            input();
            break;
        case 'clientSettings':
            console.log(settings);
            input();
            break;
        case 'serverSettings':
            if (serverSettings) {
                console.log(serverSettings)
            } else {
                console.log('\x1b[31m%s\x1b[0m', 'No server settings available.');
            }
            input();
            break;
        case 'start':
        case 'scan':
            scan(1);
            break;
        case 'cancelscan':
            scan(0);
            input();
            break;
        case '?':
        case 'help':
            console.log('Commands: screenshot, click, settings, exit, sync, clientSettings, scan, help');
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
                        rl.question('Enter look (soft/standard/rich): ', (look) => {
                            settings = { film_type: film_type, look: look, border: parseInt(border), file_format: file_format };
                            input(); // Prompt for next command
                        });

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