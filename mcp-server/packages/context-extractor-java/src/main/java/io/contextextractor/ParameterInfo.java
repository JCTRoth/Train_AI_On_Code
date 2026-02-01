package io.contextextractor;

/**
 * Represents a method parameter with its metadata.
 */
public class ParameterInfo {
    private final String name;
    private final String typeName;
    private final String defaultValue;

    public ParameterInfo(String name, String typeName) {
        this(name, typeName, null);
    }

    public ParameterInfo(String name, String typeName, String defaultValue) {
        this.name = name;
        this.typeName = typeName != null ? typeName : "Object";
        this.defaultValue = defaultValue;
    }

    public String getName() {
        return name;
    }

    public String getTypeName() {
        return typeName;
    }

    public String getDefaultValue() {
        return defaultValue;
    }

    public boolean hasDefaultValue() {
        return defaultValue != null;
    }

    @Override
    public String toString() {
        if (defaultValue != null) {
            return String.format("%s: %s = %s", name, typeName, defaultValue);
        }
        return String.format("%s: %s", name, typeName);
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"name\":\"").append(escapeJson(name)).append("\",");
        sb.append("\"type\":\"").append(escapeJson(typeName)).append("\"");
        if (defaultValue != null) {
            sb.append(",\"default\":\"").append(escapeJson(defaultValue)).append("\"");
        }
        sb.append("}");
        return sb.toString();
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
