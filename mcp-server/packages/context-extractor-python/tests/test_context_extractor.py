"""
Tests for the Context Extractor Python implementation.
"""

import os
import sys
import json
import tempfile
import pytest

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from context_extractor import ContextExtractor
from models import MethodInfo, ParameterInfo, ObjectNode
from example_objects import (
    Logger, DatabaseConnection, UserRepository, 
    NotificationService, UserService, create_user_service
)


class TestParameterInfo:
    """Tests for ParameterInfo model."""
    
    def test_basic_parameter(self):
        param = ParameterInfo("name", "str")
        assert param.name == "name"
        assert param.type_name == "str"
        assert param.default_value is None
        assert str(param) == "name: str"
    
    def test_parameter_with_default(self):
        param = ParameterInfo("count", "int", "10")
        assert param.name == "count"
        assert param.type_name == "int"
        assert param.default_value == "10"
        assert str(param) == "count: int = 10"
    
    def test_to_dict(self):
        param = ParameterInfo("value", "float", "0.0")
        d = param.to_dict()
        assert d["name"] == "value"
        assert d["type"] == "float"
        assert d["default"] == "0.0"


class TestMethodInfo:
    """Tests for MethodInfo model."""
    
    def test_basic_method(self):
        method = MethodInfo(
            name="get_data",
            parameters=[],
            return_type="dict"
        )
        assert method.name == "get_data"
        assert method.return_type == "dict"
        assert method.get_signature() == "get_data() -> dict"
    
    def test_method_with_params(self):
        method = MethodInfo(
            name="set_value",
            parameters=[
                ParameterInfo("key", "str"),
                ParameterInfo("value", "Any")
            ],
            return_type="bool"
        )
        assert method.get_signature() == "set_value(key: str, value: Any) -> bool"
    
    def test_method_with_docstring(self):
        method = MethodInfo(
            name="process",
            parameters=[],
            return_type="None",
            docstring="Process the data."
        )
        assert method.docstring == "Process the data."


class TestObjectNode:
    """Tests for ObjectNode model."""
    
    def test_basic_node(self):
        node = ObjectNode(
            name="root",
            class_name="TestClass",
            methods=[],
            children=[],
            depth=0
        )
        assert node.name == "root"
        assert node.class_name == "TestClass"
        assert node.depth == 0
    
    def test_count_methods(self):
        child = ObjectNode(
            name="child",
            class_name="ChildClass",
            methods=[MethodInfo("method1", [], "void")],
            children=[],
            depth=1
        )
        parent = ObjectNode(
            name="parent",
            class_name="ParentClass",
            methods=[
                MethodInfo("method2", [], "void"),
                MethodInfo("method3", [], "void")
            ],
            children=[child],
            depth=0
        )
        assert parent._count_total_methods() == 3
    
    def test_to_json(self):
        node = ObjectNode(
            name="test",
            class_name="TestClass",
            methods=[],
            children=[],
            depth=0
        )
        json_str = node.to_json()
        data = json.loads(json_str)
        assert data["name"] == "test"
        assert data["class"] == "TestClass"
    
    def test_to_text(self):
        node = ObjectNode(
            name="root",
            class_name="MyService",
            methods=[MethodInfo("do_something", [], "bool")],
            children=[],
            depth=0
        )
        text = node.to_text()
        assert "MyService" in text
        assert "do_something" in text


class TestContextExtractor:
    """Tests for the ContextExtractor class."""
    
    @pytest.fixture
    def extractor(self):
        """Create an extractor with a temp directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield ContextExtractor(output_dir=tmpdir, max_depth=5)
    
    def test_extract_methods_from_simple_class(self, extractor):
        logger = Logger()
        methods = extractor.extract_methods(logger)
        
        method_names = [m.name for m in methods]
        assert "log_info" in method_names
        assert "log_error" in method_names
        assert "log_debug" in method_names
    
    def test_extract_methods_excludes_private(self, extractor):
        class TestClass:
            def public_method(self):
                pass
            def _private_method(self):
                pass
        
        obj = TestClass()
        methods = extractor.extract_methods(obj, include_private=False)
        method_names = [m.name for m in methods]
        
        assert "public_method" in method_names
        assert "_private_method" not in method_names
    
    def test_extract_method_parameters(self, extractor):
        db = DatabaseConnection()
        methods = extractor.extract_methods(db)
        
        connect_method = next(m for m in methods if m.name == "connect")
        param_names = [p.name for p in connect_method.parameters]
        
        assert "host" in param_names
        assert "port" in param_names
    
    def test_explore_object_hierarchy(self, extractor):
        user_service = create_user_service()
        node = extractor.explore_object(user_service)
        
        assert node.class_name == "UserService"
        assert len(node.methods) > 0
        assert len(node.children) > 0
        
        # Check that children include expected dependencies
        # Note: Logger is not included because it has no instance variables (not explorable)
        child_names = [c.name for c in node.children]
        assert "repository" in child_names
        assert "notifier" in child_names
    
    def test_explore_detects_nested_dependencies(self, extractor):
        """Test nested dependencies - only objects with instance variables are explored."""
        user_service = create_user_service()
        node = extractor.explore_object(user_service)
        
        # Find the repository child
        repo_node = next(c for c in node.children if c.name == "repository")
        
        # Repository has db and logger as fields, but they have no instance variables
        # so they are not considered explorable (leaf nodes)
        assert repo_node is not None
        assert repo_node.class_name == "UserRepository"
        assert len(repo_node.methods) > 0
    
    def test_cycle_detection(self, extractor):
        """Test that cycles are handled correctly."""
        class Node:
            def __init__(self, name):
                self.name = name
                self.next = None
            def get_name(self):
                return self.name
        
        a = Node("A")
        b = Node("B")
        a.next = b
        b.next = a  # Create cycle
        
        # Should not hang or crash
        node = extractor.explore_object(a)
        assert node is not None
    
    def test_save_as_json(self, extractor):
        logger = Logger()
        filepath = extractor.save_as_json(logger, "test_logger.json")
        
        assert os.path.exists(filepath)
        
        with open(filepath) as f:
            data = json.load(f)
        
        assert data["class"] == "Logger"
        assert len(data["methods"]) > 0
    
    def test_save_as_text(self, extractor):
        user_service = create_user_service()
        filepath = extractor.save_as_text(user_service, "test_userservice.txt")
        
        assert os.path.exists(filepath)
        
        with open(filepath) as f:
            content = f.read()
        
        assert "UserService" in content
        assert "register_user" in content
        assert "repository" in content
    
    def test_extract_from_class(self, extractor):
        """Test extracting methods from a class without instantiation."""
        node = extractor.extract_from_class(UserService)
        
        assert node.class_name == "UserService"
        method_names = [m.name for m in node.methods]
        assert "register_user" in method_names


class TestIntegration:
    """Integration tests with the full workflow."""
    
    def test_full_extraction_workflow(self):
        """Test the complete workflow from object to output files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            extractor = ContextExtractor(output_dir=tmpdir)
            
            # Create a complex object hierarchy
            user_service = create_user_service()
            
            # Extract and save
            json_path = extractor.save_as_json(user_service)
            text_path = extractor.save_as_text(user_service)
            
            # Verify JSON output
            with open(json_path) as f:
                json_data = json.load(f)
            
            assert json_data["class"] == "UserService"
            assert len(json_data["methods"]) >= 5
            # Only repository and notifier are explored (Logger has no instance vars)
            assert len(json_data["children"]) >= 2
            
            # Verify text output
            with open(text_path) as f:
                text_content = f.read()
            
            # Check structure elements
            assert "# UserService Component Structure" in text_content
            assert "## Methods" in text_content
            assert "## Dependencies" in text_content
            assert "## Summary" in text_content


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
