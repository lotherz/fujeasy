import socket
import json
import pyautogui

pyautogui.PAUSE = 0.5

def process_command(command):
    if command['type'] == 'click':
        pyautogui.click(command['x'], command['y'])
        print(f"Clicking at: {command['x']}, {command['y']})

def start_server():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(('0.0.0.0', 8080))
    server_socket.listen(5)

    while True:
        client_socket, addr = server_socket.accept()
        print("Connection has been established.")

        full_data = b''
        while True:
            data = client_socket.recv(1024)
            if not data:
                break
            full_data += data

        command = json.loads(full_data.decode('utf-8'))
        process_command(command)

        client_socket.close()

start_server()
