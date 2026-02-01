namespace ContextExtractor.Models;

/// <summary>
/// Represents a method parameter with its metadata.
/// </summary>
public class ParameterInfo
{
    public string Name { get; set; }
    public string TypeName { get; set; }
    public string? DefaultValue { get; set; }

    public ParameterInfo(string name, string typeName, string? defaultValue = null)
    {
        Name = name;
        TypeName = typeName ?? "object";
        DefaultValue = defaultValue;
    }

    public bool HasDefaultValue => DefaultValue != null;

    public override string ToString()
    {
        if (DefaultValue != null)
        {
            return $"{Name}: {TypeName} = {DefaultValue}";
        }
        return $"{Name}: {TypeName}";
    }

    public Dictionary<string, object?> ToDictionary()
    {
        var dict = new Dictionary<string, object?>
        {
            ["name"] = Name,
            ["type"] = TypeName
        };
        if (DefaultValue != null)
        {
            dict["default"] = DefaultValue;
        }
        return dict;
    }
}
