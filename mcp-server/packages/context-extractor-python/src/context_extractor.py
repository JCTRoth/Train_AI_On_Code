"""
Context Extractor - Extracts method trees from objects using reflection.

This module provides functionality to analyze Python objects and extract
their method hierarchies for use as AI context enrichment.
"""

import inspect
import os
import time
import json
import logging
from typing import Any, Set, Optional, Type, Callable

try:
    from .models import MethodInfo, ParameterInfo, PropertyInfo, ObjectNode
except ImportError:
    from models import MethodInfo, ParameterInfo, PropertyInfo, ObjectNode

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


class ContextExtractor:
    """
    Extracts method trees and object hierarchies using Python reflection.
    
    This class analyzes objects and their attributes recursively, building
    a structured representation of available methods that can be used to
    enrich AI context for better code completion suggestions.
    """
    
    def __init__(self, output_dir: str = "generated_context", max_depth: int = 10):
        """
        Initialize the ContextExtractor.
        
        Args:
            output_dir: Directory where generated context files will be saved
            max_depth: Maximum depth for recursive object exploration
        """
        self.output_dir = output_dir
        self.max_depth = max_depth
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # Create output directory if it doesn't exist
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            self.logger.info(f"Created output directory: {output_dir}")
    
    def extract_methods(self, obj: Any, include_private: bool = False) -> list[MethodInfo]:
        """
        Extract all methods from an object.
        
        Args:
            obj: The object to extract methods from
            include_private: Whether to include methods starting with underscore
            
        Returns:
            List of MethodInfo objects describing the methods
        """
        methods = []
        
        for name, member in inspect.getmembers(obj):
            # Skip magic methods and optionally private methods
            if name.startswith("__"):
                continue
            if not include_private and name.startswith("_"):
                continue
            
            # Check if it's a method
            if inspect.ismethod(member) or inspect.isfunction(member):
                method_info = self._analyze_method(name, member)
                if method_info:
                    methods.append(method_info)
        
        return methods
    
    def _analyze_method(self, name: str, method: Callable) -> Optional[MethodInfo]:
        """
        Analyze a method and extract its signature information.
        
        Args:
            name: The method name
            method: The method object
            
        Returns:
            MethodInfo object or None if analysis fails
        """
        try:
            sig = inspect.signature(method)
            
            # Extract parameters
            parameters = []
            for param_name, param in sig.parameters.items():
                if param_name == 'self':
                    continue
                
                # Get parameter type
                type_name = "Any"
                if param.annotation != inspect.Parameter.empty:
                    type_name = self._get_type_name(param.annotation)
                
                # Get default value
                default_value = None
                if param.default != inspect.Parameter.empty:
                    default_value = repr(param.default)
                
                parameters.append(ParameterInfo(
                    name=param_name,
                    type_name=type_name,
                    default_value=default_value
                ))
            
            # Get return type
            return_type = "Any"
            if sig.return_annotation != inspect.Signature.empty:
                return_type = self._get_type_name(sig.return_annotation)
            
            # Get docstring
            docstring = inspect.getdoc(method)
            
            # Check if static or class method
            is_static = isinstance(inspect.getattr_static(method.__self__.__class__, name, None), staticmethod) if hasattr(method, '__self__') else False
            is_class_method = isinstance(inspect.getattr_static(method.__self__.__class__, name, None), classmethod) if hasattr(method, '__self__') else False
            
            return MethodInfo(
                name=name,
                parameters=parameters,
                return_type=return_type,
                docstring=docstring,
                is_static=is_static,
                is_class_method=is_class_method
            )
            
        except Exception as e:
            self.logger.debug(f"Could not analyze method {name}: {e}")
            return MethodInfo(
                name=name,
                parameters=[],
                return_type="Unknown",
                docstring="Could not inspect method"
            )
    
    def _get_type_name(self, annotation: Any) -> str:
        """
        Get a string representation of a type annotation.
        
        Args:
            annotation: The type annotation
            
        Returns:
            String representation of the type
        """
        if hasattr(annotation, '__name__'):
            return annotation.__name__
        elif hasattr(annotation, '__origin__'):
            # Handle generic types like List[str], Dict[str, int], etc.
            origin = annotation.__origin__
            args = getattr(annotation, '__args__', ())
            origin_name = getattr(origin, '__name__', str(origin))
            if args:
                args_str = ", ".join(self._get_type_name(a) for a in args)
                return f"{origin_name}[{args_str}]"
            return origin_name
        return str(annotation)
    
    def extract_properties(self, obj: Any, include_private: bool = False) -> list[PropertyInfo]:
        """
        Extract properties/attributes from an object.
        
        Args:
            obj: The object to extract properties from
            include_private: Whether to include private attributes
            
        Returns:
            List of PropertyInfo objects
        """
        properties = []
        
        for name in dir(obj):
            if name.startswith("__"):
                continue
            if not include_private and name.startswith("_"):
                continue
            
            try:
                value = getattr(obj, name)
                # Skip methods
                if callable(value):
                    continue
                
                type_name = type(value).__name__
                properties.append(PropertyInfo(
                    name=name,
                    type_name=type_name,
                    is_readonly=False  # Python doesn't have true read-only properties by default
                ))
            except AttributeError:
                continue
        
        return properties
    
    def explore_object(self, obj: Any, name: str = "root", 
                       visited: Optional[Set[int]] = None, 
                       depth: int = 0,
                       include_private: bool = False) -> ObjectNode:
        """
        Recursively explore an object and build its hierarchy tree.
        
        Args:
            obj: The object to explore
            name: Name to assign to this node
            visited: Set of already visited object IDs (for cycle detection)
            depth: Current depth in the hierarchy
            include_private: Whether to include private members
            
        Returns:
            ObjectNode representing the object and its hierarchy
        """
        if visited is None:
            visited = set()
        
        obj_id = id(obj)
        class_name = obj.__class__.__name__
        
        # Create the node
        node = ObjectNode(
            name=name,
            class_name=class_name,
            depth=depth
        )
        
        # Check for cycles or max depth
        if obj_id in visited or depth >= self.max_depth:
            return node
        
        visited.add(obj_id)
        
        # Extract methods
        node.methods = self.extract_methods(obj, include_private)
        
        # Extract properties
        node.properties = self.extract_properties(obj, include_private)
        
        # Explore sub-objects (attributes that are custom objects)
        for attr_name, attr_value in vars(obj).items():
            if attr_name.startswith("__"):
                continue
            if not include_private and attr_name.startswith("_"):
                continue
            
            # Only explore custom objects, not primitives
            if self._is_explorable_object(attr_value):
                child_node = self.explore_object(
                    attr_value, 
                    attr_name, 
                    visited.copy(), 
                    depth + 1,
                    include_private
                )
                node.children.append(child_node)
        
        return node
    
    def _is_explorable_object(self, obj: Any) -> bool:
        """
        Determine if an object should be explored recursively.
        
        Args:
            obj: The object to check
            
        Returns:
            True if the object should be explored
        """
        # Skip None and primitive types
        if obj is None:
            return False
        
        primitive_types = (str, int, float, bool, bytes, type(None))
        if isinstance(obj, primitive_types):
            return False
        
        # Skip common container types (unless they contain custom objects)
        container_types = (list, dict, set, tuple, frozenset)
        if isinstance(obj, container_types):
            return False
        
        # Skip types themselves
        if isinstance(obj, type):
            return False
        
        # Check if it has custom attributes (indicates a custom class)
        return hasattr(obj, '__dict__') and len(vars(obj)) > 0
    
    def save_as_json(self, obj: Any, filename: Optional[str] = None, 
                     include_private: bool = False) -> str:
        """
        Extract object hierarchy and save as JSON.
        
        Args:
            obj: The root object to analyze
            filename: Output filename (auto-generated if None)
            include_private: Whether to include private members
            
        Returns:
            Path to the saved file
        """
        if filename is None:
            timestamp = int(time.time())
            class_name = obj.__class__.__name__.lower()
            filename = f"{class_name}_{timestamp}.json"
        
        filepath = os.path.join(self.output_dir, filename)
        
        # Extract the object tree
        root_node = self.explore_object(obj, include_private=include_private)
        
        # Save to file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(root_node.to_json())
        
        self.logger.info(f"Saved JSON context to: {filepath}")
        return filepath
    
    def save_as_text(self, obj: Any, filename: Optional[str] = None,
                     include_private: bool = False,
                     include_details: bool = True) -> str:
        """
        Extract object hierarchy and save as AI-optimized text.
        
        Args:
            obj: The root object to analyze
            filename: Output filename (auto-generated if None)
            include_private: Whether to include private members
            include_details: Whether to include detailed parameter info
            
        Returns:
            Path to the saved file
        """
        if filename is None:
            timestamp = int(time.time())
            class_name = obj.__class__.__name__.lower()
            filename = f"{class_name}_{timestamp}.txt"
        
        filepath = os.path.join(self.output_dir, filename)
        
        # Extract the object tree
        root_node = self.explore_object(obj, include_private=include_private)
        
        # Save to file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(root_node.to_text(include_details))
        
        self.logger.info(f"Saved text context to: {filepath}")
        return filepath
    
    def save(self, result: "ObjectNode", filename: str, format: str = "json") -> str:
        """
        Save extraction result to a file.
        
        Args:
            result: The ObjectNode to save
            filename: Base filename (without extension)
            format: Output format - 'json' or 'text'
            
        Returns:
            Path to the saved file
        """
        if format == "json":
            full_filename = f"{filename}.json"
            filepath = os.path.join(self.output_dir, full_filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(result.to_json())
        else:
            full_filename = f"{filename}.txt"
            filepath = os.path.join(self.output_dir, full_filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(result.to_text())
        
        self.logger.info(f"Saved context to: {filepath}")
        return filepath
    
    def extract_from_class(self, cls: Type, include_private: bool = False) -> ObjectNode:
        """
        Extract method information from a class (without instantiating).
        
        Args:
            cls: The class to analyze
            include_private: Whether to include private members
            
        Returns:
            ObjectNode representing the class structure
        """
        node = ObjectNode(
            name=cls.__name__,
            class_name=cls.__name__,
            depth=0
        )
        
        for name, member in inspect.getmembers(cls):
            if name.startswith("__"):
                continue
            if not include_private and name.startswith("_"):
                continue
            
            if inspect.isfunction(member) or inspect.ismethod(member):
                try:
                    sig = inspect.signature(member)
                    
                    parameters = []
                    for param_name, param in sig.parameters.items():
                        if param_name == 'self':
                            continue
                        
                        type_name = "Any"
                        if param.annotation != inspect.Parameter.empty:
                            type_name = self._get_type_name(param.annotation)
                        
                        default_value = None
                        if param.default != inspect.Parameter.empty:
                            default_value = repr(param.default)
                        
                        parameters.append(ParameterInfo(
                            name=param_name,
                            type_name=type_name,
                            default_value=default_value
                        ))
                    
                    return_type = "Any"
                    if sig.return_annotation != inspect.Signature.empty:
                        return_type = self._get_type_name(sig.return_annotation)
                    
                    node.methods.append(MethodInfo(
                        name=name,
                        parameters=parameters,
                        return_type=return_type,
                        docstring=inspect.getdoc(member)
                    ))
                except (ValueError, TypeError):
                    node.methods.append(MethodInfo(
                        name=name,
                        parameters=[],
                        return_type="Unknown",
                        docstring="Could not inspect"
                    ))
        
        return node
