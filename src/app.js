const net = require('net');
const express = require('express');

//Set up express server
const app = express();
const port = 3000;

//Set up express to serve static files
app.use(express.static('public'));

//Start server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

const client = new net.Socket();
client.connect(8080, '192.168.1.14', () => {
    console.log('Connected to VM');
    //Click "Start" button at start
    client.write(JSON.stringify({ type: 'click', x: 739, y: 514 }));
});

client.on('data', (data) => {
    console.log('Received: ' + data);
    client.destroy(); // Destroy after operation
});

client.on('close', () => {
    console.log('Connection closed');
});