const net = require('net');
const express = require('express');

//Set up express server
const app = express();
const port = 3000;

//Set up express to serve static files
app.use(express.static('../public'));

//Start server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

const client = new net.Socket();

function click(x, y) {
    client.write(JSON.stringify({ type: 'click', x: x, y: y }));
}

function settings(film_type, look, border, file_format) {
    init_settings = [
        film_type = film_type,
        look = look,
        border = border,
        file_format = file_format
    ]

    return init_settings;
}

client.connect(8080, '192.168.1.20', () => {
    console.log('Connected to VM');
    const init_settings = settings('bw', 'standard', 'borderless', 'jpg');
    if (init_settings.film_type !== 'color') {
        click(301, 173);
        click(404, 289);
    }
});

client.on('data', (data) => {
    console.log('Received: ' + data);
    client.destroy(); // Destroy after operation
});

client.on('close', () => {
    console.log('Connection closed');
});