import { spawn, type ChildProcess } from 'child_process';

export class REPLExecutor {
  private variables: Map<string, string> = new Map();
  private pythonProcess: ChildProcess | null = null;
  private pythonPath: string;

  constructor(pythonPath = 'python3') {
    this.pythonPath = pythonPath;
  }

  setVariable(name: string, value: string): void {
    this.variables.set(name, value);
  }

  async execute(code: string): Promise<string> {
    const sandboxedCode = this.sandboxCode(code);
    
    try {
      const result = await this.runPython(sandboxedCode);
      return result;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private sandboxCode(code: string): string {
    const allowedBuiltins = ['len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'abs', 'round', 'divmod', 'pow', 'chr', 'ord', 'hex', 'oct', 'bin', 'format', 'repr', 'ascii', 'hasattr', 'getattr', 'isinstance', 'issubclass', 'type', 'callable', 'dir', 'vars', 'locals', 'globals', 'compile', 'eval', 'exec'];
    
    const safeImports = ['re', 'math', 'random', 'datetime', 'itertools', 'collections', 'functools', 'operator', 'string', 'textwrap', 'hashlib', 'json', 'statistics'];
    
    const setupCode = `
import sys
import re
import json

# Restrict imports
allowed_modules = ${JSON.stringify(safeImports)}
original_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __builtins__['__import__']

def safe_import(name, *args, **kwargs):
    if name not in allowed_modules and not name.startswith(tuple(allowed_modules)):
        raise ImportError(f"Import of '{name}' is not allowed")
    return original_import(name, *args, **kwargs)

if hasattr(__builtins__, '__import__'):
    __builtins__.__import__ = safe_import
else:
    __builtins__['__import__'] = safe_import

# Set context variable
context = sys.stdin.read()
`;
    
    return setupCode + '\n' + code;
  }

  private async runPython(code: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const contextValue = this.variables.get('context') || '';
      
      const python = spawn(this.pythonPath, ['-c', code], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      });

      let stdout = '';
      let stderr = '';

      python.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Python process exited with code ${code}`));
        } else {
          resolve(stdout.trim());
        }
      });

      python.on('error', (err) => {
        reject(err);
      });

      // Send context via stdin
      python.stdin?.write(contextValue);
      python.stdin?.end();
    });
  }

  close(): void {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
    }
  }
}
