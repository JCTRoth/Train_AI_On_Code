package io.contextextractor.examples;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;

/**
 * Repository for user data access.
 */
public class UserRepository {
    private final DatabaseConnection db;
    private final Logger logger;
    
    public UserRepository(DatabaseConnection db, Logger logger) {
        this.db = db;
        this.logger = logger;
    }
    
    public Map<String, Object> getUserById(int userId) {
        return Map.of("id", userId);
    }
    
    public boolean saveUser(Map<String, Object> userData) {
        return true;
    }
    
    public boolean deleteUser(int userId) {
        return true;
    }
    
    public List<Map<String, Object>> findUsersByName(String name, int limit) {
        return new ArrayList<>();
    }
    
    // Getters for testing dependency exploration
    public DatabaseConnection getDb() {
        return db;
    }
    
    public Logger getLogger() {
        return logger;
    }
}
