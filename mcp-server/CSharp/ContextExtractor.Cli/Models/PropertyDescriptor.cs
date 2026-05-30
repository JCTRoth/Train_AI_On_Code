namespace ContextExtractor.Cli.Models;

public sealed class PropertyDescriptor
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = "object";
    public bool HasGetter { get; set; }
    public bool HasSetter { get; set; }
}
