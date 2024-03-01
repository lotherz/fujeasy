import socket
import json
import pyautogui
import io
import cv2
import time
import numpy as np
from PIL import Image
import pytesseract
import asyncio

fp = "//Mac/Home/Documents/fujeasy/server/screenshots"

reference_images = {
    "film_type": fp + "/film_type_true.png",
    "border": fp + "/border_true.png",
    "file_format": fp + "/file_format_true.png",
    "look_soft": fp + "/look_soft_3.png",
    "look_standard": fp + "/look_standard_4.png",
    "look_rich": fp + "/look_rich_5.png",
    "film_insert_dialogue": fp + "/film_insert_dialogue.png",
    "film_position_dialogue": fp + "/film_position.png",
    "barcode_dialogue": fp + "/barcode_dialogue.png",
    "dark_correction": fp + "/dark_correction.png",
    "incomplete_order": fp + "/incomplete_order.png",
    "film_reversed": fp + "/film_reversed.png",
    "processing": fp + "/processing.png",
    "processing_greyed": fp + "/processing_greyed.png",
    "reading_image": fp + "/reading_image.png",
    "grid_view": fp + "/grid_view.png",
    "scan_finished": fp + "/scan_finished.png"
}

monitored_regions = {
    "job_number":               (56, 25, 35, 11),
    "film_type":                (240, 146, 117, 68),
    "border":                   (386, 146, 168, 68),
    "file_format":              (386, 376, 116, 67), 
    "look_dropdown":            (365, 294, 7, 10),
    "film_insert_dialogue":     (171, 206, 458, 189),
    "film_position_dialogue":   (145, 445, 510, 88),
    "barcode_dialogue":         (189, 202, 214, 95),
    "dark_correction":          (189, 202, 214, 95),
    "incomplete_order":         (2, 499, 563, 35),
    "film_reversed":            (189, 202, 341, 90),
    "processing":               (113, 217, 575, 167),
    "processing_greyed":        (113, 217, 575, 167),
    "reading_image":            (113, 217, 575, 167),
    "grid_view":                (0, 498, 800, 36),
    "scan_finished":            (0, 498, 800, 102)
    #                           (x-coordinate, y-coordinate, width, height)
}

def communicate_state(state, client_socket):
    status_message = json.dumps({"status": state})
    client_socket.sendall(status_message.encode('utf-8') + b'<END_OF_JSON>')
    print(state)

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
        if compare_with_reference(screenshot, reference, monitored_regions["look_dropdown"], threshold, 0):
            pyautogui.click(550, 300)  # Click to commit the change, if needed
            #print("Look: " + look)
            return look
        else:
            print(look + " not found, trying next")
    
    pyautogui.click(550, 300)  # Click to commit the change, if needed
    print("Look not found, defaulting to standard")
    return "standard"

def get_job_number(screenshot):
    print("Starting OCR for job number...")
    gray_screenshot = cv2.cvtColor(screenshot, cv2.COLOR_BGR2GRAY)
    print("Converted screenshot to grayscale.")

    # Extract job number using OCR
    x, y, w, h = monitored_regions["job_number"]
    job_number_region = gray_screenshot[y:y+h, x:x+w]
    print(f"Cropped to region: {x}, {y}, {w}, {h}")

    job_number = pytesseract.image_to_string(job_number_region, config='--psm 7')
    print(f"Job Number: {job_number}")

    return job_number

def derive_settings():
    screenshot = take_screenshot()
    threshold = 0.99
    settings = {
        "film_type": "colour" if compare_with_reference(screenshot, reference_images["film_type"], monitored_regions["film_type"], threshold, 0) else "bw",
        "border": 0 if compare_with_reference(screenshot, reference_images["border"], monitored_regions["border"], 0.999, 0) else 1,
        "file_format": "JPEG" if compare_with_reference(screenshot, reference_images["file_format"], monitored_regions["file_format"], threshold, 0) else "TIFF",
        "look": get_look(),
        "job_number": get_job_number(screenshot)
    }
    return settings

def compare_with_reference(screenshot_data, reference_image_path, region, threshold, skipMessage):
    
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

    #REFERENCE DEBUGGING
    if not skipMessage:
        print("Comparing with " + reference_image_path + ", similarity score: " + str(max_val))

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

@asyncio.coroutine
def continuous_film_monitoring(client_socket):
    last_state = None  # Variable to keep track of the last communicated state
    while True:
        try:
            screenshot = take_screenshot()
            tolerance = 0.999
            detected_state = None  # Track the detected state
            dialogues = {
                "film_insert_dialogue": ("Awaiting Film Insertion", None),
                "dark_correction": ("Awaiting Dark Correction", None),
                "film_position_dialogue": ("Accepted Film Position", (575, 500)),
                "barcode_dialogue": ("Barcode Dialogue Detected, Starting Scan", (575, 420)),
                "incomplete_order": ("Incomplete Order, Insert More Film to Continue", None),
                "film_reversed": ("Film is Reversed, Please Flip the Film", (575, 420)),
                "reading_image": ("Reading Image...", None),
                "grid_view": ("Progressing Scan...", (745, 515)),
                "processing": ("Processing...", None),
                "processing_greyed": ("Processing...", None),
                "scan_finished": ("Scan Finished", None)
            }
            for dialogue, (state, click_position) in dialogues.items():
                if compare_with_reference(screenshot, reference_images[dialogue], monitored_regions[dialogue], tolerance, 1):
                    detected_state = state
                    
                    if detected_state == "Scan Finished" and last_state != "Processing...":
                        break
                    else:
                        # Only communicate the state if it is different from the last communicated state
                        if detected_state and detected_state != last_state:
                            communicate_state(detected_state, client_socket)  # Send detected state to client
                            last_state = detected_state  # Update the last communicated state
                        
                    # Perform the click if a click position is specified for the detected dialogue
                    if click_position:
                        pyautogui.click(*click_position)
                    break  # Stop checking once the first dialogue is detected
            yield from asyncio.sleep(1)  # Adjust sleep duration as needed
        except Exception as e:
            print("Error in continuous monitoring: {}".format(e))
            yield from asyncio.sleep(1)

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
    except Exception as e:
        print("Error handling client: ", e)
    finally:
        client_socket.close()
        print("Connection closed.")

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
                print("Connection has been established: {}".format(addr))
                # Adapt to both Python 3.4 and newer versions
                try:
                    asyncio.ensure_future(handle_client(client_socket))
                except AttributeError:
                    getattr(asyncio, 'async')(handle_client(client_socket))
                
                # Similarly for continuous_film_monitoring
                try:
                    asyncio.ensure_future(continuous_film_monitoring(client_socket))
                except AttributeError:
                    getattr(asyncio, 'async')(continuous_film_monitoring(client_socket))
            else:

                yield from asyncio.sleep(1)  # Wait a bit before trying again
        except Exception as e:
            print("Error accepting client connection: {}".format(e))
            yield from asyncio.sleep(1)  # Wait and try again

            
# Start the asyncio event loop
loop = asyncio.get_event_loop()
loop.run_until_complete(start_server())




