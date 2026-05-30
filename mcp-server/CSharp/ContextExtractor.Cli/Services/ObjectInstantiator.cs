using System.Reflection;

namespace ContextExtractor.Cli.Services;

public sealed class ObjectInstantiator
{
    private static readonly string[] PreferredFactoryNames = { "Create", "CreateDefault", "CreateSample", "Build" };

    public object? TryCreateInstance(Type type)
    {
        return TryCreateInstance(type, new HashSet<Type>(), 0);
    }

    private object? TryCreateInstance(Type type, HashSet<Type> stack, int depth)
    {
        if (depth > 8)
        {
            return null;
        }

        if (TryCreateSimpleValue(type, out object? simpleValue))
        {
            return simpleValue;
        }

        if (!stack.Add(type))
        {
            return null;
        }

        try
        {
            if (type.IsAbstract || type.IsInterface || type.ContainsGenericParameters)
            {
                return null;
            }

            MethodInfo? factory = FindFactory(type);
            if (factory != null)
            {
                return factory.Invoke(null, null);
            }

            ConstructorInfo? parameterlessConstructor = type.GetConstructor(Type.EmptyTypes);
            if (parameterlessConstructor != null)
            {
                return Activator.CreateInstance(type);
            }

            foreach (ConstructorInfo constructor in type.GetConstructors().OrderByDescending(item => item.GetParameters().Length))
            {
                ParameterInfo[] parameters = constructor.GetParameters();
                var values = new object?[parameters.Length];
                bool canCreate = true;
                for (int index = 0; index < parameters.Length; index++)
                {
                    if (!TryCreateParameter(parameters[index].ParameterType, stack, depth + 1, out object? value))
                    {
                        canCreate = false;
                        break;
                    }

                    values[index] = value;
                }

                if (canCreate)
                {
                    return constructor.Invoke(values);
                }
            }

            return null;
        }
        finally
        {
            stack.Remove(type);
        }
    }

    private static MethodInfo? FindFactory(Type type)
    {
        foreach (string name in PreferredFactoryNames)
        {
            MethodInfo? method = type.GetMethod(name, BindingFlags.Public | BindingFlags.Static, Array.Empty<Type>());
            if (method != null && type.IsAssignableFrom(method.ReturnType))
            {
                return method;
            }
        }

        return null;
    }

    private bool TryCreateParameter(Type type, HashSet<Type> stack, int depth, out object? value)
    {
        if (TryCreateSimpleValue(type, out value))
        {
            return true;
        }

        value = TryCreateInstance(type, stack, depth);
        return value != null;
    }

    private static bool TryCreateSimpleValue(Type type, out object? value)
    {
        if (type == typeof(string))
        {
            value = string.Empty;
            return true;
        }

        if (type == typeof(bool))
        {
            value = false;
            return true;
        }

        if (type == typeof(byte) || type == typeof(short) || type == typeof(int) || type == typeof(long))
        {
            value = Activator.CreateInstance(type);
            return true;
        }

        if (type == typeof(float) || type == typeof(double) || type == typeof(decimal))
        {
            value = Activator.CreateInstance(type);
            return true;
        }

        if (type == typeof(Guid))
        {
            value = Guid.Empty;
            return true;
        }

        if (type == typeof(DateTime))
        {
            value = DateTime.UnixEpoch;
            return true;
        }

        if (type == typeof(DateTimeOffset))
        {
            value = DateTimeOffset.UnixEpoch;
            return true;
        }

        if (type == typeof(TimeSpan))
        {
            value = TimeSpan.Zero;
            return true;
        }

        if (type.IsEnum)
        {
            Array values = Enum.GetValues(type);
            value = values.Length > 0 ? values.GetValue(0) : Activator.CreateInstance(type);
            return true;
        }

        if (type.IsArray)
        {
            value = Array.CreateInstance(type.GetElementType()!, 0);
            return true;
        }

        if (type.IsGenericType)
        {
            Type genericType = type.GetGenericTypeDefinition();
            Type[] genericArguments = type.GetGenericArguments();
            if (genericType == typeof(Nullable<>))
            {
                value = null;
                return true;
            }

            if (genericType == typeof(List<>))
            {
                value = Activator.CreateInstance(type);
                return true;
            }

            if (genericType == typeof(Dictionary<,>))
            {
                value = Activator.CreateInstance(type);
                return true;
            }

            if (genericType == typeof(IEnumerable<>))
            {
                Type arrayType = genericArguments[0].MakeArrayType();
                value = Array.CreateInstance(genericArguments[0], 0);
                value = Convert.ChangeType(value, arrayType);
                return true;
            }
        }

        value = null;
        return false;
    }
}
