import socket
import json
import pyautogui
import io
import cv2
import numpy as np
from PIL import Image

# Assuming you have reference images stored as 'film_type_true.png', 'border_true.png', 'file_format_true.png'
reference_images = {
    "film_type": "//Mac/Home/Documents/fujeasy/public/screenshots/film_type_true.png",
    "border": "//Mac/Home/Documents/fujeasy/public/screenshots/border_true.png",
    "file_format": "//Mac/Home/Documents/fujeasy/public/screenshots/file_format_true.png"
}

def derive_settings():
    # Define regions for each setting
    regions = {
        "film_type":    (240, 146, 117, 68),    # Example coordinates for film_type
        "border":       (386, 146, 168, 68),     # Example coordinates for border
        "file_format":  (387, 376, 115, 68)     # Example coordinates for file_format
        #               (x-coordinate, y-coordinate, width, height)
    }

    screenshot = take_screenshot()
    settings = {
        "film_type": "colour" if compare_with_reference(screenshot, reference_images["film_type"], regions["film_type"]) else "bw",
        "border": 0 if compare_with_reference(screenshot, reference_images["border"], regions["border"]) else 1,
        "file_format": "JPEG" if compare_with_reference(screenshot, reference_images["file_format"], regions["file_format"]) else "TIFF"
    }
    return settings

def compare_with_reference(screenshot_data, reference_image_path, region):
    # Load reference image
    reference_image = cv2.imread(reference_image_path)
    
    # Check if the reference image is loaded correctly
    if reference_image is None:
        print("Error loading reference image: " + reference_image_path)
        return False

    # Convert the reference image to grayscale
    reference_image = cv2.cvtColor(reference_image, cv2.COLOR_BGR2GRAY)

    # Convert screenshot data to image
    screenshot_image = Image.open(io.BytesIO(screenshot_data))
    screenshot_image = np.array(screenshot_image)
    screenshot_image = cv2.cvtColor(screenshot_image, cv2.COLOR_RGB2GRAY)

    # Extract the region of interest
    x, y, w, h = region
    region_of_interest = screenshot_image[y:y+h, x:x+w]

    # Compare the region of interest with the reference image
    # Note: You may need to adjust the method of comparison based on your specific needs
    similarity = cv2.matchTemplate(region_of_interest, reference_image, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, _ = cv2.minMaxLoc(similarity)

    # Assuming a threshold for similarity to consider the setting as True
    threshold = 1
    print("Similarity of" + reference_image_path + ": " + str(max_val))
    print(max_val >= threshold)
    return max_val >= threshold


def take_screenshot():
    screenshot = pyautogui.screenshot()
    img_byte_arr = io.BytesIO()
    screenshot.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()

def send_screenshot(client_socket):
    img_data = take_screenshot()
    size = len(img_data)
    client_socket.sendall(str(size).encode('utf-8') + b'\n')
    client_socket.sendall(img_data)

def process_command(command, client_socket):
    print("Received command: " + str(command))
    if command['type'] == 'click':
        pyautogui.click(command['x'], command['y'])
        print("Clicking at: " + str(command['x']) + ", " + str(command['y']))
    elif command['type'] == 'screenshot':
        send_screenshot(client_socket)
    elif command['type'] == 'get_settings':
        settings = derive_settings()
        print(settings)
        settings_json = json.dumps(settings)
        client_socket.sendall(settings_json.encode('utf-8'))

def start_server():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(('0.0.0.0', 8080))
    server_socket.listen(5)

    while True:
        client_socket, addr = server_socket.accept()
        print("Connection has been established.")

        buffer = ""
        while True:
            data = client_socket.recv(1024).decode('utf-8')
            if not data:
                break

            buffer += data
            try:
                command = json.loads(buffer)
                process_command(command, client_socket)
                buffer = ""  # Clear the buffer after successful processing
            except ValueError as e:
                # If JSON is incomplete, continue receiving data
                print("Received incomplete JSON data.")
                continue

        client_socket.close()
        print("Connection closed.")

start_server()
