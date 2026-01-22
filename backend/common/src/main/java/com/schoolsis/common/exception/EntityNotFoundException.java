package com.schoolsis.common.exception;

/**
 * Exception thrown when an entity is not found.
 */
public class EntityNotFoundException extends RuntimeException {

    private final String entity;
    private final Object id;

    public EntityNotFoundException(String entity, Object id) {
        super(entity + " not found: " + id);
        this.entity = entity;
        this.id = id;
    }

    public String getEntity() {
        return entity;
    }

    public Object getId() {
        return id;
    }
}
