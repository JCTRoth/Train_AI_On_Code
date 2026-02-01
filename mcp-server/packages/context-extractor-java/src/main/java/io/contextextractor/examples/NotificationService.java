package io.contextextractor.examples;

/**
 * Service for sending notifications.
 */
public class NotificationService {
    private final Logger logger;
    
    public NotificationService(Logger logger) {
        this.logger = logger;
    }
    
    public boolean sendEmail(String address, String subject, String content) {
        return true;
    }
    
    public boolean sendSms(String number, String content) {
        return true;
    }
    
    public boolean sendPush(String deviceToken, String title, String body) {
        return true;
    }
    
    public Logger getLogger() {
        return logger;
    }
}
