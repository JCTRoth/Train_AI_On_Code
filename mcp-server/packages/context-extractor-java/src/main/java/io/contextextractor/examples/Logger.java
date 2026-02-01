package io.contextextractor.examples;

/**
 * Simple logging utility for testing.
 */
public class Logger {
    public void logInfo(String message) {
        System.out.println("INFO: " + message);
    }
    
    public void logError(String message) {
        System.out.println("ERROR: " + message);
    }
    
    public void logDebug(String message, int level) {
        System.out.println("DEBUG[" + level + "]: " + message);
    }
}
