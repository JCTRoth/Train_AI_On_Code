using ContextExtractor.Cli.Models;
using ContextExtractor.Cli.Services;
using Xunit;

namespace ContextExtractor.Tests;

public sealed class ContextExtractionServiceTests
{
    private readonly CSharpExtractionService _service = new();

    [Fact]
    public async Task ExtractSource_ReturnsRuntimeGraph_ForSimpleClass()
    {
        const string source = """
            public class Logger
            {
                public void LogInfo(string message) { }
                public int Count(string message = "ok") => message.Length;
            }
            """;

        CliResponse response = await _service.ExecuteAsync(new CliRequest
        {
            Mode = "extract-source",
            SourceCode = source,
            ClassName = "Logger",
            MaxDepth = 3,
            OutputFormat = "both"
        });

        Assert.True(response.Success);
        Assert.Equal("runtime", response.ExtractionKind);
        Assert.NotNull(response.Data);
        Assert.Equal("Logger", response.Data!.Type);
        Assert.Contains(response.Data.Methods, method => method.Name == "LogInfo");
        Assert.Contains(response.Data.Methods, method => method.Name == "Count" && method.Parameters.Any(parameter => parameter.HasDefault));
        Assert.Contains("## Summary", response.TextOutput);
    }

    [Fact]
    public async Task ExtractFile_ReturnsLargeHierarchy_AndHandlesCycles()
    {
        string fixturePath = GetFixturePath("HugeHierarchy.cs");

        CliResponse response = await _service.ExecuteAsync(new CliRequest
        {
            Mode = "extract-file",
            FilePath = fixturePath,
            ClassName = "OrderService",
            MaxDepth = 4,
            OutputFormat = "json"
        });

        Assert.True(response.Success, response.Error);
        Assert.Equal("runtime", response.ExtractionKind);
        Assert.NotNull(response.Data);
        Assert.Equal("OrderService", response.Data!.Type);
        Assert.Contains(response.Data.Dependencies, dependency => dependency.Name == "Catalog");
        Assert.Contains(response.Data.Dependencies, dependency => dependency.Name == "PaymentProcessor");

        ObjectNode paymentProcessor = response.Data.Dependencies.First(dependency => dependency.Name == "PaymentProcessor");
        Assert.Contains(paymentProcessor.Dependencies, dependency => dependency.Name == "Owner");
        Assert.True(response.Data.CountTotalDependencies() < 40);
    }

    [Fact]
    public async Task ExtractSource_UsesTypeFallback_WhenInstantiationFails()
    {
        const string source = """
            public interface IClock
            {
                System.DateTime UtcNow();
            }

            public class NeedsClock
            {
                private readonly IClock _clock;

                public NeedsClock(IClock clock)
                {
                    _clock = clock;
                }

                public System.DateTime Read() => _clock.UtcNow();
            }
            """;

        CliResponse response = await _service.ExecuteAsync(new CliRequest
        {
            Mode = "extract-source",
            SourceCode = source,
            ClassName = "NeedsClock",
            MaxDepth = 2,
            OutputFormat = "json"
        });

        Assert.True(response.Success);
        Assert.Equal("type", response.ExtractionKind);
        Assert.NotNull(response.Data);
        Assert.Equal("NeedsClock", response.Data!.Type);
        Assert.Contains(response.Data.Methods, method => method.Name == "Read");
    }

    [Fact]
    public async Task AnalyzeFile_ReturnsStaticDependencyGraph()
    {
        string fixturePath = GetFixturePath("HugeHierarchy.cs");

        CliResponse response = await _service.ExecuteAsync(new CliRequest
        {
            Mode = "analyze-file",
            FilePath = fixturePath,
            ClassName = "OrderService",
            MaxDepth = 3,
            OutputFormat = "both"
        });

        Assert.True(response.Success, response.Error);
        Assert.Equal("static", response.ExtractionKind);
        Assert.NotNull(response.Data);
        Assert.Contains(response.Data!.Dependencies, dependency => dependency.Name == "Catalog");
        Assert.Contains(response.Data.Dependencies, dependency => dependency.Name == "PaymentProcessor");
        Assert.Contains("## Dependencies", response.TextOutput);
    }

    [Fact]
    public async Task ExtractSource_RespectsZeroDepth_WhileKeepingRootMethods()
    {
        string fixtureSource = await File.ReadAllTextAsync(GetFixturePath("HugeHierarchy.cs"));

        CliResponse response = await _service.ExecuteAsync(new CliRequest
        {
            Mode = "extract-source",
            SourceCode = fixtureSource,
            ClassName = "OrderService",
            MaxDepth = 0,
            OutputFormat = "json"
        });

        Assert.True(response.Success, response.Error);
        Assert.NotNull(response.Data);
        Assert.NotEmpty(response.Data!.Methods);
        Assert.Empty(response.Data.Dependencies);
    }

    [Fact]
    public async Task ExtractFile_ReturnsFailure_ForMissingFile()
    {
        CliResponse response = await _service.ExecuteAsync(new CliRequest
        {
            Mode = "extract-file",
            FilePath = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".cs"),
            ClassName = "Missing",
            MaxDepth = 2,
            OutputFormat = "json"
        });

        Assert.False(response.Success);
        Assert.Contains("File not found", response.Error);
    }

    private static string GetFixturePath(string fileName)
    {
        return Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName);
    }
}
