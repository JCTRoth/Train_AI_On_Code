# Context Extractor MCP Server

An MCP (Model Context Protocol) server that provides reflection-based context extraction for AI assistants. Extract method trees from Python, Java, and C# source code to enrich AI context for better code suggestions.

## Features

- **Multi-language support**: Python, Java, and C#
- **Deep dependency extraction**: Recursively explores object dependencies
- **Multiple output formats**: JSON (structured) and Text (AI-optimized)
- **Static analysis**: Quick analysis without code execution
- **MCP integration**: Works with any MCP-compatible AI assistant

## Installation

```bash
cd mcp-server/packages/mcp-server
npm install
npm run build
```

The published npm package includes the `CSharp` source tree. The first C# request builds the bundled .NET CLI locally and then reuses the compiled DLL for subsequent requests.

## Configuration

Add to your MCP settings (e.g., Claude Desktop, VS Code):

```json
{
  "mcpServers": {
    "context-extractor": {
      "command": "node",
      "args": ["/path/to/mcp-server/packages/mcp-server/dist/index.js"],
      "env": {
        "PYTHON_PATH": "python3",
        "JAVA_PATH": "java",
        "DOTNET_PATH": "dotnet"
      }
    }
  }
}
```

## Tools

### `extract_context`

Extract method tree context from source code using reflection.

**Parameters:**
- `language` (required): `python`, `java`, or `csharp`
- `sourceCode` (required): The complete source code to analyze
- `filePath` (optional): Absolute path to the source file to analyze
- `className` (required): The name of the main class to extract
- `maxDepth` (optional): Maximum depth for dependencies (default: 3)
- `outputFormat` (optional): `json`, `text`, or `both` (default: `both`)

Provide either `sourceCode` or `filePath`.

**Example:**
```json
{
  "language": "python",
  "sourceCode": "class UserService:\n    def get_user(self, id: int) -> dict:\n        pass",
  "className": "UserService"
}
```

### `extract_context_from_file`

Extract context from a source file on disk.

**Parameters:**
- `language` (required): `python`, `java`, or `csharp`
- `filePath` (required): Absolute path to the source file
- `className` (required): The name of the class to extract
- `maxDepth` (optional): Maximum depth (default: 3)
- `outputFormat` (optional): Output format (default: `both`)

### `analyze_source_static`

Perform quick static analysis without code execution.

**Parameters:**
- `language` (required): `python`, `java`, or `csharp`
- `sourceCode` (required): The source code to analyze
- `filePath` (optional): Absolute path to the source file to analyze
- `className` (optional): Preferred class name when multiple classes exist
- `maxDepth` (optional): Maximum depth (default: 3)

Provide either `sourceCode` or `filePath`.

### `get_supported_languages`

Returns the list of supported programming languages with their requirements.

## Resources

The server provides example code and documentation as MCP resources:

- `context-extractor://examples/python` - Python example
- `context-extractor://examples/java` - Java example  
- `context-extractor://examples/csharp` - C# example
- `context-extractor://docs/output-format` - Output format documentation

## Output Format

### JSON Output

```json
{
  "success": true,
  "data": {
    "name": "UserService",
    "type": "UserService",
    "methods": [
      {
        "name": "getUser",
        "returnType": "dict",
        "parameters": [
          {"name": "userId", "type": "int"}
        ],
        "isStatic": false,
        "docstring": "Get user by ID"
      }
    ],
    "dependencies": [
      {
        "name": "logger",
        "type": "Logger",
        "methods": [...],
        "depth": 1
      }
    ]
  },
  "language": "python",
  "executionTimeMs": 45
}
```

### Text Output (AI-Optimized)

```
=== UserService ===
Methods:
  - getUser(userId: int) -> dict
    Get user by ID
  - createUser(name: str, email: str) -> dict
    Create a new user

Dependencies:
  === Logger (depth: 1) ===
  Methods:
    - log(message: str) -> None
    - error(message: str) -> None
```

## Requirements

- **Node.js**: 18+
- **Python**: 3.8+ (for Python extraction)
- **Java**: 17+ (for Java extraction)
- **.NET**: 8.0+ (for C# extraction)

## Development

```bash
# Build
npm run build

# Watch mode
npm run watch

# Run directly
npm run dev
```

## How It Works

The server uses language-specific reflection mechanisms:

1. **Python**: Uses the `inspect` module to introspect objects at runtime
2. **Java**: Uses `java.lang.reflect` API for class and method analysis
3. **C#**: Uses `System.Reflection` namespace for type inspection

Each extractor can:
- Instantiate objects and explore their structure
- Extract method signatures with full type information
- Map dependencies between objects recursively
- Handle circular references with cycle detection

## Use Cases

- **AI Code Completion**: Provide rich context to AI assistants
- **API Documentation**: Generate docs from code structure
- **Dependency Mapping**: Understand class relationships
- **Code Analysis**: Quick overview of class interfaces

## License

MIT
