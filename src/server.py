import socket
import json
import pyautogui

def process_command(command):
    if command['type'] == 'click':
        pyautogui.click(command['x'], command['y'])
        print("Clicking at: " + str(command['x']) + ", " + str(command['y']))

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
                break  # Exit the loop if no data is received, indicating the client has closed the connection
            try:
                command = json.loads(data.decode('utf-8'))
                process_command(command)
            except json.JSONDecodeError:
                print("Received non-JSON data or incomplete JSON data.")

        client_socket.close()
        print("Connection closed.")

start_server()
