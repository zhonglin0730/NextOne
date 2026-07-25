package com.nextone;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "nextone.single-user.token=test-access-token"
)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class NextOnePostgresIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @LocalServerPort
    int port;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    JsonMapper jsonMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Test
    @Order(1)
    void migratesAnEmptyDatabaseAndRequiresAuthentication() throws Exception {
        Integer migrationCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM flyway_schema_history
                WHERE success = true AND version IN ('1', '2')
                """, Integer.class);
        assertThat(migrationCount).isEqualTo(2);

        HttpResponse<String> response = send("GET", "/api/v1/me", null, null);
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(jsonMapper.readTree(response.body()).get("code").asString())
                .isEqualTo("AUTH_REQUIRED");

        HttpResponse<String> openApi = send(
                "GET",
                "/openapi/nextone-v1.yaml",
                null,
                null
        );
        assertThat(openApi.statusCode()).isEqualTo(200);
        assertThat(openApi.body()).contains("openapi: 3.1.0");
    }

    @Test
    @Order(2)
    void upgradesAnExistingV1SchemaToTheLatestVersion() {
        jdbcTemplate.execute("CREATE SCHEMA existing_v1");
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas("existing_v1")
                .defaultSchema("existing_v1")
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("1"))
                .load()
                .migrate();

        Integer taskTableBeforeUpgrade = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM information_schema.tables
                WHERE table_schema = 'existing_v1' AND table_name = 'task'
                """, Integer.class);
        assertThat(taskTableBeforeUpgrade).isZero();

        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas("existing_v1")
                .defaultSchema("existing_v1")
                .locations("classpath:db/migration")
                .load()
                .migrate();

        Integer taskTableAfterUpgrade = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM information_schema.tables
                WHERE table_schema = 'existing_v1' AND table_name = 'task'
                """, Integer.class);
        assertThat(taskTableAfterUpgrade).isEqualTo(1);
    }

    @Test
    @Order(3)
    void persistsTasksRevalidatesTransitionsAndIsolatesUsers() throws Exception {
        HttpResponse<String> created = send(
                "POST",
                "/api/v1/tasks",
                """
                        {"title":"Persist me"}
                        """,
                "test-access-token"
        );
        assertThat(created.statusCode()).isEqualTo(201);
        JsonNode task = jsonMapper.readTree(created.body());
        String taskId = task.get("id").asString();

        HttpResponse<String> invalidTransition = send(
                "POST",
                "/api/v1/tasks/" + taskId + "/transition",
                """
                        {"status":"DOING","allowWipOverride":false}
                        """,
                "test-access-token"
        );
        assertThat(invalidTransition.statusCode()).isEqualTo(409);
        assertThat(jsonMapper.readTree(invalidTransition.body()).get("code").asString())
                .isEqualTo("TASK_TRANSITION_INVALID");

        HttpResponse<String> clarified = send(
                "POST",
                "/api/v1/tasks/" + taskId + "/transition",
                """
                        {"status":"READY","allowWipOverride":false}
                        """,
                "test-access-token"
        );
        assertThat(clarified.statusCode()).isEqualTo(200);

        jdbcTemplate.update("""
                INSERT INTO app_user (
                    id, display_name, locale, time_zone, created_at, updated_at, revision
                ) VALUES ('other-user', 'Other', 'en', 'UTC', NOW(), NOW(), 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO task (
                    id, user_id, title, status, visibility, sort_key,
                    created_at, updated_at, revision
                ) VALUES (
                    'other-task', 'other-user', 'Private', 'INBOX', 'ACTIVE',
                    'other', NOW(), NOW(), 1
                )
                """);

        HttpResponse<String> otherTask = send(
                "GET",
                "/api/v1/tasks/other-task",
                null,
                "test-access-token"
        );
        assertThat(otherTask.statusCode()).isEqualTo(404);
        assertThat(jsonMapper.readTree(otherTask.body()).get("code").asString())
                .isEqualTo("TASK_NOT_FOUND");

        HttpResponse<String> bootstrap = send(
                "GET",
                "/api/v1/bootstrap",
                null,
                "test-access-token"
        );
        assertThat(bootstrap.statusCode()).isEqualTo(200);
        String bootstrapBody = bootstrap.body();
        assertThat(bootstrapBody).contains(taskId);
        assertThat(bootstrapBody).doesNotContain("other-task");

        Integer stored = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM task WHERE user_id = 'local-user' AND id = ?",
                Integer.class,
                taskId
        );
        assertThat(stored).isEqualTo(1);
        Integer eventCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM task_event WHERE user_id = 'local-user' AND task_id = ?",
                Integer.class,
                taskId
        );
        assertThat(eventCount).isGreaterThanOrEqualTo(2);
    }

    @Test
    @Order(4)
    void revalidatesWipDailyFocusAndProjectFocusRules() throws Exception {
        List<String> taskIds = new ArrayList<>();
        for (int index = 0; index < 4; index++) {
            String taskId = createTask("WIP " + index, null);
            taskIds.add(taskId);
            assertThat(transition(taskId, "READY", false).statusCode()).isEqualTo(200);
        }

        for (int index = 0; index < 3; index++) {
            assertThat(transition(taskIds.get(index), "DOING", false).statusCode())
                    .isEqualTo(200);
        }
        HttpResponse<String> wipExceeded = transition(taskIds.get(3), "DOING", false);
        assertThat(wipExceeded.statusCode()).isEqualTo(409);
        assertThat(jsonMapper.readTree(wipExceeded.body()).get("code").asString())
                .isEqualTo("WIP_LIMIT_EXCEEDED");

        for (int index = 0; index < 3; index++) {
            HttpResponse<String> added = send(
                    "POST",
                    "/api/v1/daily-plans/2026-07-25/items",
                    """
                            {"taskId":"%s","section":"FOCUS","timeZone":"Asia/Shanghai"}
                            """.formatted(taskIds.get(index)),
                    "test-access-token"
            );
            assertThat(added.statusCode()).isEqualTo(200);
        }
        HttpResponse<String> dailyFocusExceeded = send(
                "POST",
                "/api/v1/daily-plans/2026-07-25/items",
                """
                        {"taskId":"%s","section":"FOCUS","timeZone":"Asia/Shanghai"}
                        """.formatted(taskIds.get(3)),
                "test-access-token"
        );
        assertThat(dailyFocusExceeded.statusCode()).isEqualTo(409);
        assertThat(jsonMapper.readTree(dailyFocusExceeded.body()).get("code").asString())
                .isEqualTo("DAILY_FOCUS_LIMIT_EXCEEDED");

        String projectA = createProject("Project A");
        String projectB = createProject("Project B");
        String projectBTask = createTask("Belongs to B", projectB);
        assertThat(transition(projectBTask, "READY", false).statusCode()).isEqualTo(200);

        HttpResponse<String> invalidFocus = send(
                "POST",
                "/api/v1/projects/" + projectA + "/focus",
                """
                        {"taskId":"%s"}
                        """.formatted(projectBTask),
                "test-access-token"
        );
        assertThat(invalidFocus.statusCode()).isEqualTo(409);
        assertThat(jsonMapper.readTree(invalidFocus.body()).get("code").asString())
                .isEqualTo("PROJECT_FOCUS_TASK_INVALID");
    }

    private String createTask(String title, String projectId) throws Exception {
        String projectField = projectId == null ? "" : ",\"projectId\":\"" + projectId + "\"";
        HttpResponse<String> response = send(
                "POST",
                "/api/v1/tasks",
                "{\"title\":\"" + title + "\"" + projectField + "}",
                "test-access-token"
        );
        assertThat(response.statusCode()).isEqualTo(201);
        return jsonMapper.readTree(response.body()).get("id").asString();
    }

    private String createProject(String name) throws Exception {
        HttpResponse<String> response = send(
                "POST",
                "/api/v1/projects",
                """
                        {"name":"%s"}
                        """.formatted(name),
                "test-access-token"
        );
        assertThat(response.statusCode()).isEqualTo(201);
        return jsonMapper.readTree(response.body()).get("id").asString();
    }

    private HttpResponse<String> transition(
            String taskId,
            String status,
            boolean allowWipOverride
    ) throws Exception {
        return send(
                "POST",
                "/api/v1/tasks/" + taskId + "/transition",
                """
                        {"status":"%s","allowWipOverride":%s}
                        """.formatted(status, allowWipOverride),
                "test-access-token"
        );
    }

    private HttpResponse<String> send(
            String method,
            String path,
            String body,
            String token
    ) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10))
                .header("Accept", "application/json");
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json");
            builder.method(method, HttpRequest.BodyPublishers.ofString(body));
        }
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
