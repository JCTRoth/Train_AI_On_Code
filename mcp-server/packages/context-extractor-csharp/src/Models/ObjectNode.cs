using System.Text;
using System.Text.Json;

namespace ContextExtractor.Models;

/// <summary>
/// Represents a node in the object hierarchy tree.
/// Contains information about an object's class, methods, and child dependencies.
/// </summary>
public class ObjectNode
{
    public string Name { get; set; }
    public string ClassName { get; set; }
    public List<MethodInfo> Methods { get; set; } = new();
    public List<ObjectNode> Children { get; set; } = new();
    public int Depth { get; set; }

    public ObjectNode(string name, string className, int depth = 0)
    {
        Name = name;
        ClassName = className;
        Depth = depth;
    }

    /// <summary>
    /// Count total methods in this node and all children.
    /// </summary>
    public int CountTotalMethods()
    {
        int count = Methods.Count;
        foreach (var child in Children)
        {
            count += child.CountTotalMethods();
        }
        return count;
    }

    /// <summary>
    /// Count total dependencies (children) recursively.
    /// </summary>
    public int CountTotalDependencies()
    {
        int count = Children.Count;
        foreach (var child in Children)
        {
            count += child.CountTotalDependencies();
        }
        return count;
    }

    /// <summary>
    /// Convert to JSON representation.
    /// </summary>
    public string ToJson(bool indented = true)
    {
        var options = new JsonSerializerOptions
        {
            WriteIndented = indented,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };
        return JsonSerializer.Serialize(ToDictionary(), options);
    }

    public Dictionary<string, object?> ToDictionary()
    {
        return new Dictionary<string, object?>
        {
            ["name"] = Name,
            ["class"] = ClassName,
            ["depth"] = Depth,
            ["methods"] = Methods.Select(m => m.ToDictionary()).ToList(),
            ["children"] = Children.Select(c => c.ToDictionary()).ToList()
        };
    }

    /// <summary>
    /// Convert to AI-optimized text representation.
    /// </summary>
    public string ToText(bool includeDetails = true)
    {
        var sb = new StringBuilder();
        BuildTextTree(sb, includeDetails, "");
        return sb.ToString();
    }

    private void BuildTextTree(StringBuilder sb, bool includeDetails, string prefix)
    {
        // Add header
        if (Depth == 0)
        {
            sb.AppendLine($"# {ClassName} Component Structure");
            sb.AppendLine();
            sb.AppendLine($"Root object: {Name} -> {ClassName}");
        }
        else
        {
            var arrow = Children.Count == 0 ? "└──" : "├──";
            sb.AppendLine($"{prefix}{arrow} {Name}: {ClassName}");
        }

        // Add methods
        if (Methods.Count > 0)
        {
            var methodPrefix = Depth > 0 ? prefix + "    " : "";
            if (Depth == 0)
            {
                sb.AppendLine();
                sb.AppendLine("## Methods");
            }
            foreach (var method in Methods)
            {
                sb.AppendLine($"{methodPrefix}  → .{method.GetSignature()}");
                if (includeDetails && !string.IsNullOrEmpty(method.Docstring))
                {
                    var firstLine = method.Docstring.Split('\n')[0].Trim();
                    sb.AppendLine($"{methodPrefix}      # {firstLine}");
                }
            }
        }

        // Add children
        if (Children.Count > 0)
        {
            if (Depth == 0)
            {
                sb.AppendLine();
                sb.AppendLine("## Dependencies");
            }
            for (int i = 0; i < Children.Count; i++)
            {
                var isLast = i == Children.Count - 1;
                var childPrefix = Depth > 0 ? prefix + (isLast ? "    " : "│   ") : "";
                Children[i].BuildTextTree(sb, includeDetails, childPrefix);
            }
        }

        // Add summary at root level
        if (Depth == 0)
        {
            sb.AppendLine();
            sb.AppendLine("## Summary");
            sb.AppendLine($"- Total methods: {CountTotalMethods()}");
            sb.AppendLine($"- Total dependencies: {CountTotalDependencies()}");
        }
    }
}
