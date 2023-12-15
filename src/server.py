import socket
import json
import pyautogui
import io

def send_screenshot(client_socket):
    # Take a screenshot
    screenshot = pyautogui.screenshot()
    
    # Save screenshot to a BytesIO object
    img_byte_arr = io.BytesIO()
    screenshot.save(img_byte_arr, format='PNG')
    img_byte_arr = img_byte_arr.getvalue()

    # Send the size of the image first
    size = len(img_byte_arr)
    client_socket.sendall(str(size).encode('utf-8') + b'\n')

    # Send the image
    client_socket.sendall(img_byte_arr)

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
        take_screenshot("start_screenshot")

        while True:
            data = client_socket.recv(1024)
            if not data:
                break
            try:
                command = json.loads(data.decode('utf-8'))
                process_command(command)
            except json.JSONDecodeError:
                print("Received non-JSON data or incomplete JSON data.")

        take_screenshot("end_screenshot")
        client_socket.close()
        print("Connection closed.")

start_server()