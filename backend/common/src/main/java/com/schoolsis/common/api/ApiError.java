package com.schoolsis.common.api;

import java.util.Map;

/**
 * Standard API error structure.
 */
public record ApiError(
    String code,
    String message,
    Map<String, String> details
) {}
