using System.Reflection;
using System.Runtime.CompilerServices;
using ContextExtractor.Cli.Models;

namespace ContextExtractor.Cli.Services;

public sealed class ReflectionExtractor
{
    private readonly bool _includePrivate;
    private readonly int _maxDepth;

    public ReflectionExtractor(int maxDepth, bool includePrivate)
    {
        _maxDepth = maxDepth;
        _includePrivate = includePrivate;
    }

    public ObjectNode ExploreObject(object instance, string name = "root")
    {
        ArgumentNullException.ThrowIfNull(instance);
        return ExploreObjectInternal(instance, name, new HashSet<int>(), 0);
    }

    public ObjectNode ExploreType(Type type, string name = "root")
    {
        ArgumentNullException.ThrowIfNull(type);
        return CreateNode(type, name, 0);
    }

    private ObjectNode ExploreObjectInternal(object instance, string name, HashSet<int> visited, int depth)
    {
        Type type = instance.GetType();
        ObjectNode node = CreateNode(type, name, depth);

        int objectId = RuntimeHelpers.GetHashCode(instance);
        if (visited.Contains(objectId) || depth >= _maxDepth)
        {
            return node;
        }

        visited.Add(objectId);

        foreach (PropertyInfo property in GetDependencyProperties(type))
        {
            try
            {
                object? value = property.GetValue(instance);
                if (!IsExplorableObject(value))
                {
                    continue;
                }

                node.Dependencies.Add(ExploreObjectInternal(value!, property.Name, new HashSet<int>(visited), depth + 1));
            }
            catch
            {
                // Ignore properties that cannot be read safely.
            }
        }

        foreach (FieldInfo field in GetDependencyFields(type))
        {
            try
            {
                object? value = field.GetValue(instance);
                if (!IsExplorableObject(value))
                {
                    continue;
                }

                node.Dependencies.Add(ExploreObjectInternal(value!, field.Name, new HashSet<int>(visited), depth + 1));
            }
            catch
            {
                // Ignore fields that cannot be read safely.
            }
        }

        node.Dependencies = node.Dependencies
            .OrderBy(dependency => dependency.Name, StringComparer.Ordinal)
            .ToList();

        return node;
    }

    private ObjectNode CreateNode(Type type, string name, int depth)
    {
        return new ObjectNode(name, TypeNameFormatter.Format(type), depth)
        {
            Methods = ExtractMethods(type),
            Properties = ExtractProperties(type)
        };
    }

    private List<MethodDescriptor> ExtractMethods(Type type)
    {
        BindingFlags bindingFlags = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public;
        if (_includePrivate)
        {
            bindingFlags |= BindingFlags.NonPublic;
        }

        return type.GetMethods(bindingFlags)
            .Where(method => method.DeclaringType != typeof(object))
            .Where(method => !method.IsSpecialName)
            .Select(BuildMethod)
            .OrderBy(method => method.Name, StringComparer.Ordinal)
            .ToList();
    }

    private static MethodDescriptor BuildMethod(System.Reflection.MethodInfo method)
    {
        return new MethodDescriptor
        {
            Name = method.Name,
            ReturnType = TypeNameFormatter.Format(method.ReturnType),
            Parameters = method.GetParameters().Select(BuildParameter).ToList(),
            IsStatic = method.IsStatic,
            IsPublic = method.IsPublic,
            IsAsync = IsAsyncMethod(method)
        };
    }

    private static ParameterDescriptor BuildParameter(System.Reflection.ParameterInfo parameter)
    {
        string? defaultValue = null;
        if (parameter.HasDefaultValue)
        {
            defaultValue = parameter.DefaultValue?.ToString() ?? "null";
        }

        return new ParameterDescriptor
        {
            Name = parameter.Name ?? $"arg{parameter.Position}",
            Type = TypeNameFormatter.Format(parameter.ParameterType),
            HasDefault = parameter.HasDefaultValue,
            DefaultValue = defaultValue
        };
    }

    private List<PropertyDescriptor> ExtractProperties(Type type)
    {
        BindingFlags bindingFlags = BindingFlags.Instance | BindingFlags.Public;
        if (_includePrivate)
        {
            bindingFlags |= BindingFlags.NonPublic;
        }

        return type.GetProperties(bindingFlags)
            .Where(property => property.GetIndexParameters().Length == 0)
            .Select(property => new PropertyDescriptor
            {
                Name = property.Name,
                Type = TypeNameFormatter.Format(property.PropertyType),
                HasGetter = property.GetMethod != null,
                HasSetter = property.SetMethod != null
            })
            .OrderBy(property => property.Name, StringComparer.Ordinal)
            .ToList();
    }

    private IEnumerable<PropertyInfo> GetDependencyProperties(Type type)
    {
        BindingFlags bindingFlags = BindingFlags.Instance | BindingFlags.Public;
        if (_includePrivate)
        {
            bindingFlags |= BindingFlags.NonPublic;
        }

        return type.GetProperties(bindingFlags)
            .Where(property => property.GetIndexParameters().Length == 0)
            .Where(property => property.GetMethod != null);
    }

    private IEnumerable<FieldInfo> GetDependencyFields(Type type)
    {
        BindingFlags bindingFlags = BindingFlags.Instance | BindingFlags.Public;
        if (_includePrivate)
        {
            bindingFlags |= BindingFlags.NonPublic;
        }

        return type.GetFields(bindingFlags)
            .Where(field => !field.IsStatic);
    }

    private static bool IsExplorableObject(object? value)
    {
        if (value == null)
        {
            return false;
        }

        if (value is string or DateTime or DateTimeOffset or TimeSpan or Guid or decimal or Uri or Delegate)
        {
            return false;
        }

        Type type = value.GetType();
        if (type.IsPrimitive || type.IsEnum)
        {
            return false;
        }

        if (value is System.Collections.IEnumerable)
        {
            return false;
        }

        return true;
    }

    private static bool IsAsyncMethod(System.Reflection.MethodInfo method)
    {
        Type returnType = method.ReturnType;
        return method.GetCustomAttribute<AsyncStateMachineAttribute>() != null
            || typeof(Task).IsAssignableFrom(returnType)
            || string.Equals(returnType.FullName, "System.Threading.Tasks.ValueTask", StringComparison.Ordinal)
            || (returnType.IsGenericType && string.Equals(returnType.GetGenericTypeDefinition().FullName, "System.Threading.Tasks.ValueTask`1", StringComparison.Ordinal));
    }
}
