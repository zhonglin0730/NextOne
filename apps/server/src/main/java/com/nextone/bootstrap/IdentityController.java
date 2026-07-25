package com.nextone.bootstrap;

import com.nextone.auth.CurrentUser;
import com.nextone.auth.SingleUserPrincipal;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class IdentityController {

    private final CurrentUser currentUser;

    public IdentityController(CurrentUser currentUser) {
        this.currentUser = currentUser;
    }

    @GetMapping("/auth-context")
    Map<String, Object> authContext() {
        return Map.of(
                "mode", "SINGLE_USER_BEARER",
                "authenticated", true,
                "userId", currentUser.id()
        );
    }

    @GetMapping("/me")
    SingleUserPrincipal me() {
        return currentUser.get();
    }
}
