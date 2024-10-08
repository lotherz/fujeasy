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

    let state = [
        "settings",
        "loading",
        "insertfilm",
        "filmposition",
        "scanning",
        "scanningincomplete",
        "scanningcomplete"
    ];
    let stateIndex = 0;

    updateLookRadiosBasedOnFilmType();
    
    let socket = new WebSocket('ws://localhost:3000');
    socket.binaryType = 'blob'; // Set binary type to receive Blob data

    socket.onopen = function(event) {
        console.log("Connected to WebSocket server");
    };

    socket.onerror = function(error) {
        console.error("WebSocket error:", error);
    };

    socket.onmessage = function(event) {
        if (event.data instanceof Blob) {
            // Handle Blob data, assume it's an image
            const url = URL.createObjectURL(event.data);
            document.getElementById('live-image').src = url;
        } else {
            // Handle JSON data
            const responseData = JSON.parse(event.data);
            console.log("Message from server:", responseData.message);
            handleServerMessage(responseData.message);
        }
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

        if (!message.startsWith('Job Number: ')) {
            switch (message) {
                case 'Processing clicks, please wait...':
                case 'All clicks processed':
                    advanceState();
                    break;
                case 'Client and server settings are in sync':
                    advanceState(2);
                    break;
                case 'Server status: Film Position Required':
                    toggleDivVisibility('filmposition', state[stateIndex]);
                    socket.send(JSON.stringify({ command: 'screenshot'}));
                    stateIndex = 3; // Set stateIndex to filmposition
                    break;
                case 'Server status: Awaiting Dark Correction':
                case 'Server status: Barcode Dialogue Detected, Starting Scan':
                case 'Server status: Reading Image...':
                    if (stateIndex <= 4) {
                        toggleDivVisibility('scanning', state[stateIndex]);
                        stateIndex = 4; // Set stateIndex to scanning
                    }
                    break;
                case 'Server status: Incomplete Order, Insert More Film to Continue':
                    advanceState();
                    break;
                case 'Server status: Scan Finished':
                    advanceState(2);
                    break;
                case 'error':
                    break;
                default:
                    // Optionally handle other messages
                    break;
            }
        } else {
            // Handle job number message
            let jobNumber = message.split('Job Number: ')[1];
            console.log('Job Number: ', jobNumber);
        }
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

    let exportButton = document.querySelector('button[name="export"]');
    if (exportButton) {
        exportButton.addEventListener('click', function() {
            socket.send(JSON.stringify({ command: 'export'}));
        });
    }

    function backToSettings() {
        if (stateIndex > 1) {
            toggleDivVisibility(state[0], state[stateIndex]);
            stateIndex = 0;
        }
    }

    let backButtons = document.querySelectorAll('button[name="backToSettings"]');
    if (backButtons.length > 0) {
        backButtons.forEach(button => {
            button.addEventListener('click', backToSettings);
        });
    }

    function acceptFinishedRoll() {
        socket.send(JSON.stringify({ command: 'finishedRoll'}));
        advanceState(1);
    }

    let finishedRoll = document.querySelector('button[name="finishedRoll"]');
    if (finishedRoll) {
        finishedRoll.addEventListener('click', acceptFinishedRoll);
    }

    // Select the button container
    const filmPosButtonContainer = document.getElementById('button-container');

    // Event handler function for buttons
    function handleFilmPosButtonClick(event) {
        const buttonName = event.target.name;
        
        switch(buttonName) {
            case 'jleft':
                console.log('Jumping Left');
                socket.send(JSON.stringify({ command: 'filmPosJumpLeft'}));
                break;
            case 'left':
                console.log('Moving Left');
                socket.send(JSON.stringify({ command: 'filmPosLeft'}));
                break;
            case 'right':
                console.log('Moving Right');
                socket.send(JSON.stringify({ command: 'filmPosRight'}));
                break;
            case 'jright':
                console.log('Jumping Right');
                socket.send(JSON.stringify({ command: 'filmPosJumpRight'}));
                break;
            case 'filmPosSelected':
                socket.send(JSON.stringify({ command: 'filmPosSelected'}));
                advanceState(1); 
                break;
            default:
                console.log('ERROR: FILM POSITION BUTTON NOT FOUND');
        }
    }

    // Add event listeners to each button
    filmPosButtonContainer.addEventListener('click', function(event) {
        if (event.target.tagName === 'BUTTON') {
            handleFilmPosButtonClick(event);
        }
    });
});

