/**
 * C# Context Extractor - Executes C# extraction via subprocess
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { ExtractionResult } from '../models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CSharpExtractor {
  private dotnetPath: string;
  private extractorPath: string;

  constructor() {
    this.dotnetPath = process.env.DOTNET_PATH || 'dotnet';
    // Navigate from dist/extractors to packages/context-extractor-csharp
    this.extractorPath = path.resolve(__dirname, '../../../context-extractor-csharp');
  }

  /**
   * Extract context from C# source code
   */
  async extractFromSource(
    sourceCode: string,
    className: string,
    maxDepth: number = 3,
    outputFormat: 'json' | 'text' | 'both' = 'both'
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    // Create a temporary project
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csharp-extract-'));

    try {
      // Create a minimal console project
      await this.createTempProject(tempDir, sourceCode, className, maxDepth);

      // Build and run
      const result = await this.runDotnet(tempDir);

      return {
        success: true,
        ...result,
        language: 'csharp',
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        language: 'csharp',
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Extract context from an existing C# file
   */
  async extractFromFile(
    filePath: string,
    className: string,
    maxDepth: number = 3,
    outputFormat: 'json' | 'text' | 'both' = 'both'
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const absolutePath = path.resolve(filePath);

    try {
      const sourceCode = fs.readFileSync(absolutePath, 'utf-8');
      return await this.extractFromSource(sourceCode, className, maxDepth, outputFormat);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        language: 'csharp',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Static analysis of C# source without compilation
   */
  async analyzeSource(sourceCode: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    // Basic regex-based extraction for quick analysis
    const classMatch = sourceCode.match(/(?:public\s+)?class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : 'Unknown';

    const methods: any[] = [];
    const methodRegex = /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)/g;

    let match;
    while ((match = methodRegex.exec(sourceCode)) !== null) {
      const [, returnType, methodName, params] = match;

      // Skip constructors
      if (methodName === className) continue;

      const parameters = params.split(',')
        .filter(p => p.trim())
        .map(p => {
          const parts = p.trim().split(/\s+/);
          return {
            name: parts[parts.length - 1],
            type: parts.slice(0, -1).join(' ') || 'object',
            hasDefault: p.includes('='),
          };
        });

      methods.push({
        name: methodName,
        returnType: returnType,
        parameters,
        isStatic: sourceCode.includes(`static ${returnType} ${methodName}`) ||
                  sourceCode.includes(`static async ${returnType} ${methodName}`),
        isAsync: sourceCode.includes(`async ${returnType} ${methodName}`) ||
                 sourceCode.includes(`async Task<${returnType}> ${methodName}`),
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
      language: 'csharp',
      executionTimeMs: Date.now() - startTime,
    };
  }

  private async createTempProject(
    tempDir: string,
    sourceCode: string,
    className: string,
    maxDepth: number
  ): Promise<void> {
    // Create project file
    const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`;

    fs.writeFileSync(path.join(tempDir, 'Extractor.csproj'), csproj);

    // Copy the ContextExtractor service
    const extractorSrc = path.join(this.extractorPath, 'src');
    if (fs.existsSync(extractorSrc)) {
      // Copy Models
      const modelsDir = path.join(tempDir, 'Models');
      fs.mkdirSync(modelsDir, { recursive: true });
      
      const srcModels = path.join(extractorSrc, 'Models');
      if (fs.existsSync(srcModels)) {
        for (const file of fs.readdirSync(srcModels)) {
          fs.copyFileSync(path.join(srcModels, file), path.join(modelsDir, file));
        }
      }

      // Copy ContextExtractorService
      const serviceFile = path.join(extractorSrc, 'ContextExtractorService.cs');
      if (fs.existsSync(serviceFile)) {
        fs.copyFileSync(serviceFile, path.join(tempDir, 'ContextExtractorService.cs'));
      }
    }

    // Write the source code
    fs.writeFileSync(path.join(tempDir, 'Target.cs'), sourceCode);

    // Create the main program
    const program = `using System;
using System.Text.Json;
using ContextExtractor;

var instance = new ${className}();
var extractor = new ContextExtractorService(${maxDepth});
var result = extractor.ExploreObject(instance);

var jsonOutput = extractor.ToJson(result);
Console.WriteLine(jsonOutput);
`;

    fs.writeFileSync(path.join(tempDir, 'Program.cs'), program);
  }

  private runDotnet(projectDir: string): Promise<Partial<ExtractionResult>> {
    return new Promise((resolve, reject) => {
      const dotnet = spawn(this.dotnetPath, ['run', '--project', projectDir], {
        cwd: projectDir,
      });

      let stdout = '';
      let stderr = '';

      dotnet.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      dotnet.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      dotnet.on('close', (code) => {
        if (code === 0) {
          try {
            const data = JSON.parse(stdout.trim());
            resolve({
              data,
              jsonOutput: stdout.trim(),
            });
          } catch (e) {
            // Might be text output
            resolve({
              textOutput: stdout.trim(),
            });
          }
        } else {
          reject(new Error(`dotnet run failed: ${stderr}`));
        }
      });

      dotnet.on('error', reject);
    });
  }
}
