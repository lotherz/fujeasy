from PIL import Image, ImageFilter, ImageOps, ImageChops
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

image_path = r'C:\s_test.png'

# Open and convert to grayscale
image = Image.open(image_path).convert('L')

# Use the size attribute to get width and height
width, height = image.size

# Rescale the image, increasing its size by a factor (e.g., 2x, 3x, etc.)
factor = 10
new_size = (int(width * factor), int(height * factor))
image = image.resize(new_size, Image.ANTIALIAS)

# Apply Gaussian blur to create a low-pass filtered image
# The radius defines the strength of the blur
low_pass = image.filter(ImageFilter.GaussianBlur(radius=30))

# Subtract the low-pass filtered image from the original image
# to achieve a high-pass filtered effect
image = ImageChops.subtract(image, low_pass)

#thresholding
threshold_value = 2
image = image.point(lambda p: p > threshold_value and 255)

#invert image
image = ImageOps.invert(image)

image.save(r'C:\preprocessed_image.png')

# Now pass the preprocessed image to pytesseract
text = pytesseract.image_to_string(image, config='-psm 7 nobatch digits')

if (text) :
    print("Found text: " + text)
else :
    print("ERROR: Text not found")