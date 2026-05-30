namespace ContextExtractor.Cli.Models;

public sealed class CliResponse
{
    public bool Success { get; set; }
    public string Language { get; set; } = "csharp";
    public long ExecutionTimeMs { get; set; }
    public ObjectNode? Data { get; set; }
    public string? JsonOutput { get; set; }
    public string? TextOutput { get; set; }
    public string? Error { get; set; }
    public List<string>? Diagnostics { get; set; }
    public string? ExtractionKind { get; set; }
}
