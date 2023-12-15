import socket
import json
import pyautogui
import datetime

def take_screenshot(name):
    print("Taking screenshot...")
    screenshot = pyautogui.screenshot()
    screenshot.save(name + '.png')

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