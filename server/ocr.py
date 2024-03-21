from PIL import Image, ImageFilter, ImageOps
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

image_path = r'C:\s_test.png'

# Open and convert to grayscale
image = Image.open(image_path).convert('L')

# Rescale the image, increasing its size by a factor (e.g., 2x, 3x, etc.)
factor = 3
new_size = (int(image.width * factor), int(image.height * factor))
image = image.resize(new_size, Image.ANTIALIAS)

# Apply a median filter for noise reduction
image = image.filter(ImageFilter.MedianFilter(size=1))

# Optionally save the preprocessed image to disk for inspection
image.save(r'C:\preprocessed_image.png')

# Now pass the preprocessed image to pytesseract
text = pytesseract.image_to_string(image, config='-psm 13')

if (text) :
    print("Found text: " + text)
else :
    print("ERROR: Text not found")