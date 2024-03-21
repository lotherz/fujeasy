from PIL import Image, ImageFilter, ImageOps
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

image_path = r'C:\s_test.png'

image = Image.open(image_path).convert('L')  # Convert to grayscale
image = ImageOps.autocontrast(image)  # Improve contrast
image = image.filter(ImageFilter.MedianFilter())  # Apply a median filter for noise reduction

text = pytesseract.image_to_string(image, config='-psm 7')

if (text) :
    print("Found text: " + text)
else :
    print("ERROR: Text not found")