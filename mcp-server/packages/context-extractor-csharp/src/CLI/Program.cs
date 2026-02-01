using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using ContextExtractor.Models;

namespace ContextExtractor.CLI
{
    /// <summary>
    /// Command-line interface for the Context Extractor.
    /// 
    /// Usage:
    ///   context-extractor [assembly] class-name [options]
    /// 
    /// Options:
    ///   --depth n        Maximum exploration depth (default: 3)
    ///   --format type    Output format: text, json, compact (default: text)
    ///   --output file    Output file (default: stdout)
    ///   --assembly file  Assembly file to load
    ///   --help           Show this help message
    /// </summary>
    public class Program
    {
        private const string Banner = @"
╔═══════════════════════════════════════════════════════════╗
║       Context Extractor for C# - AI Context Generator      ║
╚═══════════════════════════════════════════════════════════╝
";

        private int _maxDepth = 3;
        private string _format = "text";
        private string? _outputFile = null;
        private string? _className = null;
        private string? _assemblyPath = null;
        private bool _verbose = false;
        private bool _showBanner = true;

        public static int Main(string[] args)
        {
            var program = new Program();
            return program.Run(args);
        }

        public int Run(string[] args)
        {
            try
            {
                ParseArguments(args);

                if (_className == null)
                {
                    PrintHelp();
                    return 1;
                }

                if (_showBanner)
                {
                    Console.WriteLine(Banner);
                }

                return Execute();
            }
            catch (ArgumentException e)
            {
                Console.Error.WriteLine($"✗ Error: {e.Message}");
                return 1;
            }
            catch (Exception e)
            {
                Console.Error.WriteLine($"✗ Unexpected error: {e.Message}");
                if (_verbose)
                {
                    Console.Error.WriteLine(e.StackTrace);
                }
                return 1;
            }
        }

        private void ParseArguments(string[] args)
        {
            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];

                switch (arg)
                {
                    case "--help":
                    case "-h":
                        PrintHelp();
                        Environment.Exit(0);
                        break;

                    case "--depth":
                    case "-d":
                        if (i + 1 >= args.Length)
                            throw new ArgumentException("--depth requires a value");
                        _maxDepth = int.Parse(args[++i]);
                        break;

                    case "--format":
                    case "-f":
                        if (i + 1 >= args.Length)
                            throw new ArgumentException("--format requires a value");
                        _format = args[++i];
                        if (!new[] { "text", "json", "compact" }.Contains(_format))
                            throw new ArgumentException($"Invalid format: {_format}");
                        break;

                    case "--output":
                    case "-o":
                        if (i + 1 >= args.Length)
                            throw new ArgumentException("--output requires a value");
                        _outputFile = args[++i];
                        break;

                    case "--assembly":
                    case "-a":
                        if (i + 1 >= args.Length)
                            throw new ArgumentException("--assembly requires a value");
                        _assemblyPath = args[++i];
                        break;

                    case "--verbose":
                    case "-v":
                        _verbose = true;
                        break;

                    case "--no-banner":
                        _showBanner = false;
                        break;

                    default:
                        if (arg.StartsWith("-"))
                            throw new ArgumentException($"Unknown option: {arg}");
                        _className = arg;
                        break;
                }
            }
        }

        private int Execute()
        {
            if (_verbose)
            {
                Console.WriteLine($"Loading class: {_className}");
            }

            // Load the type
            Type? targetType = LoadType(_className!);

            if (targetType == null)
            {
                Console.Error.WriteLine($"✗ Error: Class '{_className}' not found");
                return 1;
            }

            // Create extractor with output dir, max depth, and include private
            var extractor = new ContextExtractorService(".", _maxDepth, false);

            // Try to instantiate and extract
            ObjectNode result;
            try
            {
                object? instance = CreateInstance(targetType);
                if (instance != null)
                {
                    result = extractor.ExploreObject(instance);
                }
                else
                {
                    if (_verbose)
                    {
                        Console.WriteLine("⚠ Cannot instantiate, using type analysis...");
                    }
                    // Use ExploreObject with a dummy instance of the type or create one with Activator
                    result = extractor.ExploreObject(targetType);
                }
            }
            catch (Exception e)
            {
                if (_verbose)
                {
                    Console.WriteLine($"⚠ Instantiation failed: {e.Message}");
                    Console.WriteLine("  Falling back to type analysis...");
                }
                result = extractor.ExploreObject(targetType);
            }

            // Format output
            string output = FormatOutput(result);

            // Write output
            if (_outputFile != null)
            {
                File.WriteAllText(_outputFile, output);
                Console.WriteLine($"✓ Output written to {_outputFile}");
            }
            else
            {
                Console.WriteLine(output);
            }

            // Summary
            if (_verbose)
            {
                Console.WriteLine($"\n✓ Extracted {result.Methods.Count} methods, {result.Children.Count} dependencies");
            }

            return 0;
        }

        private Type? LoadType(string className)
        {
            // Try to find in loaded assemblies first
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var type = assembly.GetType(className, false);
                if (type != null) return type;
            }

            // Try simple name match
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var type = assembly.GetTypes()
                    .FirstOrDefault(t => t.Name == className || t.FullName == className);
                if (type != null) return type;
            }

            // Try loading from assembly file
            if (_assemblyPath != null && File.Exists(_assemblyPath))
            {
                var assembly = Assembly.LoadFrom(_assemblyPath);
                var type = assembly.GetType(className, false) ??
                           assembly.GetTypes().FirstOrDefault(t => t.Name == className);
                if (type != null) return type;
            }

            return null;
        }

        private object? CreateInstance(Type type)
        {
            try
            {
                // Try parameterless constructor
                var constructor = type.GetConstructor(Type.EmptyTypes);
                if (constructor != null)
                {
                    return Activator.CreateInstance(type);
                }
                return null;
            }
            catch
            {
                return null;
            }
        }

        private string FormatOutput(ObjectNode result)
        {
            return _format switch
            {
                "json" => result.ToJson(),
                "compact" => JsonSerializer.Serialize(result.ToDictionary()),
                "text" => result.ToText(),
                _ => result.ToText()
            };
        }

        private void PrintHelp()
        {
            Console.WriteLine(@"
Context Extractor CLI - Extract method trees for AI context enrichment

Usage:
  context-extractor <class-name> [options]

Arguments:
  class-name           Fully qualified or simple class name to analyze

Options:
  -d, --depth <n>      Maximum exploration depth (default: 3)
  -f, --format <type>  Output format: text, json, compact (default: text)
  -o, --output <file>  Output file path (default: stdout)
  -a, --assembly <dll> Assembly file to load for type resolution
  -v, --verbose        Verbose output
  --no-banner          Suppress the banner
  -h, --help           Show this help message

Examples:
  context-extractor MyNamespace.UserService
  context-extractor UserService --depth 5
  context-extractor UserService -f json -o context.json
  context-extractor MyService -a ./bin/Debug/MyApp.dll

For more information, visit: https://github.com/your-repo/context-extractor
");
        }
    }
}
