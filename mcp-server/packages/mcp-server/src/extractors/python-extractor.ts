/**
 * Python Context Extractor - Executes Python extraction via subprocess
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { ExtractionResult, ObjectNode } from '../models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PythonExtractor {
  private pythonPath: string;
  private extractorPath: string;

  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    // Navigate from dist/extractors to packages/context-extractor-python
    // __dirname = packages/mcp-server/dist/extractors (when compiled)
    // We need: packages/context-extractor-python
    this.extractorPath = path.resolve(__dirname, '../../../context-extractor-python');
  }

  /**
   * Extract context from Python source code
   */
  async extractFromSource(
    sourceCode: string,
    className: string,
    maxDepth: number = 3,
    outputFormat: 'json' | 'text' | 'both' = 'both'
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    const script = `
import sys
import json
sys.path.insert(0, '${this.extractorPath}/src')

from context_extractor import ContextExtractor
from models import ObjectNode

# Execute the provided source code to define the class
exec('''${sourceCode.replace(/'/g, "\\'")}''')

# Get the class and create an instance
target_class = ${className}
instance = target_class()

# Extract context
extractor = ContextExtractor(max_depth=${maxDepth})
result = extractor.explore_object(instance)

# Output based on format
output = {
    'success': True,
    'data': result.to_dict() if result else None,
}

if '${outputFormat}' in ['text', 'both']:
    output['textOutput'] = result.to_text() if result else None
if '${outputFormat}' in ['json', 'both']:
    output['jsonOutput'] = result.to_json() if result else None

print(json.dumps(output))
`;

    try {
      const result = await this.runPython(script);
      const parsed = JSON.parse(result);
      
      return {
        ...parsed,
        language: 'python',
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        language: 'python',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract context from an existing Python file
   */
  async extractFromFile(
    filePath: string,
    className: string,
    maxDepth: number = 3,
    outputFormat: 'json' | 'text' | 'both' = 'both'
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const absolutePath = path.resolve(filePath);
    const dirPath = path.dirname(absolutePath);
    const moduleName = path.basename(filePath, '.py');

    const script = `
import sys
import json
sys.path.insert(0, '${this.extractorPath}/src')
sys.path.insert(0, '${dirPath}')

from context_extractor import ContextExtractor
import ${moduleName}

# Get the class and create an instance
target_class = getattr(${moduleName}, '${className}')
instance = target_class()

# Extract context
extractor = ContextExtractor(max_depth=${maxDepth})
result = extractor.explore_object(instance)

# Output based on format
output = {
    'success': True,
    'data': result.to_dict() if result else None,
}

if '${outputFormat}' in ['text', 'both']:
    output['textOutput'] = result.to_text() if result else None
if '${outputFormat}' in ['json', 'both']:
    output['jsonOutput'] = result.to_json() if result else None

print(json.dumps(output))
`;

    try {
      const result = await this.runPython(script);
      const parsed = JSON.parse(result);
      
      return {
        ...parsed,
        language: 'python',
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        language: 'python',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Analyze Python source without execution (static analysis)
   */
  async analyzeSource(
    sourceCode: string,
    maxDepth: number = 3
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    const script = `
import json
import ast

source = '''${sourceCode.replace(/'/g, "\\'")}'''
tree = ast.parse(source)

def analyze_class(node, depth=0):
    methods = []
    dependencies = []
    
    for item in node.body:
        if isinstance(item, ast.FunctionDef) or isinstance(item, ast.AsyncFunctionDef):
            params = []
            for arg in item.args.args:
                if arg.arg != 'self':
                    param_type = 'Any'
                    if arg.annotation:
                        param_type = ast.unparse(arg.annotation) if hasattr(ast, 'unparse') else str(arg.annotation)
                    params.append({
                        'name': arg.arg,
                        'type': param_type,
                        'hasDefault': False
                    })
            
            return_type = 'None'
            if item.returns:
                return_type = ast.unparse(item.returns) if hasattr(ast, 'unparse') else str(item.returns)
            
            docstring = ast.get_docstring(item)
            
            methods.append({
                'name': item.name,
                'returnType': return_type,
                'parameters': params,
                'isStatic': any(isinstance(d, ast.Name) and d.id == 'staticmethod' for d in item.decorator_list),
                'isAsync': isinstance(item, ast.AsyncFunctionDef),
                'docstring': docstring
            })
    
    return {
        'name': node.name,
        'type': node.name,
        'methods': methods,
        'dependencies': dependencies,
        'depth': depth
    }

results = []
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        results.append(analyze_class(node))

output = {
    'success': True,
    'data': results[0] if results else None,
    'allClasses': results
}

print(json.dumps(output))
`;

    try {
      const result = await this.runPython(script);
      const parsed = JSON.parse(result);
      
      return {
        ...parsed,
        language: 'python',
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        language: 'python',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  private runPython(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, ['-c', script]);
      
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        reject(err);
      });
    });
  }
}
