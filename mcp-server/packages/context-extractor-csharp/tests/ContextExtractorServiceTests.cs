using ContextExtractor.Tests.Examples;
using Xunit;
using MethodInfo = ContextExtractor.Models.MethodInfo;

namespace ContextExtractor.Tests;

/// <summary>
/// Tests for the ContextExtractor C# implementation.
/// </summary>
public class ContextExtractorServiceTests : IDisposable
{
    private readonly string _tempDir;
    private readonly ContextExtractorService _extractor;

    public ContextExtractorServiceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempDir);
        _extractor = new ContextExtractorService(_tempDir, 10, false);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, true);
        }
    }

    [Fact]
    public void ExtractMethods_FromSimpleClass_ReturnsExpectedMethods()
    {
        var logger = new Logger();
        var methods = _extractor.ExtractMethods(logger);

        var methodNames = methods.Select(m => m.Name).ToList();

        Assert.Contains("LogInfo", methodNames);
        Assert.Contains("LogError", methodNames);
        Assert.Contains("LogDebug", methodNames);
    }

    [Fact]
    public void ExtractMethods_WithParameters_CapturesParameterInfo()
    {
        var db = new DatabaseConnection();
        var methods = _extractor.ExtractMethods(db);

        var connectMethod = methods.FirstOrDefault(m => m.Name == "Connect");
        Assert.NotNull(connectMethod);
        Assert.Equal(2, connectMethod.Parameters.Count);
    }

    [Fact]
    public void ExtractMethods_ReturnsCorrectReturnType()
    {
        var logger = new Logger();
        var methods = _extractor.ExtractMethods(logger);

        var logInfoMethod = methods.FirstOrDefault(m => m.Name == "LogInfo");
        Assert.NotNull(logInfoMethod);
        Assert.Equal("void", logInfoMethod.ReturnType);
    }

    [Fact]
    public void ExploreObject_ReturnsHierarchy()
    {
        var userService = UserService.Create();
        var node = _extractor.ExploreObject(userService);

        Assert.Equal("UserService", node.ClassName);
        Assert.True(node.Methods.Count > 0);
        Assert.True(node.Children.Count > 0);

        var childNames = node.Children.Select(c => c.Name).ToList();
        Assert.Contains("Repository", childNames);
        Assert.Contains("Notifier", childNames);
        Assert.Contains("Logger", childNames);
    }

    [Fact]
    public void ExploreObject_ExploresNestedDependencies()
    {
        var userService = UserService.Create();
        var node = _extractor.ExploreObject(userService);

        var repoNode = node.Children.FirstOrDefault(c => c.Name == "Repository");
        Assert.NotNull(repoNode);

        var repoChildNames = repoNode.Children.Select(c => c.Name).ToList();
        Assert.Contains("Db", repoChildNames);
        Assert.Contains("Logger", repoChildNames);
    }

    [Fact]
    public void ObjectNode_ToJson_ProducesValidJson()
    {
        var logger = new Logger();
        var node = _extractor.ExploreObject(logger);

        var json = node.ToJson();

        Assert.Contains("\"name\"", json);
        Assert.Contains("\"class\"", json);
        Assert.Contains("Logger", json);
    }

    [Fact]
    public void ObjectNode_ToText_ProducesStructuredOutput()
    {
        var userService = UserService.Create();
        var node = _extractor.ExploreObject(userService);

        var text = node.ToText();

        Assert.Contains("UserService", text);
        Assert.Contains("## Methods", text);
        Assert.Contains("## Dependencies", text);
        Assert.Contains("## Summary", text);
    }

    [Fact]
    public void CountTotalMethods_IncludesAllChildren()
    {
        var userService = UserService.Create();
        var node = _extractor.ExploreObject(userService);

        var totalMethods = node.CountTotalMethods();

        // Should count methods from UserService, UserRepository, NotificationService, Logger, etc.
        Assert.True(totalMethods > 10);
    }

    [Fact]
    public void SaveAsJson_CreatesFile()
    {
        var logger = new Logger();
        var filepath = _extractor.SaveAsJson(logger, "test_logger.json");

        Assert.True(File.Exists(filepath));

        var content = File.ReadAllText(filepath);
        Assert.Contains("Logger", content);
        Assert.Contains("LogInfo", content);
    }

    [Fact]
    public void SaveAsText_CreatesFile()
    {
        var userService = UserService.Create();
        var filepath = _extractor.SaveAsText(userService, "test_userservice.txt");

        Assert.True(File.Exists(filepath));

        var content = File.ReadAllText(filepath);
        Assert.Contains("UserService", content);
        Assert.Contains("RegisterUser", content);
        Assert.Contains("Repository", content);
    }

    [Fact]
    public void ExploreType_ExtractsMethodsWithoutInstance()
    {
        var node = _extractor.ExploreType(typeof(UserService));

        Assert.Equal("UserService", node.ClassName);
        Assert.True(node.Methods.Count > 0);

        var methodNames = node.Methods.Select(m => m.Name).ToList();
        Assert.Contains("RegisterUser", methodNames);
        Assert.Contains("Authenticate", methodNames);
    }
}
