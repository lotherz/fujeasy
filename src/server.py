import socket
import json
import pyautogui
import io
import cv2
import time
import numpy as np
from PIL import Image

is_scanning = False

reference_images = {
    "film_type": "//Mac/Home/Documents/fujeasy/public/screenshots/film_type_true.png",
    "border": "//Mac/Home/Documents/fujeasy/public/screenshots/border_true.png",
    "file_format": "//Mac/Home/Documents/fujeasy/public/screenshots/file_format_true.png",
    "look_soft": "//Mac/Home/Documents/fujeasy/public/screenshots/look_soft_3.png",
    "look_standard": "//Mac/Home/Documents/fujeasy/public/screenshots/look_standard_4.png",
    "look_rich": "//Mac/Home/Documents/fujeasy/public/screenshots/look_rich_5.png",
    "film_insert_dialogue": "//Mac/Home/Documents/fujeasy/public/screenshots/film_insert_dialogue.png"
}

monitored_regions = {
    "film_type":                (240, 146, 117, 68),
    "border":                   (386, 146, 168, 68),
    "file_format":              (386, 376, 116, 67), 
    "look_dropdown":            (365, 294, 7, 10),
    "film_insert_dialogue":     (172, 206, 458, 189),
    #                           (x-coordinate, y-coordinate, width, height)
}

def get_look():
    pyautogui.click(85, 520)  # Click on the "Custom" button
    
    time.sleep(1) # Introduce a delay to allow the UI to update

    screenshot = take_screenshot()
    
    looks = {
        "soft": reference_images["look_soft"],
        "standard": reference_images["look_standard"],
        "rich": reference_images["look_rich"]
    }
    
    threshold = 0.99
    
    for look, reference in looks.items():
        if compare_with_reference(screenshot, reference, monitored_regions["look_dropdown"], threshold):
            pyautogui.click(550, 300)  # Click to commit the change, if needed
            #print("Look: " + look)
            return look
        else:
            print(look + " not found, trying next")
    
    pyautogui.click(550, 300)  # Click to commit the change, if needed
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
    reference_image = cv2.imread(reference_image_path)
    if reference_image is None:
        #print("Error loading reference image: " + reference_image_path)
        return False

    reference_image = cv2.cvtColor(reference_image, cv2.COLOR_BGR2GRAY)
    screenshot_image = Image.open(io.BytesIO(screenshot_data))
    screenshot_image = np.array(screenshot_image)
    screenshot_image = cv2.cvtColor(screenshot_image, cv2.COLOR_RGB2GRAY)

    x, y, w, h = region
    region_of_interest = screenshot_image[y:y+h, x:x+w]

    similarity = cv2.matchTemplate(region_of_interest, reference_image, cv2.TM_CCORR_NORMED)
    _, max_val, _, _ = cv2.minMaxLoc(similarity)

    #print("Comparing with " + reference_image_path + ", similarity score: " + str(max_val))

    return max_val >= threshold

def take_screenshot():
    screenshot = pyautogui.screenshot()
    img_byte_arr = io.BytesIO()
    screenshot.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()

def take_screenshot_and_display():
    screenshot = pyautogui.screenshot()
    screenshot.show()  # Display the screenshot using the default image viewer

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

def scan():
    screenshot = take_screenshot()
    while compare_with_reference(screenshot, reference_images["film_insert_dialogue"], monitored_regions["film_insert_dialogue"], 0.99) :
        print("Film Insert Dialogue Found")
        time.sleep(2)
    else :
        print("Screen Changed")

    #while is_scanning:
       # print("Scanning")
        #time.sleep(1)
        #:
         #   print("Film Insert Dialogue Found")
          #  return
        #else :
         #   print("Film Inserted")
        #return
    

def process_command(command, client_socket):
    print("Received command: " + str(command))
    if command['type'] == 'click':
        pyautogui.click(command['x'], command['y'])
        print("Clicking at: " + str(command['x']) + ", " + str(command['y']))

    elif command['type'] == 'screenshot':
        send_screenshot(client_socket)

    elif command['type'] == 'get_settings':
        send_settings(client_socket)
        
    elif command['type'] == 'scan':
        is_scanning = True
        scan()
        
    elif command['type'] == 'cancelscan':
        is_scanning = False
        
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
