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

let settings = {
    film_type: "colour",
    look: "standard",
    border: 0,
    file_format: "JPEG"
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
    // Attempt to parse the data as JSON
    try {
        let jsonData = JSON.parse(data.toString());
        //console.log('JSON Data received:', jsonData);

        // Process the JSON data as settings
        serverSettings = { 
            film_type: jsonData.film_type, 
            look: settings.look, 
            border: jsonData.border, 
            file_format: jsonData.file_format 
        };
        
        if (firstLoad > 0) {
            console.log(serverSettings);
        }

        firstLoad++

        /*if (JSON.stringify(serverSettings) !== JSON.stringify(settings)) {
            compareAndProcessSettings();
        }*/
        //if(serverSettings){input()} // Prompt for the next command
    } catch (e) {
        // If parsing fails, it's likely image data
        handleImageData(data);
    }
});


function requestserverSettings() {
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
        console.log('Current settings not available.');
        return;
    }

    // Compare film_type setting
    if (serverSettings.film_type !== settings.film_type) {
        console.log('Film type out of sync');
        const filmTypeSetting = settings.film_type === 'colour' ? 'colour' : 'bw';
        processClicksForSetting(filmTypeSetting);
    }

    // Compare border setting
    if (serverSettings.border !== settings.border) {
        console.log('Border out of sync');
        const borderSetting = settings.border === 1 ? 'border' : 'no_border';
        processClicksForSetting(borderSetting);
    }

    // Compare file_format setting
    if (serverSettings.file_format !== settings.file_format) {
        console.log('File format out of sync');
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
    setTimeout(processClickQueue, 1000); // Delay of 0.5 seconds between clicks
}



function sendClick(x, y) {
    const command = JSON.stringify({ type: 'click', x: x, y: y });
    console.log(`Sending command: ${command}`);  // Debug log
    client.write(command + '<END_OF_JSON>');
}

function handleCommand(command) {
    switch (command) {
        case 'clickqueue':
            console.log(clickQueue)
            input();
            break;
        case 'sync':
            //This case will ensure that the client and server are in sync with each other
            let splicedSettings = Object.keys(settings).splice(1, 1);
            if (settings.film_type !== serverSettings.film_type || settings.border !== serverSettings.border || settings.file_format !== serverSettings.file_format) {
                console.log('Client and server are not in sync');
                compareAndProcessSettings();
            } else {
                console.log('Client and server are in sync');
                input();
            }
            break;
        case 'clientSettings':
            console.log(settings);
            input();
            break;
        case 'serverSettings':
            requestserverSettings();
            input();
            break;
        case '?':
        case 'help':
            console.log('Commands: screenshot, click, settings, exit');
            
            break;
        case 'screenshot':
            requestScreenshot();
            input();
            break;
        case 'click':
            rl.question('Enter x: ', (x) => {
                rl.question('Enter y: ', (y) => {
                    addClick(parseInt(x, 10), parseInt(y, 10));
                    compareAndProcessSettings();
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
        case 'run':
            requestserverSettings();
            input();
            break;
        default:
            console.log('Invalid command');
            input();
            break;
    }
}

rl.on('close', () => {
    console.log('User Exit');
    process.exit(0);
});
