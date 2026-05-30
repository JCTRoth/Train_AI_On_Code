using System.Runtime.Loader;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;

namespace ContextExtractor.Cli.Services;

public sealed class SourceCompiler
{
    private static readonly IReadOnlyList<MetadataReference> MetadataReferences = LoadMetadataReferences();

    public SourceCompilationResult Compile(string sourceCode, string? pathHint = null)
    {
        SyntaxTree syntaxTree = CSharpSyntaxTree.ParseText(sourceCode, path: pathHint ?? "Source.cs");
        var compilation = CSharpCompilation.Create(
            assemblyName: $"ContextExtractor.Dynamic.{Guid.NewGuid():N}",
            syntaxTrees: new[] { syntaxTree },
            references: MetadataReferences,
            options: new CSharpCompilationOptions(
                OutputKind.DynamicallyLinkedLibrary,
                optimizationLevel: OptimizationLevel.Release,
                nullableContextOptions: NullableContextOptions.Enable));

        using var assemblyStream = new MemoryStream();

        EmitResult result = compilation.Emit(assemblyStream);
        if (!result.Success)
        {
            return SourceCompilationResult.Failure(
                result.Diagnostics
                    .Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
                    .Select(diagnostic => diagnostic.ToString())
                    .ToList());
        }

        assemblyStream.Position = 0;
        var loadContext = new CollectibleAssemblyLoadContext();
        var loadedAssembly = loadContext.LoadFromStream(assemblyStream);
        return SourceCompilationResult.SuccessResult(loadedAssembly, loadContext);
    }

    private static IReadOnlyList<MetadataReference> LoadMetadataReferences()
    {
        string? trustedAssemblies = AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string;
        if (string.IsNullOrWhiteSpace(trustedAssemblies))
        {
            throw new InvalidOperationException("Unable to locate trusted platform assemblies for Roslyn compilation.");
        }

        return trustedAssemblies
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(path => MetadataReference.CreateFromFile(path))
            .ToList();
    }

    private sealed class CollectibleAssemblyLoadContext : AssemblyLoadContext
    {
        public CollectibleAssemblyLoadContext()
            : base(isCollectible: true)
        {
        }
    }
}

public sealed class SourceCompilationResult : IDisposable
{
    private SourceCompilationResult(bool success, List<string> diagnostics, AssemblyLoadContext? loadContext, System.Reflection.Assembly? assembly)
    {
        Success = success;
        Diagnostics = diagnostics;
        LoadContext = loadContext;
        Assembly = assembly;
    }

    public bool Success { get; }
    public List<string> Diagnostics { get; }
    public AssemblyLoadContext? LoadContext { get; }
    public System.Reflection.Assembly? Assembly { get; }

    public static SourceCompilationResult Failure(List<string> diagnostics)
    {
        return new SourceCompilationResult(false, diagnostics, null, null);
    }

    public static SourceCompilationResult SuccessResult(System.Reflection.Assembly assembly, AssemblyLoadContext loadContext)
    {
        return new SourceCompilationResult(true, new List<string>(), loadContext, assembly);
    }

    public void Dispose()
    {
        LoadContext?.Unload();
    }
}
