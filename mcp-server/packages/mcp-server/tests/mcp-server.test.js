/**
 * MCP Server Tests
 *
 * Integration tests for the Context Extractor MCP Server
 */
import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csharpFixturePath = path.resolve(__dirname, '../../../CSharp/ContextExtractor.Tests/Fixtures/HugeHierarchy.cs');
class McpTestClient {
    serverPath;
    buffer = '';
    process = null;
    requestId = 0;
    responseHandlers = new Map();
    constructor() {
        this.serverPath = path.resolve(__dirname, '../dist/index.js');
    }
    async start() {
        this.process = spawn('node', [this.serverPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (!this.process.stdout || !this.process.stdin) {
            throw new Error('Failed to create MCP server process');
        }
        this.process.stdout.on('data', (data) => {
            this.buffer += data.toString();
            this.processBuffer();
        });
        this.process.stderr.on('data', () => {
            // Ignore startup logs written to stderr.
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
        });
    }
    processBuffer() {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim()) {
                continue;
            }
            try {
                const response = JSON.parse(line);
                const handler = this.responseHandlers.get(response.id);
                if (handler) {
                    handler(response);
                    this.responseHandlers.delete(response.id);
                }
            }
            catch {
                // Ignore non-JSON output.
            }
        }
    }
    async sendRequest(method, params) {
        if (!this.process?.stdin) {
            throw new Error('Server not started');
        }
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.responseHandlers.delete(id);
                reject(new Error(`Request timed out: ${method}`));
            }, 30000);
            this.responseHandlers.set(id, (response) => {
                if (response.error) {
                    reject(new Error(response.error.message));
                    return;
                }
                resolve(response);
            });
            this.process.stdin.write(JSON.stringify(request) + '\n');
        });
    }
    async callTool(name, args) {
        return this.sendRequest('tools/call', { name, arguments: args });
    }
    async listTools() {
        return this.sendRequest('tools/list', {});
    }
    async listResources() {
        return this.sendRequest('resources/list', {});
    }
    stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}
// Test functions
async function testToolsList() {
    const client = new McpTestClient();
    try {
        await client.start();
        const response = await client.listTools();
        const result = response.result;
        const toolNames = result.tools.map(t => t.name);
        const expectedTools = ['extract_context', 'extract_context_from_file', 'analyze_source_static', 'get_supported_languages'];
        const hasAllTools = expectedTools.every(name => toolNames.includes(name));
        console.log(`✓ tools/list: Found ${toolNames.length} tools`);
        return hasAllTools;
    }
    catch (error) {
        console.error('✗ tools/list failed:', error);
        return false;
    }
    finally {
        client.stop();
    }
}
async function testSupportedLanguages() {
    const client = new McpTestClient();
    try {
        await client.start();
        const response = await client.callTool('get_supported_languages', {});
        const result = response.result;
        const data = JSON.parse(result.content[0].text);
        const hasAllLanguages = ['python', 'java', 'csharp'].every(lang => data.languages.includes(lang));
        console.log(`✓ get_supported_languages: ${data.languages.join(', ')}`);
        return hasAllLanguages;
    }
    catch (error) {
        console.error('✗ get_supported_languages failed:', error);
        return false;
    }
    finally {
        client.stop();
    }
}
async function testPythonStaticAnalysis() {
    const client = new McpTestClient();
    try {
        await client.start();
        const response = await client.callTool('analyze_source_static', {
            language: 'python',
            sourceCode: `class TestClass:
    def hello(self, name: str) -> str:
        """Say hello"""
        return f"Hello, {name}"
    
    def goodbye(self) -> None:
        pass`,
        });
        const result = response.result;
        const data = JSON.parse(result.content[0].text);
        const success = data.success === true &&
            data.data.name === 'TestClass' &&
            data.data.methods.length === 2;
        console.log(`✓ Python static analysis: ${data.data.methods.length} methods found`);
        return success;
    }
    catch (error) {
        console.error('✗ Python static analysis failed:', error);
        return false;
    }
    finally {
        client.stop();
    }
}
async function testJavaStaticAnalysis() {
    const client = new McpTestClient();
    try {
        await client.start();
        const response = await client.callTool('analyze_source_static', {
            language: 'java',
            sourceCode: `public class TestService {
    public String getData(int id) {
        return "data";
    }
    
    public void setData(String value) {
    }
}`,
        });
        const result = response.result;
        const data = JSON.parse(result.content[0].text);
        const success = data.success === true &&
            data.data.name === 'TestService' &&
            data.data.methods.length === 2;
        console.log(`✓ Java static analysis: ${data.data.methods.length} methods found`);
        return success;
    }
    catch (error) {
        console.error('✗ Java static analysis failed:', error);
        return false;
    }
    finally {
        client.stop();
    }
}
async function testCSharpStaticAnalysis() {
    const client = new McpTestClient();
    try {
        await client.start();
        const response = await client.callTool('analyze_source_static', {
            language: 'csharp',
            sourceCode: `public class TestService {
    public string GetData(int id) {
        return "data";
    }
    
    public async Task<bool> SaveData(string value) {
        return true;
    }
}`,
        });
        const result = response.result;
        const data = JSON.parse(result.content[0].text);
        const success = data.success === true &&
            data.data.name === 'TestService' &&
            data.data.methods.length === 2;
        console.log(`✓ C# static analysis: ${data.data.methods.length} methods found`);
        return success;
    }
    catch (error) {
        console.error('✗ C# static analysis failed:', error);
        return false;
    }
    finally {
        client.stop();
    }
}
async function testResourcesList() {
    const client = new McpTestClient();
    try {
        await client.start();
        const response = await client.listResources();
        const result = response.result;
        const resourceUris = result.resources.map(r => r.uri);
        const expectedResources = [
            'context-extractor://examples/python',
            'context-extractor://examples/java',
            'context-extractor://examples/csharp',
            'context-extractor://docs/output-format',
        ];
        const hasAllResources = expectedResources.every(uri => resourceUris.includes(uri));
        console.log(`✓ resources/list: Found ${resourceUris.length} resources`);
        return hasAllResources;
    }
    catch (error) {
        console.error('✗ resources/list failed:', error);
        return false;
    }
    finally {
        client.stop();
    }
}
async function testCSharpRuntimeExtraction() {
    const client = new McpTestClient();
    try {
        await client.start();
        const response = await client.callTool('extract_context', {
            language: 'csharp',
            filePath: csharpFixturePath,
            className: 'OrderService',
            maxDepth: 3,
            outputFormat: 'json',
        });
        const result = response.result;
        const data = JSON.parse(result.content[0].text);
        const success = data.success === true &&
            data.data.type === 'OrderService' &&
            data.data.dependencies.some(dependency => dependency.name === 'Catalog');
        console.log(`✓ C# runtime extraction: ${data.data.dependencies.length} dependencies found`);
        return success;
    }
    catch (error) {
        console.error('✗ C# runtime extraction failed:', error);
        return false;
    }
    finally {
        client.stop();
    }
}
// Main test runner
async function runTests() {
    console.log('=== MCP Server Integration Tests ===\n');
    const tests = [
        { name: 'Tools List', fn: testToolsList },
        { name: 'Supported Languages', fn: testSupportedLanguages },
        { name: 'Python Static Analysis', fn: testPythonStaticAnalysis },
        { name: 'Java Static Analysis', fn: testJavaStaticAnalysis },
        { name: 'C# Static Analysis', fn: testCSharpStaticAnalysis },
        { name: 'Resources List', fn: testResourcesList },
        { name: 'C# Runtime Extraction', fn: testCSharpRuntimeExtraction },
    ];
    let passed = 0;
    let failed = 0;
    for (const test of tests) {
        try {
            const result = await test.fn();
            if (result) {
                passed++;
            }
            else {
                failed++;
            }
        }
        catch (error) {
            console.error(`✗ ${test.name} threw an error:`, error);
            failed++;
        }
    }
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}
runTests();
//# sourceMappingURL=mcp-server.test.js.map