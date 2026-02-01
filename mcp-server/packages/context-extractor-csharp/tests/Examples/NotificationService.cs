namespace ContextExtractor.Tests.Examples;

/// <summary>
/// Service for sending notifications.
/// </summary>
public class NotificationService
{
    public Logger Logger { get; }

    public NotificationService(Logger logger)
    {
        Logger = logger;
    }

    public bool SendEmail(string address, string subject, string content)
    {
        return true;
    }

    public bool SendSms(string number, string content)
    {
        return true;
    }

    public bool SendPush(string deviceToken, string title, string body)
    {
        return true;
    }
}
