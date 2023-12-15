const net = require('net');
const express = require('express');

const app = express();
const port = 3000;

app.use(express.static('../public'));

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

const client = new net.Socket();
client.on('error', (err) => {
    console.error('Socket error:', err);
});

function click(x, y) {
    client.write(JSON.stringify({ type: 'click', x: x, y: y }));
}

function settings(film_type, look, border, file_format) {
    return { film_type, look, border, file_format };
}

function wait(seconds) {
    const milliseconds = seconds * 1000;
    const start = Date.now();
    let current = null;
    do {
        current = Date.now();
    } while (current - start < milliseconds);
}

client.connect(8080, '192.168.1.20', () => {
    console.log('Connected to VM');
    const init_settings = settings('bw', 'standard', 'borderless', 'jpg');
    if (init_settings.film_type !== 'color') {
        click(301, 173);
        wait(0.5);
        click(404, 289);
    }
    client.end(); // Close the connection when done
});

client.on('data', (data) => {
    console.log('Received: ' + data);
});

client.on('close', () => {
    console.log('Connection closed');
});