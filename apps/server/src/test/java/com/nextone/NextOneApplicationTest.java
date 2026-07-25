package com.nextone;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
        "spring.flyway.enabled=false",
        "nextone.bootstrap.enabled=false"
})
class NextOneApplicationTest {

    @Test
    void contextLoads() {
    }
}
