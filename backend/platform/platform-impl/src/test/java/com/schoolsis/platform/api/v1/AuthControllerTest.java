package com.schoolsis.platform.api.v1;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for AuthController endpoints.
 */
@WebMvcTest(AuthController.class)
@DisplayName("Auth Controller Tests")
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/auth/login")
    class Login {

        @Test
        @DisplayName("TC-AUTH-001: Should login with valid credentials")
        void shouldLoginWithValidCredentials() throws Exception {
            String loginJson = """
                    {
                        "email": "admin@school.com",
                        "password": "valid_password"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(loginJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.token").exists())
                    .andExpect(jsonPath("$.data.refreshToken").exists())
                    .andExpect(jsonPath("$.data.user.email").value("admin@school.com"));
        }

        @Test
        @DisplayName("TC-AUTH-002: Should reject invalid credentials")
        void shouldRejectInvalidCredentials() throws Exception {
            String loginJson = """
                    {
                        "email": "admin@school.com",
                        "password": "wrong_password"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(loginJson))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.success").value(false));
        }

        @Test
        @DisplayName("TC-AUTH-002b: Should not reveal which field is wrong")
        void shouldNotRevealWhichFieldIsWrong() throws Exception {
            String loginJson = """
                    {
                        "email": "nonexistent@school.com",
                        "password": "any_password"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(loginJson))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.message").value("Invalid credentials"));
        }

        @Test
        @DisplayName("Should require email field")
        void shouldRequireEmail() throws Exception {
            String loginJson = """
                    {
                        "password": "password"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(loginJson))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("Should require password field")
        void shouldRequirePassword() throws Exception {
            String loginJson = """
                    {
                        "email": "admin@school.com"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(loginJson))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("Should validate email format")
        void shouldValidateEmailFormat() throws Exception {
            String loginJson = """
                    {
                        "email": "not-an-email",
                        "password": "password"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(loginJson))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/auth/refresh")
    class TokenRefresh {

        @Test
        @DisplayName("TC-AUTH-004: Should refresh token with valid refresh token")
        void shouldRefreshToken() throws Exception {
            String refreshJson = """
                    {
                        "refreshToken": "valid_refresh_token"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/refresh")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(refreshJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.token").exists());
        }

        @Test
        @DisplayName("Should reject expired refresh token")
        void shouldRejectExpiredRefreshToken() throws Exception {
            String refreshJson = """
                    {
                        "refreshToken": "expired_refresh_token"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/refresh")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(refreshJson))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/auth/logout")
    class Logout {

        @Test
        @WithMockUser
        @DisplayName("TC-AUTH-005: Should logout successfully")
        void shouldLogout() throws Exception {
            mockMvc.perform(post("/api/v1/auth/logout"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true));
        }

        @Test
        @DisplayName("Should require authentication for logout")
        void shouldRequireAuthForLogout() throws Exception {
            mockMvc.perform(post("/api/v1/auth/logout"))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/auth/forgot-password")
    class ForgotPassword {

        @Test
        @DisplayName("TC-AUTH-006: Should send reset email for valid email")
        void shouldSendResetEmail() throws Exception {
            String requestJson = """
                    {
                        "email": "user@school.com"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/forgot-password")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("Password reset email sent"));
        }

        @Test
        @DisplayName("Should return success even for non-existent email (security)")
        void shouldReturnSuccessForNonExistentEmail() throws Exception {
            String requestJson = """
                    {
                        "email": "nonexistent@school.com"
                    }
                    """;

            // Should return same response to prevent email enumeration
            mockMvc.perform(post("/api/v1/auth/forgot-password")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/auth/reset-password")
    class ResetPassword {

        @Test
        @DisplayName("TC-AUTH-007: Should reset password with valid token")
        void shouldResetPassword() throws Exception {
            String requestJson = """
                    {
                        "token": "valid_reset_token",
                        "newPassword": "NewSecurePassword123!"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/reset-password")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("Password reset successful"));
        }

        @Test
        @DisplayName("Should reject invalid token")
        void shouldRejectInvalidToken() throws Exception {
            String requestJson = """
                    {
                        "token": "invalid_token",
                        "newPassword": "NewPassword123!"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/reset-password")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("Should enforce password complexity")
        void shouldEnforcePasswordComplexity() throws Exception {
            String requestJson = """
                    {
                        "token": "valid_reset_token",
                        "newPassword": "simple"
                    }
                    """;

            mockMvc.perform(post("/api/v1/auth/reset-password")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.message").value(
                            org.hamcrest.Matchers.containsString("Password must")));
        }
    }

    @Nested
    @DisplayName("GET /api/v1/auth/me")
    class GetCurrentUser {

        @Test
        @WithMockUser(username = "admin@school.com", roles = "ADMIN")
        @DisplayName("Should return current user info")
        void shouldReturnCurrentUser() throws Exception {
            mockMvc.perform(get("/api/v1/auth/me"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.email").value("admin@school.com"));
        }

        @Test
        @DisplayName("Should require authentication")
        void shouldRequireAuth() throws Exception {
            mockMvc.perform(get("/api/v1/auth/me"))
                    .andExpect(status().isUnauthorized());
        }
    }
}
