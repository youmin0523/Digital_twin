import venv
import os
import sys

target = os.path.join(os.getcwd(), 'digital_twin_row_models', 'report-service', 'venv')
print(f"Creating venv at: {target}")
try:
    venv.create(target, with_pip=True)
    print("Venv created successfully.")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
