namespace ContextExtractor.Cli.Models;

public sealed class MethodDescriptor
{
    public string Name { get; set; } = string.Empty;
    public string ReturnType { get; set; } = "void";
    public List<ParameterDescriptor> Parameters { get; set; } = new();
    public bool IsStatic { get; set; }
    public bool IsPublic { get; set; }
    public bool IsAsync { get; set; }
    public string? Docstring { get; set; }

    public string GetSignature()
    {
        string parameterList = string.Join(", ", Parameters.Select(parameter => parameter.ToSignaturePart()));
        return $"{Name}({parameterList}) -> {ReturnType}";
    }
}
