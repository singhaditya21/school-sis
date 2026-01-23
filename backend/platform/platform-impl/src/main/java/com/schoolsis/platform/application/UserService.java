package com.schoolsis.platform.application;

import com.schoolsis.platform.domain.model.Role;
import com.schoolsis.platform.domain.model.User;
import com.schoolsis.platform.domain.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for user management operations.
 */
@Service
@Transactional
public class UserService {

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = new BCryptPasswordEncoder();
    }

    /**
     * Get all users (paginated).
     */
    @Transactional(readOnly = true)
    public Page<User> getAllUsers(Pageable pageable) {
        return userRepository.findAll(pageable);
    }

    /**
     * Get all users for a tenant.
     */
    @Transactional(readOnly = true)
    public List<User> getUsersByTenant(UUID tenantId) {
        return userRepository.findActiveByTenantId(tenantId);
    }

    /**
     * Get user by ID.
     */
    @Transactional(readOnly = true)
    public Optional<User> getUserById(UUID id) {
        return userRepository.findById(id);
    }

    /**
     * Get user by email.
     */
    @Transactional(readOnly = true)
    public Optional<User> getUserByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    /**
     * Create a new user.
     */
    public User createUser(CreateUserCommand cmd) {
        // Check if email already exists
        if (userRepository.existsByEmail(cmd.email())) {
            throw new IllegalArgumentException("Email already exists: " + cmd.email());
        }

        User user = new User(
                cmd.email(),
                passwordEncoder.encode(cmd.password()),
                cmd.firstName(),
                cmd.lastName(),
                cmd.role());
        user.setTenantId(cmd.tenantId());
        user.setActive(true);

        return userRepository.save(user);
    }

    /**
     * Update an existing user.
     */
    public User updateUser(UUID id, UpdateUserCommand cmd) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + id));

        if (cmd.firstName() != null) {
            user.setFirstName(cmd.firstName());
        }
        if (cmd.lastName() != null) {
            user.setLastName(cmd.lastName());
        }
        if (cmd.role() != null) {
            user.setRole(cmd.role());
        }
        if (cmd.active() != null) {
            user.setActive(cmd.active());
        }

        return userRepository.save(user);
    }

    /**
     * Change user password.
     */
    public void changePassword(UUID id, String newPassword) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + id));

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    /**
     * Reset user password and return temporary password.
     */
    public String resetPassword(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + id));

        String tempPassword = generateTempPassword();
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        userRepository.save(user);

        return tempPassword;
    }

    /**
     * Deactivate a user (soft delete).
     */
    public void deactivateUser(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + id));

        user.setActive(false);
        userRepository.save(user);
    }

    /**
     * Activate a user.
     */
    public void activateUser(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + id));

        user.setActive(true);
        userRepository.save(user);
    }

    /**
     * Verify password for a user.
     */
    @Transactional(readOnly = true)
    public boolean verifyPassword(String email, String password) {
        return userRepository.findByEmailAndActiveTrue(email)
                .map(user -> passwordEncoder.matches(password, user.getPasswordHash()))
                .orElse(false);
    }

    private String generateTempPassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder(12);
        for (int i = 0; i < 12; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }

    // Command records
    public record CreateUserCommand(
            String email,
            String password,
            String firstName,
            String lastName,
            Role role,
            UUID tenantId) {
    }

    public record UpdateUserCommand(
            String firstName,
            String lastName,
            Role role,
            Boolean active) {
    }
}
