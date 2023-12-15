import socket
import json
import pyautogui

def process_command(command):
    match command['type']:
        case 'click':
            pyautogui.click(command['x'], command['y'])
            print(f"Clicking at: {command['x']}, {command['y']}")
        case 'locate':
            img = pyautogui.locateOnScreen(command['image'])
            if img is not None:
                print(f"Image found at: {img}")
                return img
            
def start_server():
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(('0.0.0.0', 8080))
    server_socket.listen(5)

    while True:
        client_socket, addr = server_socket.accept()
        print("Connection has been established.")
        
        data = client_socket.recv(1024)
        command = json.loads(data.decode('utf-8'))
        process_command(command)

        client_socket.close()

start_server()