import os
from PIL import Image

def optimize_images(root_dir):
    """
    Finds all PNG images in a directory and its subdirectories,
    and converts them to WebP format.
    """
    for subdir, _, files in os.walk(root_dir):
        for file in files:
            if file.lower().endswith('.png'):
                file_path = os.path.join(subdir, file)
                try:
                    with Image.open(file_path) as img:
                        # Construct the new filename
                        webp_path = os.path.splitext(file_path)[0] + '.webp'
                        
                        # Convert and save as WebP
                        img.save(webp_path, 'webp', quality=85)
                        print(f"Converted {file_path} to {webp_path}")

                except Exception as e:
                    print(f"Could not convert {file_path}: {e}")

if __name__ == "__main__":
    assets_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'images')
    optimize_images(assets_dir)
    print("Image optimization complete.") 