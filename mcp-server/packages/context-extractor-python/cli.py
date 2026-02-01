#!/usr/bin/env python3
"""
Context Extractor CLI

A command-line interface for extracting method trees from Python objects.

Usage:
    context-extractor <file> <class_name> [options]
    context-extractor --help

Examples:
    context-extractor services.py UserService
    context-extractor services.py UserService --depth 5 --output context.txt
    context-extractor services.py UserService --format json --output context.json
"""

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Optional

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from context_extractor import ContextExtractor
from models import ObjectNode


def load_class_from_file(file_path: str, class_name: str):
    """Load a class from a Python file."""
    path = Path(file_path).resolve()
    
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    if not path.suffix == '.py':
        raise ValueError(f"File must be a Python file (.py): {file_path}")
    
    # Load the module
    spec = importlib.util.spec_from_file_location("target_module", path)
    module = importlib.util.module_from_spec(spec)
    
    # Add the file's directory to sys.path for relative imports
    sys.path.insert(0, str(path.parent))
    
    try:
        spec.loader.exec_module(module)
    except Exception as e:
        raise RuntimeError(f"Failed to load module: {e}")
    
    # Get the class
    if not hasattr(module, class_name):
        available = [name for name in dir(module) 
                     if not name.startswith('_') and isinstance(getattr(module, name), type)]
        raise ValueError(
            f"Class '{class_name}' not found in {file_path}. "
            f"Available classes: {', '.join(available) if available else 'none'}"
        )
    
    return getattr(module, class_name)


def create_instance(cls, allow_error: bool = True):
    """Try to create an instance of a class."""
    try:
        return cls()
    except TypeError as e:
        if allow_error:
            # Class requires constructor arguments
            return None
        raise RuntimeError(
            f"Cannot instantiate {cls.__name__}: {e}. "
            f"Try using --static for static analysis instead."
        )


def format_output(result: ObjectNode, format_type: str) -> str:
    """Format the extraction result."""
    if format_type == 'json':
        return result.to_json(indent=2)
    elif format_type == 'text':
        return result.to_text()
    elif format_type == 'compact':
        return json.dumps(result.to_dict())
    else:
        raise ValueError(f"Unknown format: {format_type}")


def print_banner():
    """Print CLI banner."""
    print("""
╔═══════════════════════════════════════════════════════════╗
║           Context Extractor - AI Context Generator         ║
╚═══════════════════════════════════════════════════════════╝
""")


def main():
    parser = argparse.ArgumentParser(
        description='Extract method trees from Python classes for AI context enrichment.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s services.py UserService
  %(prog)s services.py UserService --depth 5
  %(prog)s services.py UserService --format json --output context.json
  %(prog)s services.py UserService --static
  %(prog)s services.py --list-classes

For more information, see: https://github.com/your-repo/context-extractor
        """
    )
    
    parser.add_argument(
        'file',
        help='Python file containing the class to analyze'
    )
    
    parser.add_argument(
        'class_name',
        nargs='?',
        help='Name of the class to extract (use --list-classes to see available)'
    )
    
    parser.add_argument(
        '-d', '--depth',
        type=int,
        default=3,
        help='Maximum depth for dependency exploration (default: 3)'
    )
    
    parser.add_argument(
        '-f', '--format',
        choices=['text', 'json', 'compact'],
        default='text',
        help='Output format (default: text)'
    )
    
    parser.add_argument(
        '-o', '--output',
        help='Output file path (default: stdout)'
    )
    
    parser.add_argument(
        '--static',
        action='store_true',
        help='Use static analysis (no instantiation required)'
    )
    
    parser.add_argument(
        '--list-classes',
        action='store_true',
        help='List available classes in the file'
    )
    
    parser.add_argument(
        '--no-banner',
        action='store_true',
        help='Suppress the banner'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Verbose output'
    )
    
    args = parser.parse_args()
    
    if not args.no_banner:
        print_banner()
    
    try:
        # List classes mode
        if args.list_classes:
            path = Path(args.file).resolve()
            spec = importlib.util.spec_from_file_location("target_module", path)
            module = importlib.util.module_from_spec(spec)
            sys.path.insert(0, str(path.parent))
            spec.loader.exec_module(module)
            
            classes = [name for name in dir(module) 
                       if not name.startswith('_') and isinstance(getattr(module, name), type)]
            
            print(f"Classes in {args.file}:")
            for cls_name in classes:
                cls = getattr(module, cls_name)
                doc = cls.__doc__ or "No description"
                doc = doc.split('\n')[0][:60]
                print(f"  • {cls_name}: {doc}")
            return 0
        
        # Normal extraction mode
        if not args.class_name:
            parser.error("class_name is required (or use --list-classes)")
        
        if args.verbose:
            print(f"Loading {args.class_name} from {args.file}...")
        
        cls = load_class_from_file(args.file, args.class_name)
        
        extractor = ContextExtractor(max_depth=args.depth)
        
        if args.static:
            if args.verbose:
                print("Using static analysis mode...")
            result = extractor.extract_from_class(cls)
        else:
            if args.verbose:
                print("Creating instance...")
            instance = create_instance(cls)
            
            if instance is None:
                print(f"⚠ Cannot instantiate {args.class_name} (requires constructor args)")
                print("  Falling back to static analysis...")
                result = extractor.extract_from_class(cls)
            else:
                result = extractor.explore_object(instance)
        
        # Format output
        output = format_output(result, args.format)
        
        # Write output
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output)
            print(f"✓ Output written to {args.output}")
        else:
            print(output)
        
        # Summary
        if args.verbose:
            method_count = len(result.methods)
            dep_count = len(result.children)
            print(f"\n✓ Extracted {method_count} methods, {dep_count} dependencies")
        
        return 0
        
    except FileNotFoundError as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"✗ Unexpected error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
