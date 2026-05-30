#!/usr/bin/env node

/**
 * Context Extractor MCP Server
 * 
 * Provides reflection-based context extraction for AI assistants.
 * Supports Python, Java, and C# source code analysis.
 */

import * as fs from 'fs';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PythonExtractor, JavaExtractor, CSharpExtractor } from './extractors/index.js';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from './models.js';

// Initialize extractors
const extractors = {
  python: new PythonExtractor(),
  java: new JavaExtractor(),
  csharp: new CSharpExtractor(),
};

// Create the MCP server
const server = new Server(
  {
    name: 'context-extractor',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Tool schemas
const ExtractContextSchema = z.object({
  language: z.enum(['python', 'java', 'csharp']).describe('Programming language of the source code'),
  sourceCode: z.string().optional().describe('The source code to analyze'),
  filePath: z.string().optional().describe('Absolute path to the source file to analyze'),
  className: z.string().describe('The name of the class to extract context from'),
  maxDepth: z.number().optional().default(3).describe('Maximum depth for dependency exploration'),
  outputFormat: z.enum(['json', 'text', 'both']).optional().default('both').describe('Output format'),
}).refine((value) => Boolean(value.sourceCode || value.filePath), {
  message: 'Either sourceCode or filePath must be provided.',
});

const ExtractFromFileSchema = z.object({
  language: z.enum(['python', 'java', 'csharp']).describe('Programming language of the file'),
  filePath: z.string().describe('Absolute path to the source file'),
  className: z.string().describe('The name of the class to extract context from'),
  maxDepth: z.number().optional().default(3).describe('Maximum depth for dependency exploration'),
  outputFormat: z.enum(['json', 'text', 'both']).optional().default('both').describe('Output format'),
});

const AnalyzeSourceSchema = z.object({
  language: z.enum(['python', 'java', 'csharp']).describe('Programming language of the source code'),
  sourceCode: z.string().optional().describe('The source code to analyze statically'),
  filePath: z.string().optional().describe('Absolute path to the source file to analyze statically'),
  className: z.string().optional().describe('Optional class name when the source contains multiple classes'),
  maxDepth: z.number().optional().default(3).describe('Maximum depth for analysis'),
  outputFormat: z.enum(['json', 'text', 'both']).optional().default('both').describe('Output format'),
}).refine((value) => Boolean(value.sourceCode || value.filePath), {
  message: 'Either sourceCode or filePath must be provided.',
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'extract_context',
        description: `Extract method tree context from source code using reflection. 
This tool analyzes a class and its dependencies to extract method signatures, parameters, return types, and docstrings.
The output can be used to enrich AI context for better code suggestions.

Supported languages: Python, Java, C#

Example use cases:
- Extract all methods from a service class to understand available operations
- Map dependency relationships between objects
- Generate API documentation from code
- Provide context to AI for code completion`,
        inputSchema: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              enum: ['python', 'java', 'csharp'],
              description: 'Programming language of the source code',
            },
            sourceCode: {
              type: 'string',
              description: 'The complete source code to analyze',
            },
            filePath: {
              type: 'string',
              description: 'Absolute path to the source file to analyze',
            },
            className: {
              type: 'string',
              description: 'The name of the main class to extract context from',
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth for exploring dependencies (default: 3)',
              default: 3,
            },
            outputFormat: {
              type: 'string',
              enum: ['json', 'text', 'both'],
              description: 'Output format - json for structured data, text for AI-optimized format',
              default: 'both',
            },
          },
          required: ['language', 'className'],
        },
      },
      {
        name: 'extract_context_from_file',
        description: `Extract method tree context from a source file on disk.
Similar to extract_context but reads from a file path.
Useful for analyzing existing codebases.`,
        inputSchema: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              enum: ['python', 'java', 'csharp'],
              description: 'Programming language of the file',
            },
            filePath: {
              type: 'string',
              description: 'Absolute path to the source file',
            },
            className: {
              type: 'string',
              description: 'The name of the class to extract context from',
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth for exploring dependencies (default: 3)',
              default: 3,
            },
            outputFormat: {
              type: 'string',
              enum: ['json', 'text', 'both'],
              description: 'Output format',
              default: 'both',
            },
          },
          required: ['language', 'filePath', 'className'],
        },
      },
      {
        name: 'analyze_source_static',
        description: `Perform static analysis on source code without execution.
Extracts class and method information using AST/regex parsing.
Faster than full extraction but doesn't capture runtime dependencies.

Use this for:
- Quick overview of a class structure
- When you can't execute the code
- Initial analysis before full extraction`,
        inputSchema: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              enum: ['python', 'java', 'csharp'],
              description: 'Programming language of the source code',
            },
            sourceCode: {
              type: 'string',
              description: 'The source code to analyze',
            },
            filePath: {
              type: 'string',
              description: 'Absolute path to the source file to analyze',
            },
            className: {
              type: 'string',
              description: 'Optional class name when the file contains multiple classes',
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth for analysis (default: 3)',
              default: 3,
            },
            outputFormat: {
              type: 'string',
              enum: ['json', 'text', 'both'],
              description: 'Output format',
              default: 'both',
            },
          },
          required: ['language'],
        },
      },
      {
        name: 'get_supported_languages',
        description: 'Get a list of supported programming languages for context extraction',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'extract_context': {
        const parsed = ExtractContextSchema.parse(args);
        const extractor = extractors[parsed.language];
        
        const result = parsed.sourceCode
          ? await extractor.extractFromSource(
              parsed.sourceCode,
              parsed.className,
              parsed.maxDepth,
              parsed.outputFormat
            )
          : await extractor.extractFromFile(
              parsed.filePath!,
              parsed.className,
              parsed.maxDepth,
              parsed.outputFormat
            );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'extract_context_from_file': {
        const parsed = ExtractFromFileSchema.parse(args);
        const extractor = extractors[parsed.language];

        const result = await extractor.extractFromFile(
          parsed.filePath,
          parsed.className,
          parsed.maxDepth,
          parsed.outputFormat
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'analyze_source_static': {
        const parsed = AnalyzeSourceSchema.parse(args);
        const extractor = extractors[parsed.language];
        const sourceCode = parsed.sourceCode ?? fs.readFileSync(parsed.filePath!, 'utf-8');

        const result = await extractor.analyzeSource(
          sourceCode,
          parsed.maxDepth
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_supported_languages': {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                languages: SUPPORTED_LANGUAGES,
                details: {
                  python: {
                    description: 'Python using inspect module for reflection',
                    requirements: ['Python 3.8+'],
                  },
                  java: {
                    description: 'Java using java.lang.reflect API',
                    requirements: ['Java 17+', 'Maven (for building)'],
                  },
                  csharp: {
                    description: 'C# using System.Reflection',
                    requirements: ['.NET 8.0+'],
                  },
                },
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw error;
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'context-extractor://examples/python',
        name: 'Python Example',
        description: 'Example Python class for context extraction',
        mimeType: 'text/x-python',
      },
      {
        uri: 'context-extractor://examples/java',
        name: 'Java Example',
        description: 'Example Java class for context extraction',
        mimeType: 'text/x-java',
      },
      {
        uri: 'context-extractor://examples/csharp',
        name: 'C# Example',
        description: 'Example C# class for context extraction',
        mimeType: 'text/x-csharp',
      },
      {
        uri: 'context-extractor://docs/output-format',
        name: 'Output Format Documentation',
        description: 'Documentation on the output format for context extraction',
        mimeType: 'text/markdown',
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'context-extractor://examples/python':
      return {
        contents: [
          {
            uri,
            mimeType: 'text/x-python',
            text: `class Logger:
    """Simple logger class"""
    def log(self, message: str) -> None:
        print(f"[LOG] {message}")
    
    def error(self, message: str) -> None:
        print(f"[ERROR] {message}")

class UserService:
    """User management service"""
    def __init__(self):
        self.logger = Logger()
    
    def get_user(self, user_id: int) -> dict:
        """Get user by ID"""
        self.logger.log(f"Getting user {user_id}")
        return {"id": user_id, "name": "John"}
    
    def create_user(self, name: str, email: str) -> dict:
        """Create a new user"""
        self.logger.log(f"Creating user {name}")
        return {"id": 1, "name": name, "email": email}
`,
          },
        ],
      };

    case 'context-extractor://examples/java':
      return {
        contents: [
          {
            uri,
            mimeType: 'text/x-java',
            text: `public class Logger {
    public void log(String message) {
        System.out.println("[LOG] " + message);
    }
    
    public void error(String message) {
        System.out.println("[ERROR] " + message);
    }
}

public class UserService {
    private Logger logger = new Logger();
    
    public Map<String, Object> getUser(int userId) {
        logger.log("Getting user " + userId);
        return Map.of("id", userId, "name", "John");
    }
    
    public Map<String, Object> createUser(String name, String email) {
        logger.log("Creating user " + name);
        return Map.of("id", 1, "name", name, "email", email);
    }
}
`,
          },
        ],
      };

    case 'context-extractor://examples/csharp':
      return {
        contents: [
          {
            uri,
            mimeType: 'text/x-csharp',
            text: `public class Logger
{
    public void Log(string message) => Console.WriteLine($"[LOG] {message}");
    public void Error(string message) => Console.WriteLine($"[ERROR] {message}");
}

public class UserService
{
    private readonly Logger _logger = new Logger();
    
    public Dictionary<string, object> GetUser(int userId)
    {
        _logger.Log($"Getting user {userId}");
        return new Dictionary<string, object> { {"id", userId}, {"name", "John"} };
    }
    
    public Dictionary<string, object> CreateUser(string name, string email)
    {
        _logger.Log($"Creating user {name}");
        return new Dictionary<string, object> { {"id", 1}, {"name", name}, {"email", email} };
    }
}
`,
          },
        ],
      };

    case 'context-extractor://docs/output-format':
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: `# Context Extractor Output Format

## JSON Format

The JSON output provides structured data about the extracted context:

\`\`\`json
{
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
      "isAsync": false,
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
  ],
  "depth": 0
}
\`\`\`

## Text Format (AI-Optimized)

The text format is designed for AI context enrichment:

\`\`\`
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
\`\`\`

## Usage Tips

1. Use \`json\` format for programmatic processing
2. Use \`text\` format for AI context injection
3. Use \`both\` when you need flexibility
4. Adjust \`maxDepth\` to control exploration depth (default: 3)
`,
          },
        ],
      };

    default:
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown resource: ${uri}`
      );
  }
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'analyze_codebase',
        description: 'Analyze a codebase to understand its structure and dependencies',
        arguments: [
          {
            name: 'language',
            description: 'Programming language (python, java, csharp)',
            required: true,
          },
          {
            name: 'entryClass',
            description: 'Main class or entry point to start analysis from',
            required: true,
          },
          {
            name: 'goal',
            description: 'What you want to accomplish (e.g., "add feature", "fix bug", "refactor")',
            required: false,
          },
        ],
      },
      {
        name: 'implement_feature',
        description: 'Get guidance on implementing a new feature with full context',
        arguments: [
          {
            name: 'language',
            description: 'Programming language (python, java, csharp)',
            required: true,
          },
          {
            name: 'serviceClass',
            description: 'Service class to add the feature to',
            required: true,
          },
          {
            name: 'featureDescription',
            description: 'Description of the feature to implement',
            required: true,
          },
        ],
      },
      {
        name: 'debug_issue',
        description: 'Debug an issue with full method context',
        arguments: [
          {
            name: 'language',
            description: 'Programming language (python, java, csharp)',
            required: true,
          },
          {
            name: 'className',
            description: 'Class where the issue occurs',
            required: true,
          },
          {
            name: 'issueDescription',
            description: 'Description of the bug or issue',
            required: true,
          },
        ],
      },
      {
        name: 'refactor_code',
        description: 'Get refactoring suggestions with dependency awareness',
        arguments: [
          {
            name: 'language',
            description: 'Programming language (python, java, csharp)',
            required: true,
          },
          {
            name: 'className',
            description: 'Class to refactor',
            required: true,
          },
          {
            name: 'refactorGoal',
            description: 'Goal of the refactoring (e.g., "improve testability", "reduce coupling")',
            required: false,
          },
        ],
      },
    ],
  };
});

// Get prompt content
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'analyze_codebase':
      return {
        description: 'Analyze codebase structure and dependencies',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I need to analyze a ${args?.language || 'unknown'} codebase, starting from the ${args?.entryClass || 'main'} class.

${args?.goal ? `My goal is to: ${args.goal}` : ''}

Please use the extract_context tool to:
1. Extract the method tree from ${args?.entryClass || 'the main class'}
2. Identify all dependencies and their methods
3. Map the data flow between components

Then provide:
- A summary of the class structure
- Key dependencies and their relationships
- Methods that are most relevant to my goal
- Potential areas of concern (tight coupling, missing abstractions, etc.)`,
            },
          },
        ],
      };

    case 'implement_feature':
      return {
        description: 'Implement a new feature with full context',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I need to implement a new feature in the ${args?.language || 'unknown'} ${args?.serviceClass || 'service'} class.

Feature: ${args?.featureDescription || 'Not specified'}

Please:
1. Use extract_context to understand the current structure of ${args?.serviceClass}
2. Analyze its dependencies and available methods
3. Suggest where to add the new functionality
4. Show me the method signatures I'll need to implement
5. Identify any existing methods I can reuse
6. Note any new dependencies that might be needed`,
            },
          },
        ],
      };

    case 'debug_issue':
      return {
        description: 'Debug an issue with full context',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I'm debugging an issue in the ${args?.language || 'unknown'} ${args?.className || 'class'}.

Issue: ${args?.issueDescription || 'Not specified'}

Please:
1. Use extract_context to get the full method tree of ${args?.className}
2. Trace potential code paths that could cause this issue
3. Identify dependencies that might be involved
4. Suggest debugging strategies based on the method signatures
5. Point out any methods that might have side effects`,
            },
          },
        ],
      };

    case 'refactor_code':
      return {
        description: 'Refactor code with dependency awareness',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to refactor the ${args?.language || 'unknown'} ${args?.className || 'class'}.

${args?.refactorGoal ? `Refactoring goal: ${args.refactorGoal}` : ''}

Please:
1. Use extract_context to understand current structure and dependencies
2. Identify code smells or architectural issues
3. Suggest refactoring strategies
4. Show how changes would affect dependent classes
5. Provide a step-by-step refactoring plan
6. Highlight any risks or breaking changes`,
            },
          },
        ],
      };

    default:
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown prompt: ${name}`
      );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Context Extractor MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
