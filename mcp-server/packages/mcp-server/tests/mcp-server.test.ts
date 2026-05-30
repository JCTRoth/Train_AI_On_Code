#!/usr/bin/env node

/**
 * Simple MCP Server Test Script
 * 
 * Tests the Context Extractor MCP Server using stdin/stdout
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.resolve(__dirname, '../dist/index.js');
const csharpFixturePath = path.resolve(__dirname, '../../../CSharp/ContextExtractor.Tests/Fixtures/HugeHierarchy.cs');

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runTest(
  name: string,
  request: object,
  validator: (response: any) => boolean
): Promise<TestResult> {
  return new Promise((resolve) => {
    const proc = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ name, passed: false, error: 'Timeout' });
    }, 30000);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      
      // Check if we have a complete JSON response
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.startsWith('{') && line.includes('"jsonrpc"')) {
          try {
            const response = JSON.parse(line);
            clearTimeout(timeout);
            proc.kill();
            
            const passed = validator(response);
            resolve({ name, passed, error: passed ? undefined : 'Validation failed' });
            return;
          } catch (e) {
            // Not complete JSON yet
          }
        }
      }
    });

    proc.stderr.on('data', () => {
      // Ignore stderr (server startup message)
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ name, passed: false, error: err.message });
    });

    // Send request
    proc.stdin.write(JSON.stringify(request) + '\n');
    proc.stdin.end();
  });
}

async function main() {
  console.log('=== MCP Server Tests ===\n');

  const results: TestResult[] = [];

  // Test 1: tools/list
  results.push(await runTest(
    'tools/list',
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    (res) => {
      const tools = res.result?.tools || [];
      const names = tools.map((t: any) => t.name);
      return names.includes('extract_context') && 
             names.includes('analyze_source_static') &&
             names.includes('get_supported_languages');
    }
  ));

  // Test 2: get_supported_languages
  results.push(await runTest(
    'get_supported_languages',
    { 
      jsonrpc: '2.0', 
      id: 2, 
      method: 'tools/call',
      params: { name: 'get_supported_languages', arguments: {} }
    },
    (res) => {
      const content = res.result?.content?.[0]?.text;
      if (!content) return false;
      const data = JSON.parse(content);
      return data.languages?.includes('python') &&
             data.languages?.includes('java') &&
             data.languages?.includes('csharp');
    }
  ));

  // Test 3: Python static analysis
  results.push(await runTest(
    'Python static analysis',
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'analyze_source_static',
        arguments: {
          language: 'python',
          sourceCode: 'class Test:\n    def hello(self) -> str:\n        pass'
        }
      }
    },
    (res) => {
      const content = res.result?.content?.[0]?.text;
      if (!content) return false;
      const data = JSON.parse(content);
      return data.success === true && data.data?.name === 'Test';
    }
  ));

  // Test 4: Java static analysis
  results.push(await runTest(
    'Java static analysis',
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'analyze_source_static',
        arguments: {
          language: 'java',
          sourceCode: 'public class Test { public void hello() {} }'
        }
      }
    },
    (res) => {
      const content = res.result?.content?.[0]?.text;
      if (!content) return false;
      const data = JSON.parse(content);
      return data.success === true && data.data?.name === 'Test';
    }
  ));

  // Test 5: C# static analysis
  results.push(await runTest(
    'C# static analysis',
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'analyze_source_static',
        arguments: {
          language: 'csharp',
          sourceCode: 'public class Test { public void Hello() {} }'
        }
      }
    },
    (res) => {
      const content = res.result?.content?.[0]?.text;
      if (!content) return false;
      const data = JSON.parse(content);
      return data.success === true && data.data?.name === 'Test';
    }
  ));

  // Test 6: resources/list
  results.push(await runTest(
    'resources/list',
    { jsonrpc: '2.0', id: 6, method: 'resources/list' },
    (res) => {
      const resources = res.result?.resources || [];
      const uris = resources.map((r: any) => r.uri);
      return uris.includes('context-extractor://examples/python');
    }
  ));

  // Test 7: C# runtime extraction from file
  results.push(await runTest(
    'C# runtime extraction',
    {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'extract_context',
        arguments: {
          language: 'csharp',
          filePath: csharpFixturePath,
          className: 'OrderService',
          maxDepth: 3,
          outputFormat: 'json'
        }
      }
    },
    (res) => {
      const content = res.result?.content?.[0]?.text;
      if (!content) return false;
      const data = JSON.parse(content);
      return data.success === true &&
             data.data?.type === 'OrderService' &&
             Array.isArray(data.data?.dependencies) &&
             data.data.dependencies.some((dependency: any) => dependency.name === 'Catalog');
    }
  ));

  // Print results
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}: ${result.error}`);
      failed++;
    }
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
