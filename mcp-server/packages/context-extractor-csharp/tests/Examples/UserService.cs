namespace ContextExtractor.Tests.Examples;

/// <summary>
/// Business logic layer for user operations.
/// </summary>
public class UserService
{
    public UserRepository Repository { get; }
    public NotificationService Notifier { get; }
    public Logger Logger { get; }

    public UserService(UserRepository repository, NotificationService notifier, Logger logger)
    {
        Repository = repository;
        Notifier = notifier;
        Logger = logger;
    }

    public Dictionary<string, object> RegisterUser(string username, string email, string password)
    {
        return new Dictionary<string, object>
        {
            ["username"] = username,
            ["email"] = email
        };
    }

    public bool Authenticate(string username, string password)
    {
        return true;
    }

    public bool UpdateProfile(int userId, Dictionary<string, object> data)
    {
        return true;
    }

    public bool ResetPassword(string email)
    {
        return true;
    }

    public bool DeactivateAccount(int userId, string? reason = null)
    {
        return true;
    }

    /// <summary>
    /// Factory method to create a fully wired UserService.
    /// </summary>
    public static UserService Create()
    {
        var logger = new Logger();
        var db = new DatabaseConnection();
        var repo = new UserRepository(db, logger);
        var notifier = new NotificationService(logger);
        return new UserService(repo, notifier, logger);
    }
}
