import socket
import json
import pyautogui

def process_command(command):
    if command['type'] == 'move':
        pyautogui.moveTo(command['x'], command['y'])
    elif command['type'] == 'click':
        pyautogui.click()

def start_server():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(('0.0.0.0', 8080))
    server_socket.listen(5)

    while True:
        client_socket, addr = server_socket.accept()
        print(f"Connection from {addr} has been established.")
        
        data = client_socket.recv(1024)
        command = json.loads(data.decode('utf-8'))
        process_command(command)

        client_socket.close()

start_server()