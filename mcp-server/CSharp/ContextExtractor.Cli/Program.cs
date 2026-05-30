using System.Text.Json;
using ContextExtractor.Cli.Models;
using ContextExtractor.Cli.Services;

namespace ContextExtractor.Cli;

public static class Program
{
    public static async Task<int> Main()
    {
        string payload = await Console.In.ReadToEndAsync();
        if (string.IsNullOrWhiteSpace(payload))
        {
            Console.Error.WriteLine("Expected a JSON request on stdin.");
            return 1;
        }

        CliRequest? request;
        try
        {
            request = JsonSerializer.Deserialize<CliRequest>(payload, JsonDefaults.Create(false));
        }
        catch (JsonException exception)
        {
            Console.Error.WriteLine($"Invalid JSON request: {exception.Message}");
            return 1;
        }

        if (request == null)
        {
            Console.Error.WriteLine("Failed to deserialize the JSON request.");
            return 1;
        }

        var service = new CSharpExtractionService();
        CliResponse response = await service.ExecuteAsync(request);
        Console.Out.Write(JsonSerializer.Serialize(response, JsonDefaults.Create(false)));
        return response.Success ? 0 : 0;
    }
}
