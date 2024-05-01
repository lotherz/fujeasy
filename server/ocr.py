import pytesseract

def read_job_no(input_image) :

    print("Reading job number...")
    
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

    print("Tesseract path set...")
    
    print("Image object type:", type(image))
    print("Image.size type:", type(image.size))

    # Use the size attribute to get width and height
    try:
    # Assuming `image` is the PIL Image object
        width, height = image.size
        print("Image size: ", width, height)
    except Exception as e:
        print("Error accessing image size:", e)
    
    # Rescale the image, increasing its size by a factor (e.g., 2x, 3x, etc.)
    factor = 10
    new_size = (int(width * factor), int(height * factor))
    image = image.resize(new_size, Image.ANTIALIAS)
    
    print("Image resized...")

    # Apply Gaussian blur to create a low-pass filtered image
    # The radius defines the strength of the blur
    low_pass = image.filter(ImageFilter.GaussianBlur(radius=100))
    
    print("Low-pass filter applied...")

    # Subtract the low-pass filtered image from the original image
    # to achieve a high-pass filtered effect
    image = ImageChops.subtract(image, low_pass)
    
    print("High-pass filter applied...")

    #thresholding
    threshold_value = 2
    image = image.point(lambda p: p > threshold_value and 255)
    
    print("Thresholding applied...")

    #invert image
    image = ImageOps.invert(image)
    
    print("Image inverted...")
    
    #image.save(r'C:\preprocessed_image.png')

    # Now pass the preprocessed image to pytesseract
    job_no = pytesseract.image_to_string(image, config='-psm 7 nobatch digits')
    
    print("Job number read...")
    
    return(job_no)