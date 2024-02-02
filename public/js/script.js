//State tracking array

let state = [
    "settings",
    "insertfilm",
    "loading",
    "scanning",
    "scanningcomplete"
];


document.addEventListener('DOMContentLoaded', function () {
    // Establish a WebSocket connection
    let socket = new WebSocket('ws://localhost:3000'); // Adjust the URL as needed

    socket.onopen = function(event) {
        console.log("Connected to WebSocket server");
    };

    socket.onerror = function(error) {
        console.error("WebSocket error:", error);
    };

    socket.onmessage = function(event) {
        const responseData = JSON.parse(event.data);
        console.log("Message from server:", responseData.message);

        // Handle server messages here
        // Example: Update UI based on the message received
        if (responseData.message === 'Client and server settings are in sync' || responseData.message === 'Client settings received') {
            toggleDivVisibility('insertfilm', 'loading'); // Show success div, hide loading div
        } else if (responseData.message === 'error') {
            toggleDivVisibility('errorDiv', 'loading'); // Show error div, hide loading div
        }
    };

    function toggleDivVisibility(showDivId, hideDivId) {
        document.getElementById(hideDivId).style.display = 'none'; // Hide the specified div
        document.getElementById(showDivId).style.display = 'block'; // Show the specified div
    }

    function sendSettings() {
        function getSelectedValue(name) {
            let radios = document.getElementsByName(name);  
            for (let i = 0; i < radios.length; i++) {
                if (radios[i].checked) {
                    return radios[i].value;
                }
            }
            return null; // Or a default value if needed
        }

        let filmType = getSelectedValue('film_type');
        let border = getSelectedValue('border') === 'borderless' ? 0 : 1;
        let fileFormat = getSelectedValue('file_format');
        let look = getSelectedValue('look');

        let data = {
            clientSettings: {
                film_type: filmType,
                border: border,
                file_format: fileFormat,
                look: look
            },
            command: document.getElementById('continue').name
        };

        // Send data via WebSocket
        socket.send(JSON.stringify(data));
    }

    // Attach the event listener to the form
    let settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.onsubmit = function (event) {
            event.preventDefault();
            toggleDivVisibility('loading', 'settings');
            sendSettings();
        };
    } else {
        console.error('Form not found.');
    }

    function backToSettings() {
        toggleDivVisibility('settings', 'insertfilm');
    }

    let backButton = document.querySelector('button[name="backToSettings"]');
    if (backButton) {
        backButton.addEventListener('click', backToSettings);
    } else {
        console.error('Button not found.');
    }
});
