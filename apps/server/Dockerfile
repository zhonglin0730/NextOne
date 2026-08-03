FROM maven:3.9.11-eclipse-temurin-17-alpine AS build
WORKDIR /workspace

COPY pom.xml pom.xml
COPY apps/server/pom.xml apps/server/pom.xml
COPY apps/server/src apps/server/src

RUN mvn -pl apps/server -DskipTests package

FROM eclipse-temurin:17-jre-alpine
RUN apk add --no-cache curl \
    && addgroup -S nextone \
    && adduser -S -G nextone nextone

WORKDIR /app
COPY --from=build /workspace/apps/server/target/nextone-server-*.jar app.jar

USER nextone
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/app.jar"]
