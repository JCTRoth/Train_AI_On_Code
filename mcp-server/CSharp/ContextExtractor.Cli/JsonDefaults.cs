using System.Text.Json;
using System.Text.Json.Serialization;

namespace ContextExtractor.Cli;

internal static class JsonDefaults
{
    public static JsonSerializerOptions Create(bool indented)
    {
        return new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            WriteIndented = indented
        };
    }
}
