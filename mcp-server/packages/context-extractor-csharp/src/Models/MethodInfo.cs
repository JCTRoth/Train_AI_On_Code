namespace ContextExtractor.Models;

/// <summary>
/// Represents a method with its signature, parameters, and documentation.
/// </summary>
public class MethodInfo
{
    public string Name { get; set; }
    public List<ParameterInfo> Parameters { get; set; } = new();
    public string ReturnType { get; set; } = "void";
    public string? Docstring { get; set; }
    public bool IsStatic { get; set; }
    public bool IsPublic { get; set; } = true;

    public MethodInfo(string name)
    {
        Name = name;
    }

    /// <summary>
    /// Get the method signature as a formatted string.
    /// </summary>
    public string GetSignature()
    {
        var paramsStr = string.Join(", ", Parameters.Select(p => p.ToString()));
        return $"{Name}({paramsStr}) -> {ReturnType}";
    }

    public override string ToString() => GetSignature();

    public Dictionary<string, object?> ToDictionary()
    {
        return new Dictionary<string, object?>
        {
            ["name"] = Name,
            ["parameters"] = Parameters.Select(p => p.ToDictionary()).ToList(),
            ["returnType"] = ReturnType,
            ["docstring"] = Docstring,
            ["isStatic"] = IsStatic,
            ["isPublic"] = IsPublic
        };
    }
}
