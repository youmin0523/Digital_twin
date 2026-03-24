import os

filepath = r'c:\Users\Codelab\Desktop\PROJECT\Portfolio\Digital Twin\arctic-hybrid.html'
with open(filepath, 'rb') as f:
    raw = f.read()

encodings_to_try = ['utf-8', 'utf-16', 'utf-16-le', 'cp949', 'euc-kr']
best_text = None
for enc in encodings_to_try:
    try:
        text = raw.decode(enc)
        print(f"Successfully decoded with {enc}")
        best_text = text
        break
    except UnicodeDecodeError:
        pass

if best_text:
    lines = best_text.split('\n')
    keywords = ['nsrRoute', 'suezRoute', 'Suez', 'evaluate', 'distance', 'Cartesian3.fromDegreesArray', 'route']
    for i, line in enumerate(lines):
        if any(k.lower() in line.lower() for k in keywords):
            print(f"{i+1}: {line.strip()[:100]}")
