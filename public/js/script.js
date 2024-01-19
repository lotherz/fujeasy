document.addEventListener('DOMContentLoaded', function () {
    function sendSettings() {
        // Function to get the selected value from a group of radio buttons
        function getSelectedValue(name) {
            var radios = document.getElementsByName(name);
            for (var i = 0; i < radios.length; i++) {
                if (radios[i].checked) {
                    return radios[i].value;
                }
            }
            return null; // or a default value if needed
        }

        var filmType = getSelectedValue('film_type');
        var border = getSelectedValue('border') === 'borderless' ? 0 : 1;
        var fileFormat = getSelectedValue('file_format');
        var look = getSelectedValue('look');

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/update-settings", true);
        xhr.setRequestHeader("Content-Type", "application/json");

        var data = {
            clientSettings: {
                film_type: filmType,
                border: border,
                file_format: fileFormat,
                look: look
            },

            command: document.getElementById('continue').name
        };

        xhr.send(JSON.stringify(data));
    }

    // Attach the event listener to the form
    var form = document.querySelector('form');
    if (form) {
        form.onsubmit = function (event) {
            event.preventDefault();
            sendSettings();
        };
    } else {
        console.error('Form not found.');
    }
});
