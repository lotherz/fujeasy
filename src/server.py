import socket
import json
import pyautogui
import io

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
