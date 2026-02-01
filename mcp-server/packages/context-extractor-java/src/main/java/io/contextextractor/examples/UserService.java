package io.contextextractor.examples;

import java.util.Map;

/**
 * Business logic layer for user operations.
 */
public class UserService {
    private final UserRepository repository;
    private final NotificationService notifier;
    private final Logger logger;
    
    public UserService(UserRepository repository, NotificationService notifier, Logger logger) {
        this.repository = repository;
        this.notifier = notifier;
        this.logger = logger;
    }
    
    public Map<String, Object> registerUser(String username, String email, String password) {
        return Map.of("username", username, "email", email);
    }
    
    public boolean authenticate(String username, String password) {
        return true;
    }
    
    public boolean updateProfile(int userId, Map<String, Object> data) {
        return true;
    }
    
    public boolean resetPassword(String email) {
        return true;
    }
    
    public boolean deactivateAccount(int userId, String reason) {
        return true;
    }
    
    // Getters for dependency exploration
    public UserRepository getRepository() {
        return repository;
    }
    
    public NotificationService getNotifier() {
        return notifier;
    }
    
    public Logger getLogger() {
        return logger;
    }
    
    /**
     * Factory method to create a fully wired UserService.
     */
    public static UserService create() {
        Logger logger = new Logger();
        DatabaseConnection db = new DatabaseConnection();
        UserRepository repo = new UserRepository(db, logger);
        NotificationService notifier = new NotificationService(logger);
        return new UserService(repo, notifier, logger);
    }
}
