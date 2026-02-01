package io.contextextractor;

import io.contextextractor.examples.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for the ContextExtractor Java implementation.
 */
class ContextExtractorTest {
    
    @TempDir
    Path tempDir;
    
    private ContextExtractor extractor;
    
    @BeforeEach
    void setUp() {
        extractor = new ContextExtractor(tempDir.toString(), 10, false);
    }
    
    @Test
    void testExtractMethodsFromSimpleClass() {
        Logger logger = new Logger();
        List<MethodInfo> methods = extractor.extractMethods(logger);
        
        List<String> methodNames = methods.stream()
                .map(MethodInfo::getName)
                .toList();
        
        assertTrue(methodNames.contains("logInfo"));
        assertTrue(methodNames.contains("logError"));
        assertTrue(methodNames.contains("logDebug"));
    }
    
    @Test
    void testExtractMethodParameters() {
        DatabaseConnection db = new DatabaseConnection();
        List<MethodInfo> methods = extractor.extractMethods(db);
        
        MethodInfo connectMethod = methods.stream()
                .filter(m -> m.getName().equals("connect"))
                .findFirst()
                .orElseThrow();
        
        List<String> paramNames = connectMethod.getParameters().stream()
                .map(ParameterInfo::getName)
                .toList();
        
        assertEquals(2, paramNames.size());
    }
    
    @Test
    void testExtractMethodReturnType() {
        Logger logger = new Logger();
        List<MethodInfo> methods = extractor.extractMethods(logger);
        
        MethodInfo logInfoMethod = methods.stream()
                .filter(m -> m.getName().equals("logInfo"))
                .findFirst()
                .orElseThrow();
        
        assertEquals("void", logInfoMethod.getReturnType());
    }
    
    @Test
    void testExploreObjectHierarchy() {
        UserService userService = UserService.create();
        ObjectNode node = extractor.exploreObject(userService);
        
        assertEquals("UserService", node.getClassName());
        assertTrue(node.getMethods().size() > 0);
        assertTrue(node.getChildren().size() > 0);
        
        // Check that children include expected dependencies
        List<String> childNames = node.getChildren().stream()
                .map(ObjectNode::getName)
                .toList();
        
        assertTrue(childNames.contains("repository"));
        assertTrue(childNames.contains("notifier"));
        assertTrue(childNames.contains("logger"));
    }
    
    @Test
    void testExploreNestedDependencies() {
        UserService userService = UserService.create();
        ObjectNode node = extractor.exploreObject(userService);
        
        // Find the repository child
        ObjectNode repoNode = node.getChildren().stream()
                .filter(c -> c.getName().equals("repository"))
                .findFirst()
                .orElseThrow();
        
        // Repository should have db and logger as children
        List<String> repoChildNames = repoNode.getChildren().stream()
                .map(ObjectNode::getName)
                .toList();
        
        assertTrue(repoChildNames.contains("db"));
        assertTrue(repoChildNames.contains("logger"));
    }
    
    @Test
    void testObjectNodeToJson() {
        Logger logger = new Logger();
        ObjectNode node = extractor.exploreObject(logger);
        
        String json = node.toJson();
        
        assertTrue(json.contains("\"name\""));
        assertTrue(json.contains("\"class\""));
        assertTrue(json.contains("Logger"));
    }
    
    @Test
    void testObjectNodeToText() {
        UserService userService = UserService.create();
        ObjectNode node = extractor.exploreObject(userService);
        
        String text = node.toText();
        
        assertTrue(text.contains("UserService"));
        assertTrue(text.contains("## Methods"));
        assertTrue(text.contains("## Dependencies"));
        assertTrue(text.contains("## Summary"));
    }
    
    @Test
    void testCountTotalMethods() {
        UserService userService = UserService.create();
        ObjectNode node = extractor.exploreObject(userService);
        
        int totalMethods = node.countTotalMethods();
        
        // Should count methods from UserService, UserRepository, NotificationService, Logger, etc.
        assertTrue(totalMethods > 10);
    }
    
    @Test
    void testSaveAsJson() throws IOException {
        Logger logger = new Logger();
        String filepath = extractor.saveAsJson(logger, "test_logger.json");
        
        File file = new File(filepath);
        assertTrue(file.exists());
        
        String content = Files.readString(file.toPath());
        assertTrue(content.contains("Logger"));
        assertTrue(content.contains("logInfo"));
    }
    
    @Test
    void testSaveAsText() throws IOException {
        UserService userService = UserService.create();
        String filepath = extractor.saveAsText(userService, "test_userservice.txt");
        
        File file = new File(filepath);
        assertTrue(file.exists());
        
        String content = Files.readString(file.toPath());
        assertTrue(content.contains("UserService"));
        assertTrue(content.contains("registerUser"));
        assertTrue(content.contains("repository"));
    }
    
    @Test
    void testExploreClass() {
        ObjectNode node = extractor.exploreClass(UserService.class);
        
        assertEquals("UserService", node.getClassName());
        assertTrue(node.getMethods().size() > 0);
        
        List<String> methodNames = node.getMethods().stream()
                .map(MethodInfo::getName)
                .toList();
        
        assertTrue(methodNames.contains("registerUser"));
        assertTrue(methodNames.contains("authenticate"));
    }
}
