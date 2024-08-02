import base64
import glob
import json
import os

images = glob.glob('*.png')
output = {}

for image in images:
    with open(image, 'rb') as f:
        data = f.read()

    data = base64.b64encode(data).decode('utf-8')
    output[os.path.basename(image).replace('.png', '')] = 'data:image/png;base64,' + data

with open('images.json', 'w', encoding='utf8') as f:
    json.dump(output, f)
