namespace ContextExtractor.Tests.Examples;

/// <summary>
/// Simple logging utility for testing.
/// </summary>
public class Logger
{
    public void LogInfo(string message)
    {
        Console.WriteLine($"INFO: {message}");
    }

    public void LogError(string message)
    {
        Console.WriteLine($"ERROR: {message}");
    }

    public void LogDebug(string message, int level = 1)
    {
        Console.WriteLine($"DEBUG[{level}]: {message}");
    }
}
