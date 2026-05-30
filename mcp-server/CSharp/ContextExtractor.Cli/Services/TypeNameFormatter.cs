namespace ContextExtractor.Cli.Services;

public static class TypeNameFormatter
{
    public static string Format(Type type)
    {
        if (type.IsByRef)
        {
            return Format(type.GetElementType()!);
        }

        Type? nullableType = Nullable.GetUnderlyingType(type);
        if (nullableType != null)
        {
            return $"{Format(nullableType)}?";
        }

        if (type.IsArray)
        {
            return $"{Format(type.GetElementType()!)}[]";
        }

        if (type.IsGenericType)
        {
            string genericName = type.Name;
            int tickIndex = genericName.IndexOf('`');
            if (tickIndex >= 0)
            {
                genericName = genericName[..tickIndex];
            }

            string genericArguments = string.Join(", ", type.GetGenericArguments().Select(Format));
            return $"{genericName}<{genericArguments}>";
        }

        return type.Name switch
        {
            "Void" => "void",
            "Boolean" => "bool",
            "Byte" => "byte",
            "Int16" => "short",
            "Int32" => "int",
            "Int64" => "long",
            "Single" => "float",
            "Double" => "double",
            "Decimal" => "decimal",
            "String" => "string",
            "Object" => "object",
            _ => type.Name
        };
    }
}