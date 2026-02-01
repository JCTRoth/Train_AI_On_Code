package io.contextextractor.examples;

import java.util.List;
import java.util.ArrayList;

/**
 * Manages database connections.
 */
public class DatabaseConnection {
    public boolean connect(String host, int port) {
        return true;
    }
    
    public void disconnect() {
    }
    
    public List<Object> executeQuery(String query, List<Object> params) {
        return new ArrayList<>();
    }
}
