plugins {
    id("org.springframework.boot")
}

dependencies {
    implementation(project(":common"))
    implementation(project(":platform:platform-impl"))
    implementation(project(":students:students-impl"))
    implementation(project(":fees:fees-impl"))
    implementation(project(":attendance:attendance-impl"))
    implementation(project(":exams:exams-impl"))
    implementation(project(":admissions:admissions-impl"))
    implementation(project(":timetable:timetable-impl"))
    implementation(project(":transport:transport-impl"))
    implementation(project(":communication:communication-impl"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    runtimeOnly("org.postgresql:postgresql")
    runtimeOnly("org.flywaydb:flyway-core")

    // API docs
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:${rootProject.extra["springdocVersion"]}")

    // Observability
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:postgresql:${rootProject.extra["testcontainersVersion"]}")
    testImplementation("org.testcontainers:junit-jupiter:${rootProject.extra["testcontainersVersion"]}")
}

tasks.bootJar {
    archiveFileName.set("school-sis.jar")
}
