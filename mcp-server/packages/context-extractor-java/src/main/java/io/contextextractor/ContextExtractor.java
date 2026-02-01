package io.contextextractor;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Parameter;
import java.util.*;
import java.util.logging.Logger;

/**
 * Context Extractor - Extracts method trees from objects using Java Reflection.
 * 
 * This class analyzes objects and their fields recursively, building
 * a structured representation of available methods that can be used to
 * enrich AI context for better code completion suggestions.
 */
public class ContextExtractor {
    private static final Logger logger = Logger.getLogger(ContextExtractor.class.getName());
    
    private final String outputDir;
    private final int maxDepth;
    private final boolean includePrivate;

    /**
     * Create a ContextExtractor with default settings.
     */
    public ContextExtractor() {
        this("generated_context", 10, false);
    }

    /**
     * Create a ContextExtractor with custom settings.
     * 
     * @param outputDir Directory for generated files
     * @param maxDepth Maximum depth for recursive exploration
     * @param includePrivate Whether to include private methods
     */
    public ContextExtractor(String outputDir, int maxDepth, boolean includePrivate) {
        this.outputDir = outputDir;
        this.maxDepth = maxDepth;
        this.includePrivate = includePrivate;
        
        // Create output directory if it doesn't exist
        File dir = new File(outputDir);
        if (!dir.exists()) {
            dir.mkdirs();
            logger.info("Created output directory: " + outputDir);
        }
    }

    /**
     * Extract methods from a class.
     * 
     * @param clazz The class to analyze
     * @return List of MethodInfo objects
     */
    public List<MethodInfo> extractMethods(Class<?> clazz) {
        List<MethodInfo> methods = new ArrayList<>();
        
        for (Method method : clazz.getDeclaredMethods()) {
            // Skip synthetic and bridge methods
            if (method.isSynthetic() || method.isBridge()) {
                continue;
            }
            
            // Check visibility
            int modifiers = method.getModifiers();
            if (!includePrivate && !Modifier.isPublic(modifiers)) {
                continue;
            }
            
            MethodInfo methodInfo = analyzeMethod(method);
            methods.add(methodInfo);
        }
        
        // Sort methods by name for consistent output
        methods.sort(Comparator.comparing(MethodInfo::getName));
        
        return methods;
    }

    /**
     * Extract methods from an object instance.
     * 
     * @param obj The object to analyze
     * @return List of MethodInfo objects
     */
    public List<MethodInfo> extractMethods(Object obj) {
        return extractMethods(obj.getClass());
    }

    /**
     * Analyze a single method and extract its information.
     */
    private MethodInfo analyzeMethod(Method method) {
        String name = method.getName();
        
        // Extract parameters
        List<ParameterInfo> parameters = new ArrayList<>();
        for (Parameter param : method.getParameters()) {
            String paramName = param.getName();
            String typeName = getTypeName(param.getType());
            parameters.add(new ParameterInfo(paramName, typeName));
        }
        
        // Get return type
        String returnType = getTypeName(method.getReturnType());
        
        // Check modifiers
        int modifiers = method.getModifiers();
        boolean isStatic = Modifier.isStatic(modifiers);
        boolean isPublic = Modifier.isPublic(modifiers);
        
        return MethodInfo.builder(name)
                .parameters(parameters)
                .returnType(returnType)
                .isStatic(isStatic)
                .isPublic(isPublic)
                .build();
    }

    /**
     * Get a clean type name for a class.
     */
    private String getTypeName(Class<?> type) {
        if (type.isArray()) {
            return getTypeName(type.getComponentType()) + "[]";
        }
        
        String name = type.getSimpleName();
        if (name.isEmpty()) {
            name = type.getName();
            int lastDot = name.lastIndexOf('.');
            if (lastDot >= 0) {
                name = name.substring(lastDot + 1);
            }
        }
        return name;
    }

    /**
     * Explore an object and build its hierarchy tree.
     * 
     * @param obj The object to explore
     * @return ObjectNode representing the hierarchy
     */
    public ObjectNode exploreObject(Object obj) {
        return exploreObject(obj, "root", new HashSet<>(), 0);
    }

    /**
     * Explore an object with a custom root name.
     * 
     * @param obj The object to explore
     * @param name Name for the root node
     * @return ObjectNode representing the hierarchy
     */
    public ObjectNode exploreObject(Object obj, String name) {
        return exploreObject(obj, name, new HashSet<>(), 0);
    }

    /**
     * Recursively explore an object.
     */
    private ObjectNode exploreObject(Object obj, String name, Set<Integer> visited, int depth) {
        Class<?> clazz = obj.getClass();
        String className = clazz.getSimpleName();
        
        ObjectNode.Builder nodeBuilder = ObjectNode.builder(name, className)
                .depth(depth);
        
        // Check for cycles or max depth
        int objId = System.identityHashCode(obj);
        if (visited.contains(objId) || depth >= maxDepth) {
            return nodeBuilder.build();
        }
        
        visited.add(objId);
        
        // Extract methods
        List<MethodInfo> methods = extractMethods(obj);
        nodeBuilder.methods(methods);
        
        // Explore fields (sub-objects)
        for (Field field : clazz.getDeclaredFields()) {
            // Skip static fields
            if (Modifier.isStatic(field.getModifiers())) {
                continue;
            }
            
            // Skip private fields if not including private
            if (!includePrivate && !Modifier.isPublic(field.getModifiers())) {
                field.setAccessible(true); // Still try to access for dependency analysis
            }
            
            try {
                field.setAccessible(true);
                Object fieldValue = field.get(obj);
                
                if (fieldValue != null && isExplorableObject(fieldValue)) {
                    Set<Integer> visitedCopy = new HashSet<>(visited);
                    ObjectNode childNode = exploreObject(fieldValue, field.getName(), visitedCopy, depth + 1);
                    nodeBuilder.addChild(childNode);
                }
            } catch (IllegalAccessException e) {
                logger.fine("Could not access field: " + field.getName());
            }
        }
        
        return nodeBuilder.build();
    }

    /**
     * Determine if an object should be explored recursively.
     */
    private boolean isExplorableObject(Object obj) {
        if (obj == null) {
            return false;
        }
        
        Class<?> clazz = obj.getClass();
        
        // Skip primitives and wrappers
        if (clazz.isPrimitive()) {
            return false;
        }
        
        // Skip common types
        if (obj instanceof String || obj instanceof Number || obj instanceof Boolean ||
            obj instanceof Character || obj instanceof Enum) {
            return false;
        }
        
        // Skip collections (could be extended to explore their contents)
        if (obj instanceof Collection || obj instanceof Map) {
            return false;
        }
        
        // Skip arrays of primitives
        if (clazz.isArray() && clazz.getComponentType().isPrimitive()) {
            return false;
        }
        
        return true;
    }

    /**
     * Explore a class (without instantiation).
     * 
     * @param clazz The class to analyze
     * @return ObjectNode representing the class structure
     */
    public ObjectNode exploreClass(Class<?> clazz) {
        String className = clazz.getSimpleName();
        
        ObjectNode.Builder nodeBuilder = ObjectNode.builder(className, className)
                .depth(0);
        
        // Extract methods
        List<MethodInfo> methods = extractMethods(clazz);
        nodeBuilder.methods(methods);
        
        return nodeBuilder.build();
    }

    /**
     * Save object hierarchy as JSON file.
     * 
     * @param obj The object to analyze
     * @return Path to the saved file
     */
    public String saveAsJson(Object obj) throws IOException {
        return saveAsJson(obj, null);
    }

    /**
     * Save object hierarchy as JSON file with custom filename.
     * 
     * @param obj The object to analyze
     * @param filename Custom filename (null for auto-generated)
     * @return Path to the saved file
     */
    public String saveAsJson(Object obj, String filename) throws IOException {
        if (filename == null) {
            long timestamp = System.currentTimeMillis() / 1000;
            String className = obj.getClass().getSimpleName().toLowerCase();
            filename = className + "_" + timestamp + ".json";
        }
        
        String filepath = outputDir + File.separator + filename;
        
        ObjectNode rootNode = exploreObject(obj);
        
        try (FileWriter writer = new FileWriter(filepath)) {
            writer.write(rootNode.toJson());
        }
        
        logger.info("Saved JSON context to: " + filepath);
        return filepath;
    }

    /**
     * Save object hierarchy as AI-optimized text file.
     * 
     * @param obj The object to analyze
     * @return Path to the saved file
     */
    public String saveAsText(Object obj) throws IOException {
        return saveAsText(obj, null);
    }

    /**
     * Save object hierarchy as AI-optimized text file with custom filename.
     * 
     * @param obj The object to analyze
     * @param filename Custom filename (null for auto-generated)
     * @return Path to the saved file
     */
    public String saveAsText(Object obj, String filename) throws IOException {
        if (filename == null) {
            long timestamp = System.currentTimeMillis() / 1000;
            String className = obj.getClass().getSimpleName().toLowerCase();
            filename = className + "_" + timestamp + ".txt";
        }
        
        String filepath = outputDir + File.separator + filename;
        
        ObjectNode rootNode = exploreObject(obj);
        
        try (FileWriter writer = new FileWriter(filepath)) {
            writer.write(rootNode.toText());
        }
        
        logger.info("Saved text context to: " + filepath);
        return filepath;
    }

    /**
     * Get the output directory.
     */
    public String getOutputDir() {
        return outputDir;
    }

    /**
     * Get the maximum exploration depth.
     */
    public int getMaxDepth() {
        return maxDepth;
    }
}
