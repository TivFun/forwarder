import "dotenv/config";
import path from "path";
import fs from "fs";

/**
 * Resolve a path to absolute path.
 * If the path is already absolute, return it as-is.
 * If the path is relative, resolve it relative to the project root (where .env file is).
 * 
 * @param inputPath - Path from environment variable (can be absolute or relative)
 * @returns Absolute path
 */
function resolvePath(inputPath: string): string {
  // If already absolute, return as-is
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  
  // If relative, resolve relative to project root
  // Project root is where the .env file is, which is typically where the process started
  // For PM2, this is usually the directory where ecosystem.config.js is located
  const projectRoot = process.cwd(); // Current working directory (usually project root)
  return path.resolve(projectRoot, inputPath);
}

/**
 * Get the Python interpreter path, prioritizing virtual environment if configured.
 * 
 * Priority:
 * 1. PYTHON_BIN_PATH environment variable (explicit path to Python binary)
 *    - Can be absolute or relative to project root
 * 2. PYTHON_VENV_PATH environment variable (path to virtual environment, will use bin/python3)
 *    - Can be absolute or relative to project root
 * 3. Default to "python3" (system Python)
 * 
 * @returns Path to Python interpreter
 */
export function getPythonInterpreter(): string {
  // Option 1: Explicit Python binary path
  const explicitPath = process.env.PYTHON_BIN_PATH;
  if (explicitPath) {
    const resolvedPath = resolvePath(explicitPath);
    if (fs.existsSync(resolvedPath)) {
      console.log(`[Python] Using Python from PYTHON_BIN_PATH: ${resolvedPath}`);
      return resolvedPath;
    } else {
      console.warn(
        `[Python] PYTHON_BIN_PATH specified but not found: ${resolvedPath} (resolved from: ${explicitPath}), falling back to default`
      );
    }
  }

  // Option 2: Virtual environment path
  const venvPath = process.env.PYTHON_VENV_PATH;
  if (venvPath) {
    const resolvedVenvPath = resolvePath(venvPath);
    
    // Try common virtual environment Python paths
    const possiblePaths = [
      path.join(resolvedVenvPath, "bin", "python3"), // Unix/macOS
      path.join(resolvedVenvPath, "bin", "python"), // Unix/macOS (alternative)
      path.join(resolvedVenvPath, "Scripts", "python.exe"), // Windows
      path.join(resolvedVenvPath, "Scripts", "python3.exe"), // Windows (alternative)
    ];

    for (const pythonPath of possiblePaths) {
      if (fs.existsSync(pythonPath)) {
        console.log(`[Python] Using virtual environment Python: ${pythonPath} (from PYTHON_VENV_PATH: ${venvPath})`);
        return pythonPath;
      }
    }

    console.warn(
      `[Python] PYTHON_VENV_PATH specified but Python not found in: ${resolvedVenvPath} (resolved from: ${venvPath}), falling back to default`
    );
  }

  // Option 3: Default to system Python
  return "python3";
}

