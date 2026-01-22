import org.gradle.api.tasks.testing.logging.TestLogEvent

plugins {
    java
    id("org.springframework.boot") version "3.2.2" apply false
    id("io.spring.dependency-management") version "1.1.4"
    id("io.freefair.lombok") version "8.4" apply false
}

// Declare versions in a central place FIRST (before subprojects)
extra["mapstructVersion"] = "1.5.5.Final"
extra["springdocVersion"] = "2.3.0"
extra["jjwtVersion"] = "0.12.3"
extra["testcontainersVersion"] = "1.19.3"

allprojects {
    group = "com.schoolsis"
    version = "1.0.0-SNAPSHOT"

    repositories {
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "java-library")
    apply(plugin = "io.spring.dependency-management")
    apply(plugin = "io.freefair.lombok")

    // Import Spring Boot BOM for ALL subprojects
    the<io.spring.gradle.dependencymanagement.dsl.DependencyManagementExtension>().apply {
        imports {
            mavenBom("org.springframework.boot:spring-boot-dependencies:3.2.2")
        }
    }

    java {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    dependencies {
        // Common test dependencies
        "testImplementation"("org.junit.jupiter:junit-jupiter:5.10.1")
        "testImplementation"("org.assertj:assertj-core:3.24.2")
        "testImplementation"("org.mockito:mockito-core:5.8.0")
        "testImplementation"("org.mockito:mockito-junit-jupiter:5.8.0")
    }

    tasks.withType<Test> {
        useJUnitPlatform()
        testLogging {
            events(TestLogEvent.PASSED, TestLogEvent.SKIPPED, TestLogEvent.FAILED)
        }
    }

    tasks.withType<JavaCompile> {
        options.encoding = "UTF-8"
        options.compilerArgs.add("-parameters")
    }
}
