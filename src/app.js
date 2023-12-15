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

client.connect(8080, '192.168.1.20', () => {
    console.log('Connected to VM');
    const init_settings = settings('bw', 'standard', 'borderless', 'jpg');
    if (init_settings.film_type !== 'color') {
        click(301, 173);
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