const net = require('net');

const client = new net.Socket();
client.connect(8080, 'WINDOWS_XP_VM_IP', () => {
  console.log('Connected to VM');

  // Example: Move mouse
  client.write(JSON.stringify({ type: 'move', x: 100, y: 100 }));

  // Example: Mouse click
  client.write(JSON.stringify({ type: 'click' }));

  // Add more commands as needed
});

client.on('data', (data) => {
  console.log('Received: ' + data);
  client.destroy(); // Destroy after operation
});

client.on('close', () => {
  console.log('Connection closed');
});