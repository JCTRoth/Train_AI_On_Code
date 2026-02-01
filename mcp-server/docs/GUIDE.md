# Context Extractor - Complete Guide

> **Enrich AI Code Completion with Reflection-Based Context Extraction**

This MCP server extracts method signatures, parameters, and dependency trees from your code using reflection. Keep the output open in your editor, and AI assistants will provide dramatically better code suggestions.

## Table of Contents

- [Why Context Extraction?](#why-context-extraction)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [MCP Server Integration](#mcp-server-integration)
- [Available Tools](#available-tools)
- [Output Formats](#output-formats)
- [Language-Specific Usage](#language-specific-usage)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

---

## Why Context Extraction?

AI code assistants like GitHub Copilot only see limited context. When you write:

```python
user_service.  # Copilot guesses methods that might not exist!
```

Copilot doesn't know what methods `user_service` actually has. It often invents plausible-sounding but **non-existent** methods.

### The Solution

Extract your object's method tree and keep it visible:

```
=== UserService ===
Methods:
  → .get_user(user_id: int) -> User
  → .create_user(name: str, email: str) -> User
  → .delete_user(user_id: int) -> bool

Dependencies:
  └── UserRepository
      → .find_by_id(id: int) -> Optional[User]
      → .save(user: User) -> User
```

Now Copilot sees the **actual** methods and suggests correct code!

---

## Quick Start

### 1. Build the MCP Server

```bash
cd mcp-server
npm install
npm run build:mcp
```

### 2. Configure Your AI Assistant

**For Claude Desktop** (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "context-extractor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/packages/mcp-server/dist/src/index.js"]
    }
  }
}
```

**For VS Code with Continue.dev**:

```json
{
  "models": [...],
  "mcpServers": [
    {
      "name": "context-extractor",
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/packages/mcp-server/dist/src/index.js"]
    }
  ]
}
```

### 3. Use It!

Ask your AI assistant:
> "Extract context from my UserService class in services/user_service.py"

---

## Installation

### Prerequisites

| Language | Requirement |
|----------|-------------|
| **Node.js** | v18+ (required for MCP server) |
| **Python** | 3.8+ (for Python extraction) |
| **Java** | 17+ (for Java extraction) |
| **.NET** | 8.0+ (for C# extraction) |

### Full Installation

```bash
# Clone and navigate
cd mcp-server

# Install Node.js dependencies
npm install

# Build the MCP server
npm run build:mcp

# Verify installation
npm run test
```

### Environment Variables (Optional)

```bash
export PYTHON_PATH=/usr/bin/python3
export JAVA_PATH=/usr/bin/java
export DOTNET_PATH=/usr/bin/dotnet
```

---

## MCP Server Integration

### Claude Desktop

1. Open Claude Desktop settings
2. Navigate to Developer → MCP Servers
3. Add configuration:

```json
{
  "mcpServers": {
    "context-extractor": {
      "command": "node",
      "args": ["/path/to/mcp-server/packages/mcp-server/dist/src/index.js"],
      "env": {
        "PYTHON_PATH": "python3"
      }
    }
  }
}
```

4. Restart Claude Desktop

### Verification

Ask Claude:
> "What tools do you have for context extraction?"

Claude should respond listing the available tools.

---

## Available Tools

### 1. `extract_context`

**Full reflection-based extraction** - Instantiates your class and explores it at runtime.

```json
{
  "language": "python",
  "sourceCode": "class MyService:\n    def get_data(self) -> dict:\n        pass",
  "className": "MyService",
  "maxDepth": 3,
  "outputFormat": "both"
}
```

**Best for:** Complete dependency mapping, runtime analysis

### 2. `extract_context_from_file`

**Extract from existing files** - Point to a file on disk.

```json
{
  "language": "python",
  "filePath": "/path/to/my_service.py",
  "className": "MyService",
  "maxDepth": 2
}
```

**Best for:** Analyzing existing codebases

### 3. `analyze_source_static`

**Quick static analysis** - No execution, just AST parsing.

```json
{
  "language": "python",
  "sourceCode": "class MyService:\n    def get_data(self) -> dict:\n        pass"
}
```

**Best for:** Quick overview, untrusted code, syntax checking

### 4. `get_supported_languages`

**List available languages** and their requirements.

---

## Output Formats

### JSON Format

Structured data for programmatic use:

```json
{
  "success": true,
  "data": {
    "name": "UserService",
    "type": "UserService",
    "methods": [
      {
        "name": "get_user",
        "returnType": "User",
        "parameters": [
          { "name": "user_id", "type": "int" }
        ],
        "docstring": "Retrieve a user by ID"
      }
    ],
    "dependencies": [
      {
        "name": "repository",
        "type": "UserRepository",
        "methods": [...],
        "depth": 1
      }
    ]
  },
  "language": "python",
  "executionTimeMs": 45
}
```

### Text Format (AI-Optimized)

Human-readable format optimized for AI context windows:

```
# UserService Component Structure

Root object: root -> UserService

## Methods
  → .get_user(user_id: int) -> User
      # Retrieve a user by ID
  → .create_user(name: str, email: str) -> User
      # Create a new user account
  → .authenticate(username: str, password: str) -> bool

## Dependencies
├── repository: UserRepository
│   → .find_by_id(id: int) -> Optional[User]
│   → .save(user: User) -> User
│   → .delete(id: int) -> bool
└── logger: Logger
    → .info(message: str) -> None
    → .error(message: str, exc: Exception) -> None

## Summary
- Total methods: 8
- Total dependencies: 2
```

---

## Language-Specific Usage

### Python

```python
# Your service class
class UserService:
    def __init__(self, repo: UserRepository, logger: Logger):
        self.repo = repo
        self.logger = logger
    
    def get_user(self, user_id: int) -> User:
        """Retrieve a user by their ID."""
        return self.repo.find_by_id(user_id)
```

**Extraction command:**
> "Extract context from UserService in my Python file at /path/to/services.py"

### Java

```java
public class UserService {
    private final UserRepository repository;
    private final Logger logger;
    
    public User getUser(int userId) {
        return repository.findById(userId);
    }
}
```

**Extraction command:**
> "Analyze UserService.java and extract its method signatures"

### C#

```csharp
public class UserService
{
    private readonly IUserRepository _repository;
    private readonly ILogger _logger;
    
    public async Task<User> GetUserAsync(int userId)
    {
        return await _repository.FindByIdAsync(userId);
    }
}
```

**Extraction command:**
> "Extract context from UserService in my C# project"

---

## Best Practices

### 1. Keep Context Files Open

Create a `context.txt` file with extracted context and keep it open:

```bash
# Generate and save context
# Then keep the file open in your editor tab
```

### 2. Extract Entry Points

Focus on your main service classes, not every utility:

```
✅ UserService, OrderService, PaymentService
❌ StringUtils, DateHelper, Constants
```

### 3. Limit Depth for Large Projects

```json
{
  "maxDepth": 2  // Prevents explosion with deeply nested dependencies
}
```

### 4. Refresh After Major Changes

Re-extract context when you:
- Add new methods
- Change method signatures
- Add new dependencies

### 5. Use Static Analysis for Quick Checks

```
analyze_source_static is 10x faster for simple method listings
```

---

## Troubleshooting

### "Python not found"

```bash
# Set the Python path explicitly
export PYTHON_PATH=/usr/bin/python3

# Or in MCP config:
"env": { "PYTHON_PATH": "python3" }
```

### "Class requires constructor arguments"

The extractor tries to instantiate your class. Solutions:

1. **Use static analysis** for classes with required dependencies
2. **Provide default constructors** in test scenarios
3. **Extract the dependency classes** separately

### "Circular dependency detected"

This is handled automatically! The extractor detects cycles and stops recursion.

### "Method not showing up"

Check if the method is:
- Private (filtered by default in some languages)
- Inherited from a base class
- A property/getter instead of a method

### Server Not Starting

```bash
# Check if built correctly
ls packages/mcp-server/dist/src/index.js

# Rebuild if needed
npm run build:mcp

# Test manually
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp-server/dist/src/index.js
```

---

## API Reference

### ExtractionResult

```typescript
interface ExtractionResult {
  success: boolean;
  data?: ObjectNode;
  textOutput?: string;
  jsonOutput?: string;
  error?: string;
  language: 'python' | 'java' | 'csharp';
  executionTimeMs: number;
}
```

### ObjectNode

```typescript
interface ObjectNode {
  name: string;
  type: string;
  methods: MethodInfo[];
  properties?: PropertyInfo[];
  dependencies: ObjectNode[];
  depth: number;
}
```

### MethodInfo

```typescript
interface MethodInfo {
  name: string;
  returnType: string;
  parameters: ParameterInfo[];
  isStatic?: boolean;
  isAsync?: boolean;
  docstring?: string;
}
```

### ParameterInfo

```typescript
interface ParameterInfo {
  name: string;
  type: string;
  hasDefault?: boolean;
}
```

---

## Example Workflow

### Scenario: Building a REST API

1. **Extract your main service:**
   > "Extract context from OrderService including dependencies"

2. **Save the output** to `docs/order-context.txt`

3. **Keep it open** while coding

4. **Ask AI for help:**
   > "Add a method to OrderService that calculates total with tax"

5. **AI sees the context** and knows:
   - Existing methods
   - Available repositories
   - Logging patterns
   - Return types

6. **Result:** Accurate, working code suggestions!

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE)
