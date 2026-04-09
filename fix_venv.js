const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'report-service');
const venvPath = path.join(targetDir, 'venv');
const pythonInVenv = process.platform === 'win32' 
  ? path.join(venvPath, 'Scripts', 'python.exe') 
  : path.join(venvPath, 'bin', 'python');

console.log('Starting venv creation in', targetDir);

try {
  // 1. Create venv
  execSync(`python -m venv venv`, { cwd: targetDir, stdio: 'inherit' });
  console.log('Venv created successfully.');

  // 2. Check if created
  if (fs.existsSync(pythonInVenv)) {
    console.log('Python found in venv:', pythonInVenv);
    
    // 3. Install requirements
    console.log('Installing requirements...');
    execSync(`"${pythonInVenv}" -m pip install -r requirements.txt`, { cwd: targetDir, stdio: 'inherit' });
    console.log('Requirements installed.');

    console.log('Installing extra packages...');
    execSync(`"${pythonInVenv}" -m pip install anthropic reportlab matplotlib httpx python-dotenv`, { cwd: targetDir, stdio: 'inherit' });
    console.log('Extras installed.');
  } else {
    console.error('Venv directory created but python.exe not found at', pythonInVenv);
  }
} catch (err) {
  console.error('Error during setup:', err.message);
}
