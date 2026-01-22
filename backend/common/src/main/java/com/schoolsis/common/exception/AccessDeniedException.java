package com.schoolsis.common.exception;

/**
 * Exception thrown when access is denied.
 */
public class AccessDeniedException extends RuntimeException {

    public AccessDeniedException(String message) {
        super(message);
    }

    public AccessDeniedException() {
        super("Access denied");
    }
}
