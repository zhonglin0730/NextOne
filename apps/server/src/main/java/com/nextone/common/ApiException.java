package com.nextone.common;

import java.util.Map;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> parameters;

    public ApiException(HttpStatus status, String code) {
        this(status, code, Map.of());
    }

    public ApiException(HttpStatus status, String code, Map<String, Object> parameters) {
        super(code);
        this.status = status;
        this.code = code;
        this.parameters = Map.copyOf(parameters);
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Map<String, Object> parameters() {
        return parameters;
    }
}
