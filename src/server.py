import socket
import json
import pyautogui
import io
import cv2
import numpy as np
from PIL import Image

def derive_settings():
    # Define regions for each setting
    regions = {
        "film_type": (100, 100, 50, 50),  # Example coordinates for film_type
        "border": (150, 100, 50, 50),     # Example coordinates for border
        "file_format": (200, 100, 50, 50) # Example coordinates for file_format
    }

    screenshot = take_screenshot()
    settings = {
        "film_type": compare_with_reference(screenshot, reference_images["film_type"], regions["film_type"]),
        "border": compare_with_reference(screenshot, reference_images["border"], regions["border"]),
        "file_format": compare_with_reference(screenshot, reference_images["file_format"], regions["file_format"])
    }
    return settings

def compare_with_reference(screenshot_data, reference_image_path, region):
    # Load reference image
    reference_image = cv2.imread(reference_image_path)
    reference_image = cv2.cvtColor(reference_image, cv2.COLOR_BGR2GRAY)

    # Convert screenshot data to image
    screenshot_image = Image.open(io.BytesIO(screenshot_data))
    screenshot_image = np.array(screenshot_image)
    screenshot_image = cv2.cvtColor(screenshot_image, cv2.COLOR_RGB2GRAY)

    # Extract the region of interest
    x, y, w, h = region
    region_of_interest = screenshot_image[y:y+h, x:x+w]

    # Rest of the comparison logic remains the same...


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
    if command['type'] == 'click':
        pyautogui.click(command['x'], command['y'])
        print("Clicking at: " + str(command['x']) + ", " + str(command['y']))
    elif command['type'] == 'screenshot':
        send_screenshot(client_socket)

def start_server():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(('0.0.0.0', 8080))
    server_socket.listen(5)

    while True:
        client_socket, addr = server_socket.accept()
        print("Connection has been established.")

        while True:
            data = client_socket.recv(1024)
            if not data:
                break
            try:
                command = json.loads(data.decode('utf-8'))
                process_command(command, client_socket)
            except ValueError:  # Use ValueError for Python 3.4
                print("Received non-JSON data or incomplete JSON data.")

        client_socket.close()
        print("Connection closed.")

start_server()
