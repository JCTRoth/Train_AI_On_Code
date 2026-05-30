using System.Text;
using System.Text.Json;

namespace ContextExtractor.Cli.Models;

public sealed class ObjectNode
{
    public ObjectNode(string name, string type, int depth)
    {
        Name = name;
        Type = type;
        Depth = depth;
    }

    public string Name { get; set; }
    public string Type { get; set; }
    public int Depth { get; set; }
    public List<MethodDescriptor> Methods { get; set; } = new();
    public List<PropertyDescriptor> Properties { get; set; } = new();
    public List<ObjectNode> Dependencies { get; set; } = new();

    public int CountTotalMethods()
    {
        int count = Methods.Count;
        foreach (ObjectNode dependency in Dependencies)
        {
            count += dependency.CountTotalMethods();
        }

        return count;
    }

    public int CountTotalDependencies()
    {
        int count = Dependencies.Count;
        foreach (ObjectNode dependency in Dependencies)
        {
            count += dependency.CountTotalDependencies();
        }

        return count;
    }

    public string ToJson(bool indented = true)
    {
        return JsonSerializer.Serialize(this, JsonDefaults.Create(indented));
    }

    public string ToText(bool includeDetails = true)
    {
        var builder = new StringBuilder();
        BuildText(builder, includeDetails, string.Empty, true);
        return builder.ToString();
    }

    private void BuildText(StringBuilder builder, bool includeDetails, string prefix, bool isLast)
    {
        if (Depth == 0)
        {
            builder.AppendLine($"# {Type} Component Structure");
            builder.AppendLine();
            builder.AppendLine($"Root object: {Name} -> {Type}");
        }
        else
        {
            string branch = isLast ? "└──" : "├──";
            builder.AppendLine($"{prefix}{branch} {Name}: {Type}");
        }

        string childPrefix = Depth == 0 ? string.Empty : prefix + (isLast ? "    " : "│   ");

        if (Methods.Count > 0)
        {
            if (Depth == 0)
            {
                builder.AppendLine();
                builder.AppendLine("## Methods");
            }

            foreach (MethodDescriptor method in Methods)
            {
                builder.AppendLine($"{childPrefix}  → .{method.GetSignature()}");
                if (includeDetails && !string.IsNullOrWhiteSpace(method.Docstring))
                {
                    builder.AppendLine($"{childPrefix}      # {method.Docstring.Trim()}");
                }
            }
        }

        if (Properties.Count > 0)
        {
            if (Depth == 0)
            {
                builder.AppendLine();
                builder.AppendLine("## Properties");
            }

            foreach (PropertyDescriptor property in Properties)
            {
                string accessors = property.HasGetter && property.HasSetter
                    ? "get/set"
                    : property.HasGetter
                        ? "get"
                        : property.HasSetter
                            ? "set"
                            : "none";
                builder.AppendLine($"{childPrefix}  • {property.Name}: {property.Type} ({accessors})");
            }
        }

        if (Dependencies.Count > 0)
        {
            if (Depth == 0)
            {
                builder.AppendLine();
                builder.AppendLine("## Dependencies");
            }

            for (int index = 0; index < Dependencies.Count; index++)
            {
                Dependencies[index].BuildText(builder, includeDetails, childPrefix, index == Dependencies.Count - 1);
            }
        }

        if (Depth == 0)
        {
            builder.AppendLine();
            builder.AppendLine("## Summary");
            builder.AppendLine($"- Total methods: {CountTotalMethods()}");
            builder.AppendLine($"- Total dependencies: {CountTotalDependencies()}");
        }
    }
}
