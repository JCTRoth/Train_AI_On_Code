namespace ContextExtractor.Tests.Examples;

/// <summary>
/// Repository for user data access.
/// </summary>
public class UserRepository
{
    public DatabaseConnection Db { get; }
    public Logger Logger { get; }

    public UserRepository(DatabaseConnection db, Logger logger)
    {
        Db = db;
        Logger = logger;
    }

    public Dictionary<string, object> GetUserById(int userId)
    {
        return new Dictionary<string, object> { ["id"] = userId };
    }

    public bool SaveUser(Dictionary<string, object> userData)
    {
        return true;
    }

    public bool DeleteUser(int userId)
    {
        return true;
    }

    public List<Dictionary<string, object>> FindUsersByName(string name, int limit = 10)
    {
        return new List<Dictionary<string, object>>();
    }
}
