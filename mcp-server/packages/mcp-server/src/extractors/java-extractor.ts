/**
 * Java Context Extractor - Executes Java extraction via subprocess
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { ExtractionResult } from '../models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class JavaExtractor {
  private javaPath: string;
  private extractorPath: string;
  private jarPath: string;

  constructor() {
    this.javaPath = process.env.JAVA_PATH || 'java';
    // Navigate from dist/extractors to packages/context-extractor-java
    this.extractorPath = path.resolve(__dirname, '../../../context-extractor-java');
    this.jarPath = path.join(this.extractorPath, 'target', 'context-extractor-1.0.0.jar');
  }

  /**
   * Check if the Java extractor JAR is built
   */
  async ensureBuilt(): Promise<void> {
    if (!fs.existsSync(this.jarPath)) {
      // Try to build
      await this.buildJar();
    }
  }

  private buildJar(): Promise<void> {
    return new Promise((resolve, reject) => {
      const mvn = spawn('mvn', ['package', '-DskipTests'], {
        cwd: this.extractorPath,
      });

      mvn.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Maven build failed with code ${code}`));
        }
      });

      mvn.on('error', reject);
    });
  }

  /**
   * Extract context from Java source code
   */
  async extractFromSource(
    sourceCode: string,
    className: string,
    maxDepth: number = 3,
    outputFormat: 'json' | 'text' | 'both' = 'both'
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    // Create a temporary directory and file
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'java-extract-'));
    const sourceFile = path.join(tempDir, `${className}.java`);

    try {
      // Write the source code
      fs.writeFileSync(sourceFile, sourceCode);

      // Compile the source
      await this.compileJava(sourceFile, tempDir);

      // Run extraction
      const result = await this.runExtraction(tempDir, className, maxDepth, outputFormat);

      return {
        success: true,
        ...result,
        language: 'java',
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        language: 'java',
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      // Cleanup temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Extract context from an existing Java file
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

    try {
      // Compile the source
      await this.compileJava(absolutePath, dirPath);

      // Run extraction
      const result = await this.runExtraction(dirPath, className, maxDepth, outputFormat);

      return {
        success: true,
        ...result,
        language: 'java',
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        language: 'java',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Static analysis of Java source without compilation
   */
  async analyzeSource(sourceCode: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    // Basic regex-based extraction for quick analysis
    const classMatch = sourceCode.match(/(?:public\s+)?class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : 'Unknown';

    const methods: any[] = [];
    const methodRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)/g;
    
    let match;
    while ((match = methodRegex.exec(sourceCode)) !== null) {
      const [, returnType, methodName, params] = match;
      
      const parameters = params.split(',')
        .filter(p => p.trim())
        .map(p => {
          const parts = p.trim().split(/\s+/);
          return {
            name: parts[parts.length - 1],
            type: parts.slice(0, -1).join(' ') || 'Object',
            hasDefault: false,
          };
        });

      methods.push({
        name: methodName,
        returnType: returnType,
        parameters,
        isStatic: sourceCode.includes(`static ${returnType} ${methodName}`),
        isAsync: false,
      });
    }

    return {
      success: true,
      data: {
        name: className,
        type: className,
        methods,
        dependencies: [],
        depth: 0,
      },
      language: 'java',
      executionTimeMs: Date.now() - startTime,
    };
  }

  private compileJava(sourceFile: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const javac = spawn('javac', ['-d', outputDir, sourceFile]);

      let stderr = '';
      javac.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      javac.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Java compilation failed: ${stderr}`));
        }
      });

      javac.on('error', reject);
    });
  }

  private runExtraction(
    classPath: string,
    className: string,
    maxDepth: number,
    outputFormat: string
  ): Promise<Partial<ExtractionResult>> {
    return new Promise((resolve, reject) => {
      // Create a runner script inline
      const runnerCode = `
import java.lang.reflect.*;
import java.util.*;

public class Runner {
    public static void main(String[] args) throws Exception {
        Class<?> clazz = Class.forName("${className}");
        Object instance = clazz.getDeclaredConstructor().newInstance();
        
        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\\"name\\": \\"").append(clazz.getSimpleName()).append("\\",");
        json.append("\\"type\\": \\"").append(clazz.getName()).append("\\",");
        json.append("\\"methods\\": [");
        
        Method[] methods = clazz.getDeclaredMethods();
        boolean first = true;
        for (Method m : methods) {
            if (!first) json.append(",");
            first = false;
            
            json.append("{");
            json.append("\\"name\\": \\"").append(m.getName()).append("\\",");
            json.append("\\"returnType\\": \\"").append(m.getReturnType().getSimpleName()).append("\\",");
            json.append("\\"isStatic\\": ").append(Modifier.isStatic(m.getModifiers())).append(",");
            json.append("\\"parameters\\": [");
            
            Parameter[] params = m.getParameters();
            for (int i = 0; i < params.length; i++) {
                if (i > 0) json.append(",");
                json.append("{");
                json.append("\\"name\\": \\"").append(params[i].getName()).append("\\",");
                json.append("\\"type\\": \\"").append(params[i].getType().getSimpleName()).append("\\"");
                json.append("}");
            }
            json.append("]");
            json.append("}");
        }
        
        json.append("],");
        json.append("\\"dependencies\\": [],");
        json.append("\\"depth\\": 0");
        json.append("}");
        
        System.out.println(json.toString());
    }
}
`;

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'java-runner-'));
      const runnerFile = path.join(tempDir, 'Runner.java');
      fs.writeFileSync(runnerFile, runnerCode);

      // Compile runner
      const javac = spawn('javac', ['-cp', classPath, '-d', tempDir, runnerFile]);
      
      javac.on('close', (code) => {
        if (code !== 0) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          reject(new Error('Failed to compile runner'));
          return;
        }

        // Run
        const java = spawn('java', ['-cp', `${classPath}:${tempDir}`, 'Runner']);
        
        let stdout = '';
        let stderr = '';

        java.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        java.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        java.on('close', (javaCode) => {
          fs.rmSync(tempDir, { recursive: true, force: true });
          
          if (javaCode === 0) {
            try {
              const data = JSON.parse(stdout.trim());
              resolve({
                success: true,
                data,
                jsonOutput: stdout.trim(),
              });
            } catch (e) {
              reject(new Error(`Failed to parse output: ${stdout}`));
            }
          } else {
            reject(new Error(`Java execution failed: ${stderr}`));
          }
        });

        java.on('error', (err) => {
          fs.rmSync(tempDir, { recursive: true, force: true });
          reject(err);
        });
      });

      javac.on('error', (err) => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        reject(err);
      });
    });
  }
}
