let state = [
    "settings",
    "loading",
    "insertfilm",
    "scanning",
    "scanningcomplete"
];
let stateIndex = 0;

function updateLookRadiosBasedOnFilmType() {
    // Get all radio buttons with the name 'film_type'
    let filmTypeRadios = document.querySelectorAll('input[name="film_type"]');
    
    // Add a change event listener to each 'film_type' radio button
    filmTypeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            // Check if the selected value is 'bw'
            let isBW = this.value === 'bw';
            
            // Get all radio buttons with the name 'look'
            let lookRadios = document.querySelectorAll('input[name="look"]');
            
            // Disable or enable 'look' radios based on the 'film_type' value
            lookRadios.forEach(lookRadio => {
                lookRadio.disabled = isBW; // Disable if 'bw', enable otherwise
                
                // Optional: visually indicate that the option is disabled
                if(isBW) {
                    lookRadio.parentElement.classList.add('disabled'); // Assuming each radio is wrapped in a container like <label>
                } else {
                    lookRadio.parentElement.classList.remove('disabled');
                }
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', function () {

    updateLookRadiosBasedOnFilmType();
    
    let socket = new WebSocket('ws://localhost:3000');

    socket.onopen = function(event) {
        console.log("Connected to WebSocket server");
    };

    socket.onerror = function(error) {
        console.error("WebSocket error:", error);
    };

    socket.onmessage = function(event) {
        const responseData = JSON.parse(event.data);
        console.log("Message from server:", responseData.message);

        handleServerMessage(responseData.message);
    };

    function advanceState(amount) {
        const advanceAmount = amount || 1; // Default to 1 if amount is not provided
        if (stateIndex < state.length - advanceAmount) {
            toggleDivVisibility(state[stateIndex + advanceAmount], state[stateIndex]);
            stateIndex += advanceAmount; // Correctly update stateIndex
            //console.log('State index:', stateIndex);
        }
    }

    function handleServerMessage(message) {
        switch (message) {
            case 'Processing clicks, please wait...':
            case 'All clicks processed':
                advanceState();
                break;
            case 'Client and server settings are in sync':
                advanceState(2); // Skip a state as intended
                break; // Add this break statement to prevent fall-through
            case 'Server status: Awaiting Dark Correction':
            case 'Server status: Barcode Dialogue Detected, Starting Scan':
            case 'Server status: Accepted Film Position':
                if (stateIndex < 4) {
                    toggleDivVisibility('scanning', state[stateIndex]);
                    stateIndex = 4; // Set stateIndex to scanning
                }
                break;
            case 'error':
                showErrorState();
                break;
            default:
                // Optionally handle other messages
                break;
        }
    }
    function showErrorState() {
        toggleDivVisibility('errorDiv', state[stateIndex]);
        // Optionally reset or handle the error state differently
    }

    function toggleDivVisibility(showDivId, hideDivId) {
        // Hide the div that is currently shown
        if (hideDivId && document.getElementById(hideDivId)) {
            document.getElementById(hideDivId).style.display = 'none';
        }
    
        // In a scenario where states are skipped, hide all other divs that should not be visible.
        // This step ensures that any divs related to skipped states are also hidden.
        state.forEach((divId) => {
            if (divId !== showDivId && document.getElementById(divId)) {
                document.getElementById(divId).style.display = 'none';
            }
        });
    
        // Show the target div
        let showDiv = document.getElementById(showDivId);
        if (showDiv) showDiv.style.display = 'block';
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
            },
            command: document.getElementById('continue').name
        };
        
        if (filmType !== 'bw') {
            data.clientSettings.look = look;
        }

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
        if (stateIndex > 1) {
            toggleDivVisibility(state[0], state[stateIndex]);
            stateIndex = 0;
        }
    }

    let backButton = document.querySelector('button[name="backToSettings"]');
    if (backButton) {
        backButton.addEventListener('click', backToSettings);
    } else {
        console.error('Button not found.');
    }
});
