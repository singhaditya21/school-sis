dependencies {
    api(project(":platform:platform-api"))
    
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    
    // JSON type for JSONB columns
    implementation("io.hypersistence:hypersistence-utils-hibernate-63:3.7.0")
    
    // JWT
    implementation("io.jsonwebtoken:jjwt-api:${rootProject.extra["jjwtVersion"]}")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:${rootProject.extra["jjwtVersion"]}")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:${rootProject.extra["jjwtVersion"]}")
    
    // MapStruct
    implementation("org.mapstruct:mapstruct:${rootProject.extra["mapstructVersion"]}")
    annotationProcessor("org.mapstruct:mapstruct-processor:${rootProject.extra["mapstructVersion"]}")
    
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
}
