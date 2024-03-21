from PIL import Image, ImageFilter, ImageOps
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

image_path = r'C:\s_test.png'

# Open and convert to grayscale
image = Image.open(image_path).convert('L')

# Apply a median filter for noise reduction
image = image.filter(ImageFilter.MedianFilter(size=0.5))

# Optionally save the preprocessed image to disk for inspection
image.save(r'C:\preprocessed_image.png')

# Now pass the preprocessed image to pytesseract
text = pytesseract.image_to_string(image, config='-psm 7 -c tessedit_char_whitelist=0123456789')

if (text) :
    print("Found text: " + text)
else :
    print("ERROR: Text not found")