dependencies {
    api("org.springframework.boot:spring-boot-starter-data-jpa")
    api("org.springframework.boot:spring-boot-starter-validation")
    api("org.springframework.boot:spring-boot-starter-web")
    
    // MapStruct for DTOs
    implementation("org.mapstruct:mapstruct:${rootProject.extra["mapstructVersion"]}")
    annotationProcessor("org.mapstruct:mapstruct-processor:${rootProject.extra["mapstructVersion"]}")
    
    // JSON type for JSONB columns
    api("io.hypersistence:hypersistence-utils-hibernate-63:3.7.0")
    
    // Utilities
    api("com.google.guava:guava:32.1.3-jre")
    api("org.apache.commons:commons-lang3:3.14.0")
}
