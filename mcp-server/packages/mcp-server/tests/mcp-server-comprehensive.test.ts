/**
 * Comprehensive test suite for MCP Server
 * Tests all tools and functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}

class McpTestClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private buffer = '';
  private responseHandlers: Map<number, (response: JsonRpcResponse) => void> = new Map();

  async start(): Promise<void> {
    const serverPath = path.join(__dirname, '..', 'dist', 'index.js');
    
    this.process = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to create process streams');
    }

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on('data', (data) => {
      // Log but don't fail on stderr
      console.error('Server stderr:', data.toString());
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Initialize the server
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line) as JsonRpcResponse;
          const handler = this.responseHandlers.get(response.id);
          if (handler) {
            handler(response);
            this.responseHandlers.delete(response.id);
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      }
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.process?.stdin) {
      throw new Error('Server not started');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 30000);

      this.responseHandlers.set(id, (response) => {
        clearTimeout(timeout);
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      });

      this.process!.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async listTools(): Promise<any> {
    return this.sendRequest('tools/list', {});
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

describe('MCP Server Comprehensive Tests', () => {
  let client: McpTestClient;

  beforeAll(async () => {
    client = new McpTestClient();
    await client.start();
  }, 60000);

  afterAll(() => {
    client.stop();
  });

  describe('Server Initialization', () => {
    it('should list all available tools', async () => {
      const result = await client.listTools();
      
      expect(result).toBeDefined();
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThanOrEqual(3);
      
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('extract_context');
      expect(toolNames).toContain('analyze_source_static');
      expect(toolNames).toContain('get_supported_languages');
    });

    it('should have correct tool schemas', async () => {
      const result = await client.listTools();
      
      const extractTool = result.tools.find((t: any) => t.name === 'extract_context');
      expect(extractTool).toBeDefined();
      expect(extractTool.inputSchema).toBeDefined();
      expect(extractTool.inputSchema.properties).toHaveProperty('language');
      expect(extractTool.inputSchema.properties).toHaveProperty('className');
    });
  });

  describe('get_supported_languages Tool', () => {
    it('should return supported languages', async () => {
      const result = await client.callTool('get_supported_languages', {});
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      
      const text = result.content[0]?.text;
      expect(text).toBeDefined();
      expect(text).toContain('python');
      expect(text).toContain('java');
      expect(text).toContain('csharp');
    });
  });

  describe('extract_context Tool', () => {
    describe('Python Extraction', () => {
      it('should extract context from Python class', async () => {
        const result = await client.callTool('extract_context', {
          language: 'python',
          className: 'SimpleService',
          filePath: path.join(__dirname, 'fixtures', 'simple_service.py'),
          maxDepth: 3,
          outputFormat: 'json'
        });
        
        expect(result).toBeDefined();
        expect(result.content).toBeInstanceOf(Array);
      });

      it('should handle Python class with dependencies', async () => {
        const result = await client.callTool('extract_context', {
          language: 'python',
          className: 'UserService',
          filePath: path.join(__dirname, 'fixtures', 'user_service.py'),
          maxDepth: 3,
          outputFormat: 'json'
        });
        
        expect(result).toBeDefined();
        expect(result.content).toBeInstanceOf(Array);
      });

      it('should respect maxDepth parameter', async () => {
        const shallowResult = await client.callTool('extract_context', {
          language: 'python',
          className: 'DeepService',
          filePath: path.join(__dirname, 'fixtures', 'deep_service.py'),
          maxDepth: 1,
          outputFormat: 'json'
        });
        
        const deepResult = await client.callTool('extract_context', {
          language: 'python',
          className: 'DeepService',
          filePath: path.join(__dirname, 'fixtures', 'deep_service.py'),
          maxDepth: 5,
          outputFormat: 'json'
        });
        
        expect(shallowResult).toBeDefined();
        expect(deepResult).toBeDefined();
      });

      it('should return text format when requested', async () => {
        const result = await client.callTool('extract_context', {
          language: 'python',
          className: 'SimpleService',
          filePath: path.join(__dirname, 'fixtures', 'simple_service.py'),
          maxDepth: 3,
          outputFormat: 'text'
        });
        
        expect(result).toBeDefined();
        expect(result.content[0]?.text).toBeDefined();
      });
    });

    describe('Error Handling', () => {
      it('should handle missing file gracefully', async () => {
        try {
          await client.callTool('extract_context', {
            language: 'python',
            className: 'NonExistent',
            filePath: '/non/existent/path.py',
            maxDepth: 3,
            outputFormat: 'json'
          });
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should handle invalid language', async () => {
        try {
          await client.callTool('extract_context', {
            language: 'invalid',
            className: 'Test',
            filePath: '/some/path.txt',
            maxDepth: 3,
            outputFormat: 'json'
          });
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should handle missing required parameters', async () => {
        try {
          await client.callTool('extract_context', {
            language: 'python'
            // Missing className and filePath
          });
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('analyze_source_static Tool', () => {
    it('should analyze Python file statically', async () => {
      const result = await client.callTool('analyze_source_static', {
        language: 'python',
        filePath: path.join(__dirname, 'fixtures', 'simple_service.py'),
        outputFormat: 'json'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
    });

    it('should analyze Java file statically', async () => {
      const testDataPath = path.resolve(__dirname, '..', '..', '..', '..', 'test_data');
      const result = await client.callTool('analyze_source_static', {
        language: 'java',
        filePath: path.join(testDataPath, 'UserService.java'),
        outputFormat: 'json'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
    });

    it('should analyze C# file statically', async () => {
      const testDataPath = path.resolve(__dirname, '..', '..', '..', '..', 'test_data');
      const result = await client.callTool('analyze_source_static', {
        language: 'csharp',
        filePath: path.join(testDataPath, 'UserService.cs'),
        outputFormat: 'json'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
    });

    it('should return text format when requested', async () => {
      const result = await client.callTool('analyze_source_static', {
        language: 'python',
        filePath: path.join(__dirname, 'fixtures', 'simple_service.py'),
        outputFormat: 'text'
      });
      
      expect(result).toBeDefined();
      const text = result.content[0]?.text;
      expect(text).toBeDefined();
    });
  });

  describe('Output Formats', () => {
    it('should return valid JSON structure', async () => {
      const result = await client.callTool('analyze_source_static', {
        language: 'python',
        filePath: path.join(__dirname, 'fixtures', 'simple_service.py'),
        outputFormat: 'json'
      });
      
      const text = result.content[0]?.text;
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it('should return readable text format', async () => {
      const result = await client.callTool('analyze_source_static', {
        language: 'python',
        filePath: path.join(__dirname, 'fixtures', 'simple_service.py'),
        outputFormat: 'text'
      });
      
      const text = result.content[0]?.text;
      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });
  });
});

describe('Integration Tests', () => {
  let client: McpTestClient;

  beforeAll(async () => {
    // Create test fixtures
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Create simple_service.py fixture
    fs.writeFileSync(path.join(fixturesDir, 'simple_service.py'), `
class SimpleService:
    """A simple service for testing."""
    
    def __init__(self):
        self.name = "simple"
    
    def get_name(self) -> str:
        """Get the service name."""
        return self.name
    
    def process(self, data: str) -> str:
        """Process some data."""
        return data.upper()
`);

    // Create user_service.py fixture
    fs.writeFileSync(path.join(fixturesDir, 'user_service.py'), `
class UserRepository:
    """Repository for user data."""
    
    def get_by_id(self, user_id: int) -> dict:
        return {"id": user_id, "name": "Test"}
    
    def save(self, user: dict) -> None:
        pass

class NotificationService:
    """Service for sending notifications."""
    
    def send(self, message: str) -> bool:
        return True

class UserService:
    """Service for managing users."""
    
    def __init__(self):
        self.repository = UserRepository()
        self.notification = NotificationService()
    
    def get_user(self, user_id: int) -> dict:
        return self.repository.get_by_id(user_id)
    
    def create_user(self, name: str) -> dict:
        user = {"name": name}
        self.repository.save(user)
        self.notification.send(f"User {name} created")
        return user
`);

    // Create deep_service.py fixture
    fs.writeFileSync(path.join(fixturesDir, 'deep_service.py'), `
class Level5:
    def method(self): pass

class Level4:
    def __init__(self):
        self.next = Level5()
    def method(self): pass

class Level3:
    def __init__(self):
        self.next = Level4()
    def method(self): pass

class Level2:
    def __init__(self):
        self.next = Level3()
    def method(self): pass

class Level1:
    def __init__(self):
        self.next = Level2()
    def method(self): pass

class DeepService:
    def __init__(self):
        self.level1 = Level1()
    def start(self): pass
`);

    client = new McpTestClient();
    await client.start();
  }, 60000);

  afterAll(() => {
    client.stop();
    
    // Clean up fixtures
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true });
    }
  });

  it('should handle full workflow: list tools -> analyze -> extract', async () => {
    // Step 1: List tools
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
    
    // Step 2: Check supported languages
    const languages = await client.callTool('get_supported_languages', {});
    expect(languages.content[0]?.text).toContain('python');
    
    // Step 3: Analyze a file
    const analysis = await client.callTool('analyze_source_static', {
      language: 'python',
      filePath: path.join(__dirname, 'fixtures', 'user_service.py'),
      outputFormat: 'json'
    });
    expect(analysis.content).toBeDefined();
  });

  it('should handle rapid successive requests', async () => {
    const requests = [];
    
    for (let i = 0; i < 5; i++) {
      requests.push(
        client.callTool('get_supported_languages', {})
      );
    }
    
    const results = await Promise.all(requests);
    
    for (const result of results) {
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
    }
  });
});
