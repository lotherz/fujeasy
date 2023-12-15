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

//Set up socket connection


const client = new net.Socket();
client.connect(8080, '192.168.1.14', () => {
    console.log('Connected to VM');
    //Click "Start" button at start
    client.write(JSON.stringify({ type: 'click', x: 739, y: 514 }));

    //Check if film has been inserted
    setInterval(() => {
        client.write(JSON.stringify({ type: 'checkInser ', image: 'insertFilmDialogue.png' }));
    }, 5000);

    //User can select cancel to return to main screen
    client.write(JSON.stringify({ type: 'click', x: 407, y: 369 }));

    //Check if couldn't read barcode screen is shown & click OK

    //Click "All" button to start scanning

    //Wait for processing to complete

    //If less than a full roll query user

    //Confirm order finish

    //Enter export screen

    //Wait for processing

    //Click run

    //Read & display order number

    //Click ok

    //Click ok when writing is complete

    //Return to main screen
});

client.on('data', (data) => {
    console.log('Received: ' + data);
    client.destroy(); // Destroy after operation
});

client.on('close', () => {
    console.log('Connection closed');
});