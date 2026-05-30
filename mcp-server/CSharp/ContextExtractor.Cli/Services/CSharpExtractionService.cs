using System.Diagnostics;
using System.Reflection;
using ContextExtractor.Cli.Models;

namespace ContextExtractor.Cli.Services;

public sealed class CSharpExtractionService
{
    private readonly ObjectInstantiator _instantiator = new();
    private readonly SourceAnalyzer _sourceAnalyzer = new();
    private readonly SourceCompiler _sourceCompiler = new();

    public async Task<CliResponse> ExecuteAsync(CliRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var stopwatch = Stopwatch.StartNew();
        try
        {
            ValidateRequest(request);

            return request.Mode switch
            {
                "extract-source" => await ExtractFromSourceAsync(request, stopwatch),
                "extract-file" => await ExtractFromFileAsync(request, stopwatch),
                "analyze-source" => AnalyzeSource(request, stopwatch),
                "analyze-file" => AnalyzeFile(request, stopwatch),
                _ => BuildFailure($"Unsupported mode '{request.Mode}'.", stopwatch.ElapsedMilliseconds)
            };
        }
        catch (Exception exception)
        {
            return BuildFailure(exception.Message, stopwatch.ElapsedMilliseconds);
        }
    }

    private static void ValidateRequest(CliRequest request)
    {
        if (request.MaxDepth < 0)
        {
            throw new ArgumentException("maxDepth must be greater than or equal to zero.");
        }

        if (request.OutputFormat is not ("json" or "text" or "both"))
        {
            throw new ArgumentException("outputFormat must be one of: json, text, both.");
        }

        if (string.IsNullOrWhiteSpace(request.Mode))
        {
            throw new ArgumentException("mode is required.");
        }

        switch (request.Mode)
        {
            case "extract-source":
            case "analyze-source":
                if (string.IsNullOrWhiteSpace(request.SourceCode))
                {
                    throw new ArgumentException("sourceCode is required for source-based modes.");
                }
                break;
            case "extract-file":
            case "analyze-file":
                if (string.IsNullOrWhiteSpace(request.FilePath))
                {
                    throw new ArgumentException("filePath is required for file-based modes.");
                }
                break;
        }
    }

    private Task<CliResponse> ExtractFromSourceAsync(CliRequest request, Stopwatch stopwatch)
    {
        string sourceCode = request.SourceCode!;
        string className = request.ClassName ?? throw new ArgumentException("className is required for extract-source.");

        using SourceCompilationResult compiled = _sourceCompiler.Compile(sourceCode, request.FilePath);
        if (!compiled.Success || compiled.Assembly == null)
        {
            return Task.FromResult(BuildFailure(
                "Compilation failed.",
                stopwatch.ElapsedMilliseconds,
                compiled.Diagnostics.ToList()));
        }

        Type? targetType = ResolveType(compiled.Assembly, className);
        if (targetType == null)
        {
            return Task.FromResult(BuildFailure($"Class '{className}' was not found in the compiled source.", stopwatch.ElapsedMilliseconds));
        }

        var extractor = new ReflectionExtractor(request.MaxDepth, request.IncludePrivate);
        object? instance = _instantiator.TryCreateInstance(targetType);

        ObjectNode node = instance != null
            ? extractor.ExploreObject(instance, targetType.Name)
            : extractor.ExploreType(targetType, targetType.Name);

        return Task.FromResult(BuildSuccess(
            node,
            request.OutputFormat,
            stopwatch.ElapsedMilliseconds,
            instance != null ? "runtime" : "type"));
    }

    private async Task<CliResponse> ExtractFromFileAsync(CliRequest request, Stopwatch stopwatch)
    {
        string filePath = Path.GetFullPath(request.FilePath!);
        if (!File.Exists(filePath))
        {
            return BuildFailure($"File not found: {filePath}", stopwatch.ElapsedMilliseconds);
        }

        request.SourceCode = await File.ReadAllTextAsync(filePath);
        request.FilePath = filePath;
        request.Mode = "extract-source";
        return await ExtractFromSourceAsync(request, stopwatch);
    }

    private CliResponse AnalyzeSource(CliRequest request, Stopwatch stopwatch)
    {
        ObjectNode node = _sourceAnalyzer.Analyze(request.SourceCode!, request.ClassName, request.MaxDepth, request.FilePath);
        return BuildSuccess(node, request.OutputFormat, stopwatch.ElapsedMilliseconds, "static");
    }

    private CliResponse AnalyzeFile(CliRequest request, Stopwatch stopwatch)
    {
        string filePath = Path.GetFullPath(request.FilePath!);
        if (!File.Exists(filePath))
        {
            return BuildFailure($"File not found: {filePath}", stopwatch.ElapsedMilliseconds);
        }

        string sourceCode = File.ReadAllText(filePath);
        ObjectNode node = _sourceAnalyzer.Analyze(sourceCode, request.ClassName, request.MaxDepth, filePath);
        return BuildSuccess(node, request.OutputFormat, stopwatch.ElapsedMilliseconds, "static");
    }

    private static Type? ResolveType(Assembly assembly, string className)
    {
        return assembly.GetType(className, false)
            ?? assembly.GetTypes().FirstOrDefault(type =>
                string.Equals(type.Name, className, StringComparison.Ordinal)
                || string.Equals(type.FullName, className, StringComparison.Ordinal));
    }

    private static CliResponse BuildSuccess(ObjectNode node, string outputFormat, long executionTimeMs, string extractionKind)
    {
        return new CliResponse
        {
            Success = true,
            Data = node,
            JsonOutput = outputFormat is "json" or "both" ? node.ToJson() : null,
            TextOutput = outputFormat is "text" or "both" ? node.ToText() : null,
            ExecutionTimeMs = executionTimeMs,
            ExtractionKind = extractionKind
        };
    }

    private static CliResponse BuildFailure(string error, long executionTimeMs, List<string>? diagnostics = null)
    {
        return new CliResponse
        {
            Success = false,
            Error = error,
            ExecutionTimeMs = executionTimeMs,
            Diagnostics = diagnostics
        };
    }
}
