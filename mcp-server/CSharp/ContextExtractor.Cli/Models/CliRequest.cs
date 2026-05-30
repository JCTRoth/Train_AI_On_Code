namespace ContextExtractor.Cli.Models;

public sealed class CliRequest
{
    public string Mode { get; set; } = string.Empty;
    public string? SourceCode { get; set; }
    public string? FilePath { get; set; }
    public string? ClassName { get; set; }
    public int MaxDepth { get; set; } = 3;
    public string OutputFormat { get; set; } = "both";
    public bool IncludePrivate { get; set; }
}
