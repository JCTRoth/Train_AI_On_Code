# Context Extractor Python Implementation
# Extracts method trees from objects using reflection for AI context enrichment

try:
    from .context_extractor import ContextExtractor
    from .models import MethodInfo, ObjectNode, ParameterInfo, PropertyInfo
except ImportError:
    from context_extractor import ContextExtractor
    from models import MethodInfo, ObjectNode, ParameterInfo, PropertyInfo

__all__ = ['ContextExtractor', 'MethodInfo', 'ObjectNode', 'ParameterInfo', 'PropertyInfo']
__version__ = '1.0.0'
