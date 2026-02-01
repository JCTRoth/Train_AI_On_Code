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
class McpTestClient {
    serverPath;
    constructor() {
        this.serverPath = path.resolve(__dirname, '../dist/index.js');
    }
    async sendRequest(request) {
        return new Promise((resolve, reject) => {
            const proc = spawn('node', [this.serverPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            proc.on('close', () => {
                try {
                    // Find the JSON response in stdout (skip the "running on stdio" message)
                    const lines = stdout.split('\n').filter(line => line.startsWith('{'));
                    if (lines.length > 0) {
                        resolve(JSON.parse(lines[0]));
                    }
                    else {
                        reject(new Error(`No JSON response found. stdout: ${stdout}, stderr: ${stderr}`));
                    }
                }
                catch (e) {
                    reject(new Error(`Failed to parse response: ${stdout}`));
                }
            });
            proc.on('error', reject);
            // Send request and close stdin
            proc.stdin.write(JSON.stringify(request));
            proc.stdin.end();
            // Timeout
            setTimeout(() => {
                proc.kill();
                reject(new Error('Request timed out'));
            }, 10000);
        });
    }
}
// Test functions
async function testToolsList() {
    const client = new McpTestClient();
    try {
        const response = await client.sendRequest({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
        });
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
}
async function testSupportedLanguages() {
    const client = new McpTestClient();
    try {
        const response = await client.sendRequest({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'get_supported_languages',
                arguments: {},
            },
        });
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
}
async function testPythonStaticAnalysis() {
    const client = new McpTestClient();
    try {
        const response = await client.sendRequest({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
                name: 'analyze_source_static',
                arguments: {
                    language: 'python',
                    sourceCode: `class TestClass:
    def hello(self, name: str) -> str:
        """Say hello"""
        return f"Hello, {name}"
    
    def goodbye(self) -> None:
        pass`,
                },
            },
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
}
async function testJavaStaticAnalysis() {
    const client = new McpTestClient();
    try {
        const response = await client.sendRequest({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: {
                name: 'analyze_source_static',
                arguments: {
                    language: 'java',
                    sourceCode: `public class TestService {
    public String getData(int id) {
        return "data";
    }
    
    public void setData(String value) {
    }
}`,
                },
            },
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
}
async function testCSharpStaticAnalysis() {
    const client = new McpTestClient();
    try {
        const response = await client.sendRequest({
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: {
                name: 'analyze_source_static',
                arguments: {
                    language: 'csharp',
                    sourceCode: `public class TestService {
    public string GetData(int id) {
        return "data";
    }
    
    public async Task<bool> SaveData(string value) {
        return true;
    }
}`,
                },
            },
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
}
async function testResourcesList() {
    const client = new McpTestClient();
    try {
        const response = await client.sendRequest({
            jsonrpc: '2.0',
            id: 6,
            method: 'resources/list',
        });
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