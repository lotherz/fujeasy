const net = require('net');
const express = require('express');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());

const port = 3000;
let clickQueue = [];
let isProcessingClicks = false;
let accumulatedData = Buffer.alloc(0);

let settings = {
    film_type: "colour",
    border: 0,
    file_format: "JPEG",
    look: "standard"
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

wss.on('connection', (ws) => {
    console.log('Client connected via WebSocket');

    // Function to send messages via WebSocket
    //function sendWebSocketMessage(message) {
    //    ws.send(JSON.stringify({ message: message }));
    //}

    // Example usage
    //sendWebSocketMessage('Hello from the server!');

    ws.on('message', (message) => {
        // Convert the binary data (Buffer) to a string and parse as JSON
        try {
            const messageString = message.toString();
            const data = JSON.parse(messageString);
            settings = data.clientSettings;
            handleCommand(data.command);
            input();
        } catch (error) {
            console.error('Error parsing message from client:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

app.use(express.static('../client/public'));

// Endpoint to receive settings and commands
app.post('/update', (req, res) => {
    const { clientSettings, command } = req.body;
    
    // Acknowledge the HTTP request immediately
    res.status(200).send({ message: 'Request received' });

    if (clientSettings) {
        console.log('Received settings from client:', clientSettings);
        settings = clientSettings;
        compareAndProcessSettings(clientSettings);
    }

    if (command) {
        console.log('Received command:', command);
        handleCommand(command);
        input();
    }
});

// Function to send messages via WebSocket
function sendClientMessage(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ message: message }));
        }
    });
}

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
                console.log('Server status: ', statusObject.status);
                sendClientMessage('Server status: ' + statusObject.status);
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
            sendClientMessage('Client and server settings are in sync');
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
        fs.writeFileSync('screenshots/screenshot.png', imageData, { encoding: 'binary' });
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

client.connect(8080, '192.168.0.20', () => {
    console.log('Connected to VM');
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
    sendClientMessage('Processing clicks, please wait...');
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

    if (serverSettings.look !== settings.look) {

        if (settings.film_type == 'bw') {
            console.log('\x1b[31m%s\x1b[0m', 'Custom looks not available for black and white film');
            input();
            return;
        }

        console.log('\x1b[31m%s\x1b[0m', 'Look out of sync');
        switch(settings.look) {
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

            //Send response to client
            sendClientMessage('All clicks processed');

            input(); // Ready to accept the next command
        }
        return;
    }

    // Processing clicks
    isProcessingClicks = true;
    const click = clickQueue.shift(); // Remove the first click from the queue
    sendClick(click.x, click.y); // Send the click

    // Set a timeout to process the next click after a delay
    setTimeout(processClickQueue, 3000);
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
        const command = JSON.stringify({ type: 'cancel_scan' });
        console.log(`Ending scan...`);  // Debug log
        client.write(command + '<END_OF_JSON>');
    }
}

const targetBaseDir = `/Users/sp500/Desktop/Export`;

async function exportImages() {
    const machineNo = '2'; // CHANGE THIS FOR EACH MACHINE !!!
    const imgExchangeDir = `/Volumes/[D] FUJI SP500 - LAB #${machineNo}/Fujifilm/Shared/ImgExchange`;

    try {
        // Read the contents of the ImgExchange directory
        const directories = await fs.readdir(imgExchangeDir, { withFileTypes: true });
        const jobDirectories = directories
            .filter(dirent => dirent.isDirectory() && dirent.name.endsWith('-1-4'))
            .map(dirent => dirent.name);

        // Find the newest directory by modification time
        let newestDir = '';
        let newestTime = 0;
        for (let dir of jobDirectories) {
            const dirPath = path.join(imgExchangeDir, dir);
            const stats = await fs.stat(dirPath);
            if (stats.mtimeMs > newestTime) {
                newestTime = stats.mtimeMs;
                newestDir = dir;
            }
        }

        if (!newestDir) {
            throw new Error("No suitable directory found.");
        }

        const jobNumber = newestDir.split('-')[0]; // Assuming the job number is the part before '-1-4'
        const mainDir = path.join(imgExchangeDir, newestDir);
        const targetDir = path.join(targetBaseDir, jobNumber);

        // Ensure the target directory exists
        await fs.access(targetDir).catch(async () => await fs.mkdir(targetDir, { recursive: true }));

        // Get the list of files in the newest directory
        const files = await fs.readdir(mainDir);

        // Filter image files (JPEG, TIFF, BMP)
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ext === '.jpg' || ext === '.jpeg' || ext === '.tiff' || ext === '.bmp';
        });

        // Copy each image file
        for (let file of imageFiles) {
            const sourcePath = path.join(mainDir, file);
            const targetPath = path.join(targetDir, file);
            await fs.copyFile(sourcePath, targetPath);
            console.log(`Copied '${file}' from '${newestDir}' to '${targetDir}'`);
        }

    } catch (err) {
        console.error(`Error: ${err.message}`);
    }
}

async function exportImages() {
    const machineNo = '2'; // CHANGE THIS FOR EACH MACHINE !!!
    const imgExchangeDir = `/Volumes/[D] FUJI SP500 - LAB #${machineNo}/Fujifilm/Shared/ImgExchange`;
    const targetBaseDir = `/Users/sp500/Desktop/Export`;

    try {
        // Read the contents of the ImgExchange directory
        const directories = await fs.readdir(imgExchangeDir, { withFileTypes: true });
        const jobDirectories = directories
            .filter(dirent => dirent.isDirectory() && dirent.name.endsWith('-1-4'))
            .map(dirent => dirent.name);

        // Find the newest directory by modification time
        let newestDir = '';
        let newestTime = 0;
        for (let dir of jobDirectories) {
            const dirPath = path.join(imgExchangeDir, dir);
            const stats = await fs.stat(dirPath);
            if (stats.mtimeMs > newestTime) {
                newestTime = stats.mtimeMs;
                newestDir = dir;
            }
        }

        if (!newestDir) {
            throw new Error("No suitable directory found.");
        }

        const jobNumber = newestDir.split('-')[0]; // Assuming the job number is the part before '-1-4'
        const mainDir = path.join(imgExchangeDir, newestDir);
        const targetDir = path.join(targetBaseDir, jobNumber);

        // Ensure the target directory exists
        await fs.access(targetDir).catch(async () => await fs.mkdir(targetDir, { recursive: true }));

        // Navigate into the subdirectory within the newest directory
        const subdirs = await fs.readdir(mainDir, { withFileTypes: true });
        const firstSubdir = subdirs.find(dirent => dirent.isDirectory());
        if (!firstSubdir) {
            throw new Error("No subdirectory found in the selected job directory.");
        }

        const subDirPath = path.join(mainDir, firstSubdir.name);

        // Get the list of files in the subdirectory
        const files = await fs.readdir(subDirPath);

        // Filter image files (JPEG, TIFF, BMP)
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ext === '.jpg' || ext === '.jpeg' || ext === '.tiff' || ext === '.bmp';
        });

        // Copy each image file
        for (let file of imageFiles) {
            const sourcePath = path.join(subDirPath, file);
            const targetPath = path.join(targetDir, file);
            await fs.copyFile(sourcePath, targetPath);
            console.log(`Copied '${file}' from '${subDirPath}' to '${targetDir}'`);
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
    }
}

// Function to open Finder at a specific path
function openFinder(path) {
    exec(`open -a Finder "${path}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);
    });
}

function handleCommand(command) {
    switch (command) {
        case 'updateSettings':
        case 'sync':
            requestserverSettings();
            input();
            break;
        case 'clientSettings':
            console.log(settings);
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
        case 'export':
            exportImages().then(() => {
                console.log('All files copied successfully!');
                openFinder(targetBaseDir);
            }).catch(err => {
                console.error('Failed to copy files:', err);
            });
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