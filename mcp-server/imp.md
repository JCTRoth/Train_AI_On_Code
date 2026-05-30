# Context Extractor Reimplementation Spec

## Purpose

Extract hierarchical method and dependency context from C# code in a form that is easy for AI systems to consume. The extractor must support two complementary strategies:

- runtime extraction from compiled source, using reflection on instantiated objects when possible
- static analysis from source, using syntax inspection when instantiation is not possible or when callers explicitly request static analysis

## Required Behavior

The extractor accepts either source text or a file path plus a target class name. It returns a JSON object with:

- `success`
- `language`
- `executionTimeMs`
- `data` as the extracted object graph when successful
- `jsonOutput` and or `textOutput` depending on `outputFormat`
- `error` and optional `diagnostics` when extraction fails

## Object Graph Contract

Each extracted node represents one object or type and contains:

- `name`: the property, field, or root label
- `type`: the CLR type or declared class name
- `depth`: zero-based traversal depth
- `methods`: method signatures available on that node
- `properties`: declared properties for AI-readable structure
- `dependencies`: recursively discovered child nodes

Method metadata contains:

- `name`
- `returnType`
- `parameters`
- `isStatic`
- `isPublic`
- `isAsync`
- optional `docstring`

Parameter metadata contains:

- `name`
- `type`
- `hasDefault`
- optional `defaultValue`

Property metadata contains:

- `name`
- `type`
- `hasGetter`
- `hasSetter`

## Runtime Extraction Rules

1. Compile the supplied C# source in memory.
2. Load the resulting assembly.
3. Resolve the requested class by simple or fully qualified name.
4. Try to create an instance by preferring:
   - a public static parameterless factory such as `Create` or `CreateDefault`
   - a public parameterless constructor
   - a public constructor whose parameters can be created recursively from simple defaults or other resolvable types
5. If instantiation succeeds, walk the object graph recursively.
6. If instantiation fails, fall back to type-only extraction so callers still receive method and property context.

## Traversal Rules

- extract methods before deciding whether to recurse further
- stop recursion when `depth >= maxDepth`
- avoid infinite loops with visited object tracking
- ignore null values and non-explorable values such as primitives, strings, common scalar structs, delegates, and collections
- skip property getters that throw
- skip static fields during dependency traversal
- sort methods, properties, and dependencies deterministically by name

## Static Analysis Rules

- parse the source with Roslyn
- locate the requested class, or the first class if no class name is supplied
- extract methods, parameters, properties, static markers, and async markers from syntax
- infer dependencies only from reference-type fields and properties that point to other classes declared in the same source unit
- skip collections and primitive-like types for dependency inference

## Output Rules

- always return structured `data` on successful extraction
- generate camelCase JSON
- provide a readable text view with methods, properties, dependencies, and a root-level summary
- never mix logs with stdout JSON; diagnostics go into the JSON payload or stderr for malformed stdin

## Packaging Rules

- the MCP npm package must contain the `CSharp` source folder
- the TypeScript extractor must build the C# CLI on first use if needed and then invoke the compiled DLL
- the packaged server must work from an installed npm tarball, not only from the monorepo layout
