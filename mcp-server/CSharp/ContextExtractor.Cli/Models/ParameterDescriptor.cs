namespace ContextExtractor.Cli.Models;

public sealed class ParameterDescriptor
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = "object";
    public bool HasDefault { get; set; }
    public string? DefaultValue { get; set; }

    public string ToSignaturePart()
    {
        if (HasDefault)
        {
            return $"{Name}: {Type} = {DefaultValue}";
        }

        return $"{Name}: {Type}";
    }
}
