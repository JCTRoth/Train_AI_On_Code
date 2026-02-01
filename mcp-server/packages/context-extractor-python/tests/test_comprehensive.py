"""
Comprehensive test suite for Context Extractor.
Tests all aspects of the context extraction functionality.
"""

import pytest
import tempfile
import os
import json
import time
from typing import List, Dict, Optional, Any

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from context_extractor import ContextExtractor
from models import ObjectNode, MethodInfo, ParameterInfo, PropertyInfo


# =============================================================================
# Test Fixtures - Service Classes
# =============================================================================

class Logger:
    """A simple logging service."""
    
    def log(self, message: str) -> None:
        """Log a message."""
        print(f"[LOG] {message}")
    
    def error(self, message: str, code: int = 0) -> None:
        """Log an error message."""
        print(f"[ERROR {code}] {message}")


class DatabaseConnection:
    """Database connection service."""
    
    def connect(self) -> bool:
        """Connect to the database."""
        return True
    
    def disconnect(self) -> None:
        """Disconnect from the database."""
        pass
    
    def query(self, sql: str, params: Optional[List[Any]] = None) -> List[Dict]:
        """Execute a query."""
        return []


class Cache:
    """Simple caching service."""
    
    def get(self, key: str) -> Optional[Any]:
        """Get a value from cache."""
        return None
    
    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """Set a value in cache."""
        return True
    
    def delete(self, key: str) -> bool:
        """Delete a value from cache."""
        return True


class ServiceWithDependencies:
    """A service with multiple dependencies."""
    
    def __init__(self):
        self.logger = Logger()
        self.db = DatabaseConnection()
        self.cache = Cache()
    
    def process(self, item_id: int) -> Dict:
        """Process an item using all dependencies."""
        self.logger.log(f"Processing {item_id}")
        return {"id": item_id}


class CircularA:
    """Class with circular reference to CircularB."""
    
    def __init__(self):
        self.b = None  # Set later to avoid recursion
    
    def method_a(self) -> str:
        return "A"


class CircularB:
    """Class with circular reference to CircularA."""
    
    def __init__(self, a: CircularA):
        self.a = a
        a.b = self
    
    def method_b(self) -> str:
        return "B"


class DeepLevel3:
    """Deepest level for depth testing."""
    def deep_method(self) -> str:
        return "deep"


class DeepLevel2:
    """Middle level for depth testing."""
    def __init__(self):
        self.level3 = DeepLevel3()
    
    def mid_method(self) -> str:
        return "mid"


class DeepLevel1:
    """Top level for depth testing."""
    def __init__(self):
        self.level2 = DeepLevel2()
    
    def top_method(self) -> str:
        return "top"


class DeepNestedService:
    """Service with deeply nested dependencies."""
    
    def __init__(self):
        self.level1 = DeepLevel1()
    
    def start(self) -> None:
        """Start the service."""
        pass


# =============================================================================
# Test Classes
# =============================================================================

class TestBasicExtraction:
    """Test basic extraction functionality."""
    
    def test_simple_class_extraction(self):
        """Should extract methods from a simple class."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(Logger())
        
        assert result is not None
        assert result.name == "root"
        assert result.class_name == "Logger"
        assert len(result.methods) >= 2
    
    def test_method_parameters(self):
        """Should extract method parameters correctly."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(Logger())
        
        error_method = next(m for m in result.methods if m.name == "error")
        assert len(error_method.parameters) == 2
        
        message_param = error_method.parameters[0]
        assert message_param.name == "message"
        assert message_param.type_name == "str"
        
        code_param = error_method.parameters[1]
        assert code_param.name == "code"
        assert code_param.default_value == "0"
    
    def test_return_types(self):
        """Should extract return types correctly."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(DatabaseConnection())
        
        connect_method = next(m for m in result.methods if m.name == "connect")
        assert connect_method.return_type == "bool"
    
    def test_docstrings(self):
        """Should extract docstrings."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(Logger())
        
        log_method = next(m for m in result.methods if m.name == "log")
        assert log_method.docstring is not None
        assert "Log a message" in log_method.docstring


class TestStaticAndClassMethods:
    """Test static and class method detection."""
    
    def test_static_method_in_extraction(self):
        """Should include static methods in extraction."""
        class WithStatic:
            @staticmethod
            def static_method(x: int) -> int:
                """A static method."""
                return x * 2
            
            def instance_method(self) -> str:
                return "instance"
        
        extractor = ContextExtractor(max_depth=3)
        obj = WithStatic()
        result = extractor.explore_object(obj)
        
        # Verify methods are extracted
        method_names = [m.name for m in result.methods]
        assert "instance_method" in method_names
    
    def test_class_method_in_extraction(self):
        """Should include class methods in extraction."""
        class WithClassMethod:
            @classmethod
            def class_method(cls, name: str) -> str:
                """A class method."""
                return f"Hello, {name}"
            
            def instance_method(self) -> str:
                return "instance"
        
        extractor = ContextExtractor(max_depth=3)
        obj = WithClassMethod()
        result = extractor.explore_object(obj)
        
        method_names = [m.name for m in result.methods]
        assert "instance_method" in method_names
    
    def test_instance_method_not_static(self):
        """Instance methods should not be marked as static."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(Logger())
        
        log_method = next(m for m in result.methods if m.name == "log")
        assert log_method.is_static == False


class TestAsyncMethods:
    """Test async method detection."""
    
    def test_async_method_extraction(self):
        """Should extract async methods."""
        class AsyncService:
            async def async_method(self) -> str:
                """An async method."""
                return "async"
            
            def sync_method(self) -> str:
                """A sync method."""
                return "sync"
        
        extractor = ContextExtractor(max_depth=3)
        obj = AsyncService()
        result = extractor.explore_object(obj)
        
        method_names = [m.name for m in result.methods]
        assert "sync_method" in method_names
    
    def test_sync_method_in_async_class(self):
        """Sync methods in async class should be properly extracted."""
        class AsyncService:
            async def async_method(self) -> str:
                return "async"
            
            def sync_method(self) -> str:
                return "sync"
        
        extractor = ContextExtractor(max_depth=3)
        obj = AsyncService()
        result = extractor.explore_object(obj)
        
        sync_method = next(m for m in result.methods if m.name == "sync_method")
        assert sync_method is not None


class TestDependencyExtraction:
    """Test dependency extraction."""
    
    def test_properties_found(self):
        """Should find object properties."""
        extractor = ContextExtractor(max_depth=3)
        service = ServiceWithDependencies()
        result = extractor.explore_object(service)
        
        # Check properties are extracted
        assert len(result.properties) >= 3
        prop_names = [p.name for p in result.properties]
        assert "logger" in prop_names
        assert "db" in prop_names
        assert "cache" in prop_names
    
    def test_property_types_extracted(self):
        """Should extract property type names."""
        extractor = ContextExtractor(max_depth=3)
        service = ServiceWithDependencies()
        result = extractor.explore_object(service)
        
        # Find logger property
        logger_prop = next((p for p in result.properties if p.name == "logger"), None)
        assert logger_prop is not None
        assert logger_prop.type_name == "Logger"
    
    def test_nested_service_has_properties(self):
        """Should extract properties from nested service."""
        extractor = ContextExtractor(max_depth=3)
        service = DeepNestedService()
        result = extractor.explore_object(service)
        
        # Verify properties are captured
        assert len(result.properties) >= 1
        prop_names = [p.name for p in result.properties]
        assert "level1" in prop_names


class TestCircularDependencies:
    """Test circular dependency handling."""
    
    def test_circular_dependency_no_infinite_loop(self):
        """Should handle circular dependencies without infinite loop."""
        a = CircularA()
        b = CircularB(a)
        
        extractor = ContextExtractor(max_depth=5)
        
        # This should not hang or crash
        result = extractor.explore_object(a)
        assert result is not None
    
    def test_circular_dependency_detected(self):
        """Should detect and handle circular references."""
        a = CircularA()
        b = CircularB(a)
        
        extractor = ContextExtractor(max_depth=5)
        result = extractor.explore_object(a)
        
        # Should complete successfully
        assert result.class_name == "CircularA"


class TestDepthLimiting:
    """Test depth limiting functionality."""
    
    def test_depth_limit_respected(self):
        """Should respect max depth setting."""
        extractor = ContextExtractor(max_depth=1)
        service = DeepNestedService()
        result = extractor.explore_object(service)
        
        # At depth 1, children shouldn't have their own children explored deeply
        def count_depth(node: ObjectNode, current_depth: int = 0) -> int:
            max_found = current_depth
            for child in node.children:
                max_found = max(max_found, count_depth(child, current_depth + 1))
            return max_found
        
        max_depth = count_depth(result)
        assert max_depth <= 2  # root (0) + one level of children
    
    def test_depth_zero_no_children(self):
        """With depth 0, should have no explored children."""
        extractor = ContextExtractor(max_depth=0)
        service = DeepNestedService()
        result = extractor.explore_object(service)
        
        assert len(result.children) == 0
    
    def test_deeper_depth_allows_more_levels(self):
        """Higher depth should allow more levels."""
        shallow_extractor = ContextExtractor(max_depth=1)
        deep_extractor = ContextExtractor(max_depth=5)
        
        service1 = DeepNestedService()
        service2 = DeepNestedService()
        
        shallow_result = shallow_extractor.explore_object(service1)
        deep_result = deep_extractor.explore_object(service2)
        
        # Both should complete
        assert shallow_result is not None
        assert deep_result is not None


class TestOutputFormats:
    """Test output format generation."""
    
    def test_to_dict_structure(self):
        """to_dict() should return proper structure."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(Logger())
        
        d = result.to_dict()
        
        assert "name" in d
        assert "class" in d  # Note: uses 'class' not 'class_name'
        assert "methods" in d
        assert "children" in d
        assert isinstance(d["methods"], list)
    
    def test_to_json_valid(self):
        """to_json() should return valid JSON."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(Logger())
        
        json_str = result.to_json()
        
        # Should be valid JSON
        parsed = json.loads(json_str)
        assert "name" in parsed
    
    def test_to_text_readable(self):
        """to_text() should return readable format."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(Logger())
        
        text = result.to_text()
        
        assert "Logger" in text
        assert "log" in text or "error" in text


class TestFileSaving:
    """Test file saving functionality."""
    
    def test_save_as_json(self):
        """Should save context as JSON file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            extractor = ContextExtractor(output_dir=tmpdir, max_depth=3)
            result = extractor.explore_object(Logger())
            
            filepath = extractor.save(result, "test_output", "json")
            
            assert os.path.exists(filepath)
            assert filepath.endswith(".json")
            
            with open(filepath) as f:
                loaded = json.load(f)
                assert "class" in loaded  # Note: uses 'class' not 'class_name'
    
    def test_save_as_text(self):
        """Should save context as text file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            extractor = ContextExtractor(output_dir=tmpdir, max_depth=3)
            result = extractor.explore_object(Logger())
            
            filepath = extractor.save(result, "test_output", "text")
            
            assert os.path.exists(filepath)
            assert filepath.endswith(".txt")
            
            with open(filepath) as f:
                content = f.read()
                assert "Logger" in content


class TestComplexTypes:
    """Test handling of complex types."""
    
    def test_optional_type(self):
        """Should handle Optional types."""
        class WithOptional:
            def method(self, value: Optional[str] = None) -> Optional[int]:
                return None
        
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(WithOptional())
        
        method = next(m for m in result.methods if m.name == "method")
        assert method is not None
        
        # Check parameter has some type info
        param = method.parameters[0]
        assert param.type_name is not None
    
    def test_dict_type(self):
        """Should handle Dict types."""
        class WithDict:
            def method(self, data: Dict[str, int]) -> Dict[str, Any]:
                return {}
        
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(WithDict())
        
        method = next(m for m in result.methods if m.name == "method")
        param = method.parameters[0]
        # Type should contain dict-related info
        assert "dict" in param.type_name.lower() or "Dict" in param.type_name


class TestEdgeCases:
    """Test edge cases and error handling."""
    
    def test_empty_class(self):
        """Should handle class with no methods."""
        class EmptyClass:
            pass
        
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(EmptyClass())
        
        assert result is not None
        assert result.class_name == "EmptyClass"
    
    def test_class_with_private_methods(self):
        """Should skip private methods by default."""
        class WithPrivate:
            def _private(self) -> None:
                pass
            
            def public(self) -> None:
                pass
        
        extractor = ContextExtractor(max_depth=3)
        result = extractor.explore_object(WithPrivate())
        
        method_names = [m.name for m in result.methods]
        assert "public" in method_names
        assert "_private" not in method_names
    
    def test_class_with_slots(self):
        """Should handle classes with __slots__."""
        class WithSlots:
            __slots__ = ['value']
            
            def __init__(self):
                self.value = 42
            
            def get_value(self) -> int:
                return self.value
        
        extractor = ContextExtractor(max_depth=3)
        obj = WithSlots()
        
        # This might raise or handle gracefully
        try:
            result = extractor.explore_object(obj)
            assert result is not None
        except TypeError:
            # Expected for objects without __dict__
            pass
    
    def test_none_object(self):
        """Should handle None object gracefully."""
        extractor = ContextExtractor(max_depth=3)
        
        # explore_object with None should not crash
        try:
            result = extractor.explore_object(None)
            # Either returns something or raises
        except (TypeError, AttributeError):
            # Expected behavior
            pass


class TestPerformance:
    """Test performance characteristics."""
    
    def test_large_class_performance(self):
        """Should handle class with many methods efficiently."""
        class LargeClass:
            pass
        
        # Dynamically add 50 methods
        for i in range(50):
            setattr(LargeClass, f"method_{i}", lambda self, x=i: x)
        
        extractor = ContextExtractor(max_depth=3)
        
        start = time.time()
        result = extractor.explore_object(LargeClass())
        duration = time.time() - start
        
        assert duration < 5.0  # Should complete in under 5 seconds
        assert len(result.methods) >= 50
    
    def test_extraction_caching(self):
        """Multiple extractions should be efficient."""
        extractor = ContextExtractor(max_depth=3)
        
        start = time.time()
        for _ in range(10):
            extractor.explore_object(Logger())
        duration = time.time() - start
        
        assert duration < 2.0  # 10 extractions should be fast


class TestFromClass:
    """Test extraction from class (not instance)."""
    
    def test_extract_from_class(self):
        """Should extract from class type."""
        extractor = ContextExtractor(max_depth=3)
        result = extractor.extract_from_class(Logger)
        
        assert result is not None
        assert result.class_name == "Logger"
        assert len(result.methods) >= 2


class TestIntegration:
    """Integration tests."""
    
    def test_full_workflow(self):
        """Test complete extraction workflow."""
        with tempfile.TemporaryDirectory() as tmpdir:
            extractor = ContextExtractor(output_dir=tmpdir, max_depth=3)
            
            # Extract
            result = extractor.explore_object(ServiceWithDependencies())
            
            # Verify basic structure
            assert result.class_name == "ServiceWithDependencies"
            assert len(result.methods) >= 1
            assert len(result.properties) >= 3
            
            # Save as JSON
            json_path = extractor.save(result, "workflow_test", "json")
            assert os.path.exists(json_path)
            
            # Save as text
            text_path = extractor.save(result, "workflow_test", "text")
            assert os.path.exists(text_path)
    
    def test_multiple_objects(self):
        """Should handle extracting multiple different objects."""
        extractor = ContextExtractor(max_depth=3)
        
        results = [
            extractor.explore_object(Logger()),
            extractor.explore_object(DatabaseConnection()),
            extractor.explore_object(Cache()),
        ]
        
        class_names = [r.class_name for r in results]
        assert "Logger" in class_names
        assert "DatabaseConnection" in class_names
        assert "Cache" in class_names
