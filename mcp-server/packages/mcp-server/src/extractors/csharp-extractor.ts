/**
 * C# Context Extractor - Invokes the packaged C# CLI over stdin/stdout.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { ExtractionResult } from '../models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CSharpExtractor {
  private buildPromise?: Promise<void>;
  private csharpRoot: string;
  private cliDllPath: string;
  private cliProjectPath: string;
  private dotnetPath: string;

  constructor() {
    this.dotnetPath = process.env.DOTNET_PATH || 'dotnet';
    const candidateRoots = [
      path.resolve(__dirname, '../../CSharp'),
      path.resolve(__dirname, '../../../../CSharp'),
    ];

    this.csharpRoot = candidateRoots.find((candidate) =>
      fs.existsSync(path.join(candidate, 'ContextExtractor.Cli', 'ContextExtractor.Cli.csproj')),
    ) ?? candidateRoots[0];
    this.cliProjectPath = path.join(this.csharpRoot, 'ContextExtractor.Cli', 'ContextExtractor.Cli.csproj');
    this.cliDllPath = path.join(this.csharpRoot, 'ContextExtractor.Cli', 'bin', 'Debug', 'net8.0', 'ContextExtractor.Cli.dll');
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
    return this.runCli({ mode: 'extract-source', sourceCode, className, maxDepth, outputFormat });
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
    return this.runCli({
      mode: 'extract-file',
      filePath: path.resolve(filePath),
      className,
      maxDepth,
      outputFormat,
    });
  }

  /**
   * Static analysis of C# source without compilation
   */
  async analyzeSource(
    sourceCode: string,
    maxDepth: number = 3,
    className?: string,
    outputFormat: 'json' | 'text' | 'both' = 'both'
  ): Promise<ExtractionResult> {
    return this.runCli({ mode: 'analyze-source', sourceCode, className, maxDepth, outputFormat });
  }

  private async runCli(request: Record<string, unknown>): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      await this.ensureBuilt();
      const rawResponse = await this.runDotnet(request);
      const parsed = JSON.parse(rawResponse) as ExtractionResult;

      return {
        ...parsed,
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
    }
  }

  private async ensureBuilt(): Promise<void> {
    if (!fs.existsSync(this.cliProjectPath)) {
      throw new Error(`C# CLI project not found at ${this.cliProjectPath}`);
    }

    if (fs.existsSync(this.cliDllPath)) {
      return;
    }

    if (!this.buildPromise) {
      this.buildPromise = new Promise<void>((resolve, reject) => {
        const build = spawn(this.dotnetPath, ['build', this.cliProjectPath], {
          cwd: this.csharpRoot,
        });

        let stderr = '';
        build.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        build.on('close', (code) => {
          this.buildPromise = undefined;

          if (code === 0 && fs.existsSync(this.cliDllPath)) {
            resolve();
            return;
          }

          reject(new Error(`dotnet build failed: ${stderr || `exit code ${code}`}`));
        });

        build.on('error', (error) => {
          this.buildPromise = undefined;
          reject(error);
        });
      });
    }

    await this.buildPromise;
  }

  private runDotnet(request: Record<string, unknown>): Promise<string> {
    return new Promise((resolve, reject) => {
      const dotnet = spawn(this.dotnetPath, [this.cliDllPath], {
        cwd: this.csharpRoot,
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
          resolve(stdout.trim());
        } else {
          reject(new Error(`dotnet run failed: ${stderr || stdout}`));
        }
      });

      dotnet.on('error', reject);

      dotnet.stdin.write(JSON.stringify(request));
      dotnet.stdin.end();
    });
  }
}
