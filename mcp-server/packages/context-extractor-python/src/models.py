"""
Data models for the context extractor.
These models represent the structured output of reflection-based object analysis.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Any
import json


@dataclass
class ParameterInfo:
    """Represents a method parameter with its metadata."""
    name: str
    type_name: str = "Any"
    default_value: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "type": self.type_name,
            "default": self.default_value
        }
    
    def __str__(self) -> str:
        result = f"{self.name}: {self.type_name}"
        if self.default_value is not None:
            result += f" = {self.default_value}"
        return result


@dataclass
class MethodInfo:
    """Represents a method with its signature and documentation."""
    name: str
    parameters: List[ParameterInfo] = field(default_factory=list)
    return_type: str = "Any"
    docstring: Optional[str] = None
    is_static: bool = False
    is_class_method: bool = False
    
    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "parameters": [p.to_dict() for p in self.parameters],
            "return_type": self.return_type,
            "docstring": self.docstring,
            "is_static": self.is_static,
            "is_class_method": self.is_class_method
        }
    
    def get_signature(self) -> str:
        """Get the method signature as a string."""
        params = ", ".join(str(p) for p in self.parameters)
        return f"{self.name}({params}) -> {self.return_type}"
    
    def __str__(self) -> str:
        return self.get_signature()


@dataclass
class PropertyInfo:
    """Represents a property/attribute of an object."""
    name: str
    type_name: str = "Any"
    is_readonly: bool = False
    
    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "type": self.type_name,
            "readonly": self.is_readonly
        }


@dataclass
class ObjectNode:
    """Represents a node in the object hierarchy tree."""
    name: str
    class_name: str
    methods: List[MethodInfo] = field(default_factory=list)
    properties: List[PropertyInfo] = field(default_factory=list)
    children: List['ObjectNode'] = field(default_factory=list)
    depth: int = 0
    
    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "class": self.class_name,
            "methods": [m.to_dict() for m in self.methods],
            "properties": [p.to_dict() for p in self.properties],
            "children": [c.to_dict() for c in self.children],
            "depth": self.depth
        }
    
    def to_json(self, indent: int = 2) -> str:
        """Convert the object tree to JSON format."""
        return json.dumps(self.to_dict(), indent=indent)
    
    def to_text(self, include_details: bool = True) -> str:
        """
        Convert the object tree to a text representation optimized for AI context.
        
        Args:
            include_details: Whether to include parameter details and docstrings
            
        Returns:
            Formatted text representation of the object tree
        """
        lines = []
        self._build_text_tree(lines, include_details)
        return "\n".join(lines)
    
    def _build_text_tree(self, lines: List[str], include_details: bool, prefix: str = "") -> None:
        """Recursively build the text tree representation."""
        # Add object header
        if self.depth == 0:
            lines.append(f"# {self.class_name} Component Structure")
            lines.append("")
            lines.append(f"Root object: {self.name} -> {self.class_name}")
        else:
            arrow = "└──" if not self.children else "├──"
            lines.append(f"{prefix}{arrow} {self.name}: {self.class_name}")
        
        # Add methods
        if self.methods:
            method_prefix = prefix + ("    " if self.depth > 0 else "")
            if self.depth == 0:
                lines.append("")
                lines.append("## Methods")
            for method in self.methods:
                sig = method.get_signature()
                lines.append(f"{method_prefix}  → .{sig}")
                if include_details and method.docstring:
                    # Only show first line of docstring
                    first_line = method.docstring.split('\n')[0].strip()
                    if first_line:
                        lines.append(f"{method_prefix}      # {first_line}")
        
        # Add children
        if self.children:
            if self.depth == 0:
                lines.append("")
                lines.append("## Dependencies")
            child_prefix = prefix + ("│   " if self.depth > 0 else "")
            for i, child in enumerate(self.children):
                is_last = i == len(self.children) - 1
                child._build_text_tree(lines, include_details, 
                                       prefix + ("    " if is_last else "│   ") if self.depth > 0 else "")
        
        # Add summary at root level
        if self.depth == 0:
            lines.append("")
            lines.append("## Summary")
            total_methods = self._count_total_methods()
            total_deps = self._count_total_dependencies()
            lines.append(f"- Total methods: {total_methods}")
            lines.append(f"- Total dependencies: {total_deps}")
    
    def _count_total_methods(self) -> int:
        """Count all methods in this node and its children."""
        count = len(self.methods)
        for child in self.children:
            count += child._count_total_methods()
        return count
    
    def _count_total_dependencies(self) -> int:
        """Count all dependency nodes."""
        count = len(self.children)
        for child in self.children:
            count += child._count_total_dependencies()
        return count
