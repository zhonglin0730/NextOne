package com.nextone.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

@Component
public class SingleUserAuthenticationFilter extends OncePerRequestFilter {

    private final SingleUserProperties properties;
    private final JsonMapper objectMapper;

    public SingleUserAuthenticationFilter(
            SingleUserProperties properties,
            JsonMapper objectMapper
    ) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String suppliedToken = authorization.substring("Bearer ".length());
        if (!secureEquals(suppliedToken, properties.token())) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            objectMapper.writeValue(response.getOutputStream(), Map.of(
                    "code", "AUTH_INVALID_TOKEN",
                    "parameters", Map.of()
            ));
            return;
        }

        SingleUserPrincipal principal = new SingleUserPrincipal(
                properties.id(),
                properties.displayName(),
                properties.locale(),
                properties.timeZone()
        );
        var authentication = UsernamePasswordAuthenticationToken.authenticated(
                principal,
                suppliedToken,
                List.of()
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);
        filterChain.doFilter(request, response);
    }

    private boolean secureEquals(String supplied, String expected) {
        return MessageDigest.isEqual(
                supplied.getBytes(StandardCharsets.UTF_8),
                expected.getBytes(StandardCharsets.UTF_8)
        );
    }
}
