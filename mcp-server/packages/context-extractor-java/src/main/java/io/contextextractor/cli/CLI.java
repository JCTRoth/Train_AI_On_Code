package io.contextextractor.cli;

import io.contextextractor.ContextExtractor;
import io.contextextractor.ObjectNode;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.lang.reflect.Constructor;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Command-line interface for the Context Extractor.
 * 
 * Usage:
 *   java -jar context-extractor.jar <class-name> [options]
 * 
 * Options:
 *   --depth <n>      Maximum exploration depth (default: 3)
 *   --format <type>  Output format: text, json, compact (default: text)
 *   --output <file>  Output file (default: stdout)
 *   --classpath <cp> Additional classpath entries
 *   --help           Show this help message
 */
public class CLI {
    
    private static final String BANNER = """
            
            ╔═══════════════════════════════════════════════════════════╗
            ║       Context Extractor for Java - AI Context Generator    ║
            ╚═══════════════════════════════════════════════════════════╝
            """;
    
    private int maxDepth = 3;
    private String format = "text";
    private String outputFile = null;
    private String className = null;
    private List<String> classpath = new ArrayList<>();
    private boolean verbose = false;
    private boolean showBanner = true;
    
    public static void main(String[] args) {
        CLI cli = new CLI();
        int exitCode = cli.run(args);
        System.exit(exitCode);
    }
    
    public int run(String[] args) {
        try {
            parseArguments(args);
            
            if (className == null) {
                printHelp();
                return 1;
            }
            
            if (showBanner) {
                System.out.println(BANNER);
            }
            
            return execute();
        } catch (IllegalArgumentException e) {
            System.err.println("✗ Error: " + e.getMessage());
            return 1;
        } catch (Exception e) {
            System.err.println("✗ Unexpected error: " + e.getMessage());
            if (verbose) {
                e.printStackTrace();
            }
            return 1;
        }
    }
    
    private void parseArguments(String[] args) {
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            
            switch (arg) {
                case "--help", "-h" -> {
                    printHelp();
                    System.exit(0);
                }
                case "--depth", "-d" -> {
                    if (i + 1 >= args.length) {
                        throw new IllegalArgumentException("--depth requires a value");
                    }
                    maxDepth = Integer.parseInt(args[++i]);
                }
                case "--format", "-f" -> {
                    if (i + 1 >= args.length) {
                        throw new IllegalArgumentException("--format requires a value");
                    }
                    format = args[++i];
                    if (!Arrays.asList("text", "json", "compact").contains(format)) {
                        throw new IllegalArgumentException("Invalid format: " + format);
                    }
                }
                case "--output", "-o" -> {
                    if (i + 1 >= args.length) {
                        throw new IllegalArgumentException("--output requires a value");
                    }
                    outputFile = args[++i];
                }
                case "--classpath", "-cp" -> {
                    if (i + 1 >= args.length) {
                        throw new IllegalArgumentException("--classpath requires a value");
                    }
                    classpath.addAll(Arrays.asList(args[++i].split(File.pathSeparator)));
                }
                case "--verbose", "-v" -> verbose = true;
                case "--no-banner" -> showBanner = false;
                default -> {
                    if (arg.startsWith("-")) {
                        throw new IllegalArgumentException("Unknown option: " + arg);
                    }
                    className = arg;
                }
            }
        }
    }
    
    private int execute() throws Exception {
        if (verbose) {
            System.out.println("Loading class: " + className);
        }
        
        // Load the class
        Class<?> targetClass = loadClass(className);
        
        // Create extractor with output dir and max depth
        ContextExtractor extractor = new ContextExtractor(".", maxDepth, false);
        
        // Try to instantiate and extract
        ObjectNode result;
        try {
            Object instance = createInstance(targetClass);
            if (instance != null) {
                result = extractor.exploreObject(instance);
            } else {
                if (verbose) {
                    System.out.println("⚠ Cannot instantiate, using class analysis...");
                }
                result = extractor.exploreObject(targetClass);
            }
        } catch (Exception e) {
            if (verbose) {
                System.out.println("⚠ Instantiation failed: " + e.getMessage());
                System.out.println("  Falling back to class analysis...");
            }
            result = extractor.exploreObject(targetClass);
        }
        
        // Format output
        String output = formatOutput(result);
        
        // Write output
        if (outputFile != null) {
            try (PrintWriter writer = new PrintWriter(new FileWriter(outputFile))) {
                writer.print(output);
            }
            System.out.println("✓ Output written to " + outputFile);
        } else {
            System.out.println(output);
        }
        
        // Summary
        if (verbose) {
            System.out.printf("%n✓ Extracted %d methods, %d dependencies%n",
                    result.getMethods().size(),
                    result.getChildren().size());
        }
        
        return 0;
    }
    
    private Class<?> loadClass(String className) throws Exception {
        // Try default classloader first
        try {
            return Class.forName(className);
        } catch (ClassNotFoundException e) {
            // Try with custom classpath
            if (!classpath.isEmpty()) {
                URL[] urls = classpath.stream()
                        .map(path -> {
                            try {
                                return Paths.get(path).toUri().toURL();
                            } catch (Exception ex) {
                                return null;
                            }
                        })
                        .filter(url -> url != null)
                        .toArray(URL[]::new);
                
                URLClassLoader loader = new URLClassLoader(urls, getClass().getClassLoader());
                return Class.forName(className, true, loader);
            }
            throw e;
        }
    }
    
    private Object createInstance(Class<?> clazz) {
        try {
            // Try no-arg constructor first
            Constructor<?> constructor = clazz.getDeclaredConstructor();
            constructor.setAccessible(true);
            return constructor.newInstance();
        } catch (NoSuchMethodException e) {
            // No no-arg constructor
            return null;
        } catch (Exception e) {
            return null;
        }
    }
    
    private String formatOutput(ObjectNode result) {
        return switch (format) {
            case "json" -> result.toJson();
            case "compact" -> result.toJson().replaceAll("\\s+", " ");
            case "text" -> result.toText();
            default -> result.toText();
        };
    }
    
    private void printHelp() {
        System.out.println("""
                Context Extractor CLI - Extract method trees for AI context enrichment
                
                Usage:
                  java -jar context-extractor.jar <class-name> [options]
                
                Arguments:
                  class-name         Fully qualified class name to analyze
                
                Options:
                  -d, --depth <n>      Maximum exploration depth (default: 3)
                  -f, --format <type>  Output format: text, json, compact (default: text)
                  -o, --output <file>  Output file path (default: stdout)
                  -cp, --classpath     Additional classpath entries (separated by :)
                  -v, --verbose        Verbose output
                  --no-banner          Suppress the banner
                  -h, --help           Show this help message
                
                Examples:
                  java -jar context-extractor.jar com.example.UserService
                  java -jar context-extractor.jar com.example.UserService --depth 5
                  java -jar context-extractor.jar com.example.UserService -f json -o context.json
                  java -jar context-extractor.jar MyService -cp ./target/classes
                
                For more information, visit: https://github.com/your-repo/context-extractor
                """);
    }
}
