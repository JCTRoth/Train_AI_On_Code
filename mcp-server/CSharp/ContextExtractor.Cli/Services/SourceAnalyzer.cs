using ContextExtractor.Cli.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace ContextExtractor.Cli.Services;

public sealed class SourceAnalyzer
{
    public ObjectNode Analyze(string sourceCode, string? className, int maxDepth, string? pathHint = null)
    {
        SyntaxTree tree = CSharpSyntaxTree.ParseText(sourceCode, path: pathHint ?? "Source.cs");
        CompilationUnitSyntax root = tree.GetCompilationUnitRoot();
        List<ClassDeclarationSyntax> classes = root.DescendantNodes().OfType<ClassDeclarationSyntax>().ToList();
        if (classes.Count == 0)
        {
            throw new InvalidOperationException("No class declarations were found in the supplied source.");
        }

        var classMap = classes
            .GroupBy(item => item.Identifier.ValueText, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);

        ClassDeclarationSyntax target = ResolveTargetClass(classes, classMap, className);
        return AnalyzeClass(target, target.Identifier.ValueText, classMap, new HashSet<string>(StringComparer.Ordinal), 0, maxDepth);
    }

    private static ClassDeclarationSyntax ResolveTargetClass(
        List<ClassDeclarationSyntax> classes,
        IReadOnlyDictionary<string, ClassDeclarationSyntax> classMap,
        string? className)
    {
        if (!string.IsNullOrWhiteSpace(className))
        {
            if (classMap.TryGetValue(className, out ClassDeclarationSyntax? directMatch))
            {
                return directMatch;
            }

            ClassDeclarationSyntax? qualifiedMatch = classes.FirstOrDefault(item =>
                string.Equals(GetQualifiedName(item), className, StringComparison.Ordinal));
            if (qualifiedMatch != null)
            {
                return qualifiedMatch;
            }

            throw new InvalidOperationException($"Class '{className}' was not found in the supplied source.");
        }

        return classes[0];
    }

    private static string GetQualifiedName(ClassDeclarationSyntax classDeclaration)
    {
        var parts = new Stack<string>();
        parts.Push(classDeclaration.Identifier.ValueText);

        SyntaxNode? current = classDeclaration.Parent;
        while (current != null)
        {
            switch (current)
            {
                case NamespaceDeclarationSyntax namespaceDeclaration:
                    parts.Push(namespaceDeclaration.Name.ToString());
                    break;
                case FileScopedNamespaceDeclarationSyntax fileScopedNamespace:
                    parts.Push(fileScopedNamespace.Name.ToString());
                    break;
            }

            current = current.Parent;
        }

        return string.Join('.', parts);
    }

    private ObjectNode AnalyzeClass(
        ClassDeclarationSyntax classDeclaration,
        string nodeName,
        IReadOnlyDictionary<string, ClassDeclarationSyntax> classMap,
        HashSet<string> visited,
        int depth,
        int maxDepth)
    {
        string typeName = classDeclaration.Identifier.ValueText;
        var node = new ObjectNode(nodeName, typeName, depth)
        {
            Methods = classDeclaration.Members
                .OfType<MethodDeclarationSyntax>()
                .Select(BuildMethod)
                .OrderBy(method => method.Name, StringComparer.Ordinal)
                .ToList(),
            Properties = classDeclaration.Members
                .OfType<PropertyDeclarationSyntax>()
                .Select(BuildProperty)
                .OrderBy(property => property.Name, StringComparer.Ordinal)
                .ToList()
        };

        if (depth >= maxDepth || !visited.Add(typeName))
        {
            return node;
        }

        foreach ((string dependencyName, string dependencyType) in GetDependencyCandidates(classDeclaration))
        {
            if (!classMap.TryGetValue(dependencyType, out ClassDeclarationSyntax? dependencyClass))
            {
                continue;
            }

            node.Dependencies.Add(
                AnalyzeClass(
                    dependencyClass,
                    dependencyName,
                    classMap,
                    new HashSet<string>(visited, StringComparer.Ordinal),
                    depth + 1,
                    maxDepth));
        }

        node.Dependencies = node.Dependencies
            .OrderBy(dependency => dependency.Name, StringComparer.Ordinal)
            .ToList();

        return node;
    }

    private static MethodDescriptor BuildMethod(MethodDeclarationSyntax method)
    {
        return new MethodDescriptor
        {
            Name = method.Identifier.ValueText,
            ReturnType = method.ReturnType.ToString(),
            Parameters = method.ParameterList.Parameters.Select(BuildParameter).ToList(),
            IsStatic = method.Modifiers.Any(modifier => modifier.IsKind(SyntaxKind.StaticKeyword)),
            IsPublic = method.Modifiers.Any(modifier => modifier.IsKind(SyntaxKind.PublicKeyword)),
            IsAsync = method.Modifiers.Any(modifier => modifier.IsKind(SyntaxKind.AsyncKeyword)),
            Docstring = TryExtractDocComment(method)
        };
    }

    private static ParameterDescriptor BuildParameter(ParameterSyntax parameter)
    {
        EqualsValueClauseSyntax? defaultValue = parameter.Default;
        return new ParameterDescriptor
        {
            Name = parameter.Identifier.ValueText,
            Type = parameter.Type?.ToString() ?? "object",
            HasDefault = defaultValue != null,
            DefaultValue = defaultValue?.Value.ToString()
        };
    }

    private static PropertyDescriptor BuildProperty(PropertyDeclarationSyntax property)
    {
        AccessorListSyntax? accessorList = property.AccessorList;
        return new PropertyDescriptor
        {
            Name = property.Identifier.ValueText,
            Type = property.Type.ToString(),
            HasGetter = accessorList?.Accessors.Any(accessor => accessor.IsKind(SyntaxKind.GetAccessorDeclaration)) == true,
            HasSetter = accessorList?.Accessors.Any(accessor => accessor.IsKind(SyntaxKind.SetAccessorDeclaration) || accessor.IsKind(SyntaxKind.InitAccessorDeclaration)) == true
        };
    }

    private static string? TryExtractDocComment(MemberDeclarationSyntax member)
    {
        SyntaxTrivia trivia = member.GetLeadingTrivia()
            .FirstOrDefault(item => item.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia) || item.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia));
        string value = trivia.ToFullString().Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static IEnumerable<(string Name, string Type)> GetDependencyCandidates(ClassDeclarationSyntax classDeclaration)
    {
        foreach (PropertyDeclarationSyntax property in classDeclaration.Members.OfType<PropertyDeclarationSyntax>())
        {
            string? propertyType = GetDependencyTypeName(property.Type);
            if (propertyType != null)
            {
                yield return (property.Identifier.ValueText, propertyType);
            }
        }

        foreach (FieldDeclarationSyntax field in classDeclaration.Members.OfType<FieldDeclarationSyntax>())
        {
            string? fieldType = GetDependencyTypeName(field.Declaration.Type);
            if (fieldType == null)
            {
                continue;
            }

            foreach (VariableDeclaratorSyntax variable in field.Declaration.Variables)
            {
                yield return (variable.Identifier.ValueText, fieldType);
            }
        }
    }

    private static string? GetDependencyTypeName(TypeSyntax typeSyntax)
    {
        switch (typeSyntax)
        {
            case PredefinedTypeSyntax:
                return null;
            case ArrayTypeSyntax:
                return null;
            case NullableTypeSyntax nullableType:
                return GetDependencyTypeName(nullableType.ElementType);
            case QualifiedNameSyntax qualifiedName:
                return qualifiedName.Right.Identifier.ValueText;
            case IdentifierNameSyntax identifierName:
                return IsKnownNonExplorable(identifierName.Identifier.ValueText) ? null : identifierName.Identifier.ValueText;
            case GenericNameSyntax genericName:
                return IsKnownCollection(genericName.Identifier.ValueText) ? null : genericName.Identifier.ValueText;
            default:
                string rawText = typeSyntax.ToString();
                return IsKnownNonExplorable(rawText) ? null : rawText;
        }
    }

    private static bool IsKnownCollection(string typeName)
    {
        return typeName is "IEnumerable" or "ICollection" or "IList" or "IReadOnlyCollection" or "IReadOnlyList" or "IDictionary" or "IReadOnlyDictionary" or "List" or "Dictionary" or "HashSet" or "Queue" or "Stack";
    }

    private static bool IsKnownNonExplorable(string typeName)
    {
        return typeName is "bool" or "byte" or "short" or "int" or "long" or "float" or "double" or "decimal" or "string" or "Guid" or "DateTime" or "DateTimeOffset" or "TimeSpan";
    }
}
