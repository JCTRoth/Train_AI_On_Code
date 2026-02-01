using System.Reflection;
using System.Runtime.CompilerServices;
using ContextExtractor.Models;
using MethodInfo = ContextExtractor.Models.MethodInfo;
using ParameterInfo = ContextExtractor.Models.ParameterInfo;

namespace ContextExtractor;

/// <summary>
/// Context Extractor - Extracts method trees from objects using .NET Reflection.
/// 
/// This class analyzes objects and their properties/fields recursively, building
/// a structured representation of available methods that can be used to
/// enrich AI context for better code completion suggestions.
/// </summary>
public class ContextExtractorService
{
    private readonly string _outputDir;
    private readonly int _maxDepth;
    private readonly bool _includePrivate;

    /// <summary>
    /// Create a ContextExtractor with default settings.
    /// </summary>
    public ContextExtractorService() : this("generated_context", 10, false)
    {
    }

    /// <summary>
    /// Create a ContextExtractor with custom settings.
    /// </summary>
    /// <param name="outputDir">Directory for generated files</param>
    /// <param name="maxDepth">Maximum depth for recursive exploration</param>
    /// <param name="includePrivate">Whether to include private methods</param>
    public ContextExtractorService(string outputDir, int maxDepth, bool includePrivate)
    {
        _outputDir = outputDir;
        _maxDepth = maxDepth;
        _includePrivate = includePrivate;

        // Create output directory if it doesn't exist
        if (!Directory.Exists(outputDir))
        {
            Directory.CreateDirectory(outputDir);
            Console.WriteLine($"Created output directory: {outputDir}");
        }
    }

    /// <summary>
    /// Extract methods from a type.
    /// </summary>
    /// <param name="type">The type to analyze</param>
    /// <returns>List of MethodInfo objects</returns>
    public List<MethodInfo> ExtractMethods(Type type)
    {
        var methods = new List<MethodInfo>();
        var bindingFlags = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public;
        
        if (_includePrivate)
        {
            bindingFlags |= BindingFlags.NonPublic;
        }

        foreach (var method in type.GetMethods(bindingFlags))
        {
            // Skip inherited Object methods
            if (method.DeclaringType == typeof(object))
                continue;

            // Skip property accessors
            if (method.IsSpecialName)
                continue;

            var methodInfo = AnalyzeMethod(method);
            methods.Add(methodInfo);
        }

        // Sort methods by name
        methods.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.Ordinal));

        return methods;
    }

    /// <summary>
    /// Extract methods from an object instance.
    /// </summary>
    /// <param name="obj">The object to analyze</param>
    /// <returns>List of MethodInfo objects</returns>
    public List<MethodInfo> ExtractMethods(object obj)
    {
        return ExtractMethods(obj.GetType());
    }

    /// <summary>
    /// Analyze a single method and extract its information.
    /// </summary>
    private MethodInfo AnalyzeMethod(System.Reflection.MethodInfo method)
    {
        var methodInfo = new MethodInfo(method.Name)
        {
            ReturnType = GetTypeName(method.ReturnType),
            IsStatic = method.IsStatic,
            IsPublic = method.IsPublic
        };

        // Extract parameters
        foreach (var param in method.GetParameters())
        {
            var paramInfo = new ParameterInfo(
                param.Name ?? $"arg{param.Position}",
                GetTypeName(param.ParameterType),
                param.HasDefaultValue ? param.DefaultValue?.ToString() : null
            );
            methodInfo.Parameters.Add(paramInfo);
        }

        // Try to get XML documentation (if available via attributes or comments)
        var descAttr = method.GetCustomAttribute<System.ComponentModel.DescriptionAttribute>();
        if (descAttr != null)
        {
            methodInfo.Docstring = descAttr.Description;
        }

        return methodInfo;
    }

    /// <summary>
    /// Get a clean type name.
    /// </summary>
    private string GetTypeName(Type type)
    {
        if (type.IsGenericType)
        {
            var genericTypeName = type.GetGenericTypeDefinition().Name;
            genericTypeName = genericTypeName[..genericTypeName.IndexOf('`')];
            var genericArgs = string.Join(", ", type.GetGenericArguments().Select(GetTypeName));
            return $"{genericTypeName}<{genericArgs}>";
        }

        if (type.IsArray)
        {
            return $"{GetTypeName(type.GetElementType()!)}[]";
        }

        // Map common types to readable names
        return type.Name switch
        {
            "Void" => "void",
            "Int32" => "int",
            "Int64" => "long",
            "String" => "string",
            "Boolean" => "bool",
            "Double" => "double",
            "Single" => "float",
            "Object" => "object",
            _ => type.Name
        };
    }

    /// <summary>
    /// Explore an object and build its hierarchy tree.
    /// </summary>
    /// <param name="obj">The object to explore</param>
    /// <returns>ObjectNode representing the hierarchy</returns>
    public ObjectNode ExploreObject(object obj)
    {
        return ExploreObject(obj, "root", new HashSet<int>(), 0);
    }

    /// <summary>
    /// Explore an object with a custom root name.
    /// </summary>
    /// <param name="obj">The object to explore</param>
    /// <param name="name">Name for the root node</param>
    /// <returns>ObjectNode representing the hierarchy</returns>
    public ObjectNode ExploreObject(object obj, string name)
    {
        return ExploreObject(obj, name, new HashSet<int>(), 0);
    }

    /// <summary>
    /// Recursively explore an object.
    /// </summary>
    private ObjectNode ExploreObject(object obj, string name, HashSet<int> visited, int depth)
    {
        var type = obj.GetType();
        var className = type.Name;
        
        var node = new ObjectNode(name, className, depth);

        // Check for cycles or max depth
        var objId = RuntimeHelpers.GetHashCode(obj);
        if (visited.Contains(objId) || depth >= _maxDepth)
        {
            return node;
        }

        visited.Add(objId);

        // Extract methods
        node.Methods = ExtractMethods(obj);

        // Explore properties and fields
        var bindingFlags = BindingFlags.Instance | BindingFlags.Public;
        if (_includePrivate)
        {
            bindingFlags |= BindingFlags.NonPublic;
        }

        // Explore properties
        foreach (var property in type.GetProperties(bindingFlags))
        {
            try
            {
                var value = property.GetValue(obj);
                if (value != null && IsExplorableObject(value))
                {
                    var visitedCopy = new HashSet<int>(visited);
                    var childNode = ExploreObject(value, property.Name, visitedCopy, depth + 1);
                    node.Children.Add(childNode);
                }
            }
            catch
            {
                // Skip properties that throw exceptions
            }
        }

        // Explore fields
        foreach (var field in type.GetFields(bindingFlags))
        {
            if (field.IsStatic)
                continue;

            try
            {
                var value = field.GetValue(obj);
                if (value != null && IsExplorableObject(value))
                {
                    var visitedCopy = new HashSet<int>(visited);
                    var childNode = ExploreObject(value, field.Name, visitedCopy, depth + 1);
                    node.Children.Add(childNode);
                }
            }
            catch
            {
                // Skip fields that throw exceptions
            }
        }

        return node;
    }

    /// <summary>
    /// Determine if an object should be explored recursively.
    /// </summary>
    private bool IsExplorableObject(object obj)
    {
        if (obj == null)
            return false;

        var type = obj.GetType();

        // Skip primitives
        if (type.IsPrimitive)
            return false;

        // Skip common types
        if (obj is string or DateTime or TimeSpan or Guid or Enum)
            return false;

        // Skip collections (could be extended to explore their contents)
        if (obj is System.Collections.IEnumerable and not string)
            return false;

        return true;
    }

    /// <summary>
    /// Explore a type (without instantiation).
    /// </summary>
    /// <param name="type">The type to analyze</param>
    /// <returns>ObjectNode representing the type structure</returns>
    public ObjectNode ExploreType(Type type)
    {
        var className = type.Name;
        var node = new ObjectNode(className, className, 0)
        {
            Methods = ExtractMethods(type)
        };
        return node;
    }

    /// <summary>
    /// Save object hierarchy as JSON file.
    /// </summary>
    /// <param name="obj">The object to analyze</param>
    /// <param name="filename">Custom filename (null for auto-generated)</param>
    /// <returns>Path to the saved file</returns>
    public string SaveAsJson(object obj, string? filename = null)
    {
        filename ??= $"{obj.GetType().Name.ToLower()}_{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}.json";

        var filepath = Path.Combine(_outputDir, filename);

        var rootNode = ExploreObject(obj);

        File.WriteAllText(filepath, rootNode.ToJson());

        Console.WriteLine($"Saved JSON context to: {filepath}");
        return filepath;
    }

    /// <summary>
    /// Save object hierarchy as AI-optimized text file.
    /// </summary>
    /// <param name="obj">The object to analyze</param>
    /// <param name="filename">Custom filename (null for auto-generated)</param>
    /// <returns>Path to the saved file</returns>
    public string SaveAsText(object obj, string? filename = null)
    {
        filename ??= $"{obj.GetType().Name.ToLower()}_{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}.txt";

        var filepath = Path.Combine(_outputDir, filename);

        var rootNode = ExploreObject(obj);

        File.WriteAllText(filepath, rootNode.ToText());

        Console.WriteLine($"Saved text context to: {filepath}");
        return filepath;
    }

    public string OutputDir => _outputDir;
    public int MaxDepth => _maxDepth;
}
