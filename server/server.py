import socket
import json
import pyautogui
import io
import cv2
import time
import numpy as np
from PIL import Image
import asyncio

file_path = "//Mac/Home/Documents/fujeasy/server/screenshots"

reference_images = {
    "film_type": file_path + "/film_type_true.png",
    "border": file_path + "/border_true.png",
    "file_format": file_path + "/file_format_true.png",
    "look_soft": file_path + "/look_soft_3.png",
    "look_standard": file_path + "/look_standard_4.png",
    "look_rich": file_path + "/look_rich_5.png",
    "film_insert_dialogue": file_path + "/film_insert_dialogue.png",
    "film_position_dialogue": file_path + "/film_position.png",
    "barcode_dialogue": file_path + "/barcode_dialogue.png",
    "dark_correction": file_path + "/dark_correction.png",
    "order_finish": file_path + "/order_finish.png",
    "film_reversed": file_path + "/film_reversed.png"
}

monitored_regions = {
    "film_type":                (240, 146, 117, 68),
    "border":                   (386, 146, 168, 68),
    "file_format":              (386, 376, 116, 67), 
    "look_dropdown":            (365, 294, 7, 10),
    "film_insert_dialogue":     (171, 206, 458, 189),
    "film_position_dialogue":   (145, 445, 510, 88),
    "barcode_dialogue":         (189, 202, 214, 95),
    "dark_correction":          (189, 202, 214, 95),
    "order_finish":             (451, 501, 114, 31),
    "film_reversed":            (189, 202, 341, 90)
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

@asyncio.coroutine
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

@asyncio.coroutine
def send_settings(client_socket):
    settings = derive_settings()
    print(settings)
    settings_json = json.dumps(settings)

    header = "JSON\n".encode('utf-8')
    client_socket.sendall(header)  # Send JSON header

    client_socket.sendall(settings_json.encode('utf-8') + b'<END_OF_JSON>')
    
def communicate_state(state, client_socket):
    status_message = json.dumps({"status": state})
    client_socket.sendall(status_message.encode('utf-8') + b'<END_OF_JSON>')
    print(state)

@asyncio.coroutine
def scan(client_socket):
    global scan_task
    try:
        while True:
            screenshot = take_screenshot()
            
            tolerance = 0.999
            
            insert_film_dialogue = compare_with_reference(screenshot, reference_images["film_insert_dialogue"], monitored_regions["film_insert_dialogue"], tolerance)
            dark_correction = compare_with_reference(screenshot, reference_images["dark_correction"], monitored_regions["dark_correction"], tolerance)
            film_position_dialogue = compare_with_reference(screenshot, reference_images["film_position_dialogue"], monitored_regions["film_position_dialogue"], tolerance)
            barcode_dialogue = compare_with_reference(screenshot, reference_images["barcode_dialogue"], monitored_regions["barcode_dialogue"], tolerance)
            order_finish = compare_with_reference(screenshot, reference_images["order_finish"], monitored_regions["order_finish"], tolerance)
            film_reversed = compare_with_reference(screenshot, reference_images["film_reversed"], monitored_regions["film_reversed"], tolerance)
            
            if scan_task.cancelled():
                communicate_state("Scan Cancelled", client_socket)
                break
            
            if insert_film_dialogue:
                communicate_state("Awaiting Film Insertion", client_socket)
                yield from asyncio.sleep(2)
            elif dark_correction:
                communicate_state("Awaiting Dark Correction", client_socket)
                yield from asyncio.sleep(2)
            elif film_position_dialogue:
                communicate_state("Accepted film position", client_socket)
                pyautogui.click(575, 500)
                yield from asyncio.sleep(2)
            elif barcode_dialogue:
                communicate_state("Barcode dialogue detected, starting scan", client_socket)
                pyautogui.click(575, 420)
                yield from asyncio.sleep(2)
            elif order_finish:
                communicate_state("Incomplete order, insert more film to continue", client_socket)
                yield from asyncio.sleep(2)
            elif film_reversed:
                communicate_state("Film is reversed, please flip the film", client_socket)
                pyautogui.click(575, 420)
                break
            else:
                communicate_state("Processing...", client_socket)
                yield from asyncio.sleep(2)
                
    except asyncio.CancelledError :
            communicate_state("Scan Cancelled", client_socket)
            # Perform any necessary cleanup here
    finally:
        scan_task = None  # Reset scan_task after cancellation or completion

@asyncio.coroutine
def process_command(command, client_socket):
    try:
        print("Received command: " + str(command))
        if command['type'] == 'click':
            pyautogui.click(command['x'], command['y'])
            print("Clicking at: " + str(command['x']) + ", " + str(command['y']))

        elif command['type'] == 'screenshot':
            global screenshot_task
            screenshot_task = asyncio.async(send_screenshot(client_socket))
            
        elif command['type'] == 'get_settings':
            #yield from send_settings(client_socket)
            global settings_task
            settings_task = asyncio.async(send_settings(client_socket))
        
        elif command['type'] == 'scan':
            global scan_task
            scan_task = asyncio.async(scan(client_socket))
        
        elif command['type'] == 'cancel_scan':
            if scan_task:
                scan_task.cancel()
                scan_task = None

    except Exception as e:
        print("Error in process_command:, ", e)


@asyncio.coroutine
def handle_client(client_socket):
    try:
        buffer = ""
        while True:
            data = yield from loop.sock_recv(client_socket, 1024)
            if not data:
                print("No more data received.")
                break

            buffer += data.decode('utf-8')

            if "<END_OF_JSON>" in buffer:
                parts = buffer.split("<END_OF_JSON>")
                for part in parts[:-1]:
                    try:
                        command = json.loads(part)
                        yield from process_command(command, client_socket)
                    except ValueError as e:
                        print("Error processing JSON data: ", e)
                buffer = parts[-1]  # Retain the remaining part for the next loop iteration
        client_socket.close()
        print("Connection closed.")
    except Exception as e:
        print("Error handling client: ", e)

        
@asyncio.coroutine
def start_server():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(('0.0.0.0', 8080))
    server_socket.listen(5)
    server_socket.setblocking(False)  # Set the socket to non-blocking

    while True:
        try:
            client_socket, addr = yield from loop.sock_accept(server_socket)
            if client_socket is not None:
                print("Connection has been established: ", addr)
                asyncio.async(handle_client(client_socket))  # Start a new task for each client
            else:
                print("No client socket received.")
                yield from asyncio.sleep(1)  # Wait a bit before trying again
        except Exception as e:
            print("Error accepting client connection: ", e)
            yield from asyncio.sleep(1)  # Wait a bit before trying again

# Start the asyncio event loop
loop = asyncio.get_event_loop()
loop.run_until_complete(start_server())



