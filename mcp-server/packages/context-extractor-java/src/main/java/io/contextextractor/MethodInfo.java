package io.contextextractor;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Represents a method with its signature, parameters, and documentation.
 */
public class MethodInfo {
    private final String name;
    private final List<ParameterInfo> parameters;
    private final String returnType;
    private final String docstring;
    private final boolean isStatic;
    private final boolean isPublic;

    private MethodInfo(Builder builder) {
        this.name = builder.name;
        this.parameters = builder.parameters;
        this.returnType = builder.returnType;
        this.docstring = builder.docstring;
        this.isStatic = builder.isStatic;
        this.isPublic = builder.isPublic;
    }

    public String getName() {
        return name;
    }

    public List<ParameterInfo> getParameters() {
        return new ArrayList<>(parameters);
    }

    public String getReturnType() {
        return returnType;
    }

    public String getDocstring() {
        return docstring;
    }

    public boolean isStatic() {
        return isStatic;
    }

    public boolean isPublic() {
        return isPublic;
    }

    /**
     * Get the method signature as a formatted string.
     */
    public String getSignature() {
        String params = parameters.stream()
                .map(ParameterInfo::toString)
                .collect(Collectors.joining(", "));
        return String.format("%s(%s) -> %s", name, params, returnType);
    }

    @Override
    public String toString() {
        return getSignature();
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"name\":\"").append(escapeJson(name)).append("\",");
        sb.append("\"parameters\":[");
        sb.append(parameters.stream()
                .map(ParameterInfo::toJson)
                .collect(Collectors.joining(",")));
        sb.append("],");
        sb.append("\"returnType\":\"").append(escapeJson(returnType)).append("\",");
        if (docstring != null) {
            sb.append("\"docstring\":\"").append(escapeJson(docstring)).append("\",");
        }
        sb.append("\"isStatic\":").append(isStatic).append(",");
        sb.append("\"isPublic\":").append(isPublic);
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

    public static Builder builder(String name) {
        return new Builder(name);
    }

    public static class Builder {
        private final String name;
        private List<ParameterInfo> parameters = new ArrayList<>();
        private String returnType = "void";
        private String docstring;
        private boolean isStatic = false;
        private boolean isPublic = true;

        public Builder(String name) {
            this.name = name;
        }

        public Builder parameters(List<ParameterInfo> parameters) {
            this.parameters = new ArrayList<>(parameters);
            return this;
        }

        public Builder addParameter(ParameterInfo parameter) {
            this.parameters.add(parameter);
            return this;
        }

        public Builder returnType(String returnType) {
            this.returnType = returnType;
            return this;
        }

        public Builder docstring(String docstring) {
            this.docstring = docstring;
            return this;
        }

        public Builder isStatic(boolean isStatic) {
            this.isStatic = isStatic;
            return this;
        }

        public Builder isPublic(boolean isPublic) {
            this.isPublic = isPublic;
            return this;
        }

        public MethodInfo build() {
            return new MethodInfo(this);
        }
    }
}
