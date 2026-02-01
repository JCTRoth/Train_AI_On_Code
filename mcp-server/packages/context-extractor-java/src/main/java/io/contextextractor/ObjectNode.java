package io.contextextractor;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Represents a node in the object hierarchy tree.
 * Contains information about an object's class, methods, and child dependencies.
 */
public class ObjectNode {
    private final String name;
    private final String className;
    private final List<MethodInfo> methods;
    private final List<ObjectNode> children;
    private final int depth;

    private ObjectNode(Builder builder) {
        this.name = builder.name;
        this.className = builder.className;
        this.methods = builder.methods;
        this.children = builder.children;
        this.depth = builder.depth;
    }

    public String getName() {
        return name;
    }

    public String getClassName() {
        return className;
    }

    public List<MethodInfo> getMethods() {
        return new ArrayList<>(methods);
    }

    public List<ObjectNode> getChildren() {
        return new ArrayList<>(children);
    }

    public int getDepth() {
        return depth;
    }

    /**
     * Count total methods in this node and all children.
     */
    public int countTotalMethods() {
        int count = methods.size();
        for (ObjectNode child : children) {
            count += child.countTotalMethods();
        }
        return count;
    }

    /**
     * Count total dependencies (children) recursively.
     */
    public int countTotalDependencies() {
        int count = children.size();
        for (ObjectNode child : children) {
            count += child.countTotalDependencies();
        }
        return count;
    }

    /**
     * Convert to JSON representation.
     */
    public String toJson() {
        return toJson(0);
    }

    private String toJson(int indent) {
        String spaces = " ".repeat(indent);
        String innerSpaces = " ".repeat(indent + 2);
        StringBuilder sb = new StringBuilder();
        
        sb.append(spaces).append("{\n");
        sb.append(innerSpaces).append("\"name\": \"").append(escapeJson(name)).append("\",\n");
        sb.append(innerSpaces).append("\"class\": \"").append(escapeJson(className)).append("\",\n");
        sb.append(innerSpaces).append("\"depth\": ").append(depth).append(",\n");
        
        // Methods
        sb.append(innerSpaces).append("\"methods\": [\n");
        for (int i = 0; i < methods.size(); i++) {
            sb.append(" ".repeat(indent + 4)).append(methods.get(i).toJson());
            if (i < methods.size() - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append(innerSpaces).append("],\n");
        
        // Children
        sb.append(innerSpaces).append("\"children\": [\n");
        for (int i = 0; i < children.size(); i++) {
            sb.append(children.get(i).toJson(indent + 4));
            if (i < children.size() - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append(innerSpaces).append("]\n");
        
        sb.append(spaces).append("}");
        return sb.toString();
    }

    /**
     * Convert to AI-optimized text representation.
     */
    public String toText() {
        return toText(true);
    }

    public String toText(boolean includeDetails) {
        StringBuilder sb = new StringBuilder();
        buildTextTree(sb, includeDetails, "");
        return sb.toString();
    }

    private void buildTextTree(StringBuilder sb, boolean includeDetails, String prefix) {
        // Add header
        if (depth == 0) {
            sb.append("# ").append(className).append(" Component Structure\n\n");
            sb.append("Root object: ").append(name).append(" -> ").append(className).append("\n");
        } else {
            String arrow = children.isEmpty() ? "└──" : "├──";
            sb.append(prefix).append(arrow).append(" ").append(name).append(": ").append(className).append("\n");
        }

        // Add methods
        if (!methods.isEmpty()) {
            String methodPrefix = depth > 0 ? prefix + "    " : "";
            if (depth == 0) {
                sb.append("\n## Methods\n");
            }
            for (MethodInfo method : methods) {
                sb.append(methodPrefix).append("  → .").append(method.getSignature()).append("\n");
                if (includeDetails && method.getDocstring() != null && !method.getDocstring().isEmpty()) {
                    String firstLine = method.getDocstring().split("\n")[0].trim();
                    sb.append(methodPrefix).append("      # ").append(firstLine).append("\n");
                }
            }
        }

        // Add children
        if (!children.isEmpty()) {
            if (depth == 0) {
                sb.append("\n## Dependencies\n");
            }
            for (int i = 0; i < children.size(); i++) {
                boolean isLast = i == children.size() - 1;
                String childPrefix = depth > 0 ? prefix + (isLast ? "    " : "│   ") : "";
                children.get(i).buildTextTree(sb, includeDetails, childPrefix);
            }
        }

        // Add summary at root level
        if (depth == 0) {
            sb.append("\n## Summary\n");
            sb.append("- Total methods: ").append(countTotalMethods()).append("\n");
            sb.append("- Total dependencies: ").append(countTotalDependencies()).append("\n");
        }
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    public static Builder builder(String name, String className) {
        return new Builder(name, className);
    }

    public static class Builder {
        private final String name;
        private final String className;
        private List<MethodInfo> methods = new ArrayList<>();
        private List<ObjectNode> children = new ArrayList<>();
        private int depth = 0;

        public Builder(String name, String className) {
            this.name = name;
            this.className = className;
        }

        public Builder methods(List<MethodInfo> methods) {
            this.methods = new ArrayList<>(methods);
            return this;
        }

        public Builder addMethod(MethodInfo method) {
            this.methods.add(method);
            return this;
        }

        public Builder children(List<ObjectNode> children) {
            this.children = new ArrayList<>(children);
            return this;
        }

        public Builder addChild(ObjectNode child) {
            this.children.add(child);
            return this;
        }

        public Builder depth(int depth) {
            this.depth = depth;
            return this;
        }

        public ObjectNode build() {
            return new ObjectNode(this);
        }
    }
}
