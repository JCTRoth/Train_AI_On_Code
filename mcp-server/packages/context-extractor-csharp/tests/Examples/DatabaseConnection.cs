namespace ContextExtractor.Tests.Examples;

/// <summary>
/// Manages database connections.
/// </summary>
public class DatabaseConnection
{
    public bool Connect(string host = "localhost", int port = 5432)
    {
        return true;
    }

    public void Disconnect()
    {
    }

    public List<object> ExecuteQuery(string query, List<object>? parameters = null)
    {
        return new List<object>();
    }
}
