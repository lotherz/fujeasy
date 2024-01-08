import socket
import json
import pyautogui
import io
import cv2
import numpy as np
from PIL import Image

reference_images = {
    "film_type": "//Mac/Home/Documents/fujeasy/public/screenshots/film_type_true.png",
    "border": "//Mac/Home/Documents/fujeasy/public/screenshots/border_true.png",
    "file_format": "//Mac/Home/Documents/fujeasy/public/screenshots/file_format_true.png",
    "look_soft": "//Mac/Home/Documents/fujeasy/public/screenshots/look_soft_3.png",
    "look_standard": "//Mac/Home/Documents/fujeasy/public/screenshots/look_standard_4.png",
    "look_rich": "//Mac/Home/Documents/fujeasy/public/screenshots/look_rich_5.png",
}

monitored_regions = {
    "film_type":                (240, 146, 117, 68),    # Example coordinates for film_type
    "border":                   (386, 146, 168, 68),    # Example coordinates for border
    "file_format":              (386, 376, 116, 67),    # Example coordinates for file_format
    "look_window":              (176, 207, 449, 187),
    "look_dropdown":            (364, 290, 95, 18),
    #                           (x-coordinate, y-coordinate, width, height)
}

def get_look():
    pyautogui.click(85, 520)  # Click on the "Custom" button
    screenshot = take_screenshot()

    look_types = {
        "soft": reference_images["look_soft"],
        "standard": reference_images["look_standard"],
        "rich": reference_images["look_rich"]
    }
    
    threshold = 0.99
    
    for look, reference in look_types.items():
        if compare_with_reference(screenshot, reference, monitored_regions["look_dropdown"], threshold):
            pyautogui.click(550, 300)  # Click on the "All" button to commit the change
            print("Look: " + look)
            return look
        else:
            print(look + " not found, trying next")
    
    pyautogui.click(550, 300)  # Click on the "All" button to commit the change
    print("Look not found, defaulting to standard")
    return "standard"


def derive_settings():

    screenshot = take_screenshot()
    threshold = 0.99
    settings = {
        "film_type": "colour" if compare_with_reference(screenshot, reference_images["film_type"], monitored_regions["film_type"], threshold) else "bw",
        "border": 0 if compare_with_reference(screenshot, reference_images["border"], monitored_regions["border"], threshold) else 1,
        "file_format": "JPEG" if compare_with_reference(screenshot, reference_images["file_format"], monitored_regions["file_format"], threshold) else "TIFF",
        "look": get_look()
    }
    return settings

def compare_with_reference(screenshot_data, reference_image_path, region, threshold):
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
    print(max_val)

    return max_val >= threshold


def take_screenshot():
    screenshot = pyautogui.screenshot()
    img_byte_arr = io.BytesIO()
    screenshot.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()

def send_screenshot(client_socket):
    img_data = take_screenshot()
    size = len(img_data)
    print('Screenshot Taken / Size: ' + str(size) + ' bytes')

    header = "IMAGE\n".encode('utf-8')
    client_socket.sendall(header)  # Send image header

    # Prepare and send image size information with a unique delimiter
    size_info = "SIZE:{}\nENDSIZE\n".format(size)
    
    client_socket.sendall(size_info.encode('utf-8'))

    # Send the actual image data
    client_socket.sendall(img_data + b'<END_OF_IMAGE>')

    print("Screenshot Sent")

def send_settings(client_socket):
    settings = derive_settings()
    print(settings)
    settings_json = json.dumps(settings)

    header = "JSON\n".encode('utf-8')
    client_socket.sendall(header)  # Send JSON header

    client_socket.sendall(settings_json.encode('utf-8') + b'<END_OF_JSON>')

def process_command(command, client_socket):
    print("Received command: " + str(command))
    if command['type'] == 'click':
        pyautogui.click(command['x'], command['y'])
        print("Clicking at: " + str(command['x']) + ", " + str(command['y']))

    elif command['type'] == 'screenshot':
        send_screenshot(client_socket)

    elif command['type'] == 'get_settings':
        send_settings(client_socket)

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
            # Check if the delimiter is in the buffer
            if "<END_OF_JSON>" in buffer:
                # Split the buffer at the delimiter
                complete_json, buffer = buffer.split("<END_OF_JSON>", 1)
                try:
                    command = json.loads(complete_json)
                    process_command(command, client_socket)
                except ValueError as e:
                    print("Error processing JSON data: ", e)
                    # You might want to handle this error differently

        client_socket.close()
        print("Connection closed.")


start_server()
