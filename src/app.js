const net = require('net');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Assuming screenshots are saved in the same directory as the Node.js app
const screenshotDir = __dirname;

app.use(express.static('../public'));

// Endpoint to serve screenshots
app.get('/screenshot/:name', (req, res) => {
    const screenshotPath = path.join(screenshotDir, req.params.name + '.png');
    if (fs.existsSync(screenshotPath)) {
        res.sendFile(screenshotPath);
    } else {
        res.status(404).send('Screenshot not found');
    }
});

app.listen(port, () => console.log(`Server listening at http://localhost:${port}`));

const client = new net.Socket();
client.on('error', (err) => console.error('Socket error:', err));

let clickQueue = [];
let isProcessingClicks = false;

let settings = {
    film_type : "colour",
    look : "soft",
    border : 0,
    file_format : "JPEG"
}

const baseSettings = settings;

function updateSettings(film_type, look, border, file_format) {

    settings = {
        film_type: film_type,
        look : look,
        border : border,
        file_format : file_format
    }
}

client.connect(8080, '192.168.1.20', () => {
    console.log('Connected to VM');

    updateSettings("bw", "soft", 1, "TIFF");

    if (settings.film_type === "colour") {
        addClick(301, 173);
        addClick(279, 279);
    } else {
        addClick(301, 173);
        addClick(404, 289);
    }

    if (settings.border === 1) {
        addClick(612, 109);
    } else {
        addClick(487, 114);
    }

    if (settings.file_format === "TIFF") {
        addClick(450, 405);
        addClick(214, 262);
        addClick(615, 191);
    } else {
        addClick(450, 405);
        addClick(217, 247);
        addClick(615, 191);
    }
    
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
    setTimeout(processClickQueue, 500); // Delay between clicks
}

client.on('data', (data) => console.log('Received: ' + data));
client.on('close', () => {
    isProcessingClicks = false;
    console.log('Connection closed');
});
