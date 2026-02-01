# Context Extractor

A multi-language implementation of a reflection-based context extractor for AI enrichment. This tool extracts method trees from objects to provide better context to AI code completion tools like GitHub Copilot.

## ✨ Features

- **Multi-Language Support**: Python, Java, and C#
- **Reflection-Based Analysis**: Deep inspection of objects and their methods
- **Dependency Tracking**: Recursively explores object relationships
- **Circular Reference Handling**: Safely handles circular dependencies
- **Multiple Output Formats**: JSON (structured) and Text (AI-optimized)
- **MCP Integration**: Full Model Context Protocol server with tools, resources, and prompts
- **CLI Tools**: Standalone command-line interface for each language
- **Comprehensive Test Suites**: 53+ Python tests, 11+ Java tests, 11+ C# tests, 6+ MCP tests

## Overview

Based on the article [Copilot Data Sources / Context Extension](https://mailbase.blog/copilot-data-sources-context-extention/), this project provides implementations in:

- **Python** - Using the `inspect` module
- **Java** - Using the Reflection API
- **C#/.NET** - Using `System.Reflection`

## Purpose

AI code completion tools like Copilot often only know about the top-level methods of objects. This causes them to "invent" methods that don't exist. By extracting the actual method tree of your objects and keeping the output file open, you can dramatically improve code completion suggestions.

## Project Structure

```
mcp-server/
├── packages/
│   ├── mcp-server/                   # MCP Server (TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts              # Main MCP server
│   │   │   ├── models.ts             # Data models
│   │   │   └── extractors/           # Language-specific extractors
│   │   └── dist/                     # Compiled output
│   ├── context-extractor-python/     # Python implementation
│   │   ├── src/
│   │   │   ├── context_extractor.py
│   │   │   └── models.py
│   │   └── tests/
│   ├── context-extractor-java/       # Java implementation
│   │   ├── src/main/java/io/contextextractor/
│   │   │   ├── ContextExtractor.java
│   │   │   ├── MethodInfo.java
│   │   │   ├── ObjectNode.java
│   │   │   └── ParameterInfo.java
│   │   └── src/test/java/
│   └── context-extractor-csharp/     # C# implementation
│       ├── src/
│       │   ├── ContextExtractorService.cs
│       │   └── Models/
│       └── tests/
├── mcp-config.example.json           # MCP configuration example
└── package.json
```

## MCP Server

The project includes an MCP (Model Context Protocol) server that exposes the context extraction functionality to AI assistants.

### Setup

```bash
cd packages/mcp-server
npm install
npm run build
```

### Configuration

Add to your MCP client settings (e.g., Claude Desktop `claude_desktop_config.json`):

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

### Available Tools

| Tool | Description |
|------|-------------|
| `extract_context` | Extract context from source code with reflection |
| `extract_context_from_file` | Extract context from a file on disk |
| `analyze_source_static` | Quick static analysis without execution |
| `get_supported_languages` | List supported languages |

See [packages/mcp-server/README.md](packages/mcp-server/README.md) for detailed documentation.

## Usage

### Python

```python
from context_extractor import ContextExtractor

# Create extractor
extractor = ContextExtractor(output_dir="generated_context")

# Explore an object and save as text (for AI context)
extractor.save_as_text(my_service_object)

# Or save as JSON for programmatic use
extractor.save_as_json(my_service_object)

# Explore without saving
node = extractor.explore_object(my_service_object)
print(node.to_text())
```

### Java

```java
import io.contextextractor.ContextExtractor;

// Create extractor
ContextExtractor extractor = new ContextExtractor("generated_context", 10, false);

// Explore and save
extractor.saveAsText(myServiceObject);
extractor.saveAsJson(myServiceObject);

// Or get the node directly
ObjectNode node = extractor.exploreObject(myServiceObject);
System.out.println(node.toText());
```

### C#

```csharp
using ContextExtractor;

// Create extractor
var extractor = new ContextExtractorService("generated_context", 10, false);

// Explore and save
extractor.SaveAsText(myServiceObject);
extractor.SaveAsJson(myServiceObject);

// Or get the node directly
var node = extractor.ExploreObject(myServiceObject);
Console.WriteLine(node.ToText());
```

## Output Format

### Text Format (AI-optimized)

```
# UserService Component Structure

Root object: root -> UserService

## Methods
  → .register_user(username: str, email: str, password: str) -> dict
      Register a new user in the system.
  → .authenticate(username: str, password: str) -> bool
  → .update_profile(user_id: int, data: dict) -> bool

## Dependencies
├── repository: UserRepository
    → .get_user_by_id(user_id: int) -> dict
    → .save_user(user_data: dict) -> bool
    └── db: DatabaseConnection
        → .connect(host: str, port: int) -> bool
        → .execute_query(query: str, params: list) -> list

## Summary
- Total methods: 15
- Total dependencies: 5
```

### JSON Format

```json
{
  "name": "root",
  "class": "UserService",
  "methods": [
    {
      "name": "register_user",
      "parameters": [
        {"name": "username", "type": "str"},
        {"name": "email", "type": "str"}
      ],
      "return_type": "dict"
    }
  ],
  "children": [...]
}
```

## Running Tests

### All tests via NX
```bash
npm test
```

### Python
```bash
cd packages/context-extractor-python
python -m pytest tests/ -v
```

### Java
```bash
cd packages/context-extractor-java
mvn test
```

### C#
```bash
cd packages/context-extractor-csharp
dotnet test
```

## How It Works

1. **Reflection**: Each implementation uses the language's reflection capabilities to inspect objects at runtime
2. **Recursive Exploration**: The extractor traverses object fields/properties to find sub-objects
3. **Cycle Detection**: Prevents infinite loops when objects reference each other
4. **Output Generation**: Creates either text (optimized for AI context) or JSON (for programmatic use)

## Integration with Copilot

1. Generate a context file for your main service object
2. Keep the generated `.txt` file open in your editor
3. Copilot will use this file as context for suggestions
4. Suggestions will now reference actual methods that exist in your codebase

## License

MIT
